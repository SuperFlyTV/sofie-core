import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { SegmentOrphanedReason } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { JobContext } from '../../jobs'
import { ReadonlyDeep } from 'type-fest'
import _ from 'underscore'
import { PlayoutSegmentModel } from '../model/PlayoutSegmentModel'
import { PlayoutRundownModel } from '../model/PlayoutRundownModel'
import { RundownId, SegmentId, ShowStyleBaseId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { PlayoutPartInstanceModel } from '../model/PlayoutPartInstanceModel'

// TODO: rename this file, add jsdoc

interface PrecedingLookupContext {
	part: ReadonlyDeep<DBPart>
	loadedPartInstances: PlayoutPartInstanceModel[]
	segment: PlayoutSegmentModel | undefined
	// should be an external responsibility to sort the rundowns.
	rundowns: PlayoutRundownModel[]
}

export function getPrecedingContext(context: JobContext, lookupContext: PrecedingLookupContext) {
	const span = context.startSpan('getIdsBeforeThisPart')

	const segment = lookupContext.segment

	const parts = getPrecedingPartIds(lookupContext)

	let segments: SegmentId[] = []
	let rundowns: {
		rundownId: RundownId
		showStyleBaseId: ReadonlyDeep<ShowStyleBaseId>
	}[] = []

	// AdlibTesting segments are at the begining of the rundownm so segments and rundown do not apply here.
	if (segment?.segment?.orphaned !== SegmentOrphanedReason.ADLIB_TESTING) {
		segments = getPrecedingSegmentIds(lookupContext)

		// we are returning the rundowns with their showstyles,
		// so later we can evaluate forward-scope and playhead-tracking infinites correctly
		// in the final implementation, the responsibility of identifying the correct showstyle might be moved to another resolution step
		rundowns = getPrecedingRundowns(lookupContext)
	}

	if (span) span.end()
	return {
		parts,
		segments,
		rundowns,
	}
}

function getPrecedingRundowns({ part, rundowns }: PrecedingLookupContext) {
	const rundownIndex = rundowns.findIndex((rd) => rd.rundown._id === part.rundownId)

	// If we found the rundown and it's not the first one
	if (rundownIndex > 0) {
		const precedingRundowns = rundowns.slice(0, rundownIndex)

		return precedingRundowns.map((r) => {
			return {
				rundownId: r.rundown._id,
				showStyleBaseId: r.rundown.showStyleBaseId,
			}
		})
	}

	return []
}

function getPrecedingSegmentIds({ segment, part, rundowns }: PrecedingLookupContext): SegmentId[] {
	const rundown = rundowns.find((r) => r.rundown._id === part.rundownId)

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

function getPrecedingPartIds(lookupContext: PrecedingLookupContext) {
	// Get the normal parts
	const normalParts = getPrecedingParts(lookupContext)
	// Find any orphaned parts
	const orphanedParts = getOrphanedPrecedingParts(lookupContext)

	const precedingParts = normalParts.concat(orphanedParts)

	return _.sortBy(precedingParts, (p) => p._rank).map((p) => p._id)
}

function getOrphanedPrecedingParts({ part, segment, loadedPartInstances }: PrecedingLookupContext) {
	const partInstances = loadedPartInstances.filter(
		(p) =>
			p.partInstance.segmentId === segment?.segment._id &&
			!!p.partInstance.orphaned &&
			p.partInstance.part._rank < part._rank
	)

	return partInstances.map((p) => p.partInstance.part)
}

function getPrecedingParts({ part, segment }: PrecedingLookupContext) {
	return segment?.parts?.filter((p) => p._rank < part._rank) ?? []
}
