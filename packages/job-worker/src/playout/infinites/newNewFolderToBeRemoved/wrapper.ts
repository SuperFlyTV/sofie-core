import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { IngestModelReadonly } from '../../../ingest/model/IngestModel'
import { JobContext } from '../../../jobs'
import { PlayoutModel } from '../../../playout/model/PlayoutModel'
import { ReadonlyDeep } from 'type-fest'
import _ from 'underscore'
import { PieceResolutionPlaylist } from './newClassesToBeCleanedUp'
import { unprotectString } from '@sofie-automation/shared-lib/dist/lib/protectedString.js'
import { InfinitePlaylist, PartialInfinitePiece } from '../interfaces'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { MongoQuery } from '../../../db'
import { mongoWhere } from '@sofie-automation/corelib/dist/mongo'
import { PieceLifespan } from '@sofie-automation/corelib/dist/playout/pieceLifespan'
import { PartId } from '@sofie-automation/corelib/dist/dataModel/Ids'

export function resolvePieces(
	context: JobContext,
	playoutModel: PlayoutModel,
	unsavedIngestModel: Pick<IngestModelReadonly, 'rundownId' | 'getAllPieces'> | undefined,
	part: ReadonlyDeep<DBPart>
) {
	const span = context.startSpan('resolvePieces')

	const rundownOrder = playoutModel.playlist.rundownIdsInOrder
	const rundowns = playoutModel.rundowns
	const sortedRundowns = _.sortBy(rundowns, (r) => rundownOrder.indexOf(r.rundown._id))

	const playlist = new PieceResolutionPlaylist(playoutModel.playlist._id, sortedRundowns, {
		rundownId: unprotectString(part.rundownId),
		segmentId: unprotectString(part.segmentId),
		partId: unprotectString(part._id),
	})

	const loadedPartInstances = playoutModel.loadedPartInstances

	const loadedPartIds = Object.values(loadedPartInstances).map((instance) =>
		unprotectString(instance.partInstance.part._id)
	)

	const piecesQuery = buildPiecesQuery(playlist, loadedPartIds)

	const ingestedPieces: PartialInfinitePiece[] = piecesQuery
		? (unsavedIngestModel
				?.getAllPieces()
				// filter to infinite pieces
				.filter((piece) => mongoWhere(piece, piecesQuery))
				.map((piece) => ({
					id: piece._id,
					lifespan: new PieceLifespan(piece.lifespan),
					enable: piece.enable,
					// TODO: check partId validity
					partId: unprotectString(piece.startPartId as PartId),
				})) ?? [])
		: []

	const loadedPieces: PartialInfinitePiece[] = loadedPartInstances.flatMap((instance) =>
		instance.pieceInstances
			.map((piece) => piece.pieceInstance)
			// filter to infinite pieces
			.filter((instance) => mongoWhere(instance.piece, lifespanQueryFragment))
			.map((instance) => ({
				id: instance.piece._id,
				lifespan: new PieceLifespan(instance.piece.lifespan),
				enable: instance.piece.enable,
				// TODO: check partId validity
				partId: unprotectString(instance.piece.startPartId ?? instance.partInstanceId),
			}))
	)

	if (ingestedPieces) {
		ingestedPieces.forEach((piece) => {
			const loadedPiece = loadedPieces.find((loaded) => loaded.id === piece.id)
			playlist.addPiece(loadedPiece ?? piece)
		})
	}

	if (span) span.end()
}

export function buildPiecesQuery(playlist: InfinitePlaylist, loadedPartIds: string[]): MongoQuery<Piece> | null {
	const partIdsWithoutLoaded = playlist.parts
		.map((p) => p.id)
		.filter((id) => !loadedPartIds.includes(unprotectString(id)))

	const fragment =
		playlist.parts.length > 0
			? {
					...lifespanQueryFragment,
					startRundownId: { $in: playlist.rundowns.map((r) => r.id) },
					startSegmentId: { $in: playlist.segments.map((s) => s.id) },
					startPartId: { $in: partIdsWithoutLoaded },
				}
			: undefined

	if (!fragment) {
		return null
	} else {
		return {
			invalid: { $ne: true },
			...fragment,
		}
	}
}

const lifespanQueryFragment = {
	lifespan: {
		$in: [
			// Part-level lifespan is generally not considered infinite
			// but persisting pieces need to resume in the part scope after being shadowed
			// this uses the same mechanism as other infinites.
			{
				scope: 'part' as const,
				presence: 'follow-playhead' as const,
				inShadow: 'persist' as const,
			},
			{
				scope: 'segment' as const,
				presence: 'forward-scope' as const,
				inShadow: 'persist' as const,
			},
			{
				scope: 'segment' as const,
				presence: 'follow-playhead' as const,
				inShadow: 'stop' as const,
			},
			{
				scope: 'rundown' as const,
				presence: 'forward-scope' as const,
				inShadow: 'persist' as const,
			},
			{
				scope: 'rundown' as const,
				presence: 'follow-playhead' as const,
				inShadow: 'stop' as const,
			},
			{
				scope: 'showstyle' as const,
				presence: 'forward-scope' as const,
				inShadow: 'persist' as const,
			},
			{
				scope: 'showstyle' as const,
				presence: 'forward-scope' as const,
				inShadow: 'persist' as const,
			},
			{
				scope: 'playlist' as const,
				presence: 'forward-scope' as const,
				inShadow: 'persist' as const,
			},
			{
				scope: 'playlist' as const,
				presence: 'forward-scope' as const,
				inShadow: 'persist' as const,
			},
		],
	},
}
