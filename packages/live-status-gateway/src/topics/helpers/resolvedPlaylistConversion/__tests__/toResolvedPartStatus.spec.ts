import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { ResolvedPartState } from '@sofie-automation/live-status-gateway-api'
import { NoteSeverity } from '@sofie-automation/blueprints-integration'
import { toResolvedPartStatus } from '../parts/toResolvedPartStatus.js'
import {
	makePartInstance,
	makePieceInstance,
	makePlaylist,
	makeRundown,
	makeSegment,
	makeTestShowStyleBaseExt,
} from './resolvedPlaylistConversionTestUtils.js'
import { createResolvedPlaylistConversionContext } from '../context/conversionContext.js'
import { splitTimingStates } from '../../../../collections/playlistTimingStatesHandler.js'
import type { PartTimingStateDoc } from '@sofie-automation/corelib/dist/dataModel/TimingState'
import type { PartId, SegmentId } from '@sofie-automation/corelib/dist/dataModel/Ids'

describe('toResolvedPartStatus', () => {
	it('maps current part state and nested pieces', () => {
		const currentPartInstanceId = protectString('current_pi')
		const ctx = createResolvedPlaylistConversionContext({
			playlistState: makePlaylist({
				currentPartInfo: { partInstanceId: currentPartInstanceId },
			}),
			rundownsState: [makeRundown('rundown0')],
			showStyleBaseExtState: makeTestShowStyleBaseExt(),
			segmentsState: [makeSegment('segment0', 'rundown0', 0)],
			partsState: [],
			partInstancesInPlaylistState: [makePartInstance('current_pi', 'part0', 'segment0', 'rundown0')],
			piecesInPlaylistState: [],
			pieceInstancesInPlaylistState: [],
		})

		const partExtended = {
			partId: protectString('part0'),
			instance: {
				...makePartInstance('current_pi', 'part0', 'segment0', 'rundown0'),
				orphaned: 'adlib-part',
				part: {
					...makePartInstance('current_pi', 'part0', 'segment0', 'rundown0').part,
					invalid: true,
					floated: true,
					untimed: true,
					invalidReason: {
						message: { key: 'Invalid {{foo}}', args: { foo: 'bar' }, namespaces: ['blueprint_test'] },
						severity: NoteSeverity.WARNING,
						color: '#ff0000',
					},
				},
			},
			startsAt: 1000,
			renderedDuration: 2000,
			pieces: [{ instance: makePieceInstance('piece0') }],
		} as any

		const result = toResolvedPartStatus(ctx, partExtended)
		expect(result.state).toBe(ResolvedPartState.CURRENT)
		expect(result.createdByAdLib).toBe(true)
		expect(result.id).toBe('part0')
		expect(result.instanceId).toBe('current_pi')
		expect(result.invalid).toBe(true)
		expect(result.floated).toBe(true)
		expect(result.untimed).toBe(true)
		expect(result.invalidReason).toMatchObject({
			message: 'Invalid bar',
			severity: 'warning',
			color: '#ff0000',
		})
		expect(result.timing).toMatchObject({
			startMs: 1000,
			durationMs: 2000,
			plannedStartedPlayback: 10,
			reportedStartedPlayback: 11,
			playOffsetMs: 12,
			setAsNext: 13,
			take: 14,
		})
		expect(result.pieces).toHaveLength(1)
	})

	it('maps next part state and default timing fallbacks', () => {
		const nextPartInstanceId = protectString('next_pi')
		const ctx = createResolvedPlaylistConversionContext({
			playlistState: makePlaylist({
				nextPartInfo: { partInstanceId: nextPartInstanceId },
			}),
			rundownsState: [makeRundown('rundown0')],
			showStyleBaseExtState: makeTestShowStyleBaseExt(),
			segmentsState: [makeSegment('segment0', 'rundown0', 0)],
			partsState: [],
			partInstancesInPlaylistState: [makePartInstance('next_pi', 'part1', 'segment0', 'rundown0')],
			piecesInPlaylistState: [],
			pieceInstancesInPlaylistState: [],
		})

		const partExtended = {
			partId: protectString('part1'),
			instance: makePartInstance('next_pi', 'part1', 'segment0', 'rundown0'),
		} as any

		const result = toResolvedPartStatus(ctx, partExtended)
		expect(result.state).toBe(ResolvedPartState.NEXT)
		expect(result.invalid).toBe(false)
		expect(result.floated).toBe(false)
		expect(result.untimed).toBe(false)
		expect(result.invalidReason).toBeUndefined()
		expect(result.timing.startMs).toBe(0)
		expect(result.timing.durationMs).toBe(0)
		expect(result.pieces).toEqual([])
	})
})

describe('toResolvedPartStatus rundown timing', () => {
	const partId = protectString<PartId>('part0')
	const segmentId = protectString<SegmentId>('segment0')

	function contextWithTiming(timing: Partial<PartTimingStateDoc> | undefined) {
		return createResolvedPlaylistConversionContext({
			playlistState: makePlaylist({}),
			rundownsState: [makeRundown('rundown0')],
			showStyleBaseExtState: makeTestShowStyleBaseExt(),
			segmentsState: [makeSegment('segment0', 'rundown0', 0)],
			partsState: [],
			partInstancesInPlaylistState: [],
			piecesInPlaylistState: [],
			pieceInstancesInPlaylistState: [],
			timingStatesState: timing
				? splitTimingStates([{ type: 'part', partId, segmentId, ...timing } as PartTimingStateDoc])
				: undefined,
		})
	}

	const partExtended = { partId, instance: makePartInstance('pi0', 'part0', 'segment0', 'rundown0') } as any

	it('forwards the published timers untouched, so the client evaluates them itself', () => {
		const countdown = { paused: false as const, zeroTime: 1600000070000, pauseTime: 1600000060000 }
		const played = { paused: true as const, duration: 0, resumesAt: 1600000060000 }

		const result = toResolvedPartStatus(contextWithTiming({ countdown, played }), partExtended)

		expect(result.rundownTiming).toMatchObject({ countdown, played })
	})

	it('evaluates the resolved durations, which are constant', () => {
		const result = toResolvedPartStatus(
			contextWithTiming({
				expectedDuration: { paused: true, duration: 10000 },
				displayDuration: { paused: true, duration: 12000 },
				isInQuickLoop: true,
				countsTowardsTiming: true,
			}),
			partExtended
		)

		expect(result.rundownTiming).toMatchObject({
			expectedDurationMs: 10000,
			displayDurationMs: 12000,
			isInQuickLoop: true,
			countsTowardsTiming: true,
		})
	})

	it('reports zeroes rather than nothing while the publication has not arrived', () => {
		const result = toResolvedPartStatus(contextWithTiming(undefined), partExtended)

		expect(result.rundownTiming).toMatchObject({
			expectedDurationMs: 0,
			displayDurationMs: 0,
			isInQuickLoop: false,
			countsTowardsTiming: false,
		})
		expect(result.rundownTiming?.countdown).toBeUndefined()
	})
})
