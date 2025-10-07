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
import {
	ExtendedPlaylistStatusCache,
	PART_INSTANCES_KEYS,
	PartInstances,
	PIECE_INSTANCES_KEYS,
	PieceInstances,
	Playlist,
	PLAYLIST_KEYS,
	Segment,
	SEGMENT_KEYS,
} from './helpers/playlist/playlistStatus.js'
import { toExtendedPlaylistStatus } from './helpers/playlist/extendedPlaylistStatus.js'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { DBRundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'

const THROTTLE_PERIOD_MS = 200

export class ExtendedActivePlaylistTopic extends WebSocketTopicBase implements WebSocketTopic {
	private _playlistStatusCache: ExtendedPlaylistStatusCache = {
		partInstancesInCurrentSegment: [],
		rundownsInCurrentPlaylist: [],
		partsById: {},
		partsBySegmentId: {},
		segmentsById: {},
		piecesByPartId: {},
	}

	constructor(logger: Logger, handlers: CollectionHandlers) {
		super(ExtendedActivePlaylistTopic.name, logger, THROTTLE_PERIOD_MS)

		handlers.playlistHandler.subscribe(this.onPlaylistUpdate, PLAYLIST_KEYS)
		handlers.rundownsHandler.subscribe(this.onRundownsUpdapte)
		handlers.partsHandler.subscribe(this.onPartsUpdate)
		handlers.partInstancesHandler.subscribe(this.onPartInstancesUpdate, PART_INSTANCES_KEYS)
		handlers.pieceInstancesHandler.subscribe(this.onPieceInstancesUpdate, PIECE_INSTANCES_KEYS)
		handlers.piecesHandler.subscribe(this.onPiecesUpdate)
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

		this.updateAndNotify({
			activePlaylist: unprotectString(rundownPlaylist?.activationId) ? rundownPlaylist : undefined,
		})
	}

	private onRundownsUpdapte = (rundowns: DBRundown[] | undefined): void => {
		this.logUpdateReceived('rundowns')

		const newRundownsInCurrentPlaylist =
			rundowns && this._playlistStatusCache.activePlaylist
				? this._playlistStatusCache.activePlaylist?.rundownIdsInOrder
						.map((rundownId) => rundowns.find((rundown) => rundown._id === rundownId))
						.filter((rundown) => rundown !== undefined)
				: []

		this.updateAndNotify({
			rundownsInCurrentPlaylist: newRundownsInCurrentPlaylist,
		})
	}

	private onPartsUpdate = (parts: DBPart[] | undefined): void => {
		this.logUpdateReceived('parts')

		this.updateAndNotify({
			partsBySegmentId: _.groupBy(parts ?? [], 'segmentId'),
		})
	}

	private onPartInstancesUpdate = (partInstances: PartInstances | undefined): void => {
		this.logUpdateReceived('partInstances', `${partInstances?.inCurrentSegment.length} instances in segment`)
		if (!partInstances)
			this.updateAndNotify({
				currentPartInstance: undefined,
				nextPartInstance: undefined,
				firstInstanceInSegmentPlayout: undefined,
				partInstancesInCurrentSegment: undefined,
			})
		else
			this.updateAndNotify({
				currentPartInstance: partInstances.current,
				nextPartInstance: partInstances.next,
				firstInstanceInSegmentPlayout: partInstances.firstInSegmentPlayout,
				partInstancesInCurrentSegment: partInstances.inCurrentSegment,
			})
	}

	private onPieceInstancesUpdate = (pieceInstances: PieceInstances | undefined): void => {
		this.logUpdateReceived('pieceInstances')
		if (!pieceInstances)
			this.updateAndNotify({
				pieceInstancesInCurrentPartInstance: undefined,
				pieceInstancesInNextPartInstance: undefined,
			})
		else
			this.updateAndNotify({
				pieceInstancesInCurrentPartInstance: pieceInstances.currentPartInstance,
				pieceInstancesInNextPartInstance: pieceInstances.nextPartInstance,
			})
	}

	private onPiecesUpdate = (pieces: Piece[] | undefined): void => {
		this.logUpdateReceived('pieces')
		this.updateAndNotify({
			piecesByPartId: pieces ? _.groupBy(pieces, 'startPartId') : undefined,
		})
	}

	private onShowStyleBaseUpdate = (showStyleBase: ShowStyleBaseExt | undefined): void => {
		this.logUpdateReceived('showStyleBase')

		this.updateAndNotify({
			showStyleBaseExt: showStyleBase,
		})
	}

	private onSegmentUpdate = (segment: Segment | undefined): void => {
		this.logUpdateReceived('segment')

		this.updateAndNotify({
			currentSegment: segment,
		})
	}

	private onSegmentsUpdate = (segments: DBSegment[] | undefined): void => {
		this.logUpdateReceived('segments')
		this.updateAndNotify({
			segmentsById: segments ? normalizeArray(segments, '_id') : {},
		})
	}

	private updateAndNotify(newCacheContent: Partial<ExtendedPlaylistStatusCache>) {
		const updatedCacheContent = { ...this._playlistStatusCache, ...newCacheContent }
		const hasAnythingChanged = !_.isEqual(this._playlistStatusCache, updatedCacheContent)
		if (hasAnythingChanged) {
			this._playlistStatusCache = updatedCacheContent
			this.throttledSendStatusToAll()
		}
	}
}
