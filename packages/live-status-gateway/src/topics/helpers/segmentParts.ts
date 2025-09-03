import { PartInstanceId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { unprotectString } from '@sofie-automation/server-core-integration'
import _ from 'underscore'
import type { CurrentSegmentPart } from '@sofie-automation/live-status-gateway-api'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'

export function getCurrentSegmentPartInstances(
	segmentPartInstances: DBPartInstance[],
	segmentParts: DBPart[]
): CurrentSegmentPart[] {
	const partInstancesByPartId: Record<string, { _id: string | PartInstanceId; part: DBPart }> = _.indexBy(
		segmentPartInstances,
		(partInstance) => unprotectString(partInstance.part._id)
	)
	segmentParts.forEach((part) => {
		const partId = unprotectString(part._id)
		if (partInstancesByPartId[partId]) return
		const partInstance = {
			_id: partId,
			part,
		}
		partInstancesByPartId[partId] = partInstance
	})
	return Object.values<{ _id: string | PartInstanceId; part: DBPart }>(partInstancesByPartId)
		.sort((a, b) => a.part._rank - b.part._rank)
		.map((partInstance): CurrentSegmentPart => dbPartToCurrentSegmentPart(partInstance.part))
}

interface ExtendedCurrentSegmentPart extends CurrentSegmentPart {
	pieces: Piece[]
}

export function getCurrentSegmentParts(
	segmentParts: DBPart[],
	piecesByPartId: Record<string, Piece[]>
): ExtendedCurrentSegmentPart[] {
	return segmentParts
		.sort((a, b) => a._rank - b._rank)
		.map(
			(part): ExtendedCurrentSegmentPart => ({
				...dbPartToCurrentSegmentPart(part),
				pieces: piecesByPartId[unprotectString(part._id)],
			})
		)
}

export function dbPartToCurrentSegmentPart(part: DBPart): CurrentSegmentPart {
	return {
		id: unprotectString(part._id),
		name: part.title,
		autoNext: part.autoNext,
		timing: {
			expectedDurationMs: part.expectedDuration,
		},
	}
}
