import { Logger } from 'winston'
import { CoreHandler } from '../coreHandler.js'
import { PublicationCollection } from '../publicationCollection.js'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import _ from 'underscore'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { RundownId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { CollectionHandlers } from '../liveStatusServer.js'
import { PickKeys } from '@sofie-automation/shared-lib/dist/lib/types'
import areElementsShallowEqual from '@sofie-automation/shared-lib/dist/lib/isShallowEqual'
import { DBRundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'

const PLAYLIST_KEYS = ['_id', 'activationId', 'rundownIdsInOrder'] as const
type Playlist = PickKeys<DBRundownPlaylist, typeof PLAYLIST_KEYS>

export class RundownsHandler extends PublicationCollection<
	DBRundown[],
	CorelibPubSub.rundownsInPlaylists,
	CollectionName.Rundowns
> {
	private _currentPlaylist: Playlist | undefined
	private _rundownIds: RundownId[] = []

	constructor(logger: Logger, coreHandler: CoreHandler) {
		super(CollectionName.Rundowns, CorelibPubSub.rundownsInPlaylists, logger, coreHandler)
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

		// Find all rundowns belonging to the current playlist
		// const allRundowns: DBRundown[] = collection.find({
		// 	_id: { $in: this._rundownIds.map(unprotectString) },
		// })

		const allRundowns: DBRundown[] = []

		this._rundownIds.map((rundownId) => {
			const rundown = collection.findOne(rundownId)

			if (rundown) allRundowns.push(rundown)
		})

		const hasAnythingChanged = !_.isEqual(this._collectionData, allRundowns)
		if (hasAnythingChanged) {
			this._collectionData = allRundowns
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
				// The subscription is based on the current playlist Id
				this.setupSubscription([this._currentPlaylist._id])
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
