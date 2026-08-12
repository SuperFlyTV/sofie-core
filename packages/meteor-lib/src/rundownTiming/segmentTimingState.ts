/**
 * Assembles the per-segment timing values as TimerStates (SegmentTimingStateDocs).
 *
 * These are the numbers the segment duration displays show. Like the playlist states they are
 * anchors rather than evaluated values, so a consumer keeps them current between recomputes and the
 * server only republishes when playout or ingest state changes.
 */

import type { TimerState } from '@sofie-automation/corelib/dist/dataModel/TimerState'
import type { SegmentTimingStateDoc } from '@sofie-automation/corelib/dist/dataModel/TimingState'
import type { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import type { SegmentId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import type { PartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { calculatePartInstanceExpectedDurationWithTransition } from '@sofie-automation/corelib/dist/playout/timings'
import { CountdownType } from '@sofie-automation/blueprints-integration'
import { type RundownTimingContext, getPartInstanceTimingId } from './index.js'

type CalculateTimingsPartInstance = Pick<
	PartInstance,
	'_id' | 'isTemporary' | 'segmentId' | 'segmentPlayoutId' | 'orphaned' | 'timings' | 'part'
>

/** The timing value fields of a SegmentTimingStateDoc (without the document envelope) */
export type SegmentTimingStateValues = Omit<SegmentTimingStateDoc, '_id' | 'type' | 'playlistId' | 'segmentId'>

/**
 * Calculate the timing values for every segment of the playlist.
 *
 * @param now Current timestamp, which the returned states are anchored to
 * @param timingContext The context calculated at `now` for the same inputs
 * @param partInstances Sorted PartInstances, as fed to the RundownTimingCalculator
 * @param segmentsMap Segments of the playlist, in playlist order
 */
export function calculateSegmentTimingStates(
	now: number,
	timingContext: RundownTimingContext,
	partInstances: CalculateTimingsPartInstance[],
	segmentsMap: Map<SegmentId, DBSegment>
): Map<SegmentId, SegmentTimingStateValues> {
	const partInstancesBySegment = new Map<SegmentId, CalculateTimingsPartInstance[]>()
	for (const partInstance of partInstances) {
		const existing = partInstancesBySegment.get(partInstance.segmentId)
		if (existing) {
			existing.push(partInstance)
		} else {
			partInstancesBySegment.set(partInstance.segmentId, [partInstance])
		}
	}

	const states = new Map<SegmentId, SegmentTimingStateValues>()
	for (const segment of segmentsMap.values()) {
		states.set(
			segment._id,
			calculateOneSegmentTimingStates(now, timingContext, segment, partInstancesBySegment.get(segment._id) ?? [])
		)
	}

	return states
}

function calculateOneSegmentTimingStates(
	now: number,
	timingContext: RundownTimingContext,
	segment: DBSegment,
	partInstances: CalculateTimingsPartInstance[]
): SegmentTimingStateValues {
	const budgetDuration = segment.segmentTiming?.budgetDuration
	const countdownType = segment.segmentTiming?.countdownType ?? CountdownType.PART_EXPECTED_DURATION

	if (countdownType === CountdownType.SEGMENT_BUDGET_DURATION) {
		const plannedDuration = budgetDuration ?? 0

		// Only the on-air segment's budget is actually counting down
		const isOnAir = timingContext.currentSegmentId === segment._id
		const remaining =
			(isOnAir ? timingContext.remainingBudgetOnCurrentSegmentState : undefined) ??
			({ paused: true, duration: plannedDuration } satisfies TimerState)

		return {
			countdownType,
			plannedDuration: { paused: true, duration: plannedDuration },
			// A budgeted segment has never reported a played-out time - the display's count-up mode
			// reads zero for one today, and this preserves that rather than quietly changing it
			playedOut: { paused: true, duration: 0 },
			remaining,
		}
	}

	const { playedOut, isAccumulating } = sumPlayedOut(now, timingContext, partInstances)
	const plannedDuration = budgetDuration ?? sumExpectedDurations(partInstances)

	return {
		countdownType,
		plannedDuration: { paused: true, duration: plannedDuration },
		// Counting up is a value going negative, per the usual convention
		// (subtracting rather than negating, so that nothing played gives 0 rather than -0)
		playedOut: isAccumulating
			? { paused: false, zeroTime: now - playedOut }
			: { paused: true, duration: 0 - playedOut },
		remaining: isAccumulating
			? { paused: false, zeroTime: now + plannedDuration - playedOut }
			: { paused: true, duration: plannedDuration - playedOut },
	}
}

/**
 * The segment's played-out time at `now`, and whether it is still growing - which it is exactly
 * when the segment holds the on-air part and that part has started.
 */
function sumPlayedOut(
	now: number,
	timingContext: RundownTimingContext,
	partInstances: CalculateTimingsPartInstance[]
): { playedOut: number; isAccumulating: boolean } {
	const partPlayed = timingContext.partPlayed ?? {}

	let playedOut = 0
	let isAccumulating = false

	for (const partInstance of partInstances) {
		if (partInstance.part.untimed) continue

		playedOut += partPlayed[getPartInstanceTimingId(partInstance)] || 0

		if (partInstance._id === timingContext.currentPartInstanceId) {
			// note: a start in the future means the part has not begun, so nothing is accumulating yet
			const startedPlayback = partInstance.timings?.plannedStartedPlayback
			if (startedPlayback !== undefined && startedPlayback <= now) isAccumulating = true
		}
	}

	return { playedOut, isAccumulating }
}

/** The planned length of a segment with no budget: the sum of its parts' expected durations */
function sumExpectedDurations(partInstances: CalculateTimingsPartInstance[]): number {
	let total = 0
	for (const partInstance of partInstances) {
		if (partInstance.orphaned || partInstance.part.untimed) continue
		total += calculatePartInstanceExpectedDurationWithTransition(partInstance) || 0
	}
	return total
}
