import { Logger } from 'winston'
import { WebSocket } from 'ws'
import { unprotectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import { ShowStyleBaseExt } from '../collections/showStyleBaseHandler.js'
import { WebSocketTopicBase, WebSocketTopic } from '../wsHandler.js'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import _ from 'underscore'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { normalizeArray } from '@sofie-automation/corelib/dist/lib'

import { CollectionHandlers } from '../liveStatusServer.js'
import areElementsShallowEqual from '@sofie-automation/shared-lib/dist/lib/isShallowEqual'
import {
	PART_INSTANCES_KEYS,
	PartInstances,
	PIECE_INSTANCES_KEYS,
	PieceInstances,
	Playlist,
	PLAYLIST_KEYS,
	PlaylistStatusCache,
	Segment,
	SEGMENT_KEYS,
} from './helpers/playlist/playlistStatus.js'
import { toExtendedPlaylistStatus } from './helpers/playlist/extendedPlaylistStatus.js'

const THROTTLE_PERIOD_MS = 100

export class ExtendedActivePlaylistTopic extends WebSocketTopicBase implements WebSocketTopic {
	private _playlistStatusCache: PlaylistStatusCache = {
		partInstancesInCurrentSegment: [],
		partsById: {},
		partsBySegmentId: {},
		segmentsById: {},
	}

	constructor(logger: Logger, handlers: CollectionHandlers) {
		super(ExtendedActivePlaylistTopic.name, logger, THROTTLE_PERIOD_MS)

		handlers.playlistHandler.subscribe(this.onPlaylistUpdate, PLAYLIST_KEYS)
		handlers.partsHandler.subscribe(this.onPartsUpdate)
		handlers.partInstancesHandler.subscribe(this.onPartInstancesUpdate, PART_INSTANCES_KEYS)
		handlers.pieceInstancesHandler.subscribe(this.onPieceInstancesUpdate, PIECE_INSTANCES_KEYS)
		handlers.showStyleBaseHandler.subscribe(this.onShowStyleBaseUpdate)
		handlers.segmentHandler.subscribe(this.onSegmentUpdate, SEGMENT_KEYS)
		handlers.segmentsHandler.subscribe(this.onSegmentsUpdate)
	}

	sendStatus(subscribers: Iterable<WebSocket>): void {
		if (this.isDataInconsistent()) {
			// data is inconsistent, let's wait
			this._logger.debug('Encountered inconsistent data.')
			return
		}

		const message = { ...toExtendedPlaylistStatus(this._playlistStatusCache) }

		this.sendMessage(subscribers, message)
	}

	private isDataInconsistent() {
		return (
			this._playlistStatusCache.currentPartInstance?._id !==
				this._playlistStatusCache.activePlaylist?.currentPartInfo?.partInstanceId ||
			this._playlistStatusCache.currentPartInstance?.segmentId !==
				this._playlistStatusCache.currentSegment?._id ||
			this._playlistStatusCache.nextPartInstance?._id !==
				this._playlistStatusCache.activePlaylist?.nextPartInfo?.partInstanceId ||
			(this._playlistStatusCache.pieceInstancesInCurrentPartInstance?.[0] &&
				this._playlistStatusCache.pieceInstancesInCurrentPartInstance?.[0].partInstanceId !==
					this._playlistStatusCache.currentPartInstance?._id) ||
			(this._playlistStatusCache.pieceInstancesInNextPartInstance?.[0] &&
				this._playlistStatusCache.pieceInstancesInNextPartInstance?.[0].partInstanceId !==
					this._playlistStatusCache.nextPartInstance?._id)
		)
	}

	private onPlaylistUpdate = (rundownPlaylist: Playlist | undefined): void => {
		this.logUpdateReceived(
			'playlist',
			`rundownPlaylistId ${rundownPlaylist?._id}, activationId ${rundownPlaylist?.activationId}`
		)
		this._playlistStatusCache.activePlaylist = unprotectString(rundownPlaylist?.activationId)
			? rundownPlaylist
			: undefined

		this.throttledSendStatusToAll()
	}

	private onPartsUpdate = (parts: DBPart[] | undefined): void => {
		const previousParts = this._playlistStatusCache.partsBySegmentId
		this._playlistStatusCache.partsBySegmentId = _.groupBy(parts ?? [], 'segmentId')
		this.logUpdateReceived('parts')

		const currentSegmentId = unprotectString(this._playlistStatusCache.currentPartInstance?.segmentId)
		if (
			currentSegmentId &&
			!areElementsShallowEqual(
				previousParts[currentSegmentId] ?? [],
				this._playlistStatusCache.partsBySegmentId[currentSegmentId] ?? []
			)
		) {
			// we have to collect all the parts, but only when those from the current segment change, we should update status
			this.throttledSendStatusToAll()
		}
	}

	private onPartInstancesUpdate = (partInstances: PartInstances | undefined): void => {
		this.logUpdateReceived('partInstances', `${partInstances?.inCurrentSegment.length} instances in segment`)

		if (!partInstances) return
		this._playlistStatusCache.currentPartInstance = partInstances.current
		this._playlistStatusCache.nextPartInstance = partInstances.next
		this._playlistStatusCache.firstInstanceInSegmentPlayout = partInstances.firstInSegmentPlayout
		this._playlistStatusCache.partInstancesInCurrentSegment = partInstances.inCurrentSegment
		this.throttledSendStatusToAll()
	}

	private onPieceInstancesUpdate = (pieceInstances: PieceInstances | undefined): void => {
		this.logUpdateReceived('pieceInstances')
		if (!pieceInstances) return

		this._playlistStatusCache.pieceInstancesInCurrentPartInstance = pieceInstances.currentPartInstance
		this._playlistStatusCache.pieceInstancesInNextPartInstance = pieceInstances.nextPartInstance
		this.throttledSendStatusToAll()
	}

	private onShowStyleBaseUpdate = (showStyleBase: ShowStyleBaseExt | undefined): void => {
		this.logUpdateReceived('showStyleBase')
		this._playlistStatusCache.showStyleBaseExt = showStyleBase
		this.throttledSendStatusToAll()
	}

	private onSegmentUpdate = (segment: Segment | undefined): void => {
		this.logUpdateReceived('segment')
		this._playlistStatusCache.currentSegment = segment
		this.throttledSendStatusToAll()
	}

	private onSegmentsUpdate = (segments: DBSegment[] | undefined): void => {
		this.logUpdateReceived('segments')
		this._playlistStatusCache.segmentsById = segments ? normalizeArray(segments, '_id') : {}
		this.throttledSendStatusToAll() // TODO: can this be smarter?
	}
}
