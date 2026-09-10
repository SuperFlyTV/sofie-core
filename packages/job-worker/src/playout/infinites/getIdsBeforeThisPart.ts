import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { SegmentOrphanedReason } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { sortRundownIDsInPlaylist } from '@sofie-automation/corelib/dist/playout/playlist'
import { JobContext } from '../../jobs'
import { ReadonlyDeep } from 'type-fest'
import _ from 'underscore'
import { PlayoutModel } from '../model/PlayoutModel'
import { PlayoutSegmentModel } from '../model/PlayoutSegmentModel'
import { PlayoutRundownModel } from '../model/PlayoutRundownModel'
import { RundownId, SegmentId, ShowStyleBaseId } from '@sofie-automation/corelib/dist/dataModel/Ids'

/**
 * Get the ids of parts, segments and rundowns before a given part in the playlist.
 * Note: this will return no segments and rundowns if the part is in the AdlibTesting segment.
 */
export function getIdsBeforeThisPart(context: JobContext, playoutModel: PlayoutModel, nextPart: ReadonlyDeep<DBPart>) {
	const span = context.startSpan('getIdsBeforeThisPart')

	const currentRundown = playoutModel.getRundown(nextPart.rundownId)
	const nextPartSegment = currentRundown?.getSegment(nextPart.segmentId)

	const parts = getOrderedPrecedingPartIdsInSegment(nextPartSegment, playoutModel, nextPart)

	let segments: SegmentId[] = []
	let rundowns: {
		rundownId: RundownId
		showStyleBaseId: ReadonlyDeep<ShowStyleBaseId>
	}[] = []

	// AdlibTesting segments are at the begining of the rundownm so segments and rundown do not apply here.
	if (nextPartSegment?.segment?.orphaned !== SegmentOrphanedReason.ADLIB_TESTING) {
		segments = getPrecedingSegmentIdsInRundown(currentRundown, nextPartSegment, nextPart)

		rundowns = getPrecedingRundownIdsWithShowstyleInPlaylist(playoutModel, nextPart)
		// this is where we should also group by showstyle. Showstyle can span multiple rundowns in the same playlist.
	}

	if (span) span.end()
	return {
		parts,
		segments,
		rundowns,
	}
}

function getPrecedingRundownIdsWithShowstyleInPlaylist(playoutModel: PlayoutModel, nextPart: ReadonlyDeep<DBPart>) {
	const sortedRundownIds = sortRundownIDsInPlaylist(
		playoutModel.playlist.rundownIdsInOrder,
		playoutModel.rundowns.map((rd) => rd.rundown._id)
	)

	const currentRundownIndex = sortedRundownIds.indexOf(nextPart.rundownId)

	// If we found the rundown and
	if (currentRundownIndex < 0) {
		const sortedRundowns = sortedRundownIds
			.map((id) => playoutModel.rundowns.find((rd) => rd.rundown._id === id))
			.filter((rd): rd is (typeof playoutModel.rundowns)[number] => rd !== undefined)

		const precedingRundowns = sortedRundowns.slice(0, currentRundownIndex)

		const rundownsWithShowstyles = precedingRundowns.map((rd) => {
			return {
				rundownId: rd.rundown._id,
				showStyleBaseId: rd.rundown.showStyleBaseId,
			}
		})

		// we are returning the rundowns with their showstyles,
		// so later we can evaluate forward-scope and playhead-tracking infinites correctly
		// in the final implementation, the responsibility of identifying the correct showstyle might be moved to another resolution step
		return rundownsWithShowstyles
	}

	return []
}

function getPrecedingSegmentIdsInRundown(
	currentRundown: PlayoutRundownModel | undefined,
	nextPartSegment: PlayoutSegmentModel | undefined,
	nextPart: ReadonlyDeep<DBPart>
): SegmentId[] {
	if (!currentRundown || !nextPartSegment) return []

	return currentRundown.segments
		.filter(
			(s) =>
				s.segment.rundownId === nextPart.rundownId &&
				s.segment._rank < nextPartSegment.segment._rank &&
				s.segment.orphaned !== SegmentOrphanedReason.ADLIB_TESTING
		)
		.map((p) => p.segment._id)
}

function getOrderedPrecedingPartIdsInSegment(
	nextPartSegment: PlayoutSegmentModel | undefined,
	playoutModel: PlayoutModel,
	nextPart: ReadonlyDeep<DBPart>
) {
	// Find any orphaned parts
	const orphanedPrecedingPartsInSegment = getOrphanedPrecedingPartsInSegment(playoutModel, nextPart)

	// Get the normal parts
	const precedingParentPartsInSegment = getPrecedingPartsInSegment(nextPartSegment, nextPart)

	const precedingPartsInSegment = precedingParentPartsInSegment.concat(orphanedPrecedingPartsInSegment)

	return _.sortBy(precedingPartsInSegment, (p) => p._rank).map((p) => p._id)
}

function getOrphanedPrecedingPartsInSegment(playoutModel: PlayoutModel, nextPart: ReadonlyDeep<DBPart>) {
	const partInstances = playoutModel.loadedPartInstances.filter(
		(p) =>
			p.partInstance.segmentId === nextPart.segmentId &&
			!!p.partInstance.orphaned &&
			p.partInstance.part._rank < nextPart._rank
	)

	return partInstances.map((p) => p.partInstance.part)
}

function getPrecedingPartsInSegment(currentSegment: PlayoutSegmentModel | undefined, nextPart: ReadonlyDeep<DBPart>) {
	return currentSegment?.parts?.filter((p) => p._rank < nextPart._rank) ?? []
}
