/**
 * Timing state for a timer, optimized for efficient client rendering.
 * When running, the client calculates current time from zeroTime.
 * When paused, the duration is frozen and sent directly.
 * pauseTime indicates when the timer should automatically pause (when current part ends and overrun begins).
 *
 * Client rendering logic:
 * ```typescript
 * if (state.paused === true) {
 *   // Manually paused by user or already pushing/overrun
 *   duration = state.duration
 * } else if (state.pauseTime && now >= state.pauseTime) {
 *   // Auto-pause at overrun (current part ended)
 *   duration = state.zeroTime - state.pauseTime
 * } else {
 *   // Running normally
 *   duration = state.zeroTime - now
 * }
 * ```
 */
export type TimerState =
	| {
			/** Whether the timer is paused */
			paused: false
			/** The absolute timestamp (ms) when the timer reaches/reached zero */
			zeroTime: number
			/** Optional timestamp when the timer should pause (when current part ends) */
			pauseTime?: number | null
	  }
	| {
			/** Whether the timer is paused */
			paused: true
			/** The frozen duration value in milliseconds */
			duration: number
			/** Optional timestamp when the timer should pause (null when already paused/pushing) */
			pauseTime?: number | null
	  }

/**
 * Calculate the current duration for a timer state.
 * Handles paused, auto-pause (pauseTime), and running states.
 *
 * @param state The timer state
 * @param now Current timestamp in milliseconds
 * @returns The current duration in milliseconds
 */
export function timerStateToDuration(state: TimerState, now: number): number {
	if (state.paused) {
		// Manually paused by user or already pushing/overrun
		return state.duration
	} else if (state.pauseTime != null && now >= state.pauseTime) {
		// Auto-pause at overrun (current part ended)
		return state.zeroTime - state.pauseTime
	} else {
		// Running normally
		return state.zeroTime - now
	}
}

/**
 * Get the zero time (reference timestamp) for a timer state.
 * - For countdown/timeOfDay timers: when the timer reaches zero
 * - For freeRun timers: when the timer started (what it counts from)
 * For paused timers, calculates when zero would be if resumed now.
 *
 * @param state The timer state
 * @param now Current timestamp in milliseconds
 * @returns The zero time timestamp in milliseconds
 */
export function timerStateToZeroTime(state: TimerState, now: number): number {
	if (state.paused) {
		// Calculate when zero would be if we resumed now
		return now + state.duration
	} else if (state.pauseTime && now >= state.pauseTime) {
		// Auto-pause at overrun (current part ended)
		return state.zeroTime - state.pauseTime + now
	} else {
		// Already have the zero time
		return state.zeroTime
	}
}
