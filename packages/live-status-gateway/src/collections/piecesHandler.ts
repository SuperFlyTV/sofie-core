import { Logger } from 'winston'
import { CoreHandler } from '../coreHandler.js'
import { PublicationCollection } from '../publicationCollection.js'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import _ from 'underscore'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { RundownId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { CollectionHandlers } from '../liveStatusServer.js'
import { PickKeys } from '@sofie-automation/shared-lib/dist/lib/types'
import areElementsShallowEqual from '@sofie-automation/shared-lib/dist/lib/isShallowEqual'
import { unprotectString } from '@sofie-automation/server-core-integration'

const PLAYLIST_KEYS = ['_id', 'activationId', 'rundownIdsInOrder'] as const
type Playlist = PickKeys<DBRundownPlaylist, typeof PLAYLIST_KEYS>

export class PiecesHandler extends PublicationCollection<Piece[], CorelibPubSub.pieces, CollectionName.Pieces> {
	private _currentPlaylist: Playlist | undefined
	private _rundownIds: RundownId[] = []

	constructor(logger: Logger, coreHandler: CoreHandler) {
		super(CollectionName.Pieces, CorelibPubSub.pieces, logger, coreHandler)
		this._collectionData = []
	}

	init(handlers: CollectionHandlers): void {
		super.init(handlers)

		handlers.playlistHandler.subscribe(this.onPlaylistUpdate, PLAYLIST_KEYS)
	}

	protected changed(): void {
		this.updateAndNotify()
	}

	private updateCollectionData(): boolean {
		if (!this._collectionData) return false
		const collection = this.getCollectionOrFail()

		// Get all pieces in the playlist by filtering on rundownId for some reason using $in doesn't work here
		const allPieces: Piece[] = []

		this._rundownIds.map((rundownId) => {
			const rundownPieces = collection.find({
				startRundownId: unprotectString(rundownId),
			})

			rundownPieces.map((piece) => allPieces.push(piece))
		})

		const hasAnythingChanged = !_.isEqual(this._collectionData, allPieces)
		if (hasAnythingChanged) {
			this._collectionData = allPieces
		}

		return hasAnythingChanged
	}

	private clearCollectionData() {
		if (!this._collectionData) return
		this._collectionData = []
	}

	private onPlaylistUpdate = (playlist: Playlist | undefined): void => {
		this.logUpdateReceived('playlist', `rundownPlaylistId ${playlist?._id}, active ${!!playlist?.activationId}`)

		const prevRundownIds = this._rundownIds
		const prevPlaylist = this._currentPlaylist

		this._currentPlaylist = playlist

		this._rundownIds = this._currentPlaylist ? this._currentPlaylist.rundownIdsInOrder : []

		if (this._currentPlaylist && this._rundownIds.length && this._currentPlaylist?.activationId) {
			const sameSubscription =
				areElementsShallowEqual(this._rundownIds, prevRundownIds) &&
				areElementsShallowEqual(prevPlaylist?.rundownIdsInOrder ?? [], this._currentPlaylist.rundownIdsInOrder)

			if (!sameSubscription) {
				// The subscription is set up based on the rundown IDs.
				this.setupSubscription(this._rundownIds, null)
			} else if (this._subscriptionId) {
				this.updateAndNotify()
			} else {
				this.clearAndNotify()
			}
		} else {
			this.clearAndNotify()
		}
	}

	private clearAndNotify() {
		this.clearCollectionData()
		this.notify(this._collectionData)
	}

	private updateAndNotify() {
		const hasAnythingChanged = this.updateCollectionData()
		if (hasAnythingChanged) {
			this.notify(this._collectionData)
		}
	}
}
