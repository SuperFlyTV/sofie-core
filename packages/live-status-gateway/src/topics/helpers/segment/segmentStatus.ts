import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { CurrentSegment, ExtendedSegment, Segment as SegmentStatus } from '@sofie-automation/live-status-gateway-api'
import { literal, unprotectString } from '@sofie-automation/server-core-integration'
import { calculateCurrentSegmentTiming, calculateSegmentTiming } from '../segmentTiming.js'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { ExtendedPlaylistStatusCache, PlaylistStatusCache } from '../playlist/playlistStatus.js'
import { toExtendedPartStatus } from '../part/partStatus.js'
import { getCurrentSegmentPartInstances, getCurrentSegmentParts } from '../segmentParts.js'

export function toCurrentSegmentStatus(
	props: ExtendedPlaylistStatusCache | PlaylistStatusCache,
	currentPart: DBPart | null,
	currentSegmentParts: DBPart[]
): CurrentSegment | null {
	const { currentPartInstance, currentSegment, firstInstanceInSegmentPlayout, partInstancesInCurrentSegment } = props
	const piecesByPartId = (props as ExtendedPlaylistStatusCache).piecesByPartId ?? undefined

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
		parts: piecesByPartId
			? getCurrentSegmentParts(currentSegmentParts, piecesByPartId)
			: getCurrentSegmentPartInstances(partInstancesInCurrentSegment ?? [], currentSegmentParts),
		// Public data missing here?
	})
}

// TODO: use proper types here
export function toExtendedSegmentStatus(
	cache: ExtendedPlaylistStatusCache,
	segment: DBSegment
): ExtendedSegment | null {
	const { partsBySegmentId } = cache
	const segmentId = unprotectString(segment._id)
	const segmentStatus = toSegmentStatus(cache, segment)
	if (!segmentStatus) return null

	return {
		...segmentStatus,
		parts: partsBySegmentId[segmentId]
			.map((part) => toExtendedPartStatus(cache, part))
			.filter((part) => part !== null),
	}
}

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
