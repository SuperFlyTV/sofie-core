import { SourceLayerType } from '@sofie-automation/blueprints-integration'
import type { PieceInstance } from '@sofie-automation/corelib/src/dataModel/PieceInstance'
import type { UIShowStyleBase, DBShowStyleBase } from '@sofie-automation/corelib/src/dataModel/ShowStyleBase'

/**
 * Determines whether a piece instance should display its AB resolver channel assignment on the Director screen.
 * Checks piece-level override first, then falls back to show style configuration.
 * Note: Future screens (presenter, camera) will have their own showOn* flags when implemented.
 */
export function shouldDisplayAbChannel(
	pieceInstance: PieceInstance,
	showStyleBase: UIShowStyleBase,
	config?: DBShowStyleBase['abChannelDisplay']
): boolean {
	// Check piece-level override first (from blueprint)
	const piece = pieceInstance.piece as any
	if (piece.displayAbChannel !== undefined) {
		return piece.displayAbChannel
	}

	// If no config, use sensible defaults but don't show (screen flag defaults to false)
	const effectiveConfig: NonNullable<DBShowStyleBase['abChannelDisplay']> = config ?? {
		// Default: guess VT and LIVE_SPEAK types
		sourceLayerIds: [],
		sourceLayerTypes: [SourceLayerType.VT, SourceLayerType.LIVE_SPEAK],
		outputLayerIds: [],

		// But don't show by default
		showOnDirectorScreen: false,
	}

	// Check if display is enabled for director screen
	if (!effectiveConfig.showOnDirectorScreen) return false

	const sourceLayer = showStyleBase.sourceLayers?.[pieceInstance.piece.sourceLayerId]

	// Check if output layer filter is specified and doesn't match
	if (effectiveConfig.outputLayerIds.length > 0) {
		if (!effectiveConfig.outputLayerIds.includes(pieceInstance.piece.outputLayerId)) {
			return false
		}
	}

	// Check source layer filters (ID or Type)
	// If both filters are empty, show all pieces (no filtering)
	const hasSourceLayerIdFilter = effectiveConfig.sourceLayerIds.length > 0
	const hasSourceLayerTypeFilter = effectiveConfig.sourceLayerTypes.length > 0

	if (!hasSourceLayerIdFilter && !hasSourceLayerTypeFilter) {
		return true
	}

	// Check if source layer ID is explicitly listed
	if (hasSourceLayerIdFilter && effectiveConfig.sourceLayerIds.includes(pieceInstance.piece.sourceLayerId)) {
		return true
	}

	// Check sourceLayer type match
	if (hasSourceLayerTypeFilter && sourceLayer?.type && effectiveConfig.sourceLayerTypes.includes(sourceLayer.type)) {
		return true
	}

	return false
}
