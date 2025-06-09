import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { RundownPlaylists } from '../../../../../collections'

export type FoundActiveRundownPlaylist = Pick<
	DBRundownPlaylist,
	| '_id'
	| 'name'
	| 'rundownIdsInOrder'
	| 'currentPartInfo'
	| 'nextPartInfo'
	| 'publicData'
	| 'timing'
	| 'quickLoop'
	| 'startedPlayback'
>

export default async function findActiveRundownPlaylist(): Promise<FoundActiveRundownPlaylist | null> {
	return (
		(await RundownPlaylists.findOneAsync(
			{ activationId: { $exists: true, $ne: undefined } },
			{
				projection: {
					_id: 1,
					name: 1,
					rundownIdsInOrder: 1,
					currentPartInfo: 1,
					nextPartInfo: 1,
					publicData: 1,
					timing: 1,
					quickLoop: 1,
					startedPlayback: 1,
				},
				limit: 1,
			}
		)) ?? null
	)
}
