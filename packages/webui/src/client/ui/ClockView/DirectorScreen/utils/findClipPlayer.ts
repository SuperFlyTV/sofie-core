import type {
	ABSessionAssignment,
	ABSessionAssignments,
	DBRundownPlaylist,
} from '@sofie-automation/corelib/src/dataModel/RundownPlaylist/RundownPlaylist'
import { shouldDisplayAbChannel } from './shouldDisplayAbChannel'
import type { PartExtended } from '@sofie-automation/corelib/src/dataModel/Part'
import type { PieceInstance } from '@sofie-automation/corelib/src/dataModel/PieceInstance'
import type { UIShowStyleBase } from '@sofie-automation/corelib/src/dataModel/ShowStyleBase'
import type { MongoReadOnlyCollection } from '@sofie-automation/meteor-lib/src/collections/lib'
import type { PieceAbSessionInfo } from '@sofie-automation/blueprints-integration'

/**
 * Resolves the active AB clip player ID for the given part instance, based on
 * piece AB session configuration and playlist AB session assignments.
 *
 * Live assignments are preferred over lookahead assignments.
 *
 * @param playlist - Current rundown playlist containing AB session assignments
 * @param showStyleBase - Active show style base configuration
 * @param partInstance - Current running part instance
 * @param PieceInstanceCollection - Collection of piece instances in the system
 * @returns The resolved player ID as a string, or undefined if no match is found
 */
export function findClipPlayer(
	playlist: DBRundownPlaylist | undefined,
	showStyleBase: UIShowStyleBase | undefined,
	partInstance: PartExtended | undefined,
	PieceInstanceCollection: MongoReadOnlyCollection<PieceInstance>
) {
	if (!partInstance || !showStyleBase || !playlist?.assignedAbSessions) return undefined

	const currentPartPieceInstances = PieceInstanceCollection.find({
		partInstanceId: partInstance.instance._id,
		reset: { $ne: true },
	}).fetch()

	for (const pieceInstance of currentPartPieceInstances) {
		// Use configuration to determine if this piece should display AB channel
		if (!shouldDisplayAbChannel(pieceInstance, showStyleBase, showStyleBase.abChannelDisplay)) continue

		const abSessions = pieceInstance.piece.abSessions
		if (!abSessions || abSessions.length === 0) continue

		const playerId = findPlayerId(playlist, abSessions)
		if (playerId) return playerId
	}

	return undefined
}

/**
 * Resolves a player ID from a list of AB session references by matching them
 * against playlist AB session assignments.
 *
 * Live assignments are preferred over lookahead assignments.
 *
 * @param playlist - Current rundown playlist containing AB session assignments
 * @param abSessions - List of AB session references from a piece
 * @returns Player ID as string if a match is found, otherwise undefined
 */
function findPlayerId(playlist: DBRundownPlaylist, abSessions: PieceAbSessionInfo[]): string | undefined {
	for (const session of abSessions) {
		const pool = playlist.assignedAbSessions?.[session.poolName]
		if (!pool) continue

		const matches: ABSessionAssignment[] = findAssignmentsInPool(session, pool)

		const live = matches.find((assignment) => !assignment.lookahead)
		if (live) return String(live.playerId)

		const lookahead = matches.find((assignment) => assignment.lookahead)
		if (lookahead) return String(lookahead.playerId)
	}

	return undefined
}

/**
 * Filters AB session assignments within a pool that match a given session name.
 *
 * @param session - AB session reference from a piece
 * @param pool - Assignment pool keyed by arbitrary identifiers
 * @returns Array of matching AB session assignments
 */
function findAssignmentsInPool(session: PieceAbSessionInfo, pool: ABSessionAssignments): ABSessionAssignment[] {
	const foundAssignments: ABSessionAssignment[] = []

	for (const key in pool) {
		const assignment = pool[key]
		if (assignment && assignment.sessionName === session.sessionName) {
			foundAssignments.push(assignment)
		}
	}

	return foundAssignments
}
