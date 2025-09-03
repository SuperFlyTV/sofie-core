import { unprotectString } from '@sofie-automation/server-core-integration'
import type { ShowStyleBaseExt } from '../../collections/showStyleBaseHandler.js'
import type { PieceInstanceMin } from '../../collections/pieceInstancesHandler.js'
import type { PieceStatus } from '@sofie-automation/live-status-gateway-api'
import { clone } from '@sofie-automation/corelib/dist/lib'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'

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
