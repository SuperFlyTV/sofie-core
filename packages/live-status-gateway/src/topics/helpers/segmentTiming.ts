import type { PartTimingStateDoc, SegmentTimingStateDoc } from '@sofie-automation/corelib/dist/dataModel/TimingState'
import { timerStateToDuration, timerStateToZeroTime } from '@sofie-automation/corelib/dist/dataModel/TimerState'
import { CountdownType, type SegmentTimingInfo } from '@sofie-automation/blueprints-integration'
import {
	SegmentCountdownType,
	type CurrentSegmentTiming,
	type SegmentTiming,
} from '@sofie-automation/live-status-gateway-api'

/**
 * A Segment's timing, taken from the `playlistTimingState` publication.
 *
 * Sofie resolves these itself, so the gateway does no timing arithmetic - it forwards the timers and
 * evaluates only the values the public schema declares as plain numbers. This is what makes the
 * numbers here the same ones the Sofie UI shows.
 */
export function calculateSegmentTiming(
	segmentTimingInfo: SegmentTimingInfo | undefined,
	timing: SegmentTimingStateDoc | undefined,
	partTimings: PartTimingStateDoc[] | undefined
): SegmentTiming {
	return {
		// Summed from the Parts rather than taken from the Segment's published `plannedDuration`:
		// for a Segment with a budget duration that is the budget, whereas this field has always
		// meant the length of the content, with the budget reported separately below.
		expectedDurationMs: sumExpectedDurations(partTimings),
		budgetDurationMs: segmentTimingInfo?.budgetDuration,
		countdownType: translateSegmentCountdownType(segmentTimingInfo?.countdownType),
		playedOut: timing?.playedOut,
		remaining: timing?.remaining,
	}
}

/**
 * As {@link calculateSegmentTiming}, plus when the Segment is now projected to end.
 *
 * `projectedEndTime` is the zero time of the remaining-time timer. Note that it is a plain number in
 * the public schema, so while the Segment is not counting down it is only accurate at the moment it
 * was sent; `remaining` is the value to use for anything that has to stay accurate.
 */
export function calculateCurrentSegmentTiming(
	segmentTimingInfo: SegmentTimingInfo | undefined,
	timing: SegmentTimingStateDoc | undefined,
	partTimings: PartTimingStateDoc[] | undefined,
	now: number
): CurrentSegmentTiming {
	const segmentTiming = calculateSegmentTiming(segmentTimingInfo, timing, partTimings)

	return {
		...segmentTiming,
		projectedEndTime: timing?.remaining ? timerStateToZeroTime(timing.remaining, now) : now,
	}
}

/**
 * The length of a Segment's content: the sum of its Parts' expected durations as Sofie resolves
 * them - with transitions, and through display-duration groups.
 */
function sumExpectedDurations(partTimings: PartTimingStateDoc[] | undefined): number {
	if (!partTimings) return 0

	return partTimings.reduce(
		// a constant state, so any instant reads the same value
		(sum, part) => sum + (part.expectedDuration ? timerStateToDuration(part.expectedDuration, 0) : 0),
		0
	)
}

function translateSegmentCountdownType(type: CountdownType | undefined): SegmentCountdownType | undefined {
	switch (type) {
		case undefined:
			return undefined
		case CountdownType.PART_EXPECTED_DURATION:
			return SegmentCountdownType.PART_EXPECTED_DURATION
		case CountdownType.SEGMENT_BUDGET_DURATION:
			return SegmentCountdownType.SEGMENT_BUDGET_DURATION
		default:
			return undefined
	}
}
