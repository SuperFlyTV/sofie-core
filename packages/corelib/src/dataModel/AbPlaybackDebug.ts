import type { AbPlayerId, ABResolverOptions } from '@sofie-automation/blueprints-integration'
import type { PartInstanceId, PieceInstanceId, PieceInstanceInfiniteId } from './Ids.js'
import type { ABSessionAssignments, ABSessionInfo } from './RundownPlaylist/RundownPlaylist.js'

export interface SessionRequest {
	readonly id: string
	readonly name: string
	readonly start: number
	readonly end: number | undefined
	readonly optional?: boolean
	readonly lookaheadRank?: number
	playerId?: AbPlayerId
	pieceNames: string[]
}

export interface FailedSession {
	id: string
	name: string
	pieceNames: string[]
}

export interface AssignmentResult {
	/** Any non-optional sessions which were not assigned a player */
	failedRequired: FailedSession[]
	/** Any optional sessions which were not assigned a player */
	failedOptional: FailedSession[]
	/** All of the requests with their player assignments set */
	requests: Readonly<SessionRequest[]>
}

/** How the AbSessionHelper decided upon the sessionId */
export type AbSessionDecisionReason =
	/** The session name is globally unique, so the id is derived from the name */
	| 'globallyUnique'
	/** Continuation of an infinite piece, reusing the session of that infinite */
	| 'infinite'
	/** The session was already tagged with this PartInstance */
	| 'samePartInstance'
	/** The session was continued from the PartInstance before */
	| 'continuedFromPreviousPart'
	/** A lookahead session for the Part was converted into a real session */
	| 'promotedLookahead'
	/** No existing session matched, so a new one was created */
	| 'new'
	/** A lookahead object matched an existing lookahead session */
	| 'lookaheadExisting'
	/** A lookahead object created a new lookahead session */
	| 'lookaheadNew'

export interface AbSessionDecision {
	sessionId: string
	reason: AbSessionDecisionReason
}

export interface AbPlaybackDebugInfo {
	/** The time used by the resolver as 'now' */
	now: number
	resolverOptions: ABResolverOptions
	/** The assignments from the previous run, as used as input to this run */
	previousAssignments: Record<string, ABSessionAssignments>
	/** The known sessions from the previous run, as used as input to this run */
	previousTrackedSessions: ABSessionInfo[]
	/** The known sessions after this run, which will be persisted */
	trackedSessions: ABSessionInfo[]
	/** Details for each pool */
	pools: Record<string, AbPlaybackPoolDebugInfo>
	/** Any error that occured after the ab resolving */
	error?: string
}

export interface AbPlaybackPoolDebugInfo {
	/** All the players defined for the pool, and whether they are enabled by the routesets */
	players: AbPlaybackDebugPlayer[]
	/** Each piece session request, before being grouped into session requests */
	pieces: AbPlaybackDebugPiece[]
	/** Lookahead objects grouped into sessions, ordered by rank */
	lookaheadGroups: AbPlaybackDebugLookaheadGroup[]
	/** The session requests given to the resolver */
	requests: SessionRequest[]
	/** The output of the resolver */
	result: AssignmentResult
	/** The decisions made by the resolver */
	decisions: AbResolverDecision[]
	/** Each timeline object which was considered when applying the assignments */
	objects: AbPlaybackDebugObject[]
	/** The assignments which will be persisted */
	assignments: ABSessionAssignments
}

export interface AbPlaybackDebugPlayer {
	playerId: AbPlayerId
	enabled: boolean
}

export interface AbPlaybackDebugPiece {
	pieceInstanceId: PieceInstanceId
	pieceName: string
	partInstanceId: PartInstanceId
	sourceLayerId: string
	infiniteInstanceId: PieceInstanceInfiniteId | undefined
	resolvedStart: number
	resolvedEnd: number | undefined
	sessionName: string
	optional: boolean
	sessionId: string
	sessionReason: AbSessionDecisionReason
}

export interface AbPlaybackDebugLookaheadGroup {
	sessionId: string
	name: string
	objectIds: string[]
	maxPriority: number
	rank: number
	/** Whether a piece also requested this session, which means the lookahead was not used as a request */
	hasPieceSession: boolean
}

export type AbPlaybackDebugObjectOutcome =
	/** The object was updated to the assigned player */
	| 'applied'
	/** The object was assigned a player, but no rule or customApplyToObject changed it */
	| 'failed'
	/** The session was not assigned a player */
	| 'noPlayer'
	/** The session was not known to the resolver, so the previous assignment was reused (if any) */
	| 'unexpected'
	/** No session could be determined for the object */
	| 'noSession'
	/** The object has no pieceInstanceId, so is ignored */
	| 'noPieceInstance'

export interface AbPlaybackDebugObject {
	objectId: string
	pieceInstanceId: string | undefined
	partInstanceId: PartInstanceId | null
	isLookahead: boolean
	sessionName: string
	sessionNameIsGloballyUnique: boolean
	sessionId: string | undefined
	sessionReason: AbSessionDecisionReason | undefined
	playerId: AbPlayerId | undefined
	layerBefore: string
	layerAfter: string
	outcome: AbPlaybackDebugObjectOutcome
}

export type AbResolverDecisionStep =
	/** A previously assigned player is no longer in the pool */
	| 'droppedUnknownPlayer'
	/** A previous lookahead assignment was cleared, to be reconsidered */
	| 'lookaheadReset'
	/** There is only one player, so everything was assigned to it */
	| 'singlePlayer'
	/** Every session already had a player, so nothing was changed */
	| 'nothingPending'
	/** A previous assignment was cleared, as it is in the future and the player is free before then */
	| 'clearedStale'
	/** A session was assigned to a player */
	| 'assigned'
	/** A session was unassigned, to make room for another */
	| 'evicted'
	/** A session could not be assigned a player */
	| 'failed'
	/** A lookahead session was assigned to a player */
	| 'lookaheadAssigned'
	/** A lookahead session was not assigned a player */
	| 'lookaheadUnassigned'

export interface AbResolverSlotAvailability {
	playerId: AbPlayerId
	/** The session which ends before this one */
	before: string | null
	/** The session which starts after this one */
	after: string | null
	/** The sessions which overlap this one */
	clashes: string[]
}

export interface AbResolverDecision {
	step: AbResolverDecisionStep
	message: string
	sessionId?: string
	playerId?: AbPlayerId
	/** The rule used to choose the player */
	rule?: string
	/** The session which caused this decision */
	causedBy?: string
	/** The availability of each player at the time of the decision */
	availability?: AbResolverSlotAvailability[]
}
