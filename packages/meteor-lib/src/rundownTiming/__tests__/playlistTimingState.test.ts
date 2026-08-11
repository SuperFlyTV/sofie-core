import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import type { RundownPlaylistActivationId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import type { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import type { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { literal } from '@sofie-automation/corelib/dist/lib'
import { protectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import { CountdownType, PlaylistTimingType, type SegmentTimingInfo } from '@sofie-automation/blueprints-integration'
import type { SegmentId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import type { PartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { wrapPartToTemporaryInstance } from '@sofie-automation/corelib/dist/playout/stateCacheResolver'
import {
	timerStateToDuration,
	timerStateToZeroTime,
	type TimerState,
} from '@sofie-automation/corelib/dist/dataModel/TimerState'
import { PlaylistTiming } from '@sofie-automation/corelib/dist/playout/rundownTiming'
import { RundownTimingCalculator } from '../index.js'
import { calculatePlaylistTimingStates, getPlaylistTimingDiff } from '../playlistTimingState.js'

const DEFAULT_DURATION = 0

function makeMockPlaylist(): DBRundownPlaylist {
	return literal<DBRundownPlaylist>({
		_id: protectString('mock-playlist'),
		externalId: 'mock-playlist',
		studioId: protectString('studio0'),
		name: 'Mock Playlist',
		created: 0,
		modified: 0,
		currentPartInfo: null,
		nextPartInfo: null,
		previousPartInfo: null,
		timing: {
			type: PlaylistTimingType.None,
		},
		rundownIdsInOrder: [],

		tTimers: [
			{ index: 1, label: '', mode: null, state: null },
			{ index: 2, label: '', mode: null, state: null },
			{ index: 3, label: '', mode: null, state: null },
		],
	})
}

function makeMockPart(
	id: string,
	rank: number,
	rundownId: string,
	segmentId: string,
	expectedDuration: number | undefined
): DBPart {
	return literal<DBPart>({
		_id: protectString(id),
		externalId: id,
		title: '',
		segmentId: protectString(segmentId),
		_rank: rank,
		rundownId: protectString(rundownId),
		expectedDuration,
		expectedDurationWithTransition: expectedDuration,
	})
}

function makeMockSegment(id: string, rank: number, rundownId: string, timing?: SegmentTimingInfo): DBSegment {
	return literal<DBSegment>({
		_id: protectString(id),
		name: 'mock-segment',
		externalId: id,
		_rank: rank,
		rundownId: protectString(rundownId),
		segmentTiming: timing,
	})
}

interface MockScenario {
	playlist: DBRundownPlaylist
	partInstances: PartInstance[]
	segmentsMap: Map<SegmentId, DBSegment>
}

/**
 * Build a simple playlist of 4 parts across 2 segments, 10s each (40s planned content).
 */
function makeStandardScenario(segmentTiming?: SegmentTimingInfo): MockScenario {
	const rundownId = 'rundown1'
	const playlist = makeMockPlaylist()

	const segmentsMap = new Map<SegmentId, DBSegment>()
	segmentsMap.set(protectString('segment1'), makeMockSegment('segment1', 0, rundownId, segmentTiming))
	segmentsMap.set(protectString('segment2'), makeMockSegment('segment2', 1, rundownId))

	const parts: DBPart[] = [
		makeMockPart('part1', 0, rundownId, 'segment1', 10000),
		makeMockPart('part2', 1, rundownId, 'segment1', 10000),
		makeMockPart('part3', 2, rundownId, 'segment2', 10000),
		makeMockPart('part4', 3, rundownId, 'segment2', 10000),
	]
	const partInstances = parts.map((part) => wrapPartToTemporaryInstance(protectString(''), part))

	return { playlist, partInstances, segmentsMap }
}

/**
 * Put the first part of the scenario on air.
 * @param startedPlayback When the part (and playlist) started playing
 */
function putFirstPartOnAir(scenario: MockScenario, startedPlayback: number): void {
	const livePartInstance = scenario.partInstances[0]
	livePartInstance.timings = {
		take: startedPlayback,
		plannedStartedPlayback: startedPlayback,
	}
	scenario.playlist.activationId = protectString<RundownPlaylistActivationId>('active')
	scenario.playlist.startedPlayback = startedPlayback
	scenario.playlist.currentPartInfo = {
		partInstanceId: livePartInstance._id,
		rundownId: livePartInstance.rundownId,
		manuallySelected: false,
		consumesQueuedSegmentId: false,
	}
	scenario.playlist.nextPartInfo = {
		partInstanceId: scenario.partInstances[1]._id,
		rundownId: scenario.partInstances[1].rundownId,
		manuallySelected: false,
		consumesQueuedSegmentId: false,
	}
}

/**
 * Assert that the published TimerStates, evaluated at several points in time after `now`,
 * are equivalent to what the ported calculator + PlaylistTiming helpers + getPlaylistTimingDiff
 * produce when run at those times (with unchanged inputs).
 */
function assertEquivalence(scenario: MockScenario, now: number, offsets: number[]): void {
	const { playlist, partInstances, segmentsMap } = scenario

	const states = calculatePlaylistTimingStates(now, playlist, partInstances, segmentsMap, DEFAULT_DURATION, {})

	for (const offset of offsets) {
		const t = now + offset

		// Reference values, computed the "old way" at time t
		const referenceContext = new RundownTimingCalculator().updateDurations(
			t,
			false,
			playlist,
			partInstances,
			segmentsMap,
			DEFAULT_DURATION,
			{}
		)
		const gatedStartedPlayback = playlist.activationId ? playlist.startedPlayback : undefined
		const referenceRemaining = PlaylistTiming.getRemainingDuration(
			playlist.timing,
			t,
			referenceContext.remainingPlaylistDuration,
			gatedStartedPlayback
		)
		const referenceEstimatedEnd = PlaylistTiming.getEstimatedEnd(
			playlist.timing,
			t,
			referenceContext.remainingPlaylistDuration,
			gatedStartedPlayback
		)
		const referenceDiff = getPlaylistTimingDiff(playlist, referenceContext, t)

		// Static values
		expect(evalZeroTime(states.plannedStart, t)).toBe(PlaylistTiming.getExpectedStart(playlist.timing))
		expect(evalZeroTime(states.plannedEnd, t)).toBe(PlaylistTiming.getExpectedEnd(playlist.timing))
		expect(evalDuration(states.plannedDuration, t)).toBe(PlaylistTiming.getExpectedDuration(playlist.timing))
		expect(evalZeroTime(states.startedPlayback, t)).toBe(gatedStartedPlayback)

		// Live values
		expect({ offset, value: evalDuration(states.remainingDuration, t) }).toEqual({
			offset,
			value: referenceRemaining,
		})
		expect({ offset, value: evalZeroTime(states.estimatedEnd, t) }).toEqual({
			offset,
			value: referenceEstimatedEnd,
		})

		// the published state reads as time in hand, the reference diff is over-positive
		const publishedDiff = states.overUnder ? 0 - timerStateToDuration(states.overUnder, t) : undefined
		expect({ offset, value: publishedDiff }).toEqual({ offset, value: referenceDiff })
	}
}

function evalDuration(state: TimerState | undefined, now: number): number | undefined {
	return state ? timerStateToDuration(state, now) : undefined
}
function evalZeroTime(state: TimerState | undefined, now: number): number | undefined {
	return state ? timerStateToZeroTime(state, now) : undefined
}

describe('calculatePlaylistTimingStates', () => {
	describe('ForwardTime', () => {
		it('matches the reference before playback, spanning the planned start', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.ForwardTime,
				expectedStart: 20000,
				expectedDuration: 40000,
			}

			// now = 10000: planned start is 10s away; offsets span past it
			assertEquivalence(scenario, 10000, [0, 1000, 9999, 10000, 15000, 60000])
		})

		it('matches the reference with an expectedEnd, before playback', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.ForwardTime,
				expectedStart: 20000,
				expectedDuration: 40000,
				expectedEnd: 60000,
			}

			assertEquivalence(scenario, 10000, [0, 1000, 9999, 10000, 15000, 60000])
		})

		it('matches the reference during playback, spanning the on-air part overrunning', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.ForwardTime,
				expectedStart: 20000,
				expectedDuration: 40000,
				expectedEnd: 60000,
			}
			putFirstPartOnAir(scenario, 20000)

			// now = 25000: 5s into a 10s part; the part overruns at 30000
			assertEquivalence(scenario, 25000, [0, 1000, 4999, 5000, 5001, 10000, 60000])
		})

		it('matches the reference when the doc is generated while already overrunning', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.ForwardTime,
				expectedStart: 20000,
				expectedEnd: 60000,
			}
			putFirstPartOnAir(scenario, 20000)

			// now = 35000: the 10s part has been overrunning for 5s
			assertEquivalence(scenario, 35000, [0, 1000, 30000])
		})

		it('matches the reference once deactivated after playout', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.ForwardTime,
				expectedStart: 20000,
				expectedDuration: 40000,
				expectedEnd: 60000,
			}
			// played out: all parts have durations
			for (const partInstance of scenario.partInstances) {
				partInstance.timings = {
					take: 0,
					plannedStartedPlayback: 0,
					duration: 11000,
				}
			}
			scenario.playlist.activationId = undefined
			scenario.playlist.startedPlayback = 20000

			assertEquivalence(scenario, 70000, [0, 1000, 30000])
		})

		it('matches the reference once deactivated after playout, without an expectedEnd', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.ForwardTime,
				expectedStart: 20000,
				expectedDuration: 40000,
			}
			for (const partInstance of scenario.partInstances) {
				partInstance.timings = {
					take: 0,
					plannedStartedPlayback: 0,
					duration: 9000,
				}
			}
			scenario.playlist.activationId = undefined
			scenario.playlist.startedPlayback = 20000

			assertEquivalence(scenario, 70000, [0, 1000, 30000])
		})
	})

	describe('BackTime', () => {
		it('matches the reference during playback, spanning the on-air part overrunning', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.BackTime,
				expectedEnd: 60000,
			}
			putFirstPartOnAir(scenario, 20000)

			assertEquivalence(scenario, 25000, [0, 1000, 4999, 5000, 5001, 10000, 60000])
		})

		it('matches the reference before playback', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.BackTime,
				expectedEnd: 60000,
				expectedDuration: 40000,
			}

			assertEquivalence(scenario, 10000, [0, 1000, 30000])
		})
	})

	describe('None', () => {
		it('publishes no overUnder for an untimed playlist that has never been played', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.None,
			}

			const states = calculatePlaylistTimingStates(
				10000,
				scenario.playlist,
				scenario.partInstances,
				scenario.segmentsMap,
				DEFAULT_DURATION,
				{}
			)
			expect(states.overUnder).toBeUndefined()
			expect(states.plannedStart).toBeUndefined()
			expect(states.plannedEnd).toBeUndefined()
			expect(states.plannedDuration).toBeUndefined()
		})

		it('matches the reference during playback, spanning the on-air part overrunning', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.None,
				expectedDuration: 40000,
			}
			putFirstPartOnAir(scenario, 20000)

			assertEquivalence(scenario, 25000, [0, 1000, 4999, 5000, 5001, 10000, 60000])
		})
	})

	describe('Duration', () => {
		it('matches the reference during playback, spanning the on-air part overrunning', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.Duration,
				expectedDuration: 40000,
			}
			putFirstPartOnAir(scenario, 20000)

			assertEquivalence(scenario, 25000, [0, 1000, 4999, 5000, 5001, 10000, 60000])
		})

		it('matches the reference before playback, with an expectedStart', () => {
			const scenario = makeStandardScenario()
			scenario.playlist.timing = {
				type: PlaylistTimingType.Duration,
				expectedDuration: 40000,
				expectedStart: 20000,
			}

			assertEquivalence(scenario, 10000, [0, 1000, 9999, 10000, 15000, 60000])
		})
	})

	describe('Segment budget durations', () => {
		it('matches the reference during playback, spanning the budget overrunning', () => {
			const scenario = makeStandardScenario({
				budgetDuration: 25000,
				countdownType: CountdownType.SEGMENT_BUDGET_DURATION,
			})
			scenario.playlist.timing = {
				type: PlaylistTimingType.ForwardTime,
				expectedStart: 20000,
				expectedEnd: 70000,
			}
			putFirstPartOnAir(scenario, 20000)
			scenario.playlist.segmentsStartedPlayback = {
				[scenario.partInstances[0].segmentPlayoutId as unknown as string]: 20000,
			}

			// now = 30000: 10s into a 25s budget; the budget overruns at 45000
			assertEquivalence(scenario, 30000, [0, 1000, 14999, 15000, 15001, 30000])
		})
	})
})
