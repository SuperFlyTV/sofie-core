import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { CurrentPartStatus, PartStatus } from '@sofie-automation/live-status-gateway-api'
import { literal, unprotectString } from '@sofie-automation/server-core-integration'
import { calculateCurrentPartTiming } from '../partTiming.js'
import { toPieceStatus } from '../pieceStatus.js'
import { PlaylistStatusCache } from '../playlist/playlistStatus.js'

export function toCurrentPartStatus(cache: PlaylistStatusCache, part: DBPart | null): CurrentPartStatus | null {
	if (!cache.currentPartInstance) return null

	const base = toPartStatus(cache, part)
	if (!base) return null

	return literal<CurrentPartStatus>({
		...base,
		timing: calculateCurrentPartTiming(cache.currentPartInstance, cache.partInstancesInCurrentSegment ?? []),
	})
}

export function toPartStatus(
	{ pieceInstancesInCurrentPartInstance, showStyleBaseExt }: PlaylistStatusCache,
	part: DBPart | null
): PartStatus | null {
	if (!part) return null

	const base = {
		id: unprotectString(part._id),
		name: part.title,
		autoNext: part.autoNext,
		segmentId: unprotectString(part.segmentId),
		pieces: (pieceInstancesInCurrentPartInstance ?? []).map((piece) => toPieceStatus(piece, showStyleBaseExt)),
		publicData: part.publicData,
	}

	return literal<PartStatus>(base)
}
