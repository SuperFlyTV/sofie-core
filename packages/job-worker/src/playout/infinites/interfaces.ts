import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { PieceLifespan } from '@sofie-automation/corelib/dist/playout/pieceLifespan'

/**
 * Top-level container representing an active playlist in an infinite piece resolution hierarchy.
 */
export interface InfinitePlaylist {
	/** Unique identifier for the playlist. */
	id: string

	/**
	 * Ordered list of rundowns contained within this playlist.
	 * Can be either a dynamic lookup or a static array depending on the implementation.
	 */
	rundowns: InfiniteRundown[]

	/**
	 * Looks up a single rundown within this playlist by its ID.
	 *
	 * @param id - The identifier of the rundown to retrieve.
	 * @returns The matching {@link InfiniteRundown}, or `undefined` if not found.
	 */
	rundown: (id: InfiniteRundown['id']) => InfiniteRundown | undefined
}

/**
 * Represents a Rundown within the playlist hierarchy.
 */
export interface InfiniteRundown {
	/** Unique identifier for the rundown. */
	id: string

	/** Identifier of the ShowStyleBase applied to this rundown. */
	showstyleId: string

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
	 * Direct reference to the parent playlist.
	 * In class-based implementations, this is passed directly into the constructor.
	 */
	playlist: InfinitePlaylist
}

/**
 * Represents a Segment containing playable parts within a rundown.
 */
export interface InfiniteSegment {
	/** Unique identifier for the segment. */
	id: string

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

	/** Shortcut reference to the root playlist. */
	playlist: InfinitePlaylist
}

/**
 * Represents a Part (the atomic step in playout) containing pieces.
 */
export interface InfinitePart {
	/** Unique identifier for the part. */
	id: string

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

	/** Shortcut reference to the parent rundown. */
	rundown: InfiniteRundown

	/** Shortcut reference to the root playlist. */
	playlist: InfinitePlaylist
}

/**
 * Represents a piece evaluated for infinite lifespan playout, carrying ancestor
 * navigation pointers for context resolution across the playlist hierarchy.
 */
export type InfinitePiece = Pick<Piece, 'enable'> & {
	/** Unique identifier for the piece. */
	id: string

	/** The lifespan behavior of the piece (e.g., OutOnNextPart, OutOnNextSegment, Infinite). */
	lifespan: PieceLifespan

	/** Direct reference to the parent part. */
	part: InfinitePart

	/** Shortcut reference to the parent segment. */
	segment: InfiniteSegment

	/** Shortcut reference to the parent rundown. */
	rundown: InfiniteRundown

	/** Shortcut reference to the root playlist. */
	playlist: InfinitePlaylist
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
