/**
 * The rundown timing calculator lives in `@sofie-automation/meteor-lib` so that it can be shared with the server.
 * This module re-exports it for backwards compatibility, wrapping the parts that need client-specific defaults.
 */

import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import {
	type RundownTimingContext,
	getPlaylistTimingDiff as getPlaylistTimingDiffInner,
} from '@sofie-automation/meteor-lib/dist/rundownTiming/index'
import { getCurrentTime } from './systemTime.js'

export {
	RundownTimingCalculator,
	type RundownTimingContext,
	type TimingId,
	type MinimalPartInstance,
	computeSegmentDuration,
	getPartInstanceTimingId,
	getPartInstanceTimingValue,
	findPartInstancesInQuickLoop,
} from '@sofie-automation/meteor-lib/dist/rundownTiming/index'

export function getPlaylistTimingDiff(
	playlist: Pick<DBRundownPlaylist, 'timing' | 'startedPlayback' | 'activationId'>,
	timingContext: RundownTimingContext
): number | undefined {
	return getPlaylistTimingDiffInner(playlist, timingContext, getCurrentTime())
}
