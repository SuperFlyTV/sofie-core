import { Segments } from '../../../../../collections'
import { SegmentId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'

export type FoundPlaylistStatusDBSegment = Pick<DBSegment, '_id' | 'identifier' | 'rundownId' | 'name' | 'publicData'>

export default async function findSegmentById(segmentID: SegmentId): Promise<FoundPlaylistStatusDBSegment | null> {
	return (await Segments.findOneAsync(
		{ _id: segmentID },
		{
			projection: {
				_id: 1,
				identifier: 1,
				rundownId: 1,
				name: 1,
				publicData: 1,
			},
		}
	)) as FoundPlaylistStatusDBSegment
}
