import { ABResolverConfiguration, TSR } from '@sofie-automation/blueprints-integration'
import { ABSessionAssignments } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { OnGenerateTimelineObjExt } from '@sofie-automation/corelib/dist/dataModel/Timeline'
import { literal } from '@sofie-automation/corelib/dist/lib'
import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { CommonContext } from '../../../blueprints/context/index.js'
import { AbSessionHelper } from '../abSessionHelper.js'
import { applyAbPlayerObjectAssignments } from '../applyAssignments.js'
import type { AbPlaybackDebugObject } from '@sofie-automation/corelib/dist/dataModel/AbPlaybackDebug'
import _ from 'underscore'

const POOL_NAME = 'clip'

describe('applyMediaPlayersAssignments', () => {
	const abSessionHelper = new AbSessionHelper([], [])

	const mockGetPieceSessionId: jest.MockedFunction<typeof abSessionHelper.getPieceABSessionId> = jest.fn()
	const mockGetObjectSessionId: jest.MockedFunction<typeof abSessionHelper.getTimelineObjectAbSessionId> = jest.fn()

	const context = new CommonContext({
		name: 'test',
		identifier: 'test',
	})

	const abConfiguration: Pick<ABResolverConfiguration, 'timelineObjectLayerChangeRules' | 'customApplyToObject'> = {}

	abSessionHelper.getPieceABSession = (...args) => ({ sessionId: mockGetPieceSessionId(...args), reason: 'new' })
	abSessionHelper.getTimelineObjectAbSession = (...args) => {
		const sessionId = mockGetObjectSessionId(...args)
		return sessionId ? { sessionId, reason: 'new' } : undefined
	}
	beforeEach(() => {
		mockGetPieceSessionId.mockReset().mockImplementation(() => {
			throw new Error('Method not implemented.')
		})
		mockGetObjectSessionId.mockReset().mockImplementation(() => {
			throw new Error('Method not implemented.')
		})
	})

	test('no assignments', () => {
		const res = applyAbPlayerObjectAssignments(abSessionHelper, context, abConfiguration, [], {}, [], POOL_NAME)
		expect(res).toEqual({})
	})

	test('only previous assignments', () => {
		const previousAssignments: ABSessionAssignments = {
			abc: {
				sessionId: 'abc',
				sessionName: 'abc',
				playerId: 5,
				lookahead: false,
			},
			def: {
				sessionId: 'def',
				sessionName: 'def',
				playerId: 3,
				lookahead: true,
			},
		}

		const res = applyAbPlayerObjectAssignments(
			abSessionHelper,
			context,
			abConfiguration,
			[],
			previousAssignments,
			[],
			POOL_NAME
		)
		expect(res).toEqual({})
	})

	test('object with unmatched assignments', () => {
		const previousAssignments: ABSessionAssignments = {
			piece0_clip_def: {
				sessionId: 'piece0_clip_def',
				sessionName: 'def',
				playerId: 3,
				lookahead: false,
			},
		}
		const pieceInstanceId = 'piece0'
		const partInstanceId = protectString('part0')

		mockGetObjectSessionId.mockImplementation(
			(obj, session) => `${obj.pieceInstanceId}_${session.poolName}_${session.sessionName}`
		)

		const objects = [
			literal<OnGenerateTimelineObjExt>({
				// This should not get assigned, as it is truely unknown, and could cause all kinds of chaos
				id: '0',
				layer: '0',
				enable: {
					start: 900,
					duration: 1000,
				},
				content: {
					deviceType: TSR.DeviceType.ABSTRACT,
				},
				abSessions: [
					{
						sessionName: 'abc',
						poolName: POOL_NAME,
					},
				],
				metaData: null,
				pieceInstanceId: pieceInstanceId,
				partInstanceId: partInstanceId,
				priority: 0,
			}),
			literal<OnGenerateTimelineObjExt>({
				// This should get assigned, as it was previously known
				id: '1',
				layer: '1',
				enable: {
					start: 3000,
					duration: 1000,
				},
				content: {
					deviceType: TSR.DeviceType.ABSTRACT,
				},
				abSessions: [
					{
						sessionName: 'def',
						poolName: POOL_NAME,
					},
				],
				metaData: null,
				pieceInstanceId: pieceInstanceId,
				partInstanceId: partInstanceId,
				priority: 0,
			}),
		]

		const res = applyAbPlayerObjectAssignments(
			abSessionHelper,
			context,
			abConfiguration,
			objects,
			previousAssignments,
			[],
			POOL_NAME
		)
		// expect(context._getNotes()).toHaveLength(0)
		expect(res).toMatchObject({
			piece0_clip_def: {
				sessionId: 'piece0_clip_def',
				playerId: 3,
				lookahead: false,
			},
		})
	})

	test('debug objects', () => {
		const previousAssignments: ABSessionAssignments = {
			piece0_clip_xyz: {
				sessionId: 'piece0_clip_xyz',
				sessionName: 'xyz',
				playerId: 3,
				lookahead: false,
			},
		}
		const partInstanceId = protectString('part0')

		mockGetObjectSessionId.mockImplementation((obj, session) =>
			session.sessionName === 'none'
				? undefined
				: `${obj.pieceInstanceId}_${session.poolName}_${session.sessionName}`
		)

		const createObject = (
			id: string,
			layer: string,
			sessionName: string,
			pieceInstanceId: string | undefined,
			poolName = POOL_NAME
		) =>
			literal<OnGenerateTimelineObjExt>({
				id,
				layer,
				enable: { start: 900 },
				content: { deviceType: TSR.DeviceType.ABSTRACT },
				abSessions: [{ sessionName, poolName }],
				metaData: null,
				pieceInstanceId,
				partInstanceId,
				priority: 0,
			})

		const objects = [
			createObject('0', 'clip', 'abc', 'piece0'),
			createObject('1', 'other', 'def', 'piece0'),
			createObject('2', 'clip', 'ghi', 'piece0'),
			createObject('3', 'clip', 'xyz', 'piece0'),
			createObject('4', 'clip', 'abc', undefined),
			createObject('5', 'clip', 'none', 'piece0'),
			createObject('6', 'clip', 'abc', 'piece0', 'otherPool'),
		]

		const debugObjects: AbPlaybackDebugObject[] = []
		applyAbPlayerObjectAssignments(
			abSessionHelper,
			context,
			{
				timelineObjectLayerChangeRules: {
					clip: {
						acceptedPoolNames: [POOL_NAME],
						newLayerName: (playerId) => `clip_${playerId}`,
						allowsLookahead: false,
					},
				},
			},
			objects,
			previousAssignments,
			[
				{ id: 'piece0_clip_abc', name: 'abc', start: 0, end: undefined, playerId: 1, pieceNames: [] },
				{ id: 'piece0_clip_def', name: 'def', start: 0, end: undefined, playerId: 2, pieceNames: [] },
				{ id: 'piece0_clip_ghi', name: 'ghi', start: 0, end: undefined, pieceNames: [] },
			],
			POOL_NAME,
			debugObjects
		)

		const pickResult = (obj: AbPlaybackDebugObject) =>
			_.pick(obj, 'objectId', 'sessionId', 'playerId', 'layerBefore', 'layerAfter', 'outcome')
		expect(debugObjects.map(pickResult)).toEqual([
			{
				objectId: '0',
				sessionId: 'piece0_clip_abc',
				playerId: 1,
				layerBefore: 'clip',
				layerAfter: 'clip_1',
				outcome: 'applied',
			},
			{
				objectId: '1',
				sessionId: 'piece0_clip_def',
				playerId: 2,
				layerBefore: 'other',
				layerAfter: 'other',
				outcome: 'failed',
			},
			{
				objectId: '2',
				sessionId: 'piece0_clip_ghi',
				playerId: undefined,
				layerBefore: 'clip',
				layerAfter: 'clip',
				outcome: 'noPlayer',
			},
			{
				objectId: '3',
				sessionId: 'piece0_clip_xyz',
				playerId: 3,
				layerBefore: 'clip',
				layerAfter: 'clip_3',
				outcome: 'unexpected',
			},
			{
				objectId: '4',
				sessionId: undefined,
				playerId: undefined,
				layerBefore: 'clip',
				layerAfter: 'clip',
				outcome: 'noPieceInstance',
			},
			{
				objectId: '5',
				sessionId: undefined,
				playerId: undefined,
				layerBefore: 'clip',
				layerAfter: 'clip',
				outcome: 'noSession',
			},
		])
	})

	// TODO - more tests
})
