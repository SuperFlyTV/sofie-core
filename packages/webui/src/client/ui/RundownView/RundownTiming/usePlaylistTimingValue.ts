import { useEffect, useState } from 'react'
import type { RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import {
	getPlaylistTimingStateDocId,
	isPlaylistTimingStateDoc,
	type PlaylistTimingStateDoc,
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

/** The timer values of a PlaylistTimingStateDoc that can be read as a single TimerState */
export type PlaylistTimerKey = {
	[K in keyof PlaylistTimingStateDoc]-?: NonNullable<PlaylistTimingStateDoc[K]> extends TimerState ? K : never
}[keyof PlaylistTimingStateDoc]

export interface UsePlaylistTimingValueOptions {
	/**
	 * How often the value should be recomputed (which re-renders the caller).
	 * Defaults to Synced (1Hz, aligned with the rest of the timing UI).
	 */
	tickResolution?: TimingTickResolution
}

/**
 * Read a single timer value from the server-published playlist timing state
 * (the `playlistTimingState` publication), already evaluated against the current time.
 *
 * Reactivity is scoped to the requested timer: the caller only re-renders when that timer's state
 * changes on the server, or when the value is recomputed at the chosen tick resolution.
 *
 * Note: the tick is driven by the RundownTimingProvider timing events, so this must be used within
 * a view that mounts one (as all the rundown views do).
 *
 * @param timer Which timer to read
 * @param mode Whether to read it as a duration or as a wall-clock timestamp
 * @returns The value in milliseconds, or null if that timer is not currently published
 */
export function usePlaylistTimingValue(
	playlistId: RundownPlaylistId,
	timer: PlaylistTimerKey,
	mode: TimerValueMode,
	options?: UsePlaylistTimingValueOptions
): number | null {
	const tickResolution = options?.tickResolution ?? TimingTickResolution.Synced

	const state = useTracker(
		() => {
			// `type` is needed to narrow the published union, so it must be in the projection
			const doc = PlaylistTimingStates.findOne(getPlaylistTimingStateDocId(playlistId), {
				fields: { type: 1, [timer]: 1 } satisfies MongoFieldSpecifierOnes<PlaylistTimingStateDoc>,
			}) as Pick<PlaylistTimingStateDoc, 'type' | typeof timer> | undefined

			if (!doc || !isPlaylistTimingStateDoc(doc)) return undefined
			return doc[timer]
		},
		[playlistId, timer],
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
