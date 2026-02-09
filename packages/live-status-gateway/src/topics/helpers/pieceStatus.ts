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
	showStyleBaseExt: ShowStyleBaseExt | undefined,
	partDurationMs: number
): ExtendedPieceStatus {
	const base = toPieceStatus(pieceInstance, showStyleBaseExt)

	const piece = 'piece' in pieceInstance ? pieceInstance.piece : pieceInstance

	const timing =
		'piece' in pieceInstance
			? (toPieceTimingStatusFromInstance(pieceInstance.piece as Piece, pieceInstance, partDurationMs) ??
				toPieceTimingStatus(pieceInstance.piece as Piece, partDurationMs))
			: toPieceTimingStatus(piece as Piece, partDurationMs)

	return {
		...base,
		timing,
	}
}

export function toPieceTimingStatus(piece: Piece, partDurationMs: number): PieceTiming {
	const startMs = piece.enable.start === 'now' ? 0 : piece.enable.start
	const durationMs = piece.enable.duration ?? Math.max(0, partDurationMs - startMs)

	return literal<PieceTiming>({
		startMs,
		durationMs,
		lifespan: toPieceLifespan(piece.lifespan),
		isAbsolute: piece.enable.isAbsolute,
	})
}

export function toPieceTimingStatusFromInstance(
	piece: Piece,
	instance: PieceInstanceMin,
	partDurationMs: number
): PieceTiming | undefined {
	const started = instance.reportedStartedPlayback ?? instance.plannedStartedPlayback
	const stopped = instance.reportedStoppedPlayback ?? instance.plannedStoppedPlayback

	if (!started && !stopped && !instance.userDuration) {
		return undefined
	}

	const timing = toPieceTimingStatus(piece, partDurationMs)

	if (instance.userDuration) {
		return {
			...timing,
			durationMs: instance.userDuration.endRelativeToPart - timing.startMs,
		}
	}

	if (started && stopped) {
		return {
			...timing,
			durationMs: stopped - started,
		}
	}

	return timing
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
