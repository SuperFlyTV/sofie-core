import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { ExtendedActivePlaylistEvent, RundownPlaylistTimingMode } from '@sofie-automation/live-status-gateway-api'
import { literal, unprotectString } from '@sofie-automation/server-core-integration'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { ExtendedPlaylistStatusCache } from './playlistStatus.js'
import { toPlaylistTiming } from './timing.js'
import { transformQuickLoopStatus } from './quickLoop.js'
import { toCurrentSegmentStatus, toExtendedSegmentStatus } from '../segment/segmentStatus.js'
import { toCurrentPartStatus, toPartStatus } from '../part/partStatus.js'

export function toExtendedPlaylistStatus(props: ExtendedPlaylistStatusCache): ExtendedActivePlaylistEvent {
	const { activePlaylist, partsById, segmentsById, currentPartInstance, partsBySegmentId, nextPartInstance } = props
	const currentPart: DBPart | null = currentPartInstance ? currentPartInstance.part : null
	console.log('nextPartInstance', nextPartInstance)
	const nextPart: DBPart | null = nextPartInstance ? nextPartInstance.part : null
	const currentSegmentParts: DBPart[] =
		(currentPart && partsBySegmentId[unprotectString(currentPart.segmentId)]) ?? []

	return activePlaylist
		? literal<ExtendedActivePlaylistEvent>({
				// TODO: Add data about the rundown
				event: 'extendedActivePlaylist',
				id: unprotectString(activePlaylist._id),
				externalId: activePlaylist.externalId,
				name: activePlaylist.name,
				rundowns: activePlaylist.rundownIdsInOrder.map((r) => unprotectString(r)),
				currentPart: toCurrentPartStatus(props, currentPart),
				currentSegment: toCurrentSegmentStatus({ ...props }, currentPart, currentSegmentParts),
				// TODO: add all fields to this object, then add parts to it.
				segments: segmentsById
					? Object.entries<DBSegment | undefined>(segmentsById)
							.map(([_id, segment]) => (segment ? toExtendedSegmentStatus(props, segment) : null))
							.filter((segment) => segment !== null)
					: [],
				nextPart: toPartStatus(props, nextPart),
				quickLoop: transformQuickLoopStatus(activePlaylist, partsById, segmentsById),
				publicData: activePlaylist.publicData,
				timing: toPlaylistTiming(activePlaylist.timing),
			})
		: literal<ExtendedActivePlaylistEvent>({
				event: 'extendedActivePlaylist',
				id: null,
				externalId: null,
				name: '',
				rundowns: [],
				currentPart: null,
				currentSegment: null,
				nextPart: null,
				quickLoop: undefined,
				publicData: undefined,
				timing: {
					timingMode: RundownPlaylistTimingMode.NONE,
				},
			})
}
