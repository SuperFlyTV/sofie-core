import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import {
	PartInstanceId,
	PieceId,
	RundownId,
	RundownPlaylistActivationId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import { JobContext } from '../../jobs/index.js'
import { ReadonlyDeep } from 'type-fest'
import { SegmentOrphanedReason } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { candidatePartIsAfterPreviewPartInstance } from '../infinites.js'
import { PlayoutModel } from '../model/PlayoutModel.js'
import { IngestModelReadonly } from '../../ingest/model/IngestModel.js'
import { InfiniteLivePiece, InfinitePartInstance, InfinitePiece, InfinitePlaylist } from './interfaces.js'
import { PieceLifespan } from '@sofie-automation/corelib/dist/playout/pieceLifespan'
import {
	omitPiecePropertiesForInstance,
	PieceInstance,
	PieceInstancePiece,
	rewrapPieceToInstance,
} from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { SourceLayers } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { protectString, unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import _ from 'underscore'

export type PieceLookupDoc = ReadonlyDeep<Piece> | ReadonlyDeep<PieceInstancePiece>

export function resolveInfinites(
	context: JobContext,
	playoutModel: PlayoutModel,
	playlist: InfinitePlaylist,
	destinationPart: ReadonlyDeep<DBPart>,
	unsavedIngestModel?: Pick<IngestModelReadonly, 'getAllPieces'>
): InfiniteLivePiece[] {
	const treeInfinites = findForwardScopeInfinitesInPart(playlist, destinationPart)
	const consideredInfinites = unionTreeAndCurrent(context, playoutModel, playlist, destinationPart, treeInfinites)

	const destShowstyleId = playlist.rundowns.find((r) => r.id === destinationPart.rundownId)?.showstyleGroup
		.showstyleId
	const correctlyScopedInfinites = consideredInfinites.filter((infinite) =>
		isInfiniteInPartScope(infinite, destinationPart, destShowstyleId, playlist)
	)

	const destLocals = collectDestLocalPieces(destinationPart, unsavedIngestModel, playoutModel)
	const mixed = mixDestLocals(correctlyScopedInfinites, destLocals)

	return normalizeEndTimes(mixed, buildPieceLookups(unsavedIngestModel, playoutModel))
}

function collectDestLocalPieces(
	destinationPart: ReadonlyDeep<DBPart>,
	unsavedIngestModel: Pick<IngestModelReadonly, 'getAllPieces'> | undefined,
	playoutModel: PlayoutModel
): InfiniteLivePiece[] {
	const byId = new Map<InfinitePiece['id'], InfiniteLivePiece>()

	for (const piece of unsavedIngestModel?.getAllPieces() ?? []) {
		if (piece.startPartId !== destinationPart._id) continue
		byId.set(piece._id, {
			id: piece._id,
			enable: piece.enable,
			lifespan: new PieceLifespan(piece.lifespan),
		})
	}

	const next = playoutModel.nextPartInstance
	if (next && next.partInstance.part._id === destinationPart._id) {
		for (const wrapper of next.pieceInstances) {
			const instance = wrapper.pieceInstance
			const startsHere = !instance.piece.startPartId || instance.piece.startPartId === destinationPart._id
			if (!startsHere) continue
			if (instance.infinite?.fromPreviousPart || instance.infinite?.fromPreviousPlayhead) continue

			byId.set(instance.piece._id, {
				id: instance.piece._id,
				enable: instance.piece.enable,
				lifespan: new PieceLifespan(instance.piece.lifespan),
				dynamicallyInserted: instance.dynamicallyInserted !== undefined,
				dynamicallyConvertedToInfinite: instance.dynamicallyConvertedToInfinite !== undefined,
			})
		}
	}

	return [...byId.values()]
}

function mixDestLocals(scoped: InfiniteLivePiece[], destLocals: InfiniteLivePiece[]): InfiniteLivePiece[] {
	const byId = new Map<InfinitePiece['id'], InfiniteLivePiece>()
	for (const piece of scoped) {
		byId.set(piece.id, piece)
	}
	for (const piece of destLocals) {
		byId.set(piece.id, piece)
	}
	return [...byId.values()]
}

export function buildPieceLookups(
	unsavedIngestModel: Pick<IngestModelReadonly, 'getAllPieces'> | undefined,
	playoutModel: PlayoutModel
): Map<PieceId, PieceLookupDoc> {
	const pieceById = new Map<PieceId, PieceLookupDoc>()

	for (const piece of unsavedIngestModel?.getAllPieces() ?? []) {
		pieceById.set(piece._id, piece)
	}

	for (const partInstance of [playoutModel.currentPartInstance, playoutModel.nextPartInstance]) {
		for (const pieceInstance of partInstance?.pieceInstances ?? []) {
			pieceById.set(pieceInstance.pieceInstance.piece._id, pieceInstance.pieceInstance.piece)
		}
	}

	return pieceById
}

function findForwardScopeInfinitesInPart(
	playlist: InfinitePlaylist,
	destinationPart: ReadonlyDeep<DBPart>
): InfiniteLivePiece[] {
	const rundown = playlist.rundowns.find((r) => r.id === destinationPart.rundownId)
	const segment = rundown?.segment(destinationPart.segmentId)
	const showstyleGroup = rundown?.showstyleGroup

	return [
		...playlist.scopedPieces,
		...(showstyleGroup?.scopedPieces ?? []),
		...(rundown?.scopedPieces ?? []),
		...(segment?.scopedPieces ?? []),
	]
}

function unionTreeAndCurrent(
	context: JobContext,
	playoutModel: PlayoutModel,
	playlist: InfinitePlaylist,
	destinationPart: ReadonlyDeep<DBPart>,
	tree: InfiniteLivePiece[]
): InfiniteLivePiece[] {
	const byId = new Map<InfinitePiece['id'], InfiniteLivePiece>()
	for (const piece of tree) {
		byId.set(piece.id, piece)
	}

	const current = playlist.live.current
	if (!current) return [...byId.values()]

	for (const piece of current.pieces) {
		if (byId.has(piece.id)) byId.set(piece.id, piece)
	}

	const canContinueFromCurrent =
		!crossesAdlibTestingBoundary(context, playoutModel, current, destinationPart) &&
		candidatePartIsAfterPreviewPartInstance(
			context,
			playoutModel.getAllOrderedSegments(),
			playoutModel.currentPartInstance?.partInstance,
			destinationPart
		)

	if (canContinueFromCurrent) {
		for (const piece of current.pieces) {
			if (isPlayheadOrAdlibOnEnd(piece) && !byId.has(piece.id)) byId.set(piece.id, piece)
		}
	}

	return [...byId.values()]
}

function isPlayheadOrAdlibOnEnd(piece: InfiniteLivePiece): boolean {
	if (piece.lifespan.tracksPlayhead) return true
	return (
		(piece.dynamicallyInserted === true || piece.dynamicallyConvertedToInfinite === true) &&
		piece.lifespan.isStatic &&
		piece.lifespan.persistsInShadow
	)
}

function isInfiniteInPartScope(
	infinite: InfiniteLivePiece,
	destinationPart: ReadonlyDeep<DBPart>,
	destShowstyleId: InfinitePlaylist['showstyleGroups'][number]['showstyleId'] | undefined,
	playlist: InfinitePlaylist
): boolean {
	const scope = infinite.lifespan.scope
	if (scope === 'playlist') return true

	const liveCurrent = playlist.live.current
	const startPart = infinite.part
	const startSegmentId = startPart?.segment.id ?? liveCurrent?.segmentId
	const startRundownId = startPart?.segment.rundown.id ?? liveCurrent?.rundownId
	const startShowstyleId =
		startPart?.segment.rundown.showstyleGroup.showstyleId ??
		(liveCurrent
			? playlist.rundowns.find((r) => r.id === liveCurrent.rundownId)?.showstyleGroup.showstyleId
			: undefined)

	switch (scope) {
		case 'part':
			return startPart?.id === destinationPart._id || liveCurrent?.partId === destinationPart._id
		case 'segment':
			return startSegmentId === destinationPart.segmentId
		case 'rundown':
			return startRundownId === destinationPart.rundownId
		case 'showstyle':
			return startShowstyleId !== undefined && startShowstyleId === destShowstyleId
		default:
			return false
	}
}

function crossesAdlibTestingBoundary(
	context: JobContext,
	playoutModel: PlayoutModel,
	current: InfinitePartInstance,
	destinationPart: ReadonlyDeep<DBPart>
): boolean {
	if (context.studio.settings.allowTestingAdlibsToPersist) return false

	const playingSegment = playoutModel.getRundown(current.rundownId)?.getSegment(current.segmentId)?.segment
	const intoSegment = playoutModel
		.getRundown(destinationPart.rundownId)
		?.getSegment(destinationPart.segmentId)?.segment

	if (!playingSegment || !intoSegment) return false
	if (playingSegment._id === intoSegment._id) return false

	return (
		playingSegment.orphaned === SegmentOrphanedReason.ADLIB_TESTING ||
		intoSegment.orphaned === SegmentOrphanedReason.ADLIB_TESTING
	)
}

function normalizeEndTimes(
	continued: InfiniteLivePiece[],
	piecesById: Map<PieceId, PieceLookupDoc>
): InfiniteLivePiece[] {
	const clonedInfinites = continued.map((piece) => ({ ...piece }))

	const byLayer = new Map<string, InfiniteLivePiece[]>()
	for (const infinite of clonedInfinites) {
		const lookup = piecesById.get(infinite.id)
		if (!lookup) continue

		const layerPieces = byLayer.get(lookup.sourceLayerId) ?? []
		layerPieces.push(infinite)
		byLayer.set(lookup.sourceLayerId, layerPieces)
	}

	for (const layerPieces of byLayer.values()) {
		layerPieces.sort((a, b) => startInPart(a) - startInPart(b))

		for (let i = 1; i < layerPieces.length; i++) {
			const laterStart = startInPart(layerPieces[i])
			for (let j = 0; j < i; j++) {
				const earlier = layerPieces[j]
				if (earlier.lifespan.inShadow !== 'stop') continue
				earlier.resolvedEndCap =
					earlier.resolvedEndCap === undefined ? laterStart : Math.min(earlier.resolvedEndCap, laterStart)
			}
		}
	}

	return clonedInfinites
}

function startInPart(piece: InfiniteLivePiece): number {
	return piece.enable.start === 'now' ? 0 : piece.enable.start
}

export function flattenForPlayout(args: {
	resolved: InfiniteLivePiece[]
	pieceById: Map<PieceId, PieceLookupDoc>
	sourceLayers: SourceLayers
	playlistActivationId: RundownPlaylistActivationId
	destPartInstanceId: PartInstanceId
	destRundownId: RundownId
}): PieceInstance[] {
	const { resolved, pieceById, sourceLayers, playlistActivationId, destPartInstanceId, destRundownId } = args

	const byLayer = new Map<string, InfiniteLivePiece[]>()
	for (const piece of resolved) {
		const doc = pieceById.get(piece.id)
		if (!doc) continue
		const key = sourceLayers[doc.sourceLayerId]?.exclusiveGroup || doc.sourceLayerId
		const layerPieces = byLayer.get(key) ?? []
		layerPieces.push(piece)
		byLayer.set(key, layerPieces)
	}

	const slices: PieceInstance[] = []
	for (const layerPieces of byLayer.values()) {
		layerPieces.sort((a, b) => startInPart(a) - startInPart(b))
		slices.push(...flattenLayer(layerPieces, pieceById, playlistActivationId, destPartInstanceId, destRundownId))
	}

	return slices
}

function flattenLayer(
	layerPieces: InfiniteLivePiece[],
	pieceById: Map<PieceId, PieceLookupDoc>,
	playlistActivationId: RundownPlaylistActivationId,
	destPartInstanceId: PartInstanceId,
	destRundownId: RundownId
): PieceInstance[] {
	const out: PieceInstance[] = []
	const sliceCounts = new Map<PieceId, number>()

	for (let pieceIndex = 0; pieceIndex < layerPieces.length; pieceIndex++) {
		const piece = layerPieces[pieceIndex]
		const start = startInPart(piece)
		const end = pieceEnd(piece)
		if (end <= start) continue

		let gaps: Array<{ start: number; end: number }>
		if (piece.lifespan.persistsInShadow) {
			gaps = [{ start, end }]
			for (let j = pieceIndex + 1; j < layerPieces.length; j++) {
				const later = layerPieces[j]
				const laterStart = startInPart(later)
				if (laterStart <= start) continue
				gaps = subtractGap(gaps, laterStart, pieceEnd(later))
			}
		} else {
			let stopEnd = end
			for (let j = pieceIndex + 1; j < layerPieces.length; j++) {
				const laterStart = startInPart(layerPieces[j])
				if (laterStart <= start) continue
				stopEnd = Math.min(stopEnd, laterStart)
				break
			}
			gaps = [{ start, end: stopEnd }]
		}

		const lookup = pieceById.get(piece.id)
		if (!lookup) continue

		for (const gap of gaps) {
			if (gap.end <= gap.start) continue
			const sliceCount = sliceCounts.get(piece.id) ?? 0
			sliceCounts.set(piece.id, sliceCount + 1)
			out.push(
				wrapSlice(
					lookup,
					piece,
					gap.start,
					gap.end,
					sliceCount,
					playlistActivationId,
					destPartInstanceId,
					destRundownId
				)
			)
		}
	}

	return out
}

function pieceEnd(piece: InfiniteLivePiece): number {
	if (piece.resolvedEndCap !== undefined) return piece.resolvedEndCap
	const start = startInPart(piece)
	if (typeof piece.enable.duration === 'number') return start + piece.enable.duration
	return Number.POSITIVE_INFINITY
}

function subtractGap(
	gaps: Array<{ start: number; end: number }>,
	cutStart: number,
	cutEnd: number
): Array<{ start: number; end: number }> {
	const next: Array<{ start: number; end: number }> = []
	for (const gap of gaps) {
		if (cutEnd <= gap.start || cutStart >= gap.end) {
			next.push(gap)
			continue
		}
		if (cutStart > gap.start) next.push({ start: gap.start, end: Math.min(cutStart, gap.end) })
		if (cutEnd < gap.end) next.push({ start: Math.max(cutEnd, gap.start), end: gap.end })
	}
	return next.filter((gap) => gap.end > gap.start)
}

function wrapSlice(
	doc: PieceLookupDoc,
	piece: InfiniteLivePiece,
	sliceStart: number,
	sliceEnd: number,
	sliceIndex: number,
	playlistActivationId: RundownPlaylistActivationId,
	destPartInstanceId: PartInstanceId,
	destRundownId: RundownId
): PieceInstance {
	const instance = rewrapPieceToInstance(
		omitPiecePropertiesForInstance(doc as Piece | PieceInstancePiece),
		playlistActivationId,
		destRundownId,
		destPartInstanceId,
		true
	)

	return {
		...instance,
		isTemporary: true,
		_id: protectString(`${unprotectString(instance._id)}_slice${sliceIndex}`),
		dynamicallyInserted: piece.dynamicallyInserted ? 1 : undefined,
		dynamicallyConvertedToInfinite: piece.dynamicallyConvertedToInfinite ? 1 : undefined,
		piece: {
			...instance.piece,
			enable: {
				...instance.piece.enable,
				start: sliceStart,
				duration: Number.isFinite(sliceEnd) ? sliceEnd - sliceStart : undefined,
			},
		},
	}
}
