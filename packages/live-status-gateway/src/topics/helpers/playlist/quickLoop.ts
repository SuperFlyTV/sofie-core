import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import {
	ActivePlaylistQuickLoop,
	QuickLoopMarker as QuickLoopMarkerStatus,
	QuickLoopMarkerType as QuickLoopMarkerStatusType,
} from '@sofie-automation/live-status-gateway-api'
import { unprotectString, assertNever } from '@sofie-automation/server-core-integration'
import { QuickLoopMarker, QuickLoopMarkerType } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { Playlist } from './playlistStatus.js'

export function transformQuickLoopStatus(
	_activePlaylist: Playlist | undefined,
	_partsById: Record<string, DBPart | undefined>,
	_segmentsById: Record<string, DBSegment | undefined>
): ActivePlaylistQuickLoop | undefined {
	if (!_activePlaylist) return

	const quickLoopProps = _activePlaylist.quickLoop
	if (!quickLoopProps) return undefined

	return {
		locked: quickLoopProps.locked,
		running: quickLoopProps.running,
		start: transformQuickLoopMarkerStatus(quickLoopProps.start, _partsById, _segmentsById),
		end: transformQuickLoopMarkerStatus(quickLoopProps.end, _partsById, _segmentsById),
	}
}

export function transformQuickLoopMarkerStatus(
	marker: QuickLoopMarker | undefined,
	_partsById: Record<string, DBPart | undefined>,
	_segmentsById: Record<string, DBSegment | undefined>
): QuickLoopMarkerStatus | undefined {
	if (!marker) return undefined

	switch (marker.type) {
		case QuickLoopMarkerType.PLAYLIST:
			return {
				markerType: QuickLoopMarkerStatusType.PLAYLIST,
				rundownId: undefined,
				segmentId: undefined,
				partId: undefined,
			}
		case QuickLoopMarkerType.RUNDOWN:
			return {
				markerType: QuickLoopMarkerStatusType.RUNDOWN,
				rundownId: unprotectString(marker.id),
				segmentId: undefined,
				partId: undefined,
			}
		case QuickLoopMarkerType.SEGMENT: {
			const segment = _segmentsById[unprotectString(marker.id)]

			return {
				markerType: QuickLoopMarkerStatusType.SEGMENT,
				rundownId: unprotectString(segment?.rundownId),
				segmentId: unprotectString(marker.id),
				partId: undefined,
			}
		}
		case QuickLoopMarkerType.PART: {
			const part = _partsById[unprotectString(marker.id)]

			return {
				markerType: QuickLoopMarkerStatusType.PART,
				rundownId: unprotectString(part?.rundownId),
				segmentId: unprotectString(part?.segmentId),
				partId: unprotectString(marker.id),
			}
		}
		default:
			assertNever(marker)
			return undefined
	}
}
