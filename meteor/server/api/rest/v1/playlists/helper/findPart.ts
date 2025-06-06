import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { PartInstances, Parts } from '../../../../../collections'
import { PartInstanceId, SegmentId, SegmentPlayoutId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'

export default async function findPartById(
	partInstanceId: PartInstanceId
): Promise<Pick<DBPartInstance, '_id' | 'part' | 'segmentPlayoutId'> | null> {
	return (await PartInstances.findOneAsync(
		{ _id: partInstanceId },
		{
			projection: {
				_id: 1,
				part: 1,
				segmentPlayoutId: 1,
			},
		}
	)) as Pick<DBPartInstance, '_id' | 'part' | 'segmentPlayoutId'>
}

export async function findPartInstancesBySegmentPlayoutId(
	segmentPlayoutId: SegmentPlayoutId
): Promise<Pick<DBPartInstance, '_id' | 'part'>[]> {
	return (await PartInstances.findFetchAsync(
		{ segmentPlayoutId: { $in: [segmentPlayoutId, protectString('')] } },
		{
			projection: {
				_id: 1,
				part: 1,
			},
		}
	)) as Pick<DBPartInstance, '_id' | 'part'>[]
}

export async function findPartsBySegmentId(segmentId: SegmentId): Promise<DBPart[]> {
	return (await Parts.findFetchAsync({ segmentId: segmentId })) as DBPart[]
}
