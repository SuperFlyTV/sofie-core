import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { ActivePlaylistEvent, RundownPlaylistTimingMode } from '@sofie-automation/live-status-gateway-api'
import { literal, unprotectString } from '@sofie-automation/server-core-integration'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { PickKeys } from '@sofie-automation/shared-lib/dist/lib/types'
import { SelectedPartInstances } from '../../../collections/partInstancesHandler.js'
import { PieceInstanceMin, SelectedPieceInstances } from '../../../collections/pieceInstancesHandler.js'
import { ShowStyleBaseExt } from '../../../collections/showStyleBaseHandler.js'
import { toPlaylistTiming } from './timing.js'
import { transformQuickLoopStatus } from './quickLoop.js'
import { toCurrentSegmentStatus } from '../segment/segmentStatus.js'
import { toCurrentPartStatus, toPartStatus } from '../part/partStatus.js'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { DBRundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'

export interface PlaylistStatusCache {
	// main data
	activePlaylist?: Playlist
	currentPartInstance?: DBPartInstance
	nextPartInstance?: DBPartInstance
	firstInstanceInSegmentPlayout?: DBPartInstance
	currentSegment?: Segment

	// collections
	partInstancesInCurrentSegment: DBPartInstance[]
	partsById: Record<string, DBPart | undefined>
	partsBySegmentId: Record<string, DBPart[]>
	segmentsById: Record<string, DBSegment | undefined>

	// pieces
	pieceInstancesInCurrentPartInstance?: PieceInstanceMin[]
	pieceInstancesInNextPartInstance?: PieceInstanceMin[]

	// show style
	showStyleBaseExt?: ShowStyleBaseExt
}

export interface ExtendedPlaylistStatusCache extends PlaylistStatusCache {
	//rundowns
	rundownsInCurrentPlaylist: DBRundown[]
	// pieces
	piecesByPartId: Record<string, Piece[]>
}

export const PLAYLIST_KEYS = [
	'_id',
	'externalId',
	'activationId',
	'name',
	'rundownIdsInOrder',
	'publicData',
	'currentPartInfo',
	'nextPartInfo',
	'timing',
	'startedPlayback',
	'quickLoop',
] as const

export type Playlist = PickKeys<DBRundownPlaylist, typeof PLAYLIST_KEYS>

export const PART_INSTANCES_KEYS = ['current', 'next', 'inCurrentSegment', 'firstInSegmentPlayout'] as const
export type PartInstances = PickKeys<SelectedPartInstances, typeof PART_INSTANCES_KEYS>

export const PIECE_INSTANCES_KEYS = ['currentPartInstance', 'nextPartInstance'] as const
export type PieceInstances = PickKeys<SelectedPieceInstances, typeof PIECE_INSTANCES_KEYS>

export const SEGMENT_KEYS = ['_id', 'segmentTiming'] as const
export type Segment = PickKeys<DBSegment, typeof SEGMENT_KEYS>

export function toPlaylistStatus(props: PlaylistStatusCache): ActivePlaylistEvent {
	const { activePlaylist, partsById, segmentsById, currentPartInstance, partsBySegmentId, nextPartInstance } = props
	const currentPart: DBPart | null = currentPartInstance ? currentPartInstance.part : null
	const nextPart: DBPart | null = nextPartInstance ? nextPartInstance.part : null
	const currentSegmentParts: DBPart[] =
		(currentPart && partsBySegmentId[unprotectString(currentPart.segmentId)]) ?? []

	return activePlaylist
		? literal<ActivePlaylistEvent>({
				event: 'activePlaylist',
				id: unprotectString(activePlaylist._id),
				externalId: activePlaylist.externalId,
				name: activePlaylist.name,
				rundownIds: activePlaylist.rundownIdsInOrder.map((r) => unprotectString(r)),
				currentPart: toCurrentPartStatus(props, currentPart),
				currentSegment: toCurrentSegmentStatus({ ...props }, currentPart, currentSegmentParts),
				nextPart: toPartStatus(props, nextPart),
				quickLoop: transformQuickLoopStatus(activePlaylist, partsById, segmentsById),
				publicData: activePlaylist.publicData,
				timing: toPlaylistTiming(activePlaylist.timing),
			})
		: literal<ActivePlaylistEvent>({
				event: 'activePlaylist',
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
					timingMode: RundownPlaylistTimingMode.NONE,
				},
			})
}
