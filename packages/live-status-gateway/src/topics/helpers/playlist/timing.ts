import { PlaylistTimingType, RundownPlaylistTiming } from '@sofie-automation/blueprints-integration'
import {
	RundownPlaylistTiming as RundownPlaylistTimingStatus,
	RundownPlaylistTimingMode,
} from '@sofie-automation/live-status-gateway-api'
import { assertNever } from '@sofie-automation/server-core-integration'

export function translatePlaylistTimingType(type: PlaylistTimingType): RundownPlaylistTimingMode {
	switch (type) {
		case PlaylistTimingType.None:
			return RundownPlaylistTimingMode.NONE
		case PlaylistTimingType.BackTime:
			return RundownPlaylistTimingMode.BACK_MINUS_TIME
		case PlaylistTimingType.ForwardTime:
			return RundownPlaylistTimingMode.FORWARD_MINUS_TIME
		default:
			assertNever(type)
			// Cast and return the value anyway, so that the application works
			return type as any as RundownPlaylistTimingMode
	}
}

export function toPlaylistTiming(
	timing: RundownPlaylistTiming & { startedPlayback?: number }
): RundownPlaylistTimingStatus {
	const timingMode = translatePlaylistTimingType(timing.type)

	const base = {
		timingMode,
		startedPlayback: timing.startedPlayback,
		expectedDurationMs: timing.expectedDuration,
		expectedStart: timing.type === PlaylistTimingType.None ? undefined : timing.expectedStart,
		expectedEnd: timing.type === PlaylistTimingType.None ? undefined : timing.expectedEnd,
	}

	return base
}
