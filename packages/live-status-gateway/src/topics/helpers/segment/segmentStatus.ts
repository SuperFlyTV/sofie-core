import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { CurrentSegment, Segment as SegmentStatus } from '@sofie-automation/live-status-gateway-api'
import { literal, unprotectString } from '@sofie-automation/server-core-integration'
import { getCurrentSegmentParts } from '../segmentParts.js'
import { calculateCurrentSegmentTiming, calculateSegmentTiming } from '../segmentTiming.js'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { PlaylistStatusCache } from '../playlist/playlistStatus.js'

export function toCurrentSegmentStatus(
	{
		currentPartInstance,
		currentSegment,
		firstInstanceInSegmentPlayout,
		partInstancesInCurrentSegment,
	}: PlaylistStatusCache,
	currentPart: DBPart | null,
	currentSegmentParts: DBPart[]
): CurrentSegment | null {
	if (!currentPartInstance || !currentPart || !currentSegment) return null

	return literal<CurrentSegment>({
		id: unprotectString(currentPart.segmentId),
		timing: calculateCurrentSegmentTiming(
			currentSegment.segmentTiming,
			currentPartInstance,
			firstInstanceInSegmentPlayout,
			partInstancesInCurrentSegment ?? [],
			currentSegmentParts
		),
		parts: getCurrentSegmentParts(partInstancesInCurrentSegment ?? [], currentSegmentParts),
		// Public data missing here?
	})
}

// TODO: use proper types here
export function toSegmentStatus({ partsBySegmentId }: PlaylistStatusCache, segment: DBSegment): SegmentStatus | null {
	const segmentId = unprotectString(segment._id)
	return {
		id: segmentId,
		rundownId: unprotectString(segment.rundownId),
		name: segment.name,
		timing: calculateSegmentTiming(segment.segmentTiming, partsBySegmentId[segmentId] ?? []),
		identifier: segment.identifier,
		publicData: segment.publicData,
	}
}
