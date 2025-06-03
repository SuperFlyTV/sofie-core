import { RundownPlaylistTiming, PlaylistTimingType } from '@sofie-automation/blueprints-integration'
import { ActivePlaylistTiming, ActivePlaylistTimingMode } from '@sofie-automation/live-status-gateway-api'

export default function rundownPlaylistTimingToActivePlaylistTiming(
	timing: RundownPlaylistTiming
): ActivePlaylistTiming {
	switch (timing.type) {
		case PlaylistTimingType.None:
			return {
				timingMode: ActivePlaylistTimingMode.NONE,
				expectedDurationMs: timing.expectedDuration,
			}
		case PlaylistTimingType.ForwardTime:
			return {
				timingMode: ActivePlaylistTimingMode.FORWARD_MINUS_TIME,
				expectedStart: Number(timing.expectedStart),
				expectedDurationMs: timing.expectedDuration,
				expectedEnd: timing.expectedEnd ? Number(timing.expectedEnd) : undefined,
			}
		case PlaylistTimingType.BackTime:
			return {
				timingMode: ActivePlaylistTimingMode.BACK_MINUS_TIME,
				expectedStart: timing.expectedStart ? Number(timing.expectedStart) : undefined,
				expectedDurationMs: timing.expectedDuration,
				expectedEnd: Number(timing.expectedEnd),
			}
	}
}
