import type { PartTimingStateDoc, PlaylistTimingStateDoc } from '@sofie-automation/corelib/dist/dataModel/TimingState'
import { timerStateToDuration, timerStateToZeroTime } from '@sofie-automation/corelib/dist/dataModel/TimerState'
import type { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import type { CurrentPartTiming } from '@sofie-automation/live-status-gateway-api'

/**
 * The on-air Part's timing, taken from the `playlistTimingState` publication.
 *
 * `expectedDurationMs` is the *resolved* duration - the transition included, the Part's share of a
 * display-duration group where it has no duration of its own, the Studio default where it has
 * neither - not the raw `expectedDuration` off the Part.
 *
 * `startTime` follows Sofie's own timing in using `plannedStartedPlayback`, so that the projected
 * end lines up with the countdowns rather than being a few frames out.
 */
export function calculateCurrentPartTiming(
	currentPartInstance: DBPartInstance,
	partTiming: PartTimingStateDoc | undefined,
	playlistTiming: PlaylistTimingStateDoc | undefined,
	now: number
): CurrentPartTiming {
	const startTime = currentPartInstance.timings?.plannedStartedPlayback ?? now

	// a constant state, so any instant reads the same value
	const expectedDurationMs = partTiming?.expectedDuration ? timerStateToDuration(partTiming.expectedDuration, 0) : 0

	return {
		startTime,
		expectedDurationMs,
		projectedEndTime: playlistTiming?.remainingOnCurrentPart
			? timerStateToZeroTime(playlistTiming.remainingOnCurrentPart, now)
			: startTime + expectedDurationMs,
	}
}
