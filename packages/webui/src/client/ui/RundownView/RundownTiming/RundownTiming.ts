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
