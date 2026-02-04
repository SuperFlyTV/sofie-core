import { unprotectString } from '@sofie-automation/server-core-integration'
import type { ShowStyleBaseExt } from '../../collections/showStyleBaseHandler.js'
import type { PieceInstanceMin } from '../../collections/pieceInstancesHandler.js'
import {
	PieceLifespan as PieceLifespanStatus,
	type ExtendedPieceStatus,
	type PieceStatus,
	type PieceTiming,
} from '@sofie-automation/live-status-gateway-api'
import { clone, literal } from '@sofie-automation/corelib/dist/lib'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'

export function toPieceStatus(
	pieceInstance: PieceInstanceMin | Piece,
	showStyleBaseExt: ShowStyleBaseExt | undefined
): PieceStatus {
	const piece = 'piece' in pieceInstance ? pieceInstance.piece : pieceInstance

	const sourceLayerName = piece.sourceLayerId
		? showStyleBaseExt?.sourceLayerNamesById.get(piece.sourceLayerId)
		: undefined
	const outputLayerName = piece.outputLayerId
		? showStyleBaseExt?.outputLayerNamesById.get(piece.outputLayerId)
		: undefined

	return {
		id: unprotectString(pieceInstance._id),
		name: piece.name,
		sourceLayer: sourceLayerName ?? 'invalid',
		outputLayer: outputLayerName ?? 'invalid',
		tags: clone<string[] | undefined>(piece.tags),
		publicData: piece.publicData,
	}
}

export function toExtendedPieceStatus(
	pieceInstance: PieceInstanceMin | Piece,
	showStyleBaseExt: ShowStyleBaseExt | undefined
): ExtendedPieceStatus {
	if ('piece' in pieceInstance) {
		return toPieceStatus(pieceInstance, showStyleBaseExt)
	}

	const sourceLayerName = pieceInstance.sourceLayerId
		? showStyleBaseExt?.sourceLayerNamesById.get(pieceInstance.sourceLayerId)
		: undefined
	const outputLayerName = pieceInstance.outputLayerId
		? showStyleBaseExt?.outputLayerNamesById.get(pieceInstance.outputLayerId)
		: undefined

	return {
		id: unprotectString(pieceInstance._id),
		name: pieceInstance.name,
		sourceLayer: sourceLayerName ?? 'invalid',
		outputLayer: outputLayerName ?? 'invalid',
		tags: clone<string[] | undefined>(pieceInstance.tags),
		publicData: pieceInstance.publicData,
		notInVision: pieceInstance.notInVision,
		pieceType: pieceInstance.pieceType,
		timing: toPieceTimingStatus(pieceInstance),
	}
}

export function toPieceTimingStatus(piece: Piece): PieceTiming {
	return literal<PieceTiming>({
		startMs: piece.enable.start == 'now' ? 0 : piece.enable.start,
		durationMs: piece.enable.duration,
		lifespan: toPieceLifespan(piece.lifespan),
		isAbsolute: piece.enable.isAbsolute,
	})
}

function toPieceLifespan(lifespan: PieceLifespan): PieceLifespanStatus {
	switch (lifespan) {
		case PieceLifespan.WithinPart:
			return PieceLifespanStatus.PART_MINUS_ONLY
		case PieceLifespan.OutOnSegmentChange:
			return PieceLifespanStatus.SEGMENT_MINUS_CHANGE
		case PieceLifespan.OutOnSegmentEnd:
			return PieceLifespanStatus.SEGMENT_MINUS_END
		case PieceLifespan.OutOnRundownChange:
			return PieceLifespanStatus.RUNDOWN_MINUS_CHANGE
		case PieceLifespan.OutOnRundownEnd:
			return PieceLifespanStatus.RUNDOWN_MINUS_END
		case PieceLifespan.OutOnShowStyleEnd:
			return PieceLifespanStatus.SHOWSTYLE_MINUS_END
	}
}
