import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { JobContext } from '../../jobs/index.js'
import { ReadonlyDeep } from 'type-fest'
import { ReadonlyObjectDeep } from 'type-fest/source/readonly-deep'
import { SegmentOrphanedReason } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { candidatePartIsAfterPreviewPartInstance } from '../infinites.js'
import { PlayoutModel } from '../model/PlayoutModel.js'
import { InfiniteLivePiece, InfinitePartInstance, InfinitePiece, InfinitePlaylist } from './interfaces.js'

export function resolveInfinites(
	context: JobContext,
	playoutModel: PlayoutModel,
	playlist: InfinitePlaylist,
	destinationPart: ReadonlyDeep<DBPart>
): InfiniteLivePiece[] {
	const treeInfinites = findForwardScopeInfinitesInPart(playlist, destinationPart)
	const consideredInfinites = unionTreeAndCurrent(context, playoutModel, playlist, destinationPart, treeInfinites)

	const destShowstyleId = playlist.rundowns.find((r) => r.id === destinationPart.rundownId)?.showstyleGroup
		.showstyleId
	const correctlyScopedInfinites = consideredInfinites.filter((infinite) =>
		isInfiniteInPartScope(infinite, destinationPart, destShowstyleId, playlist)
	)

	// normalizeEndTimes / stop-on-override is a later pass
	return correctlyScopedInfinites
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
	_context: JobContext,
	_consideredInfinites: ReadonlyObjectDeep<Piece>[],
	_destinationPart: ReadonlyObjectDeep<DBPart>
): ReadonlyObjectDeep<Piece>[] {
	throw new Error('Function not implemented.')
}
