import type { PlaylistTimingType } from '@sofie-automation/blueprints-integration'
import { ProtectedString, protectString } from '../protectedString.js'
import type { RundownPlaylistId } from './Ids.js'
import type { TimerState } from './TimerState.js'

export type TimingStateDocId = ProtectedString<'TimingStateDoc'>

/**
 * A document published by the `playlistTimingState` publication.
 *
 * Every timing value is expressed as a `TimerState` — a piecewise-linear function of wall-clock time —
 * so that consumers can evaluate the current value locally (via `timerStateToDuration` /
 * `timerStateToZeroTime`) and the server only needs to publish updates when playout or ingest state
 * changes, never on a clock tick.
 *
 * This is a discriminated union so that more document shapes (per-segment, per-partInstance)
 * can be published into the same collection later.
 */
export type TimingStateDoc = PlaylistTimingStateDoc

/**
 * Playlist-level timing values: the timers shown in the rundown header.
 */
export interface PlaylistTimingStateDoc {
	_id: TimingStateDocId
	type: 'playlist'
	playlistId: RundownPlaylistId

	/** Which timing mode the playlist is in (None/ForwardTime/BackTime/Duration) */
	timingType: PlaylistTimingType

	/**
	 * Planned start of the playlist.
	 * zeroTime read = the planned start timestamp ("Plan. Start"),
	 * duration read = countdown until the planned start ("Start In").
	 * Omitted if the playlist has no (derivable) planned start.
	 */
	plannedStart?: TimerState

	/**
	 * Planned end of the playlist.
	 * zeroTime read = the planned end timestamp ("Plan. End").
	 * Omitted if the playlist has no (derivable) planned end.
	 */
	plannedEnd?: TimerState

	/**
	 * Planned duration of the playlist ("Plan. Dur").
	 * Always paused (a constant duration read).
	 * Omitted if the playlist has no planned duration.
	 */
	plannedDuration?: TimerState

	/**
	 * Actual start of playback (only present while the playlist is active, matching the header behavior).
	 * zeroTime read = the startedPlayback timestamp ("Started").
	 */
	startedPlayback?: TimerState

	/**
	 * Remaining content duration of the playlist.
	 * duration read = time remaining ("Rem. Dur").
	 * pauseTime = the expected end of the on-air part: once the on-air part overruns,
	 * the remaining duration freezes (the equivalent of the old client-side `max(0, …)` clamp).
	 */
	remainingDuration?: TimerState

	/**
	 * Estimated end of the playlist.
	 * zeroTime read = the projected end timestamp ("Est. End").
	 * While the on-air part is overrunning (past pauseTime) the estimate pushes 1:1 with time.
	 * Kept separate from remainingDuration: before playback with a future planned start,
	 * the estimated end is fixed while the remaining duration is also fixed — a single state
	 * cannot express both a constant timestamp and a constant duration at once.
	 */
	estimatedEnd?: TimerState

	/**
	 * Schedule balance ("Over"/"Under"), expressed like a T-timer projection: a target state
	 * and a projected state. (A single TimerState cannot express the over/under shape —
	 * constant while on schedule, then moving 1:1 once pushing — but the difference of two can.)
	 *
	 * Evaluate both with `timerStateToZeroTime`:
	 * over = projected - target (positive = over / behind schedule),
	 * under = target - projected (positive = under / time in hand).
	 *
	 * Omitted when not meaningful (an untimed playlist with no expected duration that has never
	 * been played) — consumers should hide the Over/Under display in that case.
	 */
	overUnder?: {
		/** When the playlist is planned to end (or a virtual equivalent for duration-compared modes) */
		target: TimerState
		/** When the playlist is projected to end (or a virtual equivalent for duration-compared modes) */
		projected: TimerState
	}
}

export function getPlaylistTimingStateDocId(playlistId: RundownPlaylistId): TimingStateDocId {
	return protectString(`playlist_${playlistId}`)
}
