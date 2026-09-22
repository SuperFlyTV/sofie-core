import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { IngestModelReadonly } from '../../../ingest/model/IngestModel'
import { JobContext } from '../../../jobs'
import { PlayoutModel } from '../../../playout/model/PlayoutModel'
import { ReadonlyDeep } from 'type-fest'
import _ from 'underscore'
import { PieceResolutionPlaylist } from './newClassesToBeCleanedUp'
import { unprotectString } from '@sofie-automation/shared-lib/dist/lib/protectedString.js'
import { LegacyPieceLifespan } from '@sofie-automation/shared-lib/dist/core/model/Rundown'
import {
	InfiniteLivePiece,
	InfinitePartInstance,
	InfinitePlaylist,
	PartialInfinitePiece,
} from '../interfaces'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { PieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { MongoQuery } from '../../../db'
import { mongoWhere } from '@sofie-automation/corelib/dist/mongo'
import { PieceLifespan } from '@sofie-automation/corelib/dist/playout/pieceLifespan'
import { PartId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { PlayoutPartInstanceModel } from '../../model/PlayoutPartInstanceModel'

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

	playlist.live.current = toLivePartInstance(playlist, playoutModel.currentPartInstance)
	playlist.live.next = toLivePartInstance(playlist, playoutModel.nextPartInstance)

	if (span) span.end()

	return playlist
}

function toLivePartInstance(
	playlist: InfinitePlaylist,
	model: PlayoutPartInstanceModel | null
): InfinitePartInstance | undefined {
	if (!model) return undefined

	const partId = model.partInstance.part._id
	const treePart = playlist.parts.find((p) => p.id === partId)

	const pieces: InfiniteLivePiece[] = model.pieceInstances
		.map((piece) => piece.pieceInstance)
		.filter((instance) => isLiveRelevant(instance))
		.map((instance) => {
			const startPartId = instance.piece.startPartId ?? partId
			return {
				id: instance.piece._id,
				enable: instance.piece.enable,
				lifespan: new PieceLifespan(instance.piece.lifespan),
				part: playlist.parts.find((p) => p.id === startPartId) ?? treePart,
				dynamicallyInserted: instance.dynamicallyInserted !== undefined,
				dynamicallyConvertedToInfinite: instance.dynamicallyConvertedToInfinite !== undefined,
			}
		})

	return {
		id: model.partInstance._id,
		part: treePart,
		partId,
		segmentId: model.partInstance.segmentId,
		rundownId: model.partInstance.rundownId,
		pieces,
	}
}

function isLiveRelevant(instance: ReadonlyDeep<PieceInstance>): boolean {
	const lifespan = new PieceLifespan(instance.piece.lifespan)
	return (
		lifespan.isInfinite ||
		lifespan.persistsInShadow ||
		instance.dynamicallyInserted !== undefined ||
		instance.dynamicallyConvertedToInfinite !== undefined
	)
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
