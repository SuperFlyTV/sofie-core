import { unprotectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import { mongoWhereFilter } from '@sofie-automation/corelib/dist/mongo'
import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import type { DBRundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import type { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import type { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import type { PartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import type { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import type { PieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import type { StateCacheResolverDataAccess } from '@sofie-automation/corelib/dist/playout/stateCacheResolverTypes'
import { PartId, RundownId, SegmentId, ShowStyleBaseId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'
import { ShowStyleBaseExt } from '../../../../collections/showStyleBaseHandler.js'

type PlaylistState = Pick<
	DBRundownPlaylist,
	| '_id'
	| 'studioId'
	| 'created'
	| 'modified'
	| 'externalId'
	| 'activationId'
	| 'rehearsal'
	| 'name'
	| 'rundownIdsInOrder'
	| 'quickLoop'
	| 'defaultBrandingId'
	| 'currentPartInfo'
	| 'nextPartInfo'
	| 'previousPartsInfo'
	| 'publicData'
	| 'publicPlayoutPersistentState'
	| 'timing'
	| 'startedPlayback'
	| 'tTimers'
>

export type ToResolvedPlaylistStatusProps = {
	playlistState: PlaylistState | undefined
	rundownsState: DBRundown[]
	showStyleBaseExtState: ShowStyleBaseExt | undefined
	showStyleBaseExtsByIdState?: ReadonlyMap<ShowStyleBaseId, ShowStyleBaseExt>
	segmentsState: DBSegment[]
	partsState: DBPart[]
	partInstancesInPlaylistState: PartInstance[]
	piecesInPlaylistState: Piece[]
	pieceInstancesInPlaylistState: PieceInstance[]
}

export type ResolvedPlaylistConversionContext = Readonly<{
	playlist: PlaylistState
	rundownsById: Map<string, DBRundown>
	showStyleBaseExt: ShowStyleBaseExt

	rundownsToShowStyles: ReadonlyMap<RundownId, ShowStyleBaseId>
	rundownsToShowStyleBaseExt: ReadonlyMap<RundownId, ShowStyleBaseExt>
	orderedRundownIds: string[]

	segmentsByRundownId: Map<string, DBSegment[]>
	partsByRundownId: Map<string, DBPart[]>

	currentPartInstance: PartInstance | undefined
	nextPartInstance: PartInstance | undefined

	accessors: ReturnType<typeof createQueryAdapters>

	/** Values derived per Rundown, filled on first use as they are needed once for every Segment in the Rundown */
	perRundownCache: Map<string, PerRundownCache>
}>

interface PerRundownCache {
	orderedPartIds?: PartId[]
	segmentIds?: Set<SegmentId>
}

/**
 * Creates a normalized lookup context used by all resolved-playlist converters.
 * This keeps conversion functions deterministic and avoids repeated map/filter work.
 */
export function createResolvedPlaylistConversionContext(
	props: ToResolvedPlaylistStatusProps
): ResolvedPlaylistConversionContext {
	const playlist = props.playlistState
	const showStyleBaseExt = props.showStyleBaseExtState

	if (!playlist || !showStyleBaseExt) {
		throw new Error('Missing playlist or showStyleBaseExt')
	}

	const orderedRundownIds = (playlist.rundownIdsInOrder ?? []).map((r) => unprotectString(r))
	const rundownsById = new Map<string, DBRundown>((props.rundownsState ?? []).map((r) => [unprotectString(r._id), r]))
	const rundownsToShowStyles = new Map<RundownId, ShowStyleBaseId>()
	const rundownsToShowStyleBaseExt = new Map<RundownId, ShowStyleBaseExt>()
	for (const rundownId of playlist.rundownIdsInOrder ?? []) {
		const rundown = rundownsById.get(unprotectString(rundownId))
		if (!rundown) continue
		rundownsToShowStyles.set(rundownId, rundown.showStyleBaseId)
		const showStyle = props.showStyleBaseExtsByIdState?.get(rundown.showStyleBaseId)
		if (showStyle) rundownsToShowStyleBaseExt.set(rundownId, showStyle)
	}

	const segmentsByRundownId = groupByRundownId(props.segmentsState)
	const partsByRundownId = groupByRundownId(props.partsState)

	const currentPartInstance = findCurrentPartInstance(playlist, props.partInstancesInPlaylistState)
	const nextPartInstance = findNextPartInstance(playlist, props.partInstancesInPlaylistState)

	const accessors = createQueryAdapters({
		segmentsState: props.segmentsState,
		partsState: props.partsState,
		partInstancesInPlaylistState: props.partInstancesInPlaylistState,
		piecesInPlaylistState: props.piecesInPlaylistState,
		pieceInstancesInPlaylistState: props.pieceInstancesInPlaylistState,
	})

	return {
		playlist,
		rundownsById,
		showStyleBaseExt,
		rundownsToShowStyles,
		rundownsToShowStyleBaseExt,
		orderedRundownIds,
		segmentsByRundownId,
		partsByRundownId,
		currentPartInstance,
		nextPartInstance,
		accessors,
		perRundownCache: new Map(),
	}
}

function getPerRundownCache(ctx: ResolvedPlaylistConversionContext, rundownId: string): PerRundownCache {
	let cache = ctx.perRundownCache.get(rundownId)
	if (!cache) {
		cache = {}
		ctx.perRundownCache.set(rundownId, cache)
	}
	return cache
}

/** The ids of the parts in the rundown, in rundown order. Computed once per rundown. */
export function getOrderedPartIdsInRundown(ctx: ResolvedPlaylistConversionContext, rundownId: string): PartId[] {
	const cache = getPerRundownCache(ctx, String(rundownId))
	cache.orderedPartIds ??= getOrderedPartsInRundown(ctx, rundownId).map((p) => p._id)
	return cache.orderedPartIds
}

/** The ids of all the segments in the rundown. Computed once per rundown. */
export function getSegmentIdsInRundown(ctx: ResolvedPlaylistConversionContext, rundownId: string): Set<SegmentId> {
	const cache = getPerRundownCache(ctx, String(rundownId))
	cache.segmentIds ??= new Set((ctx.segmentsByRundownId.get(String(rundownId)) ?? []).map((s) => s._id))
	return cache.segmentIds
}

function groupByRundownId<T extends { rundownId: unknown }>(items: T[]): Map<string, T[]> {
	const map = new Map<string, T[]>()
	for (const item of items ?? []) {
		const rundownId = String(item.rundownId)
		const list = map.get(rundownId) ?? ([] as T[])
		list.push(item)
		map.set(rundownId, list)
	}
	return map
}

/** Returns segments in rundown order so API consumers get stable ranks. */
export function getOrderedSegmentsInRundown(ctx: ResolvedPlaylistConversionContext, rundownId: string): DBSegment[] {
	const list = ctx.segmentsByRundownId.get(String(rundownId)) ?? []
	return list.slice().sort((a, b) => a._rank - b._rank)
}

/** Returns parts in rundown order for state resolver and API output parity. */
export function getOrderedPartsInRundown(ctx: ResolvedPlaylistConversionContext, rundownId: string): DBPart[] {
	const normalizedRundownId = String(rundownId)

	const partsInRundown = ctx.partsByRundownId.get(normalizedRundownId) ?? []
	if (partsInRundown.length === 0) return []

	// Part._rank is only meaningful within a segment, so we must preserve segment order.
	const partsBySegmentId = new Map<string, DBPart[]>()
	for (const part of partsInRundown) {
		const segmentId = String(part.segmentId)
		const list = partsBySegmentId.get(segmentId) ?? []
		list.push(part)
		partsBySegmentId.set(segmentId, list)
	}

	const orderedSegments = getOrderedSegmentsInRundown(ctx, normalizedRundownId)
	const orderedParts: DBPart[] = []
	for (const segment of orderedSegments) {
		const segmentParts = partsBySegmentId.get(String(segment._id))
		if (!segmentParts?.length) continue
		segmentParts.sort((a, b) => a._rank - b._rank)
		orderedParts.push(...segmentParts)
	}

	return orderedParts
}

/** Finds the current part instance referenced by playlist state. */
export function findCurrentPartInstance(
	playlist: PlaylistState,
	partInstancesInPlaylistState: PartInstance[]
): PartInstance | undefined {
	return partInstancesInPlaylistState.find((pi) => pi._id === playlist.currentPartInfo?.partInstanceId)
}

/** Finds the next part instance referenced by playlist state. */
export function findNextPartInstance(
	playlist: PlaylistState,
	partInstancesInPlaylistState: PartInstance[]
): PartInstance | undefined {
	return partInstancesInPlaylistState.find((pi) => pi._id === playlist.nextPartInfo?.partInstanceId)
}

/**
 * Group documents by the value of one field, keeping each group in the original document order.
 */
function groupByField<T, K extends keyof T>(items: readonly T[], key: K): Map<T[K], T[]> {
	const map = new Map<T[K], T[]>()
	for (const item of items) {
		const value = item[key]
		const list = map.get(value)
		if (list) list.push(item)
		else map.set(value, [item])
	}
	return map
}

/**
 * If the selector requires `key` to equal a single plain value, return that value.
 * Returns `undefined` when the selector constrains the field in any other way (or not at all).
 */
function getRequiredEqualValue(selector: unknown, key: string): string | number | undefined {
	if (!selector || typeof selector !== 'object') return undefined
	let value = (selector as Record<string, unknown>)[key]
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const operators = Object.keys(value)
		if (operators.length !== 1 || operators[0] !== '$eq') return undefined
		value = (value as Record<string, unknown>).$eq
	}
	return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

/**
 * Narrow `allItems` to the bucket of `index` that `selector` is restricted to by `key`, if it is restricted to
 * a single value. The full selector must still be applied to the result.
 */
function narrowByIndex<T>(
	allItems: readonly T[],
	index: ReadonlyMap<unknown, T[]>,
	selector: unknown,
	key: string
): readonly T[] {
	const value = getRequiredEqualValue(selector, key)
	if (value === undefined) return allItems
	return index.get(value) ?? []
}

/**
 * Whether the selector can only match Pieces with a lifespan other than `WithinPart`: it restricts `lifespan` to
 * values which don't include it, either directly, or in every branch of an `$or` (or any part of an `$and`).
 * The query for the infinites which may continue into a part has this shape, and is run for every part.
 */
function excludesWithinPartLifespan(selector: unknown): boolean {
	if (!selector || typeof selector !== 'object') return false
	const { lifespan, $or, $and } = selector as Record<string, unknown>

	if (lifespan !== undefined) {
		const isOtherLifespan = (value: unknown) =>
			typeof value === 'string' && value !== (PieceLifespan.WithinPart as string)
		if (isOtherLifespan(lifespan)) return true
		if (lifespan && typeof lifespan === 'object') {
			const operators = lifespan as Record<string, unknown>
			if (isOtherLifespan(operators.$eq)) return true
			if (Array.isArray(operators.$in) && operators.$in.every(isOtherLifespan)) return true
		}
	}

	if (Array.isArray($or) && $or.length > 0 && $or.every(excludesWithinPartLifespan)) return true
	if (Array.isArray($and) && $and.some(excludesWithinPartLifespan)) return true

	return false
}

/**
 * The resolver looks documents up once per Segment and once per Part, so scanning the whole playlist for each lookup
 * makes the build quadratic. Index the collections by the fields it looks up by, and only run the selector against
 * the documents in the matching bucket.
 * The full selector is always applied to the narrowed set, so a selector of any other shape still gives the right
 * answer, just without the speedup.
 */
function createQueryAdapters({
	segmentsState,
	partsState,
	partInstancesInPlaylistState,
	piecesInPlaylistState,
	pieceInstancesInPlaylistState,
}: {
	segmentsState: DBSegment[]
	partsState: DBPart[]
	partInstancesInPlaylistState: PartInstance[]
	piecesInPlaylistState: Piece[]
	pieceInstancesInPlaylistState: PieceInstance[]
}): StateCacheResolverDataAccess {
	const segmentsById = groupByField(segmentsState, '_id')
	const partsBySegmentId = groupByField(partsState, 'segmentId')

	const activePartInstances = partInstancesInPlaylistState.filter((pi) => pi.reset !== true)
	const activePartInstancesBySegmentId = groupByField(activePartInstances, 'segmentId')

	const piecesById = groupByField(piecesInPlaylistState, '_id')
	const piecesByStartPartId = groupByField(piecesInPlaylistState, 'startPartId')
	/** Pieces which may continue beyond the Part they start in. Usually a small fraction of all Pieces */
	const infinitePieces = piecesInPlaylistState.filter((p) => p.lifespan !== PieceLifespan.WithinPart)

	const pieceInstancesById = groupByField(pieceInstancesInPlaylistState, '_id')
	const pieceInstancesByPartInstanceId = groupByField(pieceInstancesInPlaylistState, 'partInstanceId')

	const filterNarrowed = <T extends Record<string, any>>(candidates: readonly T[], selector: unknown): T[] =>
		mongoWhereFilter(candidates as T[], selector as never)

	// Adapter surface expected by `getResolvedSegment`
	return {
		segmentsFindOne: (selector, _options): DBSegment | undefined => {
			if (!selector) return undefined
			if (typeof selector === 'string') return segmentsById.get(selector)?.[0]

			return filterNarrowed(narrowByIndex(segmentsState, segmentsById, selector, '_id'), selector)[0]
		},
		getSegmentsAndPartsSync: (playlistPick, segmentsQuery, partsQuery) => {
			const rundownIds = playlistPick.rundownIdsInOrder ?? []
			const rundownIdSet = new Set(rundownIds)

			let segments: DBSegment[]
			if (segmentsQuery) {
				const candidates = narrowByIndex(segmentsState, segmentsById, segmentsQuery, '_id')
				segments = filterNarrowed(
					candidates.filter((s) => rundownIdSet.has(s.rundownId)),
					segmentsQuery
				)
			} else {
				segments = segmentsState.filter((s) => rundownIdSet.has(s.rundownId))
			}

			let parts: DBPart[]
			if (partsQuery) {
				const candidates = narrowByIndex(partsState, partsBySegmentId, partsQuery, 'segmentId')
				parts = filterNarrowed(
					candidates.filter((p) => rundownIdSet.has(p.rundownId)),
					partsQuery
				)
			} else {
				parts = partsState.filter((p) => rundownIdSet.has(p.rundownId))
			}

			return { segments, parts }
		},
		getActivePartInstances: (_playlistPick: Pick<DBRundownPlaylist, '_id'>, selector?: unknown) => {
			if (!selector) return activePartInstances.slice()
			// The reset check always wins over anything the selector says about `reset`
			const mergedSelector = { ...(selector as any), reset: { $ne: true } }
			return filterNarrowed(
				narrowByIndex(activePartInstances, activePartInstancesBySegmentId, selector, 'segmentId'),
				mergedSelector
			)
		},
		piecesFind: (selector) => {
			if (!selector) return piecesInPlaylistState
			if (typeof selector === 'string') return piecesById.get(selector)?.slice() ?? []

			let candidates = narrowByIndex(piecesInPlaylistState, piecesById, selector, '_id')
			if (candidates === piecesInPlaylistState) {
				candidates = narrowByIndex(piecesInPlaylistState, piecesByStartPartId, selector, 'startPartId')
			}
			if (candidates === piecesInPlaylistState && excludesWithinPartLifespan(selector)) {
				candidates = infinitePieces
			}
			return filterNarrowed(candidates, selector)
		},
		pieceInstancesFind: (selector) => {
			if (!selector) return pieceInstancesInPlaylistState
			if (typeof selector === 'string') return pieceInstancesById.get(selector)?.slice() ?? []

			let candidates = narrowByIndex(pieceInstancesInPlaylistState, pieceInstancesById, selector, '_id')
			if (candidates === pieceInstancesInPlaylistState) {
				candidates = narrowByIndex(
					pieceInstancesInPlaylistState,
					pieceInstancesByPartInstanceId,
					selector,
					'partInstanceId'
				)
			}
			return filterNarrowed(candidates, selector)
		},
	}
}
