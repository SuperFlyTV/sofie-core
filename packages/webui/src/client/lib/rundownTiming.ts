/**
 * The rundown timing calculator lives in `@sofie-automation/meteor-lib` and now runs only on the
 * server, inside the `playlistTimingState` publication. This module re-exports the few pieces the
 * client still needs - identity helpers and types, no calculation.
 */

export {
	type RundownTimingContext,
	type TimingId,
	type MinimalPartInstance,
	getPartInstanceTimingId,
	getPartInstanceTimingValue,
	findPartInstancesInQuickLoop,
} from '@sofie-automation/meteor-lib/dist/rundownTiming/index'
