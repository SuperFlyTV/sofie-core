import { z } from 'zod'
import { RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { MongoFieldSpecifierOnesStrict } from '@sofie-automation/corelib/dist/mongo'
import { ReadonlyDeep } from 'type-fest'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { CustomCollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import {
	getPlaylistTimingStateDocId,
	PlaylistTimingStateDoc,
	TimingStateDoc,
} from '@sofie-automation/corelib/dist/dataModel/TimingState'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { SegmentId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { literal } from '@sofie-automation/corelib/dist/lib'
import { sortSegmentsInRundowns } from '@sofie-automation/corelib/dist/playout/playlist'
import { DEFAULT_DISPLAY_DURATION } from '@sofie-automation/shared-lib/dist/core/constants'
import { calculatePlaylistTimingStates } from '@sofie-automation/meteor-lib/dist/rundownTiming/playlistTimingState'
import { prepareTimingPartInstances } from '@sofie-automation/meteor-lib/dist/rundownTiming/prepareTimingInputs'
import { setUpOptimizedObserverArray, SetupObserversResult, TriggerUpdate } from '../../lib/customPublication'
import { logger } from '../../logging'
import { getCurrentTime } from '../../lib/lib'
import { ContentCache, createReactiveContentCache } from './reactiveContentCache'
import { RundownsObserver } from '../lib/rundownsObserver'
import { RundownContentObserver } from './rundownContentObserver'
import { RundownPlaylists } from '../../collections'
import { check } from '../../lib/check'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../../security/securityVerify'
import type { PublicationRegistry } from '../../publicationRegistry'

interface PlaylistTimingStateArgs {
	readonly playlistId: RundownPlaylistId
}

export interface PlaylistTimingStateState {
	contentCache: ReadonlyDeep<ContentCache>
}

interface PlaylistTimingStateUpdateProps {
	newCache: ContentCache

	/** Some of the timing inputs changed; the (single) doc needs recomputing */
	invalidateTiming: boolean
}

type RundownPlaylistLookupFields = '_id' | 'studioId'
const rundownPlaylistLookupFieldSpecifier = literal<
	MongoFieldSpecifierOnesStrict<Pick<DBRundownPlaylist, RundownPlaylistLookupFields>>
>({
	_id: 1,
	studioId: 1,
})

async function setupPlaylistTimingStatePublicationObservers(
	args: ReadonlyDeep<PlaylistTimingStateArgs>,
	triggerUpdate: TriggerUpdate<PlaylistTimingStateUpdateProps>
): Promise<SetupObserversResult> {
	const playlist = (await RundownPlaylists.findOneAsync(args.playlistId, {
		projection: rundownPlaylistLookupFieldSpecifier,
	})) as Pick<DBRundownPlaylist, RundownPlaylistLookupFields> | undefined
	if (!playlist) throw new Error(`RundownPlaylist "${args.playlistId}" not found!`)

	const rundownsObserver = await RundownsObserver.createForPlaylist(
		playlist.studioId,
		playlist._id,
		async (rundownIds) => {
			logger.silly(`Creating new RundownContentObserver`)

			const cache = createReactiveContentCache()

			// Push update
			triggerUpdate({ newCache: cache })

			const contentObserver = await RundownContentObserver.create(
				playlist.studioId,
				args.playlistId,
				rundownIds,
				cache
			)

			// Any change to any of the inputs invalidates the (single) output doc
			const invalidate = () => triggerUpdate({ invalidateTiming: true })
			const innerQueries = [
				cache.StudioSettings.observeChanges({ added: invalidate, changed: invalidate, removed: invalidate }),
				cache.RundownPlaylists.observeChanges({ added: invalidate, changed: invalidate, removed: invalidate }),
				cache.Segments.observeChanges({ added: invalidate, changed: invalidate, removed: invalidate }),
				cache.Parts.observeChanges({ added: invalidate, changed: invalidate, removed: invalidate }),
				cache.PartInstances.observeChanges({ added: invalidate, changed: invalidate, removed: invalidate }),
			]

			return () => {
				contentObserver.dispose()

				for (const query of innerQueries) {
					query.stop()
				}
			}
		}
	)

	// Set up observers:
	return [rundownsObserver]
}

export async function manipulatePlaylistTimingStatePublicationData(
	args: PlaylistTimingStateArgs,
	state: Partial<PlaylistTimingStateState>,
	updateProps: Partial<ReadonlyDeep<PlaylistTimingStateUpdateProps>> | undefined
): Promise<TimingStateDoc[] | null> {
	// Prepare data for publication:

	if (updateProps?.newCache !== undefined) {
		state.contentCache = updateProps.newCache ?? undefined
	}

	if (!state.contentCache) {
		// Nothing to publish
		return []
	}

	const doc = createPlaylistTimingStateDoc(args.playlistId, state.contentCache, getCurrentTime())
	return doc ? [doc] : []
}

/**
 * Compute the PlaylistTimingStateDoc from the cached content, for a given point in time.
 * All the timing math lives in meteor-lib/corelib (shared with the client); this only feeds it
 * the cached documents.
 */
export function createPlaylistTimingStateDoc(
	playlistId: RundownPlaylistId,
	contentCache: ReadonlyDeep<ContentCache>,
	now: number
): PlaylistTimingStateDoc | undefined {
	// Note: the casts below are safe because the cache projections include every field the timing
	// calculations read (matching the projections the client RundownTimingProvider uses)
	const playlist = contentCache.RundownPlaylists.findOne(playlistId) as unknown as DBRundownPlaylist | undefined
	if (!playlist) return undefined

	const studioSettings = contentCache.StudioSettings.findOne(playlist.studioId)
	const defaultDuration = studioSettings?.settings?.defaultDisplayDuration ?? DEFAULT_DISPLAY_DURATION

	const segments = sortSegmentsInRundowns(
		contentCache.Segments.findFetch({}),
		playlist.rundownIdsInOrder
	) as unknown as DBSegment[]
	const segmentsMap = new Map<SegmentId, DBSegment>(segments.map((segment) => [segment._id, segment]))

	const unorderedParts = contentCache.Parts.findFetch({}) as unknown as DBPart[]
	const activePartInstances = contentCache.PartInstances.findFetch({}, { sort: { takeCount: 1 } })

	const { partInstances, partsInQuickLoop } = prepareTimingPartInstances(
		playlist,
		segments,
		unorderedParts,
		activePartInstances
	)

	const timingValues = calculatePlaylistTimingStates(
		now,
		playlist,
		partInstances,
		segmentsMap,
		defaultDuration,
		partsInQuickLoop
	)

	return {
		_id: getPlaylistTimingStateDocId(playlistId),
		type: 'playlist',
		playlistId: playlistId,
		...timingValues,
	}
}

export function registerPlaylistTimingStatePublications(registry: PublicationRegistry): void {
	registry.customPublish(
		CorelibPubSub.playlistTimingState,
		CustomCollectionName.PlaylistTimingState,
		async (_context, pub, playlistId: RundownPlaylistId | null) => {
			check(playlistId, z.string().nullish())

			triggerWriteAccessBecauseNoCheckNecessary()

			if (!playlistId) {
				logger.info(`Pub.${CustomCollectionName.PlaylistTimingState}: Not playlistId`)
				return
			}

			await setUpOptimizedObserverArray<
				TimingStateDoc,
				PlaylistTimingStateArgs,
				PlaylistTimingStateState,
				PlaylistTimingStateUpdateProps
			>(
				`pub_${CorelibPubSub.playlistTimingState}_${playlistId}`,
				{ playlistId },
				setupPlaylistTimingStatePublicationObservers,
				manipulatePlaylistTimingStatePublicationData,
				pub,
				50
			)
		}
	)
}
