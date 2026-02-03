import { DBPart, PartInvalidReason } from '@sofie-automation/corelib/dist/dataModel/Part'
import {
	CurrentPartStatus,
	ExtendedPartStatus,
	InvalidReason,
	PartStatus,
} from '@sofie-automation/live-status-gateway-api'
import { literal, unprotectString } from '@sofie-automation/server-core-integration'
import { calculateCurrentPartTiming } from '../partTiming.js'
import { toExtendedPieceStatus, toPieceStatus } from '../pieceStatus.js'
import { ExtendedPlaylistStatusCache, PlaylistStatusCache } from '../playlist/playlistStatus.js'
import { interpollateTranslation } from '@sofie-automation/corelib/dist/TranslatableMessage'
import { toNotificationSeverity } from '../notification/toNotificationStatus.js'

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
		autoNext: part.autoNext ?? false,
		segmentId: unprotectString(part.segmentId),
		pieces: (pieceInstancesInCurrentPartInstance ?? []).map((piece) => toPieceStatus(piece, showStyleBaseExt)),
		publicData: part.publicData,
	}

	return literal<PartStatus>(base)
}

export function toExtendedPartStatus(
	{ showStyleBaseExt, piecesByPartId }: ExtendedPlaylistStatusCache,
	part: DBPart | null
): ExtendedPartStatus | null {
	if (!part) return null

	return literal<ExtendedPartStatus>({
		id: unprotectString(part._id),
		externalId: part.externalId,
		name: part.title,
		identifier: part.identifier,
		prompterTitle: part.prompterTitle,
		gap: part.gap,
		invalid: part.invalid,
		invalidReason: toPartInvalidReason(part.invalidReason),
		floated: part.floated,
		autoNext: part.autoNext ?? false,
		segmentId: unprotectString(part.segmentId),
		pieces: (piecesByPartId[unprotectString(part._id)] ?? []).map((piece) =>
			toExtendedPieceStatus(piece, showStyleBaseExt)
		),
		publicData: part.publicData,
	})
}

export function toPartInvalidReason(
	invalidReason: PartInvalidReason | undefined = undefined
): InvalidReason | undefined {
	if (!invalidReason) return undefined

	return literal<InvalidReason>({
		color: invalidReason.color,
		message: interpollateTranslation(invalidReason.message.key, invalidReason.message.args),
		severity: invalidReason.severity ? toNotificationSeverity(invalidReason.severity) : undefined,
	})
}
