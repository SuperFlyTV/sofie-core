import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { ExtendedActivePlaylistEvent, RundownPlaylistTimingMode } from '@sofie-automation/live-status-gateway-api'
import { literal, unprotectString } from '@sofie-automation/server-core-integration'
import { ExtendedPlaylistStatusCache } from './playlistStatus.js'
import { toPlaylistTiming } from './timing.js'
import { transformQuickLoopStatus } from './quickLoop.js'
import { toCurrentSegmentStatus } from '../segment/segmentStatus.js'
import { toCurrentPartStatus, toPartStatus } from '../part/partStatus.js'
import toRundownStatus from '../rundown/toRundownStatus.js'

export function toExtendedPlaylistStatus(props: ExtendedPlaylistStatusCache): ExtendedActivePlaylistEvent {
	const {
		activePlaylist,
		partsById,
		segmentsById,
		currentPartInstance,
		partsBySegmentId,
		nextPartInstance,
		rundownsInCurrentPlaylist,
	} = props
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
				rundowns: rundownsInCurrentPlaylist.map((rundown) => toRundownStatus(props, rundown)),
				currentPart: toCurrentPartStatus(props, currentPart),
				currentSegment: toCurrentSegmentStatus({ ...props }, currentPart, currentSegmentParts),
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
