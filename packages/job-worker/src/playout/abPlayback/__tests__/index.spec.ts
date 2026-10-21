import {
	IBlueprintPieceType,
	PieceLifespan,
	ShowStyleBlueprintManifest,
	TSR,
} from '@sofie-automation/blueprints-integration'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { EmptyPieceTimelineObjectsBlob } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { PieceInstancePiece, ResolvedPieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { OnGenerateTimelineObjExt } from '@sofie-automation/corelib/dist/dataModel/Timeline'
import { literal } from '@sofie-automation/corelib/dist/lib'
import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { MockJobContext, setupDefaultJobEnvironment } from '../../../__mocks__/context.js'
import { setupMockShowStyleCompound } from '../../../__mocks__/presetCollections.js'
import { WrappedShowStyleBlueprint } from '../../../blueprints/cache.js'
import { AbSessionHelper } from '../abSessionHelper.js'
import { applyAbPlaybackForTimeline } from '../index.js'

const POOL_NAME = 'clip'

describe('applyAbPlaybackForTimeline', () => {
	let jobContext: MockJobContext
	beforeEach(async () => {
		jobContext = setupDefaultJobEnvironment()
	})

	const partInstance = {
		_id: protectString('partInstance0'),
		part: {
			_id: protectString('part0'),
			_rank: 0,
		},
	} as any as DBPartInstance

	function createResolvedPiece(id: string, start: number): ResolvedPieceInstance {
		const piece = literal<PieceInstancePiece>({
			_id: protectString(id),
			externalId: id,
			name: `name-${id}`,
			enable: { start },
			sourceLayerId: 'source0',
			outputLayerId: '',
			privateData: {},
			lifespan: PieceLifespan.WithinPart,
			timelineObjectsString: EmptyPieceTimelineObjectsBlob,
			content: {},
			invalid: false,
			startPartId: protectString(''),
			pieceType: IBlueprintPieceType.Normal,
			abSessions: [{ sessionName: `session-${id}`, poolName: POOL_NAME }],
		})

		return {
			instance: {
				_id: protectString(`inst_${id}`),
				partInstanceId: partInstance._id,
				rundownId: protectString(''),
				playlistActivationId: protectString(''),
				piece,
			},
			resolvedStart: start,
			resolvedDuration: undefined,
			timelinePriority: 0,
		}
	}

	function createObject(id: string, pieceId: string): OnGenerateTimelineObjExt {
		return literal<OnGenerateTimelineObjExt>({
			id,
			layer: 'clip',
			enable: { start: 0 },
			content: { deviceType: TSR.DeviceType.ABSTRACT },
			abSessions: [{ sessionName: `session-${pieceId}`, poolName: POOL_NAME }],
			metaData: null,
			pieceInstanceId: `inst_${pieceId}`,
			partInstanceId: partInstance._id,
			priority: 0,
		})
	}

	test('debug info', async () => {
		const showStyle = await setupMockShowStyleCompound(jobContext)

		const blueprint: WrappedShowStyleBlueprint = {
			blueprintId: protectString('blueprint0'),
			blueprintHash: 'hash0',
			blueprint: {
				getAbResolverConfiguration: () => ({
					resolverOptions: { idealGapBefore: 1000, nowWindow: 2000 },
					pools: { [POOL_NAME]: [{ playerId: 1 }, { playerId: 2 }] },
					timelineObjectLayerChangeRules: {
						clip: {
							acceptedPoolNames: [POOL_NAME],
							newLayerName: (playerId) => `clip_${playerId}`,
							allowsLookahead: false,
						},
					},
				}),
			} as Partial<ShowStyleBlueprintManifest> as ShowStyleBlueprintManifest,
		}

		const playlist = {
			_id: protectString('playlist0'),
			name: 'playlist0',
			assignedAbSessions: {},
			trackedAbSessions: [],
		} as Partial<DBRundownPlaylist> as DBRundownPlaylist

		const abSessionHelper = new AbSessionHelper([partInstance], [])
		let nextId = 0
		abSessionHelper.getNewSessionId = () => `session#${nextId++}`

		const now = Date.now()
		const pieces = [createResolvedPiece('a', now - 1000), createResolvedPiece('b', now - 500)]
		const objects = [createObject('obj_a', 'a'), createObject('obj_b', 'b')]

		const result = applyAbPlaybackForTimeline(
			jobContext,
			abSessionHelper,
			blueprint,
			showStyle,
			playlist,
			pieces,
			objects
		)

		const debug = result.debug
		expect(debug).toBeTruthy()
		if (!debug) throw new Error('Missing debug')

		expect(debug.resolverOptions).toEqual({ idealGapBefore: 1000, nowWindow: 2000 })
		expect(debug.previousAssignments).toEqual({})
		expect(debug.previousTrackedSessions).toEqual([])
		expect(debug.trackedSessions.map((s) => s.id)).toEqual(['session#0', 'session#1'])

		const poolDebug = debug.pools[POOL_NAME]
		expect(poolDebug).toBeTruthy()
		expect(poolDebug.players).toEqual([
			{ playerId: 1, enabled: true },
			{ playerId: 2, enabled: true },
		])
		expect(poolDebug.pieces).toMatchObject([
			{ pieceInstanceId: 'inst_a', sessionId: 'session#0', sessionReason: 'new', sourceLayerId: 'source0' },
			{ pieceInstanceId: 'inst_b', sessionId: 'session#1', sessionReason: 'new', sourceLayerId: 'source0' },
		])

		// The requests should be captured before the resolver assigned them
		expect(poolDebug.requests.map((r) => r.playerId)).toEqual([undefined, undefined])
		expect(poolDebug.result.requests.map((r) => [r.id, r.playerId])).toEqual([
			['session#0', 1],
			['session#1', 2],
		])
		expect(poolDebug.decisions.filter((d) => d.step === 'assigned').map((d) => d.sessionId)).toEqual([
			'session#0',
			'session#1',
		])

		expect(poolDebug.objects).toMatchObject([
			{
				objectId: 'obj_a',
				sessionId: 'session#0',
				layerBefore: 'clip',
				layerAfter: 'clip_1',
				outcome: 'applied',
			},
			{
				objectId: 'obj_b',
				sessionId: 'session#1',
				layerBefore: 'clip',
				layerAfter: 'clip_2',
				outcome: 'applied',
			},
		])
		expect(poolDebug.assignments).toEqual(result.assignments[POOL_NAME])
	})
})
