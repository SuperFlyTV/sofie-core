import { PlaylistTimingType, RundownPlaylistTiming } from '@sofie-automation/blueprints-integration'
import { ActivePlaylistTimingMode, ActivePlaylistTiming } from '@sofie-automation/live-status-gateway-api'
import { assertNever } from '@sofie-automation/server-core-integration'

export function translatePlaylistTimingType(type: PlaylistTimingType): ActivePlaylistTimingMode {
	switch (type) {
		case PlaylistTimingType.None:
			return ActivePlaylistTimingMode.NONE
		case PlaylistTimingType.BackTime:
			return ActivePlaylistTimingMode.BACK_MINUS_TIME
		case PlaylistTimingType.ForwardTime:
			return ActivePlaylistTimingMode.FORWARD_MINUS_TIME
		default:
			assertNever(type)
			// Cast and return the value anyway, so that the application works
			return type as any as ActivePlaylistTimingMode
	}
}

export function toPlaylistTiming(timing: RundownPlaylistTiming & { startedPlayback?: number }): ActivePlaylistTiming {
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
