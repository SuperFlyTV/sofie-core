import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { ActivePlaylistEvent, ActivePlaylistTimingMode } from '@sofie-automation/live-status-gateway-api'
import { literal, unprotectString } from '@sofie-automation/server-core-integration'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { PlaylistStatusCache } from './playlistStatus.js'
import { toPlaylistTiming } from './timing.js'
import { transformQuickLoopStatus } from './quickLoop.js'
import { toCurrentSegmentStatus, toSegmentStatus } from '../segment/segmentStatus.js'
import { toCurrentPartStatus, toPartStatus } from '../part/partStatus.js'

export function toExtendedPlaylistStatus(props: PlaylistStatusCache): ActivePlaylistEvent {
	const { activePlaylist, partsById, segmentsById, currentPartInstance, partsBySegmentId, nextPartInstance } = props
	const currentPart: DBPart | null = currentPartInstance ? currentPartInstance.part : null
	console.log('nextPartInstance', nextPartInstance)
	const nextPart: DBPart | null = nextPartInstance ? nextPartInstance.part : null
	const currentSegmentParts: DBPart[] =
		(currentPart && partsBySegmentId[unprotectString(currentPart.segmentId)]) ?? []

	return activePlaylist
		? literal<ActivePlaylistEvent>({
				// TODO: Add data about the rundown
				event: 'extendedActivePlaylist',
				id: unprotectString(activePlaylist._id),
				externalId: activePlaylist.externalId,
				name: activePlaylist.name,
				rundownIds: activePlaylist.rundownIdsInOrder.map((r) => unprotectString(r)),
				currentPart: toCurrentPartStatus(props, currentPart),
				currentSegment: toCurrentSegmentStatus({ ...props }, currentPart, currentSegmentParts),
				// TODO: add all fields to this object, then add parts to it.
				segments: segmentsById
					? Object.entries<DBSegment | undefined>(segmentsById)
							.filter(([_id, segment]) => segment)
							.map(([_id, segment]) => (segment ? toSegmentStatus(props, segment) : null))
					: [],
				nextPart: toPartStatus(props, nextPart),
				quickLoop: transformQuickLoopStatus(activePlaylist, partsById, segmentsById),
				publicData: activePlaylist.publicData,
				timing: toPlaylistTiming(activePlaylist.timing),
			})
		: literal<ActivePlaylistEvent>({
				event: 'extendedActivePlaylist',
				id: null,
				externalId: null,
				name: '',
				rundownIds: [],
				currentPart: null,
				currentSegment: null,
				nextPart: null,
				quickLoop: undefined,
				publicData: undefined,
				timing: {
					timingMode: ActivePlaylistTimingMode.NONE,
				},
			})
}
