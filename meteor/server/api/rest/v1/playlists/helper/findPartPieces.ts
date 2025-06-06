import { ISourceLayer } from '@sofie-automation/blueprints-integration'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { PieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { DBShowStyleBase, SourceLayers } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { PieceStatus } from '@sofie-automation/live-status-gateway-api'
import { PieceInstances, ShowStyleBases } from '../../../../../collections'
import findSourceLayers from './findSourceLayers'
import { Rundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'

export default async function findPartPieces(
	rundowns: Rundown[],
	part: Pick<DBPartInstance, '_id' | 'part'>
): Promise<PieceStatus[]> {
	const showStyles: DBShowStyleBase[] | null = rundowns
		? await ShowStyleBases.findFetchAsync({
				_id: { $in: Array.from(new Set(rundowns.map((r) => r.showStyleBaseId))) },
			})
		: null

	const sourceLayers: SourceLayers | null = showStyles ? await findSourceLayers(showStyles) : null

	return (
		await PieceInstances.findFetchAsync(
			{ partInstanceId: part._id },
			{
				projection: {
					_id: 1,
					piece: 1,
				},
			}
		)
	).map((pieceInstance: PieceInstance): PieceStatus => {
		const sourceLayer: string = sourceLayers
			? (Object.entries<ISourceLayer | undefined>(sourceLayers).find(
					([id, _sourceLayer]) => id === pieceInstance.piece.sourceLayerId && _sourceLayer !== undefined
				)?.[1]?.name ?? 'unkown source layer')
			: 'unkown source layer'

		return {
			id: unprotectString(pieceInstance._id),
			name: pieceInstance.piece.name,
			sourceLayer: sourceLayer,
			outputLayer: pieceInstance.piece.outputLayerId,
			tags: pieceInstance.piece.tags,
			publicData: pieceInstance.piece.publicData,
		}
	})
}
