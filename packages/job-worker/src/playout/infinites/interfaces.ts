import {
	PartId,
	PieceId,
	RundownId,
	RundownPlaylistId,
	SegmentId,
	ShowStyleBaseId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { PieceLifespan } from '@sofie-automation/corelib/dist/playout/pieceLifespan'
import { PlayoutRundownModel } from '../model/PlayoutRundownModel'

/**
 * Top-level container representing an active playlist in an infinite piece resolution hierarchy.
 */
export interface InfinitePlaylist {
	/** Unique identifier for the playlist. */
	id: RundownPlaylistId

	/**
	 * Ordered list of showstyle groups contained within this playlist.
	 * Can be either a dynamic lookup or a static array depending on the implementation.
	 */
	showstyleGroups: InfiniteShowstyleGroup[]

	/**
	 * Looks up a list of showstyle groups within this playlist by a showstyle ID.
	 *
	 * @param id - The identifier of the groups containing the showstyle to retrieve.
	 * @returns An array of the matching {@link InfiniteShowstyleGroup}s
	 */
	showstyle: (showstyleId: InfiniteShowstyleGroup['showstyleId']) => InfiniteShowstyleGroup[]

	/**
	 * Looks up a single showstyle group within this playlist by its ID and showstyle ID.
	 *
	 * @param id - The identifier of the showstyle group to retrieve.
	 * @param showstyleId - The identifier of the showstyle to retrieve.
	 * @returns The matching {@link InfiniteShowstyleGroup}, or `undefined` if not found.
	 */
	showstyleGroup: (
		id: InfiniteShowstyleGroup['id'],
		showstyleId: InfiniteShowstyleGroup['showstyleId']
	) => InfiniteShowstyleGroup | undefined
}

/**
 * Represents a Showstyle Group within the playlist hierarchy.
 *
 * A showstyle group is a collection of rundowns that follow each other and share the same showstyle.
 *
 * A showstyle could have multiple groups associated with it when interrupted by another showstyle.
 */
export interface InfiniteShowstyleGroup {
	/** incremental id for the showstyle group.
	 * When a showstyle group is interrupted by another showstyle, the same showstyle will get a new group instance
	 * and while the showstyleId is the same, the groupId will be different. */
	id: number

	/** Unique identifier for the showstyle. */
	showstyleId: ShowStyleBaseId

	/** Ordered list of rundowns belonging to this showstyle. */
	rundowns: InfiniteRundown[]

	/**
	 * Looks up a single rundown within this showstyle by its ID.
	 *
	 * @param id - The identifier of the rundown to retrieve.
	 * @returns The matching {@link InfiniteRundown}, or `undefined` if not found.
	 */
	rundown: (id: InfiniteRundown['id']) => InfiniteRundown | undefined

	addRundown: (rundown: PlayoutRundownModel) => InfiniteShowstyleGroup

	/** Direct reference to the parent playlist. */
	playlist: InfinitePlaylist
}

/**
 * Represents a Rundown within the playlist hierarchy.
 */
export interface InfiniteRundown {
	/** Unique identifier for the rundown. */
	id: RundownId

	/**
	 * Ordered list of segments belonging to this rundown.
	 * Can be either a dynamic lookup or a static array depending on the implementation.
	 */
	segments: InfiniteSegment[]

	/**
	 * Looks up a single segment within this rundown by its ID.
	 *
	 * @param id - The identifier of the segment to retrieve.
	 * @returns The matching {@link InfiniteSegment}, or `undefined` if not found.
	 */
	segment: (id: InfiniteSegment['id']) => InfiniteSegment | undefined

	/**
	 * Direct reference to the parent showstyle group.
	 * In class-based implementations, this is passed directly into the constructor.
	 */
	showstyleGroup: InfiniteShowstyleGroup
}

/**
 * Represents a Segment containing playable parts within a rundown.
 */
export interface InfiniteSegment {
	/** Unique identifier for the segment. */
	id: SegmentId

	/**
	 * Ordered list of parts contained within this segment.
	 * Can be either a dynamic lookup or a static array depending on the implementation.
	 */
	parts: InfinitePart[]

	/**
	 * Looks up a single part within this segment by its ID.
	 *
	 * @param id - The identifier of the part to retrieve.
	 * @returns The matching {@link InfinitePart}, or `undefined` if not found.
	 */
	part: (id: InfinitePart['id']) => InfinitePart | undefined

	/** Direct reference to the parent rundown. */
	rundown: InfiniteRundown
}

/**
 * Represents a Part (the atomic step in playout) containing pieces.
 */
export interface InfinitePart {
	/** Unique identifier for the part. */
	id: PartId

	/**
	 * List of pieces contained within this part.
	 * Can be either a dynamic lookup or a static array depending on the implementation.
	 */
	pieces: InfinitePiece[]

	/**
	 * Looks up a single piece within this part by its ID.
	 *
	 * @param id - The identifier of the piece to retrieve.
	 * @returns The matching {@link InfinitePiece}, or `undefined` if not found.
	 */
	piece: (id: InfinitePiece['id']) => InfinitePiece | undefined

	/** Direct reference to the parent segment. */
	segment: InfiniteSegment
}

/**
 * Represents a piece evaluated for infinite lifespan playout, carrying ancestor
 * navigation pointers for context resolution across the playlist hierarchy.
 */
export type InfinitePiece = Pick<Piece, 'enable'> & {
	/** Unique identifier for the piece. */
	id: PieceId

	/** The lifespan behavior of the piece (e.g., OutOnNextPart, OutOnNextSegment, Infinite). */
	lifespan: PieceLifespan

	/** Direct reference to the parent part. */
	part: InfinitePart
}

/**
 * Coordinate pointing to the boundary part.
 * Entities strictly preceding this coordinate will be loaded into the graph.
 */
export interface TargetPartCursor {
	rundownId: string
	segmentId: string
	partId: string
}
