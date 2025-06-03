import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { PartInstances } from '../../../../../collections'
import { PartInstanceId } from '@sofie-automation/corelib/dist/dataModel/Ids'

export default async function findPartById(partInstanceId: PartInstanceId): Promise<DBPartInstance | null> {
	return (await PartInstances.findOneAsync(
		{ _id: partInstanceId },
		{
			projection: {
				_id: 1,
				part: 1,
			},
		}
	)) as DBPartInstance
}
