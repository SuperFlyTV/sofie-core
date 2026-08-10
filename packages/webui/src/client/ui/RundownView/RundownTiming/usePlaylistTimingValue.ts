import { useEffect, useState } from 'react'
import type { RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import {
	getPlaylistTimingStateDocId,
	type PlaylistTimingStateDoc,
} from '@sofie-automation/corelib/dist/dataModel/TimingState'
import { PlaylistTimingStates } from '../../Collections.js'
import { useTracker } from '../../../lib/ReactMeteorData/ReactMeteorData.js'
import { getCurrentTime } from '../../../lib/systemTime.js'
import { TimingTickResolution, rundownTimingEventFromTickResolution } from './withTiming.js'
import type { TimingEvent } from './RundownTiming.js'

/** The individual timer values of a PlaylistTimingStateDoc that can be fetched */
export type PlaylistTimingValueKey =
	| 'plannedStart'
	| 'plannedEnd'
	| 'plannedDuration'
	| 'startedPlayback'
	| 'remainingDuration'
	| 'estimatedEnd'
	| 'overUnder'

export interface UsePlaylistTimingValueOptions {
	/**
	 * How often the returned `now` should tick (which re-renders the caller).
	 * Defaults to Synced (1Hz, aligned with the rest of the timing UI).
	 */
	tickResolution?: TimingTickResolution
}

/**
 * Fetch a single timer value from the server-published playlist timing state
 * (the `playlistTimingState` publication), along with a ticking `now` to evaluate it against
 * (via `timerStateToDuration` / `timerStateToZeroTime`).
 *
 * Reactivity is scoped to the requested timer: the caller only re-renders when that timer's
 * state changes on the server, or when `now` ticks at the chosen resolution.
 *
 * Note: the tick is driven by the RundownTimingProvider timing events, so this must be used
 * within a view that mounts one (as all the rundown views do).
 */
export function usePlaylistTimingValue<K extends PlaylistTimingValueKey>(
	playlistId: RundownPlaylistId,
	timer: K,
	options?: UsePlaylistTimingValueOptions
): { value: PlaylistTimingStateDoc[K] | undefined; now: number } {
	const tickResolution = options?.tickResolution ?? TimingTickResolution.Synced

	const value = useTracker(
		() => {
			const doc = PlaylistTimingStates.findOne(getPlaylistTimingStateDocId(playlistId), {
				fields: { [timer]: 1 } as any,
			}) as Pick<PlaylistTimingStateDoc, K> | undefined
			return doc?.[timer]
		},
		[playlistId, timer],
		undefined
	)

	const [now, setNow] = useState(() => getCurrentTime())
	useEffect(() => {
		const eventName = rundownTimingEventFromTickResolution(tickResolution)
		const handler = (e: Event) => {
			setNow((e as TimingEvent).detail?.currentTime ?? getCurrentTime())
		}
		window.addEventListener(eventName, handler)
		return () => {
			window.removeEventListener(eventName, handler)
		}
	}, [tickResolution])

	return { value, now }
}
