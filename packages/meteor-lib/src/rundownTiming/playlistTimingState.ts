/**
 * Calculates the playlist-level timing values as piecewise-linear TimerStates, for publishing
 * over DDP (the `playlistTimingState` publication).
 *
 * The key idea: every value shown in the rundown header is a piecewise-linear function of
 * wall-clock time — it counts down 1:1, holds constant, or pushes 1:1 — and the breakpoint
 * (the moment the on-air part/segment overruns its expected duration) is known in advance.
 * So instead of publishing evaluated numbers every second, we publish TimerStates that a
 * consumer evaluates locally with `timerStateToDuration` / `timerStateToZeroTime`, and the
 * server only republishes when playout or ingest state actually changes.
 *
 * The numbers are defined to be equivalent (between state changes) to what the
 * RundownTimingCalculator + PlaylistTiming helpers + getPlaylistTimingDiff produce — this is
 * asserted by the equivalence tests in __tests__/playlistTimingState.test.ts.
 */

import type { TimerState } from '@sofie-automation/corelib/dist/dataModel/TimerState'
import type { PlaylistTimingStateDoc } from '@sofie-automation/corelib/dist/dataModel/TimingState'
import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import type { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import type { SegmentId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import type { PartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { PlaylistTiming } from '@sofie-automation/corelib/dist/playout/rundownTiming'
import { unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { RundownTimingCalculator, type RundownTimingContext, type TimingId, getPartInstanceTimingId } from './index.js'

type CalculateTimingsPartInstance = Pick<
	PartInstance,
	'_id' | 'isTemporary' | 'segmentId' | 'segmentPlayoutId' | 'orphaned' | 'timings' | 'part'
>

/** The timing value fields of a PlaylistTimingStateDoc (without the document envelope) */
export type PlaylistTimingStateValues = Omit<PlaylistTimingStateDoc, '_id' | 'type' | 'playlistId'>

/**
 * Describes the single time-varying term of the playlist aggregates:
 * the on-air part (or budgeted segment) counts down until `pushTime`, after which the
 * remaining duration freezes and the as-played duration / estimated end start pushing 1:1.
 */
interface LiveMotion {
	/** The timestamp at which the live part/segment overruns (the piecewise breakpoint). */
	pushTime: number | undefined
	/** Whether the breakpoint has already passed (we are currently overrunning/pushing). */
	isPushing: boolean
}

/**
 * Calculate the playlist timing values as TimerStates for a given point in time.
 *
 * @param now Current timestamp. The returned states are anchored to this time, and remain valid
 *   until the next playout/ingest state change (at which point this should be re-run).
 * @param playlist The playlist
 * @param partInstances Sorted PartInstances (with unplayed Parts wrapped as temporary instances),
 *   as fed to RundownTimingCalculator
 * @param segmentsMap Segments of the playlist, in playlist order
 * @param defaultDuration Fallback duration for Parts without a duration of their own
 *   (the Studio's `defaultDisplayDuration`)
 * @param partsInQuickLoop As produced by findPartInstancesInQuickLoop
 */
export function calculatePlaylistTimingStates(
	now: number,
	playlist: DBRundownPlaylist,
	partInstances: CalculateTimingsPartInstance[],
	segmentsMap: Map<SegmentId, DBSegment>,
	defaultDuration: number,
	partsInQuickLoop: Record<TimingId, boolean>
): PlaylistTimingStateValues {
	const timingContext = new RundownTimingCalculator().updateDurations(
		now,
		false,
		playlist,
		partInstances,
		segmentsMap,
		defaultDuration,
		partsInQuickLoop
	)

	return calculatePlaylistTimingStatesFromContext(now, playlist, partInstances, segmentsMap, timingContext)
}

/**
 * Inner implementation of calculatePlaylistTimingStates, for callers that already have a
 * RundownTimingContext calculated at `now` for the same inputs.
 */
export function calculatePlaylistTimingStatesFromContext(
	now: number,
	playlist: DBRundownPlaylist,
	partInstances: CalculateTimingsPartInstance[],
	segmentsMap: Map<SegmentId, DBSegment>,
	timingContext: RundownTimingContext
): PlaylistTimingStateValues {
	const timing = playlist.timing

	const expectedStart = PlaylistTiming.getExpectedStart(timing)
	const expectedEnd = PlaylistTiming.getExpectedEnd(timing)
	const expectedDuration = PlaylistTiming.getExpectedDuration(timing)

	// Matching the header components: `Started` (and the started-based projections) are only
	// shown while the playlist is active
	const startedPlayback = playlist.activationId ? playlist.startedPlayback : undefined

	const remaining = timingContext.remainingPlaylistDuration ?? 0
	const motion = findLiveMotion(now, playlist, partInstances, segmentsMap, timingContext)

	return {
		timingType: timing.type,

		plannedStart: expectedStart !== undefined ? { paused: false, zeroTime: expectedStart } : undefined,
		plannedEnd: expectedEnd !== undefined ? { paused: false, zeroTime: expectedEnd } : undefined,
		plannedDuration: expectedDuration !== undefined ? { paused: true, duration: expectedDuration } : undefined,
		startedPlayback: startedPlayback !== undefined ? { paused: false, zeroTime: startedPlayback } : undefined,

		remainingDuration: calculateRemainingDurationState(
			now,
			timing,
			remaining,
			startedPlayback,
			expectedDuration,
			motion
		),
		estimatedEnd: calculateEstimatedEndState(
			now,
			remaining,
			startedPlayback,
			expectedStart,
			expectedDuration,
			timing,
			motion
		),
		overUnder: calculateOverUnderStates(now, playlist, timingContext, motion),
	}
}

/**
 * Find the piecewise breakpoint of the playlist aggregates: the moment the on-air part
 * (or the on-air segment's budget) overruns.
 *
 * This mirrors the branches of RundownTimingCalculator that make `remainingPlaylistDuration`
 * and `asPlayedPlaylistDuration` time-varying:
 * - a budgeted live segment contributes `max(0, budget - (now - segmentStartedPlayback))` to
 *   remaining and `max(now - segmentStartedPlayback, budget)` to as-played
 * - otherwise the live part contributes `max(0, partExpectedDuration - (now - startedPlayback))`
 *   to remaining and `max(partExpectedDuration, now - startedPlayback)` to as-played
 *
 * Both cross their breakpoint at the same time; everything else in the aggregates is constant.
 */
function findLiveMotion(
	now: number,
	playlist: DBRundownPlaylist,
	partInstances: CalculateTimingsPartInstance[],
	segmentsMap: Map<SegmentId, DBSegment>,
	timingContext: RundownTimingContext
): LiveMotion {
	const noMotion: LiveMotion = { pushTime: undefined, isPushing: false }

	const currentPartInstanceId = playlist.currentPartInfo?.partInstanceId
	if (!currentPartInstanceId) return noMotion

	const livePartInstance = partInstances.find((instance) => instance._id === currentPartInstanceId)
	if (!livePartInstance) return noMotion

	// Untimed parts don't contribute to the aggregates at all
	if (livePartInstance.part.untimed) return noMotion

	const liveSegment = segmentsMap.get(livePartInstance.segmentId)
	const segmentBudget = liveSegment?.segmentTiming?.budgetDuration

	if (segmentBudget !== undefined) {
		// Budgeted segment: remaining/as-played track the segment budget from when the segment started
		const segmentStartedPlayback =
			playlist.segmentsStartedPlayback?.[unprotectString(livePartInstance.segmentPlayoutId)]
		if (segmentStartedPlayback === undefined) return noMotion

		const pushTime = segmentStartedPlayback + segmentBudget
		return { pushTime, isPushing: now >= pushTime }
	} else {
		// Normal part: remaining/as-played track the live part's expected duration from when it started
		// (a startedPlayback in the future means it hasn't started yet, e.g. from an autonext)
		const lastStartedPlayback =
			(livePartInstance.timings?.plannedStartedPlayback ?? 0) <= now
				? livePartInstance.timings?.plannedStartedPlayback
				: undefined
		if (lastStartedPlayback === undefined) return noMotion
		// once a duration is set, the part is no longer driving the aggregates
		if (livePartInstance.timings?.duration !== undefined) return noMotion

		// Use the same (displayDurationGroup-affected) expected duration as the calculator did
		const partExpectedDuration =
			timingContext.partExpectedDurations?.[getPartInstanceTimingId(livePartInstance)] ?? 0

		const pushTime = lastStartedPlayback + partExpectedDuration
		return { pushTime, isPushing: now >= pushTime }
	}
}

/**
 * The remaining playlist duration ("Rem. Dur"), matching `PlaylistTiming.getRemainingDuration`.
 * duration read: counts down 1:1 while the live part is playing, freezes once it overruns.
 */
function calculateRemainingDurationState(
	now: number,
	timing: DBRundownPlaylist['timing'],
	remaining: number,
	startedPlayback: number | undefined,
	expectedDuration: number | undefined,
	motion: LiveMotion
): TimerState | undefined {
	// Duration-timed playlists count down against their own expected duration, ignoring content
	if (PlaylistTiming.isPlaylistDurationTimed(timing) && expectedDuration) {
		if (startedPlayback) {
			// counts down to startedPlayback + expectedDuration (and into negative when over)
			return { paused: false, zeroTime: startedPlayback + expectedDuration }
		} else {
			return { paused: true, duration: expectedDuration }
		}
	}

	if (motion.isPushing || motion.pushTime === undefined) {
		// Frozen (overrunning), or nothing is playing: remaining is constant
		return { paused: true, duration: remaining }
	}

	// Counting down; freezes when the live part overruns
	return { paused: false, zeroTime: now + remaining, pauseTime: motion.pushTime }
}

/**
 * The estimated end of the playlist ("Est. End"), matching `PlaylistTiming.getEstimatedEnd`.
 * zeroTime read: constant while on schedule, pushes 1:1 once the live part overruns
 * (or, before playback, once the planned start has passed).
 */
function calculateEstimatedEndState(
	now: number,
	remaining: number,
	startedPlayback: number | undefined,
	expectedStart: number | undefined,
	expectedDuration: number | undefined,
	timing: DBRundownPlaylist['timing'],
	motion: LiveMotion
): TimerState | undefined {
	// Duration-timed playlists have a fixed estimated end once started
	if (PlaylistTiming.isPlaylistDurationTimed(timing) && expectedDuration) {
		if (startedPlayback) {
			return { paused: false, zeroTime: startedPlayback + expectedDuration }
		} else if (expectedStart) {
			return { paused: false, zeroTime: expectedStart + expectedDuration }
		}
	}

	if (startedPlayback) {
		// estimatedEnd = now + remaining: constant while remaining counts down,
		// pushing 1:1 once remaining freezes. This is the same state as remainingDuration,
		// read through timerStateToZeroTime instead.
		if (motion.isPushing || motion.pushTime === undefined) {
			// zeroTime read of a paused state = now + duration: pushes 1:1
			return { paused: true, duration: remaining }
		}
		return { paused: false, zeroTime: now + remaining, pauseTime: motion.pushTime }
	}

	// Not started: estimatedEnd = max(now, expectedStart ?? now) + remaining
	if (expectedStart !== undefined && expectedStart > now) {
		// Fixed at expectedStart + remaining until the planned start passes, then pushes
		return { paused: false, zeroTime: expectedStart + remaining, pauseTime: expectedStart }
	}
	// Planned start already passed (or none): estimatedEnd = now + remaining, pushing 1:1
	return { paused: true, duration: remaining }
}

/**
 * The over/under schedule balance, matching `getPlaylistTimingDiff`, expressed as a
 * target/projected TimerState pair (both read via timerStateToZeroTime):
 * over = projected - target.
 *
 * For end-anchored modes (ForwardTime/BackTime while relevant), target is the (derived)
 * planned end and projected is the estimated end.
 * For duration-compared modes (None/Duration, and any played-out & deactivated playlist),
 * both are virtual end timestamps built on a common base: target = base + plannedDuration,
 * projected = base + asPlayedDuration.
 */
function calculateOverUnderStates(
	now: number,
	playlist: DBRundownPlaylist,
	timingContext: RundownTimingContext,
	motion: LiveMotion
): PlaylistTimingStateValues['overUnder'] {
	const { timing, startedPlayback, activationId } = playlist
	const active = !!activationId

	// Matching the header's hide rule: an untimed playlist with no expected duration that has
	// never been played has no meaningful diff
	if (
		PlaylistTiming.isPlaylistTimingNone(timing) &&
		PlaylistTiming.getExpectedDuration(timing) === undefined &&
		!startedPlayback
	) {
		return undefined
	}

	const asPlayed = timingContext.asPlayedPlaylistDuration || 0
	const plannedDuration = timing.expectedDuration ?? timingContext.totalPlaylistDuration ?? 0

	const playedOutAndDeactivated = !active && !!startedPlayback

	// All duration-compared cases: diff = asPlayed - plannedDuration
	if (
		PlaylistTiming.isPlaylistTimingNone(timing) ||
		PlaylistTiming.isPlaylistDurationTimed(timing) ||
		(playedOutAndDeactivated && !(PlaylistTiming.isPlaylistTimingForwardTime(timing) && timing.expectedEnd))
	) {
		const base = startedPlayback ?? now
		return {
			target: { paused: false, zeroTime: base + plannedDuration },
			projected: projectedAsPlayedEnd(now, base, asPlayed, playedOutAndDeactivated ? noMotionFrozen() : motion),
		}
	}

	// Played out & deactivated ForwardTime with a firm expectedEnd:
	// diff = startedPlayback + asPlayed - expectedEnd
	if (playedOutAndDeactivated && PlaylistTiming.isPlaylistTimingForwardTime(timing) && timing.expectedEnd) {
		// startedPlayback is set here (playedOutAndDeactivated)
		const base = startedPlayback ?? now
		return {
			target: { paused: false, zeroTime: timing.expectedEnd },
			projected: projectedAsPlayedEnd(now, base, asPlayed, noMotionFrozen()),
		}
	}

	// End-anchored modes: diff = frontAnchor + remaining - backAnchor
	const remaining = timingContext.remainingPlaylistDuration || 0

	let target: TimerState
	if (PlaylistTiming.isPlaylistTimingBackTime(timing)) {
		target = { paused: false, zeroTime: timing.expectedEnd }
	} else if (PlaylistTiming.isPlaylistTimingForwardTime(timing)) {
		if (timing.expectedEnd !== undefined) {
			target = { paused: false, zeroTime: timing.expectedEnd }
		} else if (startedPlayback !== undefined) {
			// backAnchor = startedPlayback + plannedDuration: constant
			target = { paused: false, zeroTime: startedPlayback + plannedDuration }
		} else if (timing.expectedStart > now) {
			// backAnchor = expectedStart + plannedDuration until the planned start passes, then pushes
			target = {
				paused: false,
				zeroTime: timing.expectedStart + plannedDuration,
				pauseTime: timing.expectedStart,
			}
		} else {
			// backAnchor = now + plannedDuration: pushes 1:1
			target = { paused: true, duration: plannedDuration }
		}
	} else {
		// (unreachable: None/Duration handled above)
		target = { paused: true, duration: plannedDuration }
	}

	// projected = frontAnchor + remaining, which is exactly the estimated-end shape
	let projected: TimerState
	const frontStartedPlayback = playlist.startedPlayback
	if (frontStartedPlayback !== undefined && frontStartedPlayback <= now) {
		// frontAnchor = now: projected = now + remaining
		if (motion.isPushing || motion.pushTime === undefined) {
			projected = { paused: true, duration: remaining }
		} else {
			projected = { paused: false, zeroTime: now + remaining, pauseTime: motion.pushTime }
		}
	} else {
		const frontStart = PlaylistTiming.isPlaylistTimingForwardTime(timing)
			? Math.max(timing.expectedStart, now)
			: now
		if (frontStart > now) {
			projected = { paused: false, zeroTime: frontStart + remaining, pauseTime: frontStart }
		} else {
			projected = { paused: true, duration: remaining }
		}
	}

	return { target, projected }
}

/** A LiveMotion representing "nothing is moving" (used for deactivated playlists) */
function noMotionFrozen(): LiveMotion {
	return { pushTime: undefined, isPushing: false }
}

/**
 * A TimerState whose zeroTime read equals `base + asPlayed(t)`:
 * constant until the live part overruns (asPlayed grows by planned durations only),
 * then pushing 1:1 (the live part's as-played term is `max(expected, elapsed)`).
 */
function projectedAsPlayedEnd(now: number, base: number, asPlayedNow: number, motion: LiveMotion): TimerState {
	if (motion.isPushing) {
		// Already pushing: the zeroTime read of a paused state is `t + duration`, moving 1:1 with
		// time. Anchor the duration so that at t = now the read equals base + asPlayedNow.
		return { paused: true, duration: base + asPlayedNow - now }
	}
	if (motion.pushTime !== undefined) {
		// Constant until pushTime, then pushes
		return { paused: false, zeroTime: base + asPlayedNow, pauseTime: motion.pushTime }
	}
	// Constant
	return { paused: false, zeroTime: base + asPlayedNow }
}
