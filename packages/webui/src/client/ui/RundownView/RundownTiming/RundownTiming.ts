export interface TimeEventArgs {
	currentTime: number
}

export type TimingEvent = CustomEvent<TimeEventArgs>

declare global {
	interface WindowEventMap {
		[RundownTiming.Events.timeupdateSynced]: TimingEvent
		[RundownTiming.Events.timeupdateLowResolution]: TimingEvent
		[RundownTiming.Events.timeupdateHighResolution]: TimingEvent
	}
}

export namespace RundownTiming {
	/**
	 * Events used by the RundownTimingProvider
	 * @export
	 * @enum {number}
	 */
	export enum Events {
		/** Event is emitted once a second, to update displays in a synced manner */
		'timeupdateSynced' = 'sofie:rundownTimeUpdateSynced',
		/** Event is emitted every now-and-then, generally to be used for simple displays */
		'timeupdateLowResolution' = 'sofie:rundownTimeUpdateLowResolution',
		/** event is emitted with a very high frequency (60 Hz), to be used sparingly as
		 * hooking up Components to it will cause a lot of renders
		 */
		'timeupdateHighResolution' = 'sofie:rundownTimeUpdateHighResolution',
	}
}

/** How often a component wants to be re-rendered by the timing clock */
export enum TimingTickResolution {
	/** Used for things that we want to "tick" at the same time (every full second) for all things in the GUI. */
	Synced = 0,
	/** Updated with Low accuracy (ie about 4 times a second - based on LOW_RESOLUTION_TIMING_DECIMATOR). */
	Low = 1,
	/** Updated with high accuracy (ie many times per second), to be used for things like countdowns. */
	High = 2,
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
