import {
	PartId,
	PieceId,
	RundownId,
	RundownPlaylistId,
	SegmentId,
	ShowStyleBaseId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import { PlayoutRundownModel } from '../../../playout/model/PlayoutRundownModel'
import {
	InfinitePart,
	InfinitePiece,
	InfinitePlaylist,
	InfiniteRundown,
	InfiniteSegment,
	InfiniteShowstyleGroup,
	PartialInfinitePiece,
	TargetPartCursor,
} from '../interfaces'
import _ from 'underscore'
import { PlayoutSegmentModel } from '../../../playout/model/PlayoutSegmentModel'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { ReadonlyObjectDeep } from 'type-fest/source/readonly-deep'
import { PieceLifespan } from '@sofie-automation/corelib/dist/playout/pieceLifespan'
import { protectString, unprotectString } from '@sofie-automation/corelib/dist/protectedString'

function sliceThrough<T>(items: readonly T[], pred: (item: T) => boolean, inclusive: boolean): T[] {
	const idx = items.findIndex(pred)
	if (idx === -1) return [...items]
	return items.slice(0, inclusive ? idx + 1 : idx)
}

function targetForRundown(target: TargetPartCursor | undefined, rundownId: RundownId): TargetPartCursor | undefined {
	return target && unprotectString(rundownId) === target.rundownId ? target : undefined
}

function targetForSegment(target: TargetPartCursor | undefined, segmentId: SegmentId): TargetPartCursor | undefined {
	return target && unprotectString(segmentId) === target.segmentId ? target : undefined
}

// TODO: Class names here are placeholders, proper names should be used when everything else is in place
export class PieceResolutionPlaylist implements InfinitePlaylist {
	id: RundownPlaylistId
	showstyleGroups: InfiniteShowstyleGroup[] = []
	scopedPieces: InfinitePiece[] = []

	constructor(id: RundownPlaylistId, sortedRundowns: PlayoutRundownModel[], target?: TargetPartCursor) {
		this.id = id

		const slicedRundowns = target
			? sliceThrough(sortedRundowns, (r) => unprotectString(r.rundown._id) === target.rundownId, true)
			: sortedRundowns

		// TODO: clean up this chaos

		// iterate through the sorted rundowns to group them by showstyle while preserving the order.
		for (let rundownIndex = 0; rundownIndex < slicedRundowns.length; rundownIndex++) {
			const rundown = slicedRundowns[rundownIndex]
			// default groupId for the first group of each showstyle
			let groupId = 0

			let showstyleGroup: InfiniteShowstyleGroup

			// if this is the first rundown, create a new group
			if (this.showstyleGroups.length === 0) {
				showstyleGroup = new PieceResolutionShowstyleGroup(
					groupId,
					rundown.rundown.showStyleBaseId,
					this,
					[rundown],
					targetForRundown(target, rundown.rundown._id)
				)
				this.showstyleGroups.push(showstyleGroup)
			}
			// otherwise we already have groups
			else {
				const lastShowstyleGroup = this.showstyleGroups[this.showstyleGroups.length - 1]

				// check if the last group has the same showstyle
				if (lastShowstyleGroup.showstyleId === rundown.rundown.showStyleBaseId) {
					// reuse the showstyle group
					showstyleGroup = lastShowstyleGroup

					// add the rundown to the showstyle group
					// Todo: the showstyle group should be responsible for creating the abstracted rundown object.
					showstyleGroup.addRundown(rundown, targetForRundown(target, rundown.rundown._id))
				}
				// showstyle is different, create a new group
				else {
					// we need to find the next available groupId for the showstyle

					// first find all groups for the current showstyle
					const groupsForShowstyle = this.showstyleGroups.filter(
						(group) => group.showstyleId === rundown.rundown.showStyleBaseId
					)

					// find the next available groupId for the showstyle if it exists, otherwise we use the initial fallback value of 0
					if (groupsForShowstyle.length > 0)
						groupId = Math.max(...groupsForShowstyle.map((group) => group.id)) + 1

					showstyleGroup = new PieceResolutionShowstyleGroup(
						groupId,
						rundown.rundown.showStyleBaseId,
						this,
						[rundown],
						targetForRundown(target, rundown.rundown._id)
					)

					this.showstyleGroups.push(showstyleGroup)
				}
			}
		}
	}
	addRundown(rundown: PlayoutRundownModel) {
		const showstyleId = rundown.rundown.showStyleBaseId

		const lastShowstyleGroup = this.showstyleGroups[this.showstyleGroups.length - 1]

		const existingShowstyleGroup = lastShowstyleGroup.showstyleId === showstyleId ? lastShowstyleGroup : undefined

		if (existingShowstyleGroup) {
			// If we found an existing showstyle group, we can add the rundown to it
			existingShowstyleGroup.addRundown(rundown)
		} else {
			// If we didn't find an existing showstyle group, we need to create a new one
			const newShowstyleGroup = new PieceResolutionShowstyleGroup(
				this.showstyleGroups.length,
				showstyleId,
				this,
				[rundown]
			)
			this.showstyleGroups.push(newShowstyleGroup)
		}
	}
	addSegment(segment: PlayoutSegmentModel) {
		const rundown = this.rundown(segment.segment.rundownId)
		if (rundown) {
			rundown.addSegment(segment)
		}
	}
	addPart(part: ReadonlyObjectDeep<DBPart>) {
		const rundown = this.rundown(part.rundownId)
		if (rundown) {
			rundown.addPart(part)
		}
	}
	addPiece(piece: PartialInfinitePiece) {
		// TODO: currently this is repeated between all of the classes. This should be reusable
		const piecePart = this.parts.find((p) => unprotectString(p.id) === piece.partId)
		if (!piecePart) throw new Error(`Part not found for piece ${piece.id}`)

		piecePart.addPiece(piece)
	}

	get rundowns(): InfiniteRundown[] {
		return this.showstyleGroups.flatMap((group) => group.rundowns)
	}

	get segments(): InfiniteSegment[] {
		return this.showstyleGroups.flatMap((group) => group.segments)
	}

	get parts(): InfinitePart[] {
		return this.showstyleGroups.flatMap((group) => group.parts)
	}

	get pieces(): InfinitePiece[] {
		return this.showstyleGroups.flatMap((group) => group.pieces)
	}

	showstyle(showstyleId: InfiniteShowstyleGroup['showstyleId']): InfiniteShowstyleGroup[] {
		return this.showstyleGroups.filter((group) => group.showstyleId === showstyleId)
	}
	showstyleGroup(
		id: InfiniteShowstyleGroup['id'],
		showstyleId: InfiniteShowstyleGroup['showstyleId']
	): InfiniteShowstyleGroup | undefined {
		return this.showstyleGroups.find((group) => group.id === id && group.showstyleId === showstyleId)
	}
	// normally this concern should be handled by the showstyle group, however in sofie showstyles are a byproduct of the rundown, so we need to account for that here.
	rundown(id: InfiniteRundown['id']): InfiniteRundown | undefined {
		for (const group of this.showstyleGroups) {
			const rundown = group.rundown(id)
			if (rundown) return rundown
		}
		return undefined
	}
}

export class PieceResolutionShowstyleGroup implements InfiniteShowstyleGroup {
	id: number
	showstyleId: ShowStyleBaseId
	playlist: InfinitePlaylist
	rundowns: InfiniteRundown[] = []
	scopedPieces: InfinitePiece[] = []

	constructor(
		id: number,
		showstyleId: ShowStyleBaseId,
		playlist: InfinitePlaylist,
		rundowns: PlayoutRundownModel[] = [],
		target?: TargetPartCursor
	) {
		this.id = id
		this.showstyleId = showstyleId
		this.playlist = playlist

		rundowns.map((rundown) => this.addRundown(rundown, target))
	}
	addSegment(segment: PlayoutSegmentModel) {
		const rundown = this.rundown(segment.segment.rundownId)
		if (rundown) {
			rundown.addSegment(segment)
		}
	}
	addPart(part: ReadonlyObjectDeep<DBPart>) {
		const rundown = this.rundown(part.rundownId)
		if (rundown) {
			rundown.addPart(part)
		}
	}
	addPiece(piece: PartialInfinitePiece) {
		const piecePart = this.parts.find((p) => unprotectString(p.id) === piece.partId)
		if (!piecePart) throw new Error(`Part not found for piece ${piece.id}`)

		piecePart.addPiece(piece)
	}

	get segments(): InfiniteSegment[] {
		return this.rundowns.flatMap((rundown) => rundown.segments)
	}

	get parts(): InfinitePart[] {
		return this.rundowns.flatMap((rundown) => rundown.parts)
	}

	get pieces(): InfinitePiece[] {
		return this.rundowns.flatMap((rundown) => rundown.pieces)
	}

	addRundown(rundown: PlayoutRundownModel, target?: TargetPartCursor): InfiniteShowstyleGroup {
		const infiniteRundown: InfiniteRundown = new PieceResolutionRundown(
			rundown.rundown._id,
			this,
			rundown.segments,
			targetForRundown(target, rundown.rundown._id)
		)

		this.rundowns.push(infiniteRundown)
		return this
	}

	rundown = (id: InfiniteRundown['id']): InfiniteRundown | undefined => {
		return this.rundowns.find((r) => r.id === id)
	}
}

export class PieceResolutionRundown implements InfiniteRundown {
	id: RundownId
	showstyleGroup: InfiniteShowstyleGroup
	segments: InfiniteSegment[] = []
	scopedPieces: InfinitePiece[] = []

	constructor(
		id: RundownId,
		showstyleGroup: InfiniteShowstyleGroup,
		segments: readonly PlayoutSegmentModel[] = [],
		target?: TargetPartCursor
	) {
		this.id = id
		this.showstyleGroup = showstyleGroup

		const sortedSegments = segments.toSorted((a, b) => a.segment._rank - b.segment._rank)

		const slicedSegments =
			target && unprotectString(this.id) === target.rundownId
				? sliceThrough(
						sortedSegments,
						(segment) => unprotectString(segment.segment._id) === target.segmentId,
						true
					)
				: sortedSegments

		slicedSegments.map((segment) => this.addSegment(segment, targetForSegment(target, segment.segment._id)))
	}
	addSegment(segment: PlayoutSegmentModel, target?: TargetPartCursor) {
		this.segments.push(
			new PieceResolutionSegment(
				segment.segment._id,
				this,
				segment.parts,
				targetForSegment(target, segment.segment._id)
			)
		)
	}
	addPart(part: ReadonlyObjectDeep<DBPart>) {
		const segment = this.segment(part.segmentId)
		if (segment) {
			segment.addPart(part)
		}
	}
	addPiece(piece: PartialInfinitePiece) {
		const piecePart = this.parts.find((p) => unprotectString(p.id) === piece.partId)
		if (!piecePart) throw new Error(`Part not found for piece ${piece.id}`)

		piecePart.addPiece(piece)
	}

	get parts(): InfinitePart[] {
		return this.segments.flatMap((segment) => segment.parts)
	}

	get pieces(): InfinitePiece[] {
		return this.segments.flatMap((segment) => segment.pieces)
	}

	segment(id: InfiniteSegment['id']): InfiniteSegment | undefined {
		return this.segments.find((segment) => segment.id === id)
	}
}

export class PieceResolutionSegment implements InfiniteSegment {
	id: SegmentId
	rundown: InfiniteRundown
	parts: InfinitePart[] = []
	scopedPieces: InfinitePiece[] = []

	constructor(
		id: SegmentId,
		rundown: InfiniteRundown,
		parts: readonly ReadonlyObjectDeep<DBPart>[] = [],
		target?: TargetPartCursor
	) {
		this.id = id
		this.rundown = rundown

		const sortedParts = parts.toSorted((a, b) => a._rank - b._rank)

		const slicedParts =
			target && unprotectString(this.id) === target.segmentId
				? sliceThrough(sortedParts, (part) => unprotectString(part._id) === target.partId, false)
				: sortedParts

		slicedParts.map(this.addPart, this)
	}
	addPart(part: ReadonlyObjectDeep<DBPart>) {
		this.parts.push(new PieceResolutionPart(part._id, this))
	}
	addPiece(piece: PartialInfinitePiece) {
		const part = this.part(protectString(piece.partId))
		if (part) {
			part.addPiece(piece)
		}
	}

	get pieces(): InfinitePiece[] {
		return this.parts.flatMap((part) => part.pieces)
	}

	part(id: InfinitePart['id']): InfinitePart | undefined {
		return this.parts.find((p) => p.id === id)
	}
}

export class PieceResolutionPart implements InfinitePart {
	id: PartId
	segment: InfiniteSegment
	pieces: InfinitePiece[] = []
	scopedPieces: InfinitePiece[] = []

	constructor(id: PartId, segment: InfiniteSegment, pieces: PartialInfinitePiece[] = []) {
		this.id = id
		this.segment = segment

		pieces.forEach((piece) => this.addPiece(piece))
	}
	addPiece(piece: PartialInfinitePiece) {
		const resolved = new PieceResolutionPiece(piece.id, piece.enable, piece.lifespan, this)
		this.pieces.push(resolved)
		this.scopeOwner(resolved.lifespan.scope).scopedPieces.push(resolved)
	}

	piece(id: InfinitePiece['id']): InfinitePiece | undefined {
		return this.pieces.find((p) => p.id === id)
	}

	private scopeOwner(scope: PieceLifespan['scope']): { scopedPieces: InfinitePiece[] } {
		switch (scope) {
			case 'part':
				return this
			case 'segment':
				return this.segment
			case 'rundown':
				return this.segment.rundown
			case 'showstyle':
				return this.segment.rundown.showstyleGroup
			case 'playlist':
				return this.segment.rundown.showstyleGroup.playlist
		}
	}
}

export class PieceResolutionPiece implements InfinitePiece {
	id: PieceId
	part: InfinitePart
	enable: InfinitePiece['enable']
	lifespan: PieceLifespan

	constructor(id: PieceId, enable: InfinitePiece['enable'], lifespan: PieceLifespan, part: InfinitePart) {
		this.id = id
		this.part = part
		this.enable = enable
		this.lifespan = lifespan
	}
}
