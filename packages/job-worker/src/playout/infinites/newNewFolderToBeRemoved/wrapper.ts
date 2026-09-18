import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { IngestModelReadonly } from '../../../ingest/model/IngestModel'
import { JobContext } from '../../../jobs'
import { PlayoutModel } from '../../../playout/model/PlayoutModel'
import { ReadonlyDeep } from 'type-fest'
import _ from 'underscore'
import { PieceResolutionPlaylist } from './newClassesToBeCleanedUp'

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

	const playlist = new PieceResolutionPlaylist(playoutModel.playlist._id, sortedRundowns)

	if (span) span.end()
}
