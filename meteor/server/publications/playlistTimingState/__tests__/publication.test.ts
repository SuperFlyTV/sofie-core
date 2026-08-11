import {
	PartId,
	PartInstanceId,
	RundownId,
	RundownPlaylistId,
	SegmentId,
	SegmentPlayoutId,
	StudioId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { PlaylistTimingType } from '@sofie-automation/blueprints-integration'
import { IStudioSettings } from '@sofie-automation/corelib/dist/dataModel/Studio'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { getPlaylistTimingStateDocId } from '@sofie-automation/corelib/dist/dataModel/TimingState'
import { manipulatePlaylistTimingStatePublicationData, createPlaylistTimingStateDoc } from '../publication'
import { ContentCache, createReactiveContentCache } from '../reactiveContentCache'

describe('playlistTimingState publication', () => {
	const playlistId = protectString<RundownPlaylistId>('playlist0')
	const studioId = protectString<StudioId>('studio0')
	const rundownId = protectString<RundownId>('rundown0')
	const segmentId0 = protectString<SegmentId>('segment0')
	const segmentId1 = protectString<SegmentId>('segment1')

	const EXPECTED_START = 20000
	const EXPECTED_DURATION = 40000
	const PART_DURATION = 10000
	const DEFAULT_DISPLAY_DURATION_FROM_STUDIO = 4000

	function makeMockPart(id: string, rank: number, segmentId: SegmentId): DBPart {
		return {
			_id: protectString<PartId>(id),
			_rank: rank,
			rundownId,
			segmentId,
			externalId: id,
			title: id,
			expectedDuration: PART_DURATION,
			expectedDurationWithTransition: PART_DURATION,
		}
	}

	function createAndPopulateMockCache(): ContentCache {
		const cache = createReactiveContentCache()

		cache.StudioSettings.insert({
			_id: studioId,
			settings: { defaultDisplayDuration: DEFAULT_DISPLAY_DURATION_FROM_STUDIO } as IStudioSettings,
		})

		cache.RundownPlaylists.insert({
			_id: playlistId,
			studioId,
			activationId: undefined,
			timing: {
				type: PlaylistTimingType.ForwardTime,
				expectedStart: EXPECTED_START,
				expectedDuration: EXPECTED_DURATION,
			},
			startedPlayback: undefined,
			currentPartInfo: null,
			nextPartInfo: null,
			outOfOrderTiming: undefined,
			segmentsStartedPlayback: undefined,
			quickLoop: undefined,
			rundownIdsInOrder: [rundownId],
		})

		cache.Segments.insert({ _id: segmentId0, _rank: 0, rundownId, segmentTiming: undefined })
		cache.Segments.insert({ _id: segmentId1, _rank: 1, rundownId, segmentTiming: undefined })

		cache.Parts.insert(makeMockPart('part0', 0, segmentId0))
		cache.Parts.insert(makeMockPart('part1', 1, segmentId0))
		cache.Parts.insert(makeMockPart('part2', 0, segmentId1))
		cache.Parts.insert(makeMockPart('part3', 1, segmentId1))

		return cache
	}

	describe('createPlaylistTimingStateDoc', () => {
		it('returns undefined when the playlist is not in the cache', () => {
			const cache = createReactiveContentCache()

			expect(createPlaylistTimingStateDoc(playlistId, cache, 10000)).toBeUndefined()
		})

		it('produces a doc for an unplayed ForwardTime playlist', () => {
			const cache = createAndPopulateMockCache()
			const now = 10000

			const doc = createPlaylistTimingStateDoc(playlistId, cache, now)

			const totalPartDurations = 4 * PART_DURATION
			expect(doc).toEqual({
				_id: getPlaylistTimingStateDocId(playlistId),
				type: 'playlist',
				playlistId,
				timingType: PlaylistTimingType.ForwardTime,
				plannedStart: { paused: false, zeroTime: EXPECTED_START },
				plannedEnd: { paused: false, zeroTime: EXPECTED_START + EXPECTED_DURATION },
				plannedDuration: { paused: true, duration: EXPECTED_DURATION },
				startedPlayback: undefined,
				// Nothing is playing: remaining is the constant sum of the part durations
				remainingDuration: { paused: true, duration: totalPartDurations },
				// Fixed at expectedStart + remaining until the planned start passes, then pushes
				estimatedEnd: {
					paused: false,
					zeroTime: EXPECTED_START + totalPartDurations,
					pauseTime: EXPECTED_START,
				},
				// Planned for 40s of content but only 40s exists, and both the target and the
				// projection slip together while unstarted, so the balance is a steady zero
				overUnder: { paused: true, duration: EXPECTED_DURATION - totalPartDurations },
			})
		})

		it('produces running states while a part is on air', () => {
			const cache = createAndPopulateMockCache()

			const startedPlayback = 20000
			const now = 25000

			const partInstanceId = protectString<PartInstanceId>('instance0')
			cache.PartInstances.insert({
				_id: partInstanceId,
				rundownId,
				segmentId: segmentId0,
				isTemporary: false,
				segmentPlayoutId: protectString<SegmentPlayoutId>('segmentPlayout0'),
				takeCount: 1,
				part: makeMockPart('part0', 0, segmentId0),
				timings: {
					take: startedPlayback,
					plannedStartedPlayback: startedPlayback,
				},
				orphaned: undefined,
			})
			const playlist = cache.RundownPlaylists.findOne(playlistId)
			if (!playlist) throw new Error('Playlist not found in cache')
			playlist.activationId = protectString('activation0')
			playlist.startedPlayback = startedPlayback
			playlist.currentPartInfo = {
				partInstanceId,
				rundownId,
				manuallySelected: false,
				consumesQueuedSegmentId: false,
			}
			cache.RundownPlaylists.replace(playlist)

			const doc = createPlaylistTimingStateDoc(playlistId, cache, now)

			// 5s into a 10s part, with 3 more 10s parts to go
			const remaining = PART_DURATION - (now - startedPlayback) + 3 * PART_DURATION
			const livePartExpectedEnd = startedPlayback + PART_DURATION
			expect(doc?.startedPlayback).toEqual({ paused: false, zeroTime: startedPlayback })
			expect(doc?.remainingDuration).toEqual({
				paused: false,
				zeroTime: now + remaining,
				pauseTime: livePartExpectedEnd,
			})
			expect(doc?.estimatedEnd).toEqual({
				paused: false,
				zeroTime: now + remaining,
				pauseTime: livePartExpectedEnd,
			})
		})

		it('uses the studio defaultDisplayDuration for parts without a duration', () => {
			const cache = createAndPopulateMockCache()

			// Give one part no duration of its own
			const part = cache.Parts.findOne(protectString<PartId>('part3'))
			if (!part) throw new Error('Part not found in cache')
			part.expectedDuration = undefined
			part.expectedDurationWithTransition = undefined
			cache.Parts.replace(part)

			const doc = createPlaylistTimingStateDoc(playlistId, cache, 10000)

			// The remaining pool only counts expectedDurations (the default duration affects display
			// durations, not remaining) - so this should simply drop to 3 parts
			expect(doc?.remainingDuration).toEqual({ paused: true, duration: 3 * PART_DURATION })
		})
	})

	describe('manipulatePlaylistTimingStatePublicationData', () => {
		it('publishes nothing before a cache is provided', async () => {
			const state = {}
			const result = await manipulatePlaylistTimingStatePublicationData({ playlistId }, state, undefined)

			expect(result).toEqual([])
		})

		it('publishes the doc once a cache arrives, and clears when the playlist disappears', async () => {
			const cache = createAndPopulateMockCache()
			const state = {}

			const result = await manipulatePlaylistTimingStatePublicationData({ playlistId }, state, {
				newCache: cache,
			})
			expect(result).toHaveLength(1)
			expect(result?.[0]?._id).toEqual(getPlaylistTimingStateDocId(playlistId))

			// Remove the playlist and invalidate
			cache.RundownPlaylists.remove(playlistId)
			const result2 = await manipulatePlaylistTimingStatePublicationData({ playlistId }, state, {
				invalidateTiming: true,
			})
			expect(result2).toEqual([])
		})
	})
})
