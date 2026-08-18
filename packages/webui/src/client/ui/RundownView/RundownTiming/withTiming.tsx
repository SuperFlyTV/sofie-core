import React, { useContext } from 'react'
import { RundownTiming } from './RundownTiming.js'
import type { RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'

export enum TimingTickResolution {
	/** Used for things that we want to "tick" at the same time (every full second) for all things in the GUI. */
	Synced = 0,
	/** Updated with Low accuracy (ie about 4 times a second - based on LOW_RESOLUTION_TIMING_DECIMATOR). */
	Low = 1,
	/** Updated with high accuracy (ie many times per second), to be used for things like countdowns. */
	High = 2,
}

export interface IRundownTimingProviderValues {
	/** The playlist this timing scope is for, so consumers can read its published timing state */
	playlistId: RundownPlaylistId | undefined
}
export const RundownTimingProviderContext = React.createContext<IRundownTimingProviderValues>({
	playlistId: undefined,
})

/**
 * The playlist of the surrounding timing scope.
 *
 * Lets a component read the playlist's published timing state without every one of its call sites
 * having to thread the id down to it.
 */
export function useTimingPlaylistId(): RundownPlaylistId | undefined {
	return useContext(RundownTimingProviderContext).playlistId
}

/** The window event that fires at the requested rate */
export function rundownTimingEventFromTickResolution(tickResolution: TimingTickResolution): RundownTiming.Events {
	switch (tickResolution) {
		case TimingTickResolution.High:
			return RundownTiming.Events.timeupdateHighResolution
		case TimingTickResolution.Low:
			return RundownTiming.Events.timeupdateLowResolution
		case TimingTickResolution.Synced:
		default:
			return RundownTiming.Events.timeupdateSynced
	}
}
