import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import {
	CurrentSegment,
	ExtendedPartStatus,
	ExtendedSegment,
	Segment as SegmentStatus,
} from '@sofie-automation/live-status-gateway-api'
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
	const { partsBySegmentId, partInstancesBySegmentId } = cache
	const segmentId = unprotectString(segment._id)

	const segmentStatus = toSegmentStatus(cache, segment)
	if (!segmentStatus) return null

	const dbParts = partsBySegmentId[segmentId] ?? []
	const partInstances = partInstancesBySegmentId?.[segmentId] ?? []

	const combinedParts: ExtendedPartStatus[] = []
	const coveredPartIds = new Set<string>()

	for (const instance of partInstances) {
		const status = toExtendedPartStatus(cache, instance)
		if (status) {
			combinedParts.push(status)
			coveredPartIds.add(unprotectString(instance.part._id))
		}
	}

	for (const part of dbParts) {
		const partId = unprotectString(part._id)
		if (!coveredPartIds.has(partId)) {
			const status = toExtendedPartStatus(cache, part)
			if (status) {
				combinedParts.push(status)
			}
		}
	}

	combinedParts.sort((a, b) => {
		const partA = dbParts.find((p) => unprotectString(p._id) === a.id)
		const partB = dbParts.find((p) => unprotectString(p._id) === b.id)
		return (partA?._rank ?? 0) - (partB?._rank ?? 0)
	})

	return {
		...segmentStatus,
		parts: combinedParts,
		isHidden: segment.isHidden,
		externalId: segment.externalId,
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
