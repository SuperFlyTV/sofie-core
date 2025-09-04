import { DBRundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import { Rundown } from '@sofie-automation/live-status-gateway-api'
import { unprotectString } from '@sofie-automation/server-core-integration'
import { toPlaylistTiming } from '../playlist/timing.js'
import { toExtendedSegmentStatus } from '../segment/segmentStatus.js'
import { ExtendedPlaylistStatusCache } from '../playlist/playlistStatus.js'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'

export default function toRundownStatus(props: ExtendedPlaylistStatusCache, rundown: DBRundown): Rundown {
	const rundownId = unprotectString(rundown._id)

	return {
		id: rundownId,
		description: rundown.description ?? undefined,
		name: rundown.name,
		segments: props.segmentsById
			? Object.entries<DBSegment | undefined>(props.segmentsById)
					.map(([_id, segment]) =>
						segment && segment.rundownId === rundown._id ? toExtendedSegmentStatus(props, segment) : null
					)
					.filter((segment) => segment !== null)
			: [],
		timing: rundown.timing ? toPlaylistTiming(rundown.timing) : undefined,
		publicData: rundown.publicData ?? undefined,
		endOfRundownIsShowBreak: rundown.endOfRundownIsShowBreak ?? undefined,
	}
}
