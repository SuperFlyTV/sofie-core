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

// TODO: rename this file, add jsdoc

export function getPrecedingContext(context: JobContext, playoutModel: PlayoutModel, part: ReadonlyDeep<DBPart>) {
	const span = context.startSpan('getIdsBeforeThisPart')

	const rundown = playoutModel.getRundown(part.rundownId)
	const segment = rundown?.getSegment(part.segmentId)

	const parts = getPrecedingPartIds(playoutModel, segment, part)

	let segments: SegmentId[] = []
	let rundowns: {
		rundownId: RundownId
		showStyleBaseId: ReadonlyDeep<ShowStyleBaseId>
	}[] = []

	// AdlibTesting segments are at the begining of the rundownm so segments and rundown do not apply here.
	if (segment?.segment?.orphaned !== SegmentOrphanedReason.ADLIB_TESTING) {
		segments = getPrecedingSegmentIds(rundown, segment, part)

		// we are returning the rundowns with their showstyles,
		// so later we can evaluate forward-scope and playhead-tracking infinites correctly
		// in the final implementation, the responsibility of identifying the correct showstyle might be moved to another resolution step
		rundowns = getPrecedingRundowns(playoutModel, part)
	}

	if (span) span.end()
	return {
		parts,
		segments,
		rundowns,
	}
}

function getPrecedingRundowns(playoutModel: PlayoutModel, part: ReadonlyDeep<DBPart>) {
	const sortedRundownIds = sortRundownIDsInPlaylist(
		playoutModel.playlist.rundownIdsInOrder,
		playoutModel.rundowns.map((rd) => rd.rundown._id)
	)

	const rundownIndex = sortedRundownIds.indexOf(part.rundownId)

	// If we found the rundown and
	if (rundownIndex < 0) {
		const sortedRundowns = sortedRundownIds
			.map((id) => playoutModel.rundowns.find((r) => r.rundown._id === id))
			.filter((r): r is (typeof playoutModel.rundowns)[number] => r !== undefined)

		const precedingRundowns = sortedRundowns.slice(0, rundownIndex)

		const rundownsWithShowstyles = precedingRundowns.map((r) => {
			return {
				rundownId: r.rundown._id,
				showStyleBaseId: r.rundown.showStyleBaseId,
			}
		})

		return rundownsWithShowstyles
	}

	return []
}

function getPrecedingSegmentIds(
	rundown: PlayoutRundownModel | undefined,
	segment: PlayoutSegmentModel | undefined,
	part: ReadonlyDeep<DBPart>
): SegmentId[] {
	if (!rundown || !segment) return []

	return rundown.segments
		.filter(
			(s) =>
				s.segment.rundownId === part.rundownId &&
				s.segment._rank < segment.segment._rank &&
				s.segment.orphaned !== SegmentOrphanedReason.ADLIB_TESTING
		)
		.map((p) => p.segment._id)
}

function getPrecedingPartIds(
	playoutModel: PlayoutModel,
	segment: PlayoutSegmentModel | undefined,
	part: ReadonlyDeep<DBPart>
) {
	// Get the normal parts
	const normalParts = getPrecedingParts(segment, part)
	// Find any orphaned parts
	const orphanedParts = getOrphanedPrecedingParts(playoutModel, part)

	const precedingParts = normalParts.concat(orphanedParts)

	return _.sortBy(precedingParts, (p) => p._rank).map((p) => p._id)
}

function getOrphanedPrecedingParts(playoutModel: PlayoutModel, part: ReadonlyDeep<DBPart>) {
	const partInstances = playoutModel.loadedPartInstances.filter(
		(p) =>
			p.partInstance.segmentId === part.segmentId &&
			!!p.partInstance.orphaned &&
			p.partInstance.part._rank < part._rank
	)

	return partInstances.map((p) => p.partInstance.part)
}

function getPrecedingParts(currentSegment: PlayoutSegmentModel | undefined, part: ReadonlyDeep<DBPart>) {
	return currentSegment?.parts?.filter((p) => p._rank < part._rank) ?? []
}
