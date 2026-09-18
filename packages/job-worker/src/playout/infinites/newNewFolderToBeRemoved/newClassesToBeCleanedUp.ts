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
} from '../interfaces'
import _ from 'underscore'
import { PlayoutSegmentModel } from '../../../playout/model/PlayoutSegmentModel'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { ReadonlyObjectDeep } from 'type-fest/source/readonly-deep'

export class PieceResolutionPlaylist implements InfinitePlaylist {
	id: RundownPlaylistId
	showstyleGroups: InfiniteShowstyleGroup[] = []

	constructor(id: RundownPlaylistId, sortedRundowns: PlayoutRundownModel[]) {
		this.id = id
		// TODO: clean up this chaos

		// iterate through the sorted rundowns to group them by showstyle while preserving the order.
		for (let rundownIndex = 0; rundownIndex < sortedRundowns.length; rundownIndex++) {
			const rundown = sortedRundowns[rundownIndex]
			// default groupId for the first group of each showstyle
			let groupId = 0

			let showstyleGroup: InfiniteShowstyleGroup

			// if this is the first rundown, create a new group
			if (this.showstyleGroups.length === 0) {
				showstyleGroup = new PieceResolutionShowstyleGroup(groupId, rundown.rundown.showStyleBaseId, this, [
					rundown,
				])
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
					showstyleGroup.addRundown(rundown)
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

					showstyleGroup = new PieceResolutionShowstyleGroup(groupId, rundown.rundown.showStyleBaseId, this, [
						rundown,
					])

					this.showstyleGroups.push(showstyleGroup)
				}
			}
		}
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

class PieceResolutionShowstyleGroup implements InfiniteShowstyleGroup {
	id: number
	showstyleId: ShowStyleBaseId
	playlist: InfinitePlaylist
	rundowns: InfiniteRundown[] = []

	constructor(
		id: number,
		showstyleId: ShowStyleBaseId,
		playlist: InfinitePlaylist,
		rundowns: PlayoutRundownModel[] = []
	) {
		this.id = id
		this.showstyleId = showstyleId
		this.playlist = playlist

		rundowns.map((rundown) => this.addRundown(rundown))
	}

	addRundown(rundown: PlayoutRundownModel): InfiniteShowstyleGroup {
		const infiniteRundown: InfiniteRundown = new PieceResolutionRundown(rundown.rundown._id, this, rundown.segments)

		this.rundowns.push(infiniteRundown)
		return this
	}

	rundown = (id: InfiniteRundown['id']): InfiniteRundown | undefined => {
		return this.rundowns.find((r) => r.id === id)
	}
}

class PieceResolutionRundown implements InfiniteRundown {
	id: RundownId
	showstyleGroup: InfiniteShowstyleGroup
	segments: InfiniteSegment[] = []

	constructor(id: RundownId, showstyleGroup: InfiniteShowstyleGroup, segments: readonly PlayoutSegmentModel[] = []) {
		this.id = id
		this.showstyleGroup = showstyleGroup

		segments.map((segment: PlayoutSegmentModel) =>
			this.segments.push(new PieceResolutionSegment(segment.segment._id, this, segment.parts))
		)
	}

	segment(id: InfiniteSegment['id']): InfiniteSegment | undefined {
		return this.segments.find((s) => s.id === id)
	}
}

class PieceResolutionSegment implements InfiniteSegment {
	id: SegmentId
	rundown: InfiniteRundown
	parts: InfinitePart[] = []

	constructor(id: SegmentId, rundown: InfiniteRundown, parts: readonly ReadonlyObjectDeep<DBPart>[] = []) {
		this.id = id
		this.rundown = rundown

		parts.map((part: ReadonlyObjectDeep<DBPart>) => this.parts.push(new PieceResolutionPart(part._id, this)))
	}

	part(id: InfinitePart['id']): InfinitePart | undefined {
		return this.parts.find((p) => p.id === id)
	}
}

class PieceResolutionPart implements InfinitePart {
	id: PartId
	segment: InfiniteSegment
	pieces: InfinitePiece[] = []

	constructor(id: PartId, segment: InfiniteSegment, pieces = []) {
		this.id = id
		this.segment = segment

		for (const piece of pieces) {
			this.pieces.push(new PieceResolutionPiece(piece._id, piece.enable, piece.lifespan, this))
		}
	}

	piece(id: InfinitePiece['id']): InfinitePiece | undefined {
		return this.pieces.find((p) => p.id === id)
	}
}

class PieceResolutionPiece implements InfinitePiece {
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
