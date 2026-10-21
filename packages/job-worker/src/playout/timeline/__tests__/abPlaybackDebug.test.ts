import {
	ABResolverConfiguration,
	OnGenerateTimelineObj,
	ShowStyleBlueprintManifest,
	TSR,
} from '@sofie-automation/blueprints-integration'
import { RundownId, RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { deserializeTimelineBlob, TimelineComplete } from '@sofie-automation/corelib/dist/dataModel/Timeline'
import { literal } from '@sofie-automation/corelib/dist/lib'
import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { MockJobContext, setupDefaultJobEnvironment } from '../../../__mocks__/context.js'
import { setupDefaultRundownPlaylist, setupMockShowStyleCompound } from '../../../__mocks__/presetCollections.js'
import { adjustFakeTime, useFakeCurrentTime, useRealCurrentTime } from '../../../__mocks__/time.js'
import { restartRandomId } from '../../../__mocks__/nanoid.js'
import { handleActivateRundownPlaylist, handleDeactivateRundownPlaylist } from '../../activePlaylistJobs.js'
import { handleTakeNextPart } from '../../take.js'
import { handleTimelineTriggerTime } from '../../timings/index.js'

const POOL_NAME = 'clip'

const AB_RESOLVER_CONFIGURATION: ABResolverConfiguration = {
	resolverOptions: { idealGapBefore: 1000, nowWindow: 2000 },
	pools: { [POOL_NAME]: [{ playerId: 1 }, { playerId: 2 }] },
	timelineObjectLayerChangeRules: {},
}

describe('AB playback debug on the timeline', () => {
	let context: MockJobContext
	let playlistId: RundownPlaylistId
	let rundownId: RundownId

	beforeEach(async () => {
		restartRandomId()
		useFakeCurrentTime()

		context = setupDefaultJobEnvironment()
		context.queueEventJob = async () => Promise.resolve()

		const showStyle = await setupMockShowStyleCompound(context)
		;({ playlistId, rundownId } = await setupDefaultRundownPlaylist(context, showStyle))

		// Give a piece an ab session, so that the resolver has something to do. piece000 gets pruned, so use piece001
		await context.mockCollections.Pieces.update(protectString(`${rundownId}_piece001`), {
			$set: {
				abSessions: [{ poolName: POOL_NAME, sessionName: 'clip0' }],
			},
		})
	})
	afterEach(() => {
		useRealCurrentTime()
	})

	async function activateAndTake() {
		await handleActivateRundownPlaylist(context, { playlistId, rehearsal: false })
		await handleTakeNextPart(context, { playlistId, fromPartInstanceId: null })
	}

	async function getTimeline(): Promise<TimelineComplete> {
		const timeline = await context.directCollections.Timelines.findOne(context.studioId)
		if (!timeline) throw new Error('Missing timeline')
		return timeline
	}

	async function getPlaylist(): Promise<DBRundownPlaylist> {
		const playlist = await context.directCollections.RundownPlaylists.findOne(playlistId)
		if (!playlist) throw new Error('Missing playlist')
		return playlist
	}

	test('no debug info when the blueprint does not use ab playback', async () => {
		await activateAndTake()

		const timeline = await getTimeline()
		expect(timeline.abPlaybackDebug).toBeUndefined()
	})

	test('no debug info once the playlist is deactivated', async () => {
		context.updateShowStyleBlueprint({
			getAbResolverConfiguration: () => AB_RESOLVER_CONFIGURATION,
		})

		await activateAndTake()
		expect((await getTimeline()).abPlaybackDebug).toBeTruthy()

		// This regenerates the timeline as the studio baseline
		await handleDeactivateRundownPlaylist(context, { playlistId })

		expect((await getTimeline()).abPlaybackDebug).toBeUndefined()
	})

	test('stores the debug info on the timeline', async () => {
		context.updateShowStyleBlueprint({
			getAbResolverConfiguration: () => AB_RESOLVER_CONFIGURATION,
		})

		await activateAndTake()

		const timeline = await getTimeline()
		const debug = timeline.abPlaybackDebug
		expect(debug).toBeTruthy()
		if (!debug) throw new Error('Missing debug')

		expect(debug.error).toBeUndefined()
		expect(debug.resolverOptions).toEqual(AB_RESOLVER_CONFIGURATION.resolverOptions)
		expect(Object.keys(debug.pools)).toEqual([POOL_NAME])

		const poolDebug = debug.pools[POOL_NAME]
		expect(poolDebug.requests).toHaveLength(1)
		expect(poolDebug.requests[0].name).toBe('clip0')
		expect(poolDebug.result.requests[0].playerId).toBe(1)

		// The tracked sessions should match what was persisted onto the playlist
		const playlist = await getPlaylist()
		expect(playlist.trackedAbSessions).toHaveLength(1)
		expect(debug.trackedSessions).toEqual(playlist.trackedAbSessions)
		expect(debug.previousTrackedSessions).toEqual([])
	})

	test('trackedSessions includes sessions created by onTimelineGenerate', async () => {
		const blueprint: Partial<ShowStyleBlueprintManifest> = {
			getAbResolverConfiguration: () => AB_RESOLVER_CONFIGURATION,
			onTimelineGenerate: async (blueprintContext, timeline, _persistentState, _previousEndState, pieces) => {
				const piece = pieces.find((p) => p.piece.abSessions?.length)
				if (piece) blueprintContext.getPieceABSessionId(piece, 'fromOnTimelineGenerate')
				return { timeline }
			},
		}
		context.updateShowStyleBlueprint(blueprint)

		await activateAndTake()

		const debug = (await getTimeline()).abPlaybackDebug
		if (!debug) throw new Error('Missing debug')

		expect(debug.trackedSessions.map((s) => s.name).sort()).toEqual(['clip_clip0', 'fromOnTimelineGenerate'])
		expect(debug.trackedSessions).toEqual((await getPlaylist()).trackedAbSessions)
	})

	test('the previous tracked sessions are those from the previous generation', async () => {
		context.updateShowStyleBlueprint({
			getAbResolverConfiguration: () => AB_RESOLVER_CONFIGURATION,
		})

		await activateAndTake()
		const firstDebug = (await getTimeline()).abPlaybackDebug
		if (!firstDebug) throw new Error('Missing debug')
		expect(firstDebug.trackedSessions).toHaveLength(1)

		adjustFakeTime(5000)
		await handleTakeNextPart(context, {
			playlistId,
			fromPartInstanceId: (await getPlaylist()).currentPartInfo?.partInstanceId ?? null,
		})

		const secondDebug = (await getTimeline()).abPlaybackDebug
		if (!secondDebug) throw new Error('Missing debug')

		expect(secondDebug.previousTrackedSessions).toEqual(firstDebug.trackedSessions)
		expect(Object.keys(secondDebug.previousAssignments[POOL_NAME] ?? {})).toEqual(
			Object.keys(firstDebug.pools[POOL_NAME].assignments)
		)
	})

	test('records an error thrown by onTimelineGenerate', async () => {
		context.updateShowStyleBlueprint({
			getAbResolverConfiguration: () => AB_RESOLVER_CONFIGURATION,
			onTimelineGenerate: async () => {
				throw new Error('Something went wrong')
			},
		})

		await activateAndTake()

		const debug = (await getTimeline()).abPlaybackDebug
		if (!debug) throw new Error('Missing debug')

		expect(debug.error).toMatch(/Something went wrong/)
		// The ab resolving still ran, so the pool details are present
		expect(debug.pools[POOL_NAME].requests).toHaveLength(1)

		// The new state was not persisted onto the playlist
		expect((await getPlaylist()).trackedAbSessions ?? []).toEqual([])
	})

	test('the debug info is preserved when the timeline is updated by a trigger time', async () => {
		context.updateShowStyleBlueprint({
			getAbResolverConfiguration: () => AB_RESOLVER_CONFIGURATION,
			// Add an object which starts at 'now', for the trigger time to update
			onTimelineGenerate: async (_context, timeline) => ({
				timeline: [
					...timeline,
					literal<OnGenerateTimelineObj<TSR.TSRTimelineContent>>({
						id: 'nowObj',
						enable: { start: 'now' },
						layer: 'layer0',
						content: { deviceType: TSR.DeviceType.ABSTRACT },
						priority: 0,
					}),
				],
			}),
		})

		await activateAndTake()

		const timelineBefore = await getTimeline()
		expect(timelineBefore.abPlaybackDebug).toBeTruthy()

		expect(deserializeTimelineBlob(timelineBefore.timelineBlob).find((obj) => obj.id === 'nowObj')).toBeTruthy()

		await handleTimelineTriggerTime(context, {
			results: [{ id: 'nowObj', time: 12345 }],
		})

		const timelineAfter = await getTimeline()
		expect(deserializeTimelineBlob(timelineAfter.timelineBlob).find((obj) => obj.id === 'nowObj')?.enable).toEqual({
			start: 12345,
			setFromNow: true,
		})
		expect(timelineAfter.timelineHash).not.toEqual(timelineBefore.timelineHash)
		expect(timelineAfter.abPlaybackDebug).toEqual(timelineBefore.abPlaybackDebug)
	})
})
