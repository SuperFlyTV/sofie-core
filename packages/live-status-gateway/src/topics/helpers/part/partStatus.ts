import { DBPart, PartInvalidReason } from '@sofie-automation/corelib/dist/dataModel/Part'
import {
	CurrentPartStatus,
	ExtendedPartStatus,
	InvalidReason,
	PartStatus,
} from '@sofie-automation/live-status-gateway-api'
import { literal, unprotectString } from '@sofie-automation/server-core-integration'
import { calculateCurrentPartInstanceTiming } from '../partTiming.js'
import { toExtendedPieceStatus, toPieceStatus } from '../pieceStatus.js'
import { ExtendedPlaylistStatusCache, PlaylistStatusCache } from '../playlist/playlistStatus.js'
import { interpollateTranslation } from '@sofie-automation/corelib/dist/TranslatableMessage'
import { toNotificationSeverity } from '../notification/toNotificationStatus.js'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { PieceInstanceMin } from '../../../collections/pieceInstancesHandler.js'

export function toCurrentPartStatus(cache: PlaylistStatusCache, part: DBPart | null): CurrentPartStatus | null {
	if (!cache.currentPartInstance) return null

	const base = toPartStatus(cache, part)
	if (!base) return null

	return literal<CurrentPartStatus>({
		...base,
		timing: calculateCurrentPartInstanceTiming(
			cache.currentPartInstance,
			cache.partInstancesInCurrentSegment ?? []
		),
	})
}

export function toPartStatus(
	{ pieceInstancesInCurrentPartInstance, showStyleBaseExt }: PlaylistStatusCache,
	partOrInstance: DBPart | DBPartInstance | null
): PartStatus | null {
	if (!partOrInstance) return null
	const { part } = getPartData(partOrInstance)

	return literal<PartStatus>({
		id: unprotectString(part._id),
		name: part.title,
		autoNext: part.autoNext ?? false,
		segmentId: unprotectString(part.segmentId),
		// Note: if it's an instance, we should ideally use its specific piece instances
		pieces: (pieceInstancesInCurrentPartInstance ?? []).map((piece) => toPieceStatus(piece, showStyleBaseExt)),
		publicData: part.publicData,
		expectedDuration: part.expectedDuration,
	})
}

export function toExtendedPartStatus(
	cache: ExtendedPlaylistStatusCache,
	partOrInstance: DBPart | DBPartInstance | null
): ExtendedPartStatus | null {
	if (!partOrInstance) return null

	const { showStyleBaseExt, piecesByPartId, pieceInstancesByPartInstanceId } = cache

	// Determine if we are looking at an Instance or a raw Part
	const isInstance = 'part' in partOrInstance
	const part = isInstance ? partOrInstance.part : partOrInstance
	const partId = unprotectString(part._id)
	const partInstanceId = isInstance ? unprotectString(partOrInstance._id) : undefined

	const blueprintPieces = piecesByPartId[partId] ?? []
	const instancePieces = partInstanceId
		? (pieceInstancesByPartInstanceId ?? []).filter((p) => unprotectString(p.partInstanceId) === partInstanceId)
		: []

	const instanceByPieceId = new Map<string, PieceInstanceMin>()
	for (const inst of instancePieces) {
		instanceByPieceId.set(unprotectString(inst.piece._id), inst)
	}

	const mergedRawPieces: Array<PieceInstanceMin> = []

	for (const bp of blueprintPieces) {
		const id = unprotectString(bp._id)
		const inst = instanceByPieceId.get(id)
		if (inst) {
			mergedRawPieces.push(inst)
			instanceByPieceId.delete(id)
		} else {
			mergedRawPieces.push(bp as unknown as PieceInstanceMin)
		}
	}

	for (const inst of instanceByPieceId.values()) {
		mergedRawPieces.push(inst)
	}

	const pieces = mergedRawPieces.map((p) => toExtendedPieceStatus(p, showStyleBaseExt, part.expectedDuration ?? 0))

	return literal<ExtendedPartStatus>({
		id: partId,
		instanceId: partInstanceId,
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
		pieces: pieces,
		publicData: part.publicData,
		expectedDuration: part.expectedDuration,
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
function getPartData(partOrInstance: DBPart | DBPartInstance) {
	if ('part' in partOrInstance) {
		return {
			part: partOrInstance.part,
			id: unprotectString(partOrInstance.part._id),
			instanceId: unprotectString(partOrInstance._id),
		}
	}
	return {
		part: partOrInstance,
		id: unprotectString(partOrInstance._id),
		instanceId: undefined,
	}
}
