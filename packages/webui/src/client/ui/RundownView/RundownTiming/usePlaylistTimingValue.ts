import { useEffect, useState } from 'react'
import type { PartInstanceId, RundownPlaylistId, SegmentId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import {
	getPlaylistTimingStateDocId,
	getSegmentTimingStateDocId,
	isPlaylistTimingStateDoc,
	isSegmentTimingStateDoc,
	type PlaylistTimingStateDoc,
	type SegmentTimingStateDoc,
	type TimingStateDoc,
	type TimingStateDocId,
} from '@sofie-automation/corelib/dist/dataModel/TimingState'
import {
	type TimerState,
	timerStateToDuration,
	timerStateToZeroTime,
} from '@sofie-automation/corelib/dist/dataModel/TimerState'
import type { MongoFieldSpecifierOnes } from '@sofie-automation/corelib/dist/mongo'
import { PlaylistTimingStates } from '../../Collections.js'
import { useTracker } from '../../../lib/ReactMeteorData/ReactMeteorData.js'
import { getCurrentTime } from '../../../lib/systemTime.js'
import { TimingTickResolution, rundownTimingEventFromTickResolution } from './withTiming.js'
import type { TimingEvent } from './RundownTiming.js'

/** How to read a published TimerState as a number */
export enum TimerValueMode {
	/**
	 * Milliseconds until the timer reaches zero, going negative once past it.
	 * Use for a duration/countdown display ("Rem. Dur", "Start In").
	 */
	Duration = 'duration',
	/**
	 * The absolute unix timestamp (ms) at which the timer reaches/reached zero.
	 * Use for a wall-clock display ("Plan. End", "Est. End").
	 */
	Timestamp = 'timestamp',
}

/** The fields of a published document that can be read as a single TimerState */
type TimerKeysOf<TDoc> = {
	[K in keyof TDoc]-?: NonNullable<TDoc[K]> extends TimerState ? K : never
}[keyof TDoc]

export type PlaylistTimerKey = TimerKeysOf<PlaylistTimingStateDoc>
export type SegmentTimerKey = TimerKeysOf<SegmentTimingStateDoc>

export interface UsePlaylistTimingValueOptions {
	/**
	 * How often the value should be recomputed (which re-renders the caller).
	 * Defaults to Synced (1Hz, aligned with the rest of the timing UI).
	 */
	tickResolution?: TimingTickResolution

	/**
	 * Only return a value while the published state is about this PartInstance.
	 *
	 * The on-air timers describe whichever part is on air, and a component rendering a specific
	 * part must not show another part's numbers during the moment after a take when the two
	 * disagree. Pass the part being rendered and the hook returns null until they match.
	 */
	forPartInstanceId?: PartInstanceId | null
	/** Only return a value while the published state is about this Segment. See `forPartInstanceId`. */
	forSegmentId?: SegmentId | null
}

/**
 * Read a single timer from the playlist's published timing state
 * (the `playlistTimingState` publication), already evaluated against the current time.
 *
 * Reactivity is scoped to the requested timer: the caller only re-renders when that timer's state
 * changes on the server, or when the value is recomputed at the chosen tick resolution.
 *
 * Note: the tick is driven by the RundownTimingProvider timing events, so this must be used within
 * a view that mounts one (as all the rundown views do).
 *
 * @param playlistId The playlist to read, or undefined outside a timing scope
 * @param timer Which timer to read
 * @param mode Whether to read it as a duration or as a wall-clock timestamp
 * @returns The value in milliseconds, or null if that timer is not currently published
 */
export function usePlaylistTimingValue(
	playlistId: RundownPlaylistId | undefined,
	timer: PlaylistTimerKey,
	mode: TimerValueMode,
	options?: UsePlaylistTimingValueOptions
): number | null {
	return useTimingStateValue(
		playlistId && getPlaylistTimingStateDocId(playlistId),
		isPlaylistTimingStateDoc,
		timer,
		mode,
		options
	)
}

/**
 * Read a single timer from a segment's published timing state. See {@link usePlaylistTimingValue}.
 *
 * Each segment's document already describes that segment - whether it is the on-air one or not -
 * so unlike the playlist's on-air timers this needs no identity guard.
 */
export function useSegmentTimingValue(
	segmentId: SegmentId | undefined,
	timer: SegmentTimerKey,
	mode: TimerValueMode,
	options?: UsePlaylistTimingValueOptions
): number | null {
	return useTimingStateValue(
		segmentId && getSegmentTimingStateDocId(segmentId),
		isSegmentTimingStateDoc,
		timer,
		mode,
		options
	)
}

function useTimingStateValue<TDoc extends TimingStateDoc>(
	docId: TimingStateDocId | undefined,
	isWantedDoc: (doc: Pick<TimingStateDoc, 'type'>) => doc is TDoc,
	timer: TimerKeysOf<TDoc>,
	mode: TimerValueMode,
	options?: UsePlaylistTimingValueOptions
): number | null {
	const tickResolution = options?.tickResolution ?? TimingTickResolution.Synced
	const forPartInstanceId = options?.forPartInstanceId
	const forSegmentId = options?.forSegmentId

	const state = useTracker(
		() => {
			if (!docId) return undefined

			// `type` narrows the published union, and the identities back the guards below, so all
			// of them have to be in the projection
			const doc = PlaylistTimingStates.findOne(docId, {
				fields: {
					type: 1,
					currentPartInstanceId: 1,
					currentSegmentId: 1,
					[timer]: 1,
				} satisfies MongoFieldSpecifierOnes<PlaylistTimingStateDoc>,
			}) as (Pick<TimingStateDoc, 'type'> & Partial<PlaylistTimingStateDoc>) | undefined

			if (!doc || !isWantedDoc(doc)) return undefined

			// Discard a state that is about a different part or segment than the caller renders
			if (forPartInstanceId !== undefined && doc.currentPartInstanceId !== forPartInstanceId) return undefined
			if (forSegmentId !== undefined && doc.currentSegmentId !== forSegmentId) return undefined

			return (doc as TDoc)[timer] as TimerState | undefined
		},
		[docId, timer, forPartInstanceId, forSegmentId],
		undefined
	)

	// Re-render on each tick, so the value stays current between published states
	const [now, setNow] = useState(() => getCurrentTime())
	useEffect(() => {
		const eventName = rundownTimingEventFromTickResolution(tickResolution)
		const handler = (e: Event) => setNow((e as TimingEvent).detail?.currentTime ?? getCurrentTime())

		window.addEventListener(eventName, handler)
		return () => window.removeEventListener(eventName, handler)
	}, [tickResolution])

	if (!state) return null

	return mode === TimerValueMode.Duration ? timerStateToDuration(state, now) : timerStateToZeroTime(state, now)
}
