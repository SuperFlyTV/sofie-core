import type { PlaylistTimingType } from '@sofie-automation/blueprints-integration'
import { ProtectedString, protectString } from '../protectedString.js'
import type { PartInstanceId, RundownPlaylistId, SegmentId } from './Ids.js'
import type { TimerState } from './TimerState.js'

export type TimingStateDocId = ProtectedString<'TimingStateDoc'>

/**
 * A document published by the `playlistTimingState` publication, which carries the timing state of
 * everything within a RundownPlaylist.
 *
 * Every timing value is expressed as a `TimerState` — a piecewise-linear function of wall-clock time —
 * so that consumers can evaluate the current value locally (via `timerStateToDuration` /
 * `timerStateToZeroTime`) and the server only needs to publish updates when playout or ingest state
 * changes, never on a clock tick.
 *
 * This is a discriminated union, keyed on `type`, with one document per "area": the playlist itself
 * today, and per-segment / per-partInstance documents to follow. Consumers must narrow on `type`
 * (e.g. with `isPlaylistTimingStateDoc`) rather than assuming a shape, and must include `type` in
 * any projection they use.
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
	 * The on-air PartInstance, if any. Consumers that render a specific part should compare this
	 * before using the on-air timers below, so that they never show another part's numbers.
	 */
	currentPartInstanceId?: PartInstanceId
	/** The on-air Segment, if any. Same purpose, for segment-scoped consumers. */
	currentSegmentId?: SegmentId

	/**
	 * Time left of the on-air part ("On Air").
	 * duration read = time remaining, going negative once the part overruns - it is deliberately
	 * not clamped, because overrunning is what the display highlights.
	 * Holds at the part's full duration until the part actually starts (`resumesAt`), which is the
	 * window after a take in a multi-gateway studio.
	 */
	remainingOnCurrentPart?: TimerState
	/**
	 * Time left of the on-air segment's budget ("Seg. Budg.").
	 * Omitted unless the on-air segment uses `CountdownType.SEGMENT_BUDGET_DURATION` - consumers
	 * hide the display when it is absent.
	 */
	remainingBudgetOnCurrentSegment?: TimerState

	/**
	 * Schedule balance ("Over"/"Under").
	 * duration read = the time in hand: positive = under (ahead of schedule), negative = over.
	 * The UI's over-positive diff is therefore `-timerStateToDuration(overUnder, now)`.
	 *
	 * The balance holds steady while the playlist is on schedule and burns down 1:1 once it starts
	 * pushing, so `resumesAt` is the moment it starts being consumed.
	 *
	 * Omitted when not meaningful (an untimed playlist with no expected duration that has never
	 * been played) — consumers should hide the Over/Under display in that case.
	 */
	overUnder?: TimerState
}

export function getPlaylistTimingStateDocId(playlistId: RundownPlaylistId): TimingStateDocId {
	return protectString(`playlist_${playlistId}`)
}

/**
 * Narrow a published timing state document to the playlist-level one.
 * Note that `type` must be present on the document, so include it in any projection.
 */
export function isPlaylistTimingStateDoc(doc: Pick<TimingStateDoc, 'type'>): doc is PlaylistTimingStateDoc {
	return doc.type === 'playlist'
}
