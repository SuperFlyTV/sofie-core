import { InfinitePiece } from './interfaces'
import {
	PieceResolutionPart,
	PieceResolutionPiece,
	PieceResolutionPlaylist,
	PieceResolutionRundown,
	PieceResolutionSegment,
	PieceResolutionShowstyleGroup,
} from './newNewFolderToBeRemoved/newClassesToBeCleanedUp'

export class InfinitePiecePropagationPlaylist extends PieceResolutionPlaylist {
	showstyleGroups: InfinitePiecePropagationShowstyleGroup[] = []
	internalPieces: InfinitePiece[] = []

	get pieces(): InfinitePiece[] {
		return this.internalPieces
	}

	propagate(): PieceResolutionPiece[] {
		this.internalPieces = this.showstyleGroups.flatMap((showstyleGroup) => showstyleGroup.propagate())

		return this.pieces
	}
}

export class InfinitePiecePropagationShowstyleGroup extends PieceResolutionShowstyleGroup {
	rundowns: InfinitePiecePropagationRundown[] = []
	internalPieces: InfinitePiece[] = []

	get pieces(): InfinitePiece[] {
		return this.internalPieces
	}

	propagate(): PieceResolutionPiece[] {
		const propagated: PieceResolutionPiece[] = []
		const newPieces: PieceResolutionPiece[] = []

		const rundownsPropagatedPieces = this.rundowns.flatMap((rundown) => rundown.propagate())

		rundownsPropagatedPieces.forEach((piece) => {
			if (
				piece.lifespan.scope !== 'part' &&
				piece.lifespan.scope !== 'segment' &&
				piece.lifespan.scope !== 'rundown' &&
				piece.lifespan.scope !== 'showstyle'
			)
				propagated.push(piece)
			else newPieces.push(piece)
		})

		this.internalPieces = newPieces

		return this.pieces
	}
}

export class InfinitePiecePropagationRundown extends PieceResolutionRundown {
	segments: InfinitePiecePropagationSegment[] = []
	internalPieces: InfinitePiece[] = []

	get pieces(): InfinitePiece[] {
		return this.internalPieces
	}

	propagate(): PieceResolutionPiece[] {
		const propagated: PieceResolutionPiece[] = []
		const newPieces: PieceResolutionPiece[] = []

		const segmentsPropagatedPieces = this.segments.flatMap((segment) => segment.propagate())

		segmentsPropagatedPieces.forEach((piece) => {
			if (
				piece.lifespan.scope !== 'part' &&
				piece.lifespan.scope !== 'segment' &&
				piece.lifespan.scope !== 'rundown'
			)
				propagated.push(piece)
			else newPieces.push(piece)
		})

		this.internalPieces = newPieces

		return this.pieces
	}
}

export class InfinitePiecePropagationSegment extends PieceResolutionSegment {
	parts: InfinitePiecePropagationPart[] = []
	internalPieces: InfinitePiece[] = []

	get pieces(): InfinitePiece[] {
		return this.internalPieces
	}

	propagate(): PieceResolutionPiece[] {
		const propagated: PieceResolutionPiece[] = []
		const newInternalPieces: PieceResolutionPiece[] = []

		const partsPropagatedPieces = this.parts.flatMap((part) => part.propagate())

		partsPropagatedPieces.forEach((piece) => {
			if (piece.lifespan.scope !== 'part' && piece.lifespan.scope !== 'segment') propagated.push(piece)
			else newInternalPieces.push(piece)
		})

		this.internalPieces = newInternalPieces

		return this.pieces
	}
}

export class InfinitePiecePropagationPart extends PieceResolutionPart {
	propagate(): PieceResolutionPiece[] {
		const propagated: PieceResolutionPiece[] = []
		const newInternalPieces: PieceResolutionPiece[] = []

		this.pieces.forEach((piece) => {
			if (piece.lifespan.scope !== 'part') propagated.push(piece)
			else newInternalPieces.push(piece)
		})

		this.pieces = newInternalPieces

		return this.pieces
	}
}
