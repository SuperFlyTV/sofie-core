import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { IngestModelReadonly } from '../../../ingest/model/IngestModel'
import { JobContext } from '../../../jobs'
import { PlayoutModel } from '../../../playout/model/PlayoutModel'
import { ReadonlyDeep } from 'type-fest'
import _ from 'underscore'
import { PieceResolutionPlaylist } from './newClassesToBeCleanedUp'
import { unprotectString } from '@sofie-automation/shared-lib/dist/lib/protectedString.js'
import { LegacyPieceLifespan } from '@sofie-automation/shared-lib/dist/core/model/Rundown'
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

	const inTreePartIds = new Set(playlist.parts.map((p) => unprotectString(p.id)))
	const overlayInstances = playoutModel.loadedPartInstances.filter(
		(instance) =>
			inTreePartIds.has(unprotectString(instance.partInstance.part._id)) && instance.pieceInstances.length > 0
	)

	const loadedPartIds = overlayInstances.map((instance) => unprotectString(instance.partInstance.part._id))

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

	const loadedPieces: PartialInfinitePiece[] = overlayInstances.flatMap((instance) =>
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

/** Forward-scope only. Follow-playhead is instance/playhead-pass, not planned-tree. */
const lifespanQueryFragment: MongoQuery<Piece> = {
	$or: [
		{ 'lifespan.presence': 'forward-scope', 'lifespan.scope': { $ne: 'part' } },
		{ 'lifespan.presence': 'forward-scope', 'lifespan.scope': 'part', 'lifespan.inShadow': 'persist' },

		// TODO: remove legacy enum compatibility on this layer, handle it with a migration.
		// We should only provide conversion in the blueprint API to not break legacy behavior.
		{
			lifespan: {
				$in: [
					LegacyPieceLifespan.OutOnSegmentEnd,
					LegacyPieceLifespan.OutOnRundownEnd,
					LegacyPieceLifespan.OutOnShowStyleEnd,
				],
			},
		},
	],
}
