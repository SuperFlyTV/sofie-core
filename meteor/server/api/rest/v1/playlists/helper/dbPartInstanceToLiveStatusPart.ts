import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { CurrentSegmentPart, PartStatus, PieceStatus } from '@sofie-automation/live-status-gateway-api'

export function dbPartInstanceToPartStatus(
	dbPartInstance: Pick<DBPartInstance, '_id' | 'part'>,
	pieces: PieceStatus[]
): PartStatus {
	return {
		id: unprotectString(dbPartInstance.part._id),
		name: dbPartInstance.part.title,
		segmentId: unprotectString(dbPartInstance.part.segmentId),
		autoNext: dbPartInstance.part.autoNext,
		pieces: pieces,
	}
}

export function dbPartInstanceToCurrentSegmentPart(
	dbPartInstance: Pick<DBPartInstance, '_id' | 'part'>
): Omit<CurrentSegmentPart, 'timing'> {
	return {
		id: unprotectString(dbPartInstance.part._id),
		name: dbPartInstance.part.title,
		autoNext: dbPartInstance.part.autoNext,
	}
}
