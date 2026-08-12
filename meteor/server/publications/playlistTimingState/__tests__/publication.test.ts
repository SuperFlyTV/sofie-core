import {
	PartId,
	PartInstanceId,
	RundownId,
	RundownPlaylistId,
	SegmentId,
	SegmentPlayoutId,
	StudioId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import { protectString, unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { CountdownType, PlaylistTimingType } from '@sofie-automation/blueprints-integration'
import { IStudioSettings } from '@sofie-automation/corelib/dist/dataModel/Studio'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import type { PartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import {
	getPlaylistTimingStateDocId,
	getPartTimingStateDocId,
	getSegmentTimingStateDocId,
	type TimingStateDoc,
} from '@sofie-automation/corelib/dist/dataModel/TimingState'
import { timerStateToDuration, type TimerState } from '@sofie-automation/corelib/dist/dataModel/TimerState'
import {
	manipulatePlaylistTimingStatePublicationData,
	createPlaylistTimingStateDoc,
	createTimingStateDocs,
	isCacheViewConsistent,
} from '../publication'
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

	function evalDuration(state: TimerState | undefined, now: number): number {
		if (!state) throw new Error('Expected a timer state')
		return timerStateToDuration(state, now)
	}

	/** Add a (non-temporary) PartInstance for the given part to the cache */
	function putPartOnAir(
		cache: ContentCache,
		partId: string,
		segmentId: SegmentId,
		instanceId: string,
		takeCount: number,
		timings: PartInstance['timings']
	): PartInstanceId {
		const _id = protectString<PartInstanceId>(instanceId)
		// As published by uiPartInstances: a DBPartInstance, so no isTemporary
		cache.PartInstances.insert({
			_id,
			rundownId,
			segmentId,
			playlistActivationId: protectString('activation0'),
			segmentPlayoutId: protectString<SegmentPlayoutId>('segmentPlayout0'),
			takeCount,
			rehearsal: false,
			part: makeMockPart(partId, takeCount - 1, segmentId),
			timings,
			orphaned: undefined,
		})
		return _id
	}

	/** Mark the playlist as active, with the given part on air */
	function setPlaylistPlayout(
		cache: ContentCache,
		playout: {
			startedPlayback: number
			currentPartInstanceId: PartInstanceId
			segmentsStartedPlayback?: Record<string, number>
		}
	): void {
		const playlist = cache.RundownPlaylists.findOne(playlistId)
		if (!playlist) throw new Error('Playlist not found in cache')
		playlist.activationId = protectString('activation0')
		playlist.startedPlayback = playout.startedPlayback
		playlist.currentPartInfo = {
			partInstanceId: playout.currentPartInstanceId,
			rundownId,
			manuallySelected: false,
			consumesQueuedSegmentId: false,
		}
		playlist.segmentsStartedPlayback = playout.segmentsStartedPlayback
		cache.RundownPlaylists.replace(playlist)
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
				currentPartWillAutoNext: false,
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

			const partInstanceId = putPartOnAir(cache, 'part0', segmentId0, 'instance0', 1, {
				take: startedPlayback,
				plannedStartedPlayback: startedPlayback,
			})
			setPlaylistPlayout(cache, { startedPlayback, currentPartInstanceId: partInstanceId })

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

		it('tracks a take: the newly on-air part drives the remaining pool', () => {
			const cache = createAndPopulateMockCache()

			// part0 played 20000-30000, part1 took over at 30000
			putPartOnAir(cache, 'part0', segmentId0, 'instance0', 1, {
				take: 20000,
				plannedStartedPlayback: 20000,
				duration: 10000,
			})
			const part1InstanceId = putPartOnAir(cache, 'part1', segmentId0, 'instance1', 2, {
				take: 30000,
				plannedStartedPlayback: 30000,
			})
			setPlaylistPlayout(cache, { startedPlayback: 20000, currentPartInstanceId: part1InstanceId })

			const doc = createPlaylistTimingStateDoc(playlistId, cache, 35000)

			// 5s into part1, with part2 and part3 still to come
			const remaining = PART_DURATION - 5000 + 2 * PART_DURATION
			expect(doc?.remainingDuration).toEqual({
				paused: false,
				zeroTime: 35000 + remaining,
				pauseTime: 30000 + PART_DURATION,
			})
		})

		it('counts down the segment budget rather than the parts, when the segment has one', () => {
			const cache = createAndPopulateMockCache()

			const segment = cache.Segments.findOne(segmentId0)
			if (!segment) throw new Error('Segment not found in cache')
			segment.segmentTiming = { budgetDuration: 25000, countdownType: CountdownType.SEGMENT_BUDGET_DURATION }
			cache.Segments.replace(segment)

			const instanceId = putPartOnAir(cache, 'part0', segmentId0, 'instance0', 1, {
				take: 20000,
				plannedStartedPlayback: 20000,
			})
			setPlaylistPlayout(cache, {
				startedPlayback: 20000,
				currentPartInstanceId: instanceId,
				segmentsStartedPlayback: { segmentPlayout0: 20000 },
			})

			const doc = createPlaylistTimingStateDoc(playlistId, cache, 30000)

			// 10s into a 25s budget, so the budget (not the on-air part) sets the breakpoint
			expect(doc?.remainingDuration).toMatchObject({ paused: false, pauseTime: 20000 + 25000 })
		})

		/**
		 * The publication only recomputes when the cached documents change, so the document it
		 * produces has to be independent of when it happened to be computed.
		 */
		it.each([
			['before playback', undefined],
			['while on air and on schedule', { startedPlayback: 20000, at: [21000, 25000, 29999] }],
			['while overrunning', { startedPlayback: 20000, at: [31000, 45000, 120000] }],
		])('produces an identical document as time passes: %s', (_label, playout) => {
			const cache = createAndPopulateMockCache()
			let times = [10000, 12000, 19000]

			if (playout) {
				const instanceId = putPartOnAir(cache, 'part0', segmentId0, 'instance0', 1, {
					take: playout.startedPlayback,
					plannedStartedPlayback: playout.startedPlayback,
				})
				setPlaylistPlayout(cache, {
					startedPlayback: playout.startedPlayback,
					currentPartInstanceId: instanceId,
				})
				times = playout.at
			}

			const reference = createPlaylistTimingStateDoc(playlistId, cache, times[0])
			for (const time of times.slice(1)) {
				expect({ time, doc: createPlaylistTimingStateDoc(playlistId, cache, time) }).toEqual({
					time,
					doc: reference,
				})
			}
		})

		/**
		 * Regression guard. The cache is fed by the uiParts/uiPartInstances publications rather than
		 * the Parts/PartInstances collections, because a QuickLoop with forced auto-next rewrites
		 * expectedDuration - so reading the raw collections would make the server publish different
		 * numbers to the ones the UI shows. This pins that the difference is real and that the
		 * calculation follows the UI documents.
		 */
		it('uses the durations as modified for a forced-auto-next QuickLoop, not the raw ones', () => {
			const cache = createAndPopulateMockCache()
			const shortDuration = 1000
			const fallbackPartDuration = 6000

			cache.StudioSettings.remove(studioId)
			cache.StudioSettings.insert({
				_id: studioId,
				settings: {
					defaultDisplayDuration: DEFAULT_DISPLAY_DURATION_FROM_STUDIO,
					fallbackPartDuration,
				} as IStudioSettings,
			})

			// every part is shorter than the fallback, so the QuickLoop inflates each of them
			for (const part of cache.Parts.findFetch({})) {
				cache.Parts.replace({
					...part,
					expectedDuration: shortDuration,
					expectedDurationWithTransition: shortDuration,
				})
			}

			const rawTotal = 4 * shortDuration
			const uiTotal = 4 * fallbackPartDuration

			// what the raw Parts collection would have produced
			const docFromRawParts = createPlaylistTimingStateDoc(playlistId, cache, 10000)
			expect(docFromRawParts?.remainingDuration).toEqual({ paused: true, duration: rawTotal })

			// now apply the same modification uiParts makes, and the numbers change
			for (const part of cache.Parts.findFetch({})) {
				cache.Parts.replace({
					...part,
					expectedDuration: fallbackPartDuration,
					expectedDurationWithTransition: fallbackPartDuration,
				})
			}

			const docFromUIParts = createPlaylistTimingStateDoc(playlistId, cache, 10000)
			expect(docFromUIParts?.remainingDuration).toEqual({ paused: true, duration: uiTotal })
			expect(uiTotal).not.toEqual(rawTotal)
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

	/**
	 * The playlist and its PartInstances are written concurrently and observed separately, so the
	 * cache can briefly hold a playlist naming a PartInstance that has not arrived. Computing then
	 * is not merely stale, it is wrong in a way that is invisible afterwards, so the publication
	 * waits instead.
	 */
	describe('consistency of the cached view', () => {
		/** Point the playlist at a next PartInstance whose document has not been observed yet */
		function setDanglingNextPartInstance(cache: ContentCache): void {
			const playlist = cache.RundownPlaylists.findOne(playlistId)
			if (!playlist) throw new Error('Playlist not found in cache')
			playlist.nextPartInfo = {
				partInstanceId: protectString<PartInstanceId>('instance-not-yet-observed'),
				rundownId,
				manuallySelected: false,
				consumesQueuedSegmentId: false,
			}
			cache.RundownPlaylists.replace(playlist)
		}

		function setUpTakeInProgress(cache: ContentCache): void {
			const currentInstanceId = putPartOnAir(cache, 'part0', segmentId0, 'instance0', 1, {
				take: 20000,
				plannedStartedPlayback: 20000,
			})
			setPlaylistPlayout(cache, { startedPlayback: 20000, currentPartInstanceId: currentInstanceId })
			setDanglingNextPartInstance(cache)
		}

		it('is consistent when the playlist is inactive, which legitimately has no PartInstances', () => {
			const cache = createAndPopulateMockCache()

			expect(isCacheViewConsistent(playlistId, cache)).toBe(true)
		})

		it('is consistent once every named PartInstance has been observed', () => {
			const cache = createAndPopulateMockCache()
			const instanceId = putPartOnAir(cache, 'part0', segmentId0, 'instance0', 1, {
				take: 20000,
				plannedStartedPlayback: 20000,
			})
			setPlaylistPlayout(cache, { startedPlayback: 20000, currentPartInstanceId: instanceId })

			expect(isCacheViewConsistent(playlistId, cache)).toBe(true)
		})

		it('is inconsistent while a named PartInstance is missing', () => {
			const cache = createAndPopulateMockCache()
			setUpTakeInProgress(cache)

			expect(isCacheViewConsistent(playlistId, cache)).toBe(false)
		})

		it('publishes nothing new rather than a document computed from the gap', async () => {
			const cache = createAndPopulateMockCache()
			const state = {}

			// good documents are published first
			const first = await manipulatePlaylistTimingStatePublicationData({ playlistId }, state, { newCache: cache })
			expect(first?.map((doc) => doc._id)).toContain(getPlaylistTimingStateDocId(playlistId))

			setUpTakeInProgress(cache)

			// null leaves the previously published document in place
			const during = await manipulatePlaylistTimingStatePublicationData({ playlistId }, state, {
				invalidateTiming: true,
			})
			expect(during).toBeNull()
		})

		/**
		 * Shows why the guard is worth having: with a budgeted segment and an unresolvable next
		 * PartInstance, the calculator drops the segment's whole budget from the remaining pool.
		 */
		it('would otherwise drop unplayed budget segments from the remaining pool', () => {
			const cache = createAndPopulateMockCache()
			const budgetDuration = 300000

			// the upcoming segment is budgeted, so it only counts towards remaining once the
			// calculator can place the next PartInstance
			const segment1 = cache.Segments.findOne(segmentId1)
			if (!segment1) throw new Error('Segment not found in cache')
			segment1.segmentTiming = { budgetDuration, countdownType: CountdownType.SEGMENT_BUDGET_DURATION }
			cache.Segments.replace(segment1)

			const currentInstanceId = putPartOnAir(cache, 'part0', segmentId0, 'instance0', 1, {
				take: 20000,
				plannedStartedPlayback: 20000,
			})
			const nextInstanceId = putPartOnAir(cache, 'part1', segmentId0, 'instance1', 2, { take: 0 })
			setPlaylistPlayout(cache, { startedPlayback: 20000, currentPartInstanceId: currentInstanceId })

			const playlist = cache.RundownPlaylists.findOne(playlistId)
			if (!playlist) throw new Error('Playlist not found in cache')
			playlist.nextPartInfo = {
				partInstanceId: nextInstanceId,
				rundownId,
				manuallySelected: false,
				consumesQueuedSegmentId: false,
			}
			cache.RundownPlaylists.replace(playlist)

			const resolved = createPlaylistTimingStateDoc(playlistId, cache, 25000)
			expect(isCacheViewConsistent(playlistId, cache)).toBe(true)

			// now lose the next PartInstance, as happens in the window between the two writes
			setDanglingNextPartInstance(cache)
			const unresolved = createPlaylistTimingStateDoc(playlistId, cache, 25000)

			// the whole budget silently vanishes from the remaining pool
			const resolvedRemaining = evalDuration(resolved?.remainingDuration, 25000)
			const unresolvedRemaining = evalDuration(unresolved?.remainingDuration, 25000)
			expect(resolvedRemaining - unresolvedRemaining).toBe(budgetDuration)

			// which is exactly the state the guard refuses to publish
			expect(isCacheViewConsistent(playlistId, cache)).toBe(false)
		})
	})

	describe('document churn', () => {
		/**
		 * Which documents actually differ between two computations. The publication deep-diffs its
		 * output and only sends what changed, so this is what a subscriber sees on the wire - the
		 * property worth pinning, because the per-part documents make it O(parts) rather than O(1).
		 */
		function changedDocIds(before: TimingStateDoc[], after: TimingStateDoc[]): string[] {
			const beforeById = new Map(before.map((doc) => [unprotectString(doc._id), JSON.stringify(doc)]))

			return after
				.filter((doc) => beforeById.get(unprotectString(doc._id)) !== JSON.stringify(doc))
				.map((doc) => unprotectString(doc._id))
		}

		it('recomputing at a later time changes nothing', () => {
			const cache = createAndPopulateMockCache()
			const partInstanceId = putPartOnAir(cache, 'part0', segmentId0, 'instance0', 1, {
				plannedStartedPlayback: 1000,
			})
			setPlaylistPlayout(cache, { startedPlayback: 1000, currentPartInstanceId: partInstanceId })

			// this is what lets the publication stay quiet between playout events
			expect(
				changedDocIds(
					createTimingStateDocs(playlistId, cache, 2000),
					createTimingStateDocs(playlistId, cache, 10000)
				)
			).toEqual([])

			// Past the on-air part's planned end at 11000 the playlist document re-anchors: it reports
			// the same values, but a state that has passed its breakpoint is re-expressed as a plain
			// paused one. The part documents stay byte-identical even across that.
			expect(
				changedDocIds(
					createTimingStateDocs(playlistId, cache, 2000),
					createTimingStateDocs(playlistId, cache, 60000)
				)
			).toEqual(['playlist_playlist0'])
		})

		it('changing one part changes that part, and the countdowns that follow it', () => {
			const cache = createAndPopulateMockCache()
			const before = createTimingStateDocs(playlistId, cache, 1000)

			const part1 = cache.Parts.findOne(protectString('part1'))
			if (!part1) throw new Error('part1 not found in cache')
			cache.Parts.replace({ ...part1, expectedDuration: 20000, expectedDurationWithTransition: 20000 })

			// part1's own durations change, and the parts after it start later - but part0, which comes
			// before it, is untouched, as are the segment and playlist documents that do not span it
			expect(changedDocIds(before, createTimingStateDocs(playlistId, cache, 1000))).toEqual([
				'playlist_playlist0',
				'segment_segment0',
				'part_part1',
				'part_part2',
				'part_part3',
			])
		})

		it('a take changes every downstream countdown', () => {
			const cache = createAndPopulateMockCache()
			const instance0 = putPartOnAir(cache, 'part0', segmentId0, 'instance0', 1, { plannedStartedPlayback: 1000 })
			setPlaylistPlayout(cache, { startedPlayback: 1000, currentPartInstanceId: instance0 })
			const before = createTimingStateDocs(playlistId, cache, 5000)

			const instance1 = putPartOnAir(cache, 'part1', segmentId0, 'instance1', 2, { plannedStartedPlayback: 5000 })
			const playedInstance0 = cache.PartInstances.findOne(instance0)
			if (!playedInstance0) throw new Error('instance0 not found in cache')
			cache.PartInstances.replace({
				...playedInstance0,
				timings: { ...playedInstance0.timings, duration: 4000 },
			})
			setPlaylistPlayout(cache, { startedPlayback: 1000, currentPartInstanceId: instance1 })

			// Every part's countdown is an offset from the one that is running, so a take necessarily
			// moves all of them. This is inherent to publishing per-part countdowns at all - any
			// absolute per-part time depends on the durations accumulated before it - so it is pinned
			// here rather than treated as something to optimise away.
			// (segment0 is unchanged: the take stays within it and its played-out total is the same
			// either side of it)
			expect(changedDocIds(before, createTimingStateDocs(playlistId, cache, 5000))).toEqual([
				'playlist_playlist0',
				'part_part0',
				'part_part1',
				'part_part2',
				'part_part3',
			])
		})
	})

	describe('manipulatePlaylistTimingStatePublicationData', () => {
		it('publishes nothing before a cache is provided', async () => {
			const state = {}
			const result = await manipulatePlaylistTimingStatePublicationData({ playlistId }, state, undefined)

			expect(result).toEqual([])
		})

		it('publishes the playlist and a document per segment and part once a cache arrives', async () => {
			const cache = createAndPopulateMockCache()
			const state = {}

			const result = await manipulatePlaylistTimingStatePublicationData({ playlistId }, state, {
				newCache: cache,
			})

			expect(result?.map((doc) => doc._id)).toEqual([
				getPlaylistTimingStateDocId(playlistId),
				getSegmentTimingStateDocId(segmentId0),
				getSegmentTimingStateDocId(segmentId1),
				getPartTimingStateDocId(protectString('part0')),
				getPartTimingStateDocId(protectString('part1')),
				getPartTimingStateDocId(protectString('part2')),
				getPartTimingStateDocId(protectString('part3')),
			])
		})

		it('clears everything when the playlist disappears', async () => {
			const cache = createAndPopulateMockCache()
			const state = {}

			await manipulatePlaylistTimingStatePublicationData({ playlistId }, state, { newCache: cache })

			cache.RundownPlaylists.remove(playlistId)
			const result = await manipulatePlaylistTimingStatePublicationData({ playlistId }, state, {
				invalidateTiming: true,
			})

			expect(result).toEqual([])
		})
	})
})
