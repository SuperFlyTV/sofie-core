import { Rundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import { Rundowns } from '../../../../../collections'
import { FoundActiveRundownPlaylist } from './findActiveRundownPlaylist'

export default async function findRundownsFromRundownPlaylist(
	rundownPlaylist: FoundActiveRundownPlaylist
): Promise<Rundown[] | null> {
	return await Rundowns.findFetchAsync({
		_id: {
			$in: rundownPlaylist.rundownIdsInOrder.map((protectedRundownId) => protectedRundownId),
		},
	})
}
