import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { PieceLifespan } from '@sofie-automation/corelib/dist/playout/pieceLifespan'
import { unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { PlayoutModel } from '../model/PlayoutModel'
import {
	InfinitePlaylist,
	InfiniteRundown,
	InfiniteSegment,
	InfinitePart,
	InfinitePiece,
	TargetPartCursor,
} from './interfaces'
import { PlayoutRundownModel } from '../model/PlayoutRundownModel'
import { PlayoutSegmentModel } from '../model/PlayoutSegmentModel'
import { ReadonlyObjectDeep } from 'type-fest/source/readonly-deep'
import { MongoQuery } from '../../db'
import { PlayoutPartInstanceModel } from '../model/PlayoutPartInstanceModel'

type PiecesLookup = (query: MongoQuery<Piece>) => ReadonlyObjectDeep<Piece>[]

export class InfinitePlayoutPlaylist implements InfinitePlaylist {
	readonly id: string
	readonly rundowns: InfiniteRundown[]

	private readonly _rundownsMap = new Map<string, InfiniteRundown>()

	constructor(playoutModel: PlayoutModel, piecesLookup: PiecesLookup, target?: TargetPartCursor) {
		const playlist = playoutModel.playlist
		this.id = unprotectString(playlist._id)

		// 1. Sort rundowns according to playlist rundown order
		const rundownOrderMap = new Map<string, number>()
		const playlistOrder = playlist.rundownIdsInOrder ?? []
		playlistOrder.forEach((id, idx) => rundownOrderMap.set(unprotectString(id), idx))

		const sortedRundowns = [...playoutModel.rundowns].sort((a, b) => {
			const aIdx = rundownOrderMap.get(unprotectString(a.rundown._id)) ?? Number.MAX_SAFE_INTEGER
			const bIdx = rundownOrderMap.get(unprotectString(b.rundown._id)) ?? Number.MAX_SAFE_INTEGER
			return aIdx - bIdx
		})

		// 2. Slice rundowns up to target.rundownId
		const slicedRundowns: PlayoutRundownModel[] = []
		for (const rundown of sortedRundowns) {
			slicedRundowns.push(rundown)
			if (target && unprotectString(rundown.rundown._id) === target.rundownId) {
				break
			}
		}

		// you are currently working on sorting and propagating the loaded parts here.
		const loadedPartInstancesMap = new Map<string, PlayoutPartInstanceModel>()
		playoutModel.loadedPartInstances.forEach((part) => {
			part.pieceInstances
		})

		// 3. Cascade down to child rundowns
		this.rundowns = slicedRundowns.map((rundown) => {
			const isTargetRundown = target && unprotectString(rundown.rundown._id) === target.rundownId
			const rundownTarget = isTargetRundown ? { segmentId: target.segmentId, partId: target.partId } : undefined

			const rundownImpl = new InfinitePlayoutRundown(
				playoutModel,
				piecesLookup,
				{
					id: unprotectString(rundown.rundown._id),
					showstyleId: unprotectString(rundown.rundown.showStyleBaseId),
				},
				rundown.segments,
				this,
				rundownTarget
			)
			this._rundownsMap.set(rundownImpl.id, rundownImpl)
			return rundownImpl
		})
	}

	rundown = (id: InfiniteRundown['id']): InfiniteRundown | undefined => {
		return this._rundownsMap.get(id)
	}
}

export class InfinitePlayoutRundown implements InfiniteRundown {
	readonly id: string
	readonly showstyleId: string
	readonly segments: InfiniteSegment[]
	readonly playlist: InfinitePlaylist

	private readonly _segmentsMap = new Map<string, InfiniteSegment>()

	constructor(
		playoutModel: PlayoutModel,
		piecesLookup: PiecesLookup,
		rawRundown: Pick<InfiniteRundown, 'id' | 'showstyleId'>,
		segments: readonly PlayoutSegmentModel[],
		parentPlaylist: InfinitePlaylist,
		target?: { segmentId: string; partId: string }
	) {
		this.id = rawRundown.id
		this.showstyleId = rawRundown.showstyleId
		this.playlist = parentPlaylist

		// 1. Get and sort segments in this rundown
		const sortedSegments = segments
			.filter((s) => unprotectString(s.segment.rundownId) === this.id)
			.sort((a, b) => a.segment._rank - b.segment._rank)

		// 2. Slice segments up to target.segmentId
		const slicedSegments: PlayoutSegmentModel[] = []
		for (const segment of sortedSegments) {
			slicedSegments.push(segment)
			if (target && unprotectString(segment.segment._id) === target.segmentId) {
				break
			}
		}

		// 3. Cascade down to child segments
		this.segments = slicedSegments.map((segment) => {
			const isTargetSegment = target && unprotectString(segment.segment._id) === target.segmentId
			const segmentTargetPartId = isTargetSegment ? target.partId : undefined

			const segmentImpl = new InfinitePlayoutSegment(
				playoutModel,
				piecesLookup,
				segment,
				this,
				segmentTargetPartId
			)
			this._segmentsMap.set(segmentImpl.id, segmentImpl)
			return segmentImpl
		})
	}

	segment = (id: InfiniteSegment['id']): InfiniteSegment | undefined => {
		return this._segmentsMap.get(id)
	}
}

export class InfinitePlayoutSegment implements InfiniteSegment {
	readonly id: string
	readonly parts: InfinitePart[]
	readonly rundown: InfiniteRundown
	readonly playlist: InfinitePlaylist

	private readonly _partsMap = new Map<string, InfinitePart>()

	constructor(
		playoutModel: PlayoutModel,
		piecesLookup: PiecesLookup,
		rawSegment: PlayoutSegmentModel,
		parentRundown: InfiniteRundown,
		targetPartId?: string
	) {
		this.id = unprotectString(rawSegment.segment._id)
		this.rundown = parentRundown
		this.playlist = parentRundown.playlist

		// 1. Get and sort parts in this segment
		const sortedParts = rawSegment.parts
			.filter((p) => unprotectString(p.segmentId) === this.id)
			.sort((a, b) => a._rank - b._rank)

		// 2. Slice parts strictly BEFORE targetPartId
		const slicedParts: ReadonlyObjectDeep<DBPart>[] = []
		for (const part of sortedParts) {
			if (targetPartId && unprotectString(part._id) === targetPartId) {
				break // Stop before the target part
			}
			slicedParts.push(part)
		}

		// 3. Cascade down to child parts
		this.parts = slicedParts.map((part) => {
			const partImpl = new InfinitePlayoutPart(piecesLookup, part, this)
			this._partsMap.set(partImpl.id, partImpl)
			return partImpl
		})
	}

	part = (id: InfinitePart['id']): InfinitePart | undefined => {
		return this._partsMap.get(id)
	}
}

export class InfinitePlayoutPart implements InfinitePart {
	readonly id: string
	readonly pieces: InfinitePiece[]
	readonly segment: InfiniteSegment
	readonly rundown: InfiniteRundown
	readonly playlist: InfinitePlaylist

	private readonly _piecesMap = new Map<string, InfinitePiece>()

	constructor(piecesLookup: PiecesLookup, rawPart: ReadonlyObjectDeep<DBPart>, parentSegment: InfiniteSegment) {
		this.id = unprotectString(rawPart._id)
		this.segment = parentSegment
		this.rundown = parentSegment.rundown
		this.playlist = parentSegment.playlist

		const partPieces = piecesLookup({
			lifespan: {
				scope: { $in: ['segment', 'rundown', 'showstyle', 'playlist'] },
			},
			startPartId: rawPart._id,
		})

		// 2. Instantiate child pieces
		this.pieces = partPieces.map((p) => {
			const piece = new InfinitePlayoutPiece(p, this)
			this._piecesMap.set(piece.id, piece)
			return piece
		})
	}

	piece = (id: InfinitePiece['id']): InfinitePiece | undefined => {
		return this._piecesMap.get(id)
	}
}

export class InfinitePlayoutPiece implements InfinitePiece {
	readonly id: string
	readonly lifespan: PieceLifespan
	readonly enable: Piece['enable']
	readonly part: InfinitePart
	readonly segment: InfiniteSegment
	readonly rundown: InfiniteRundown
	readonly playlist: InfinitePlaylist

	constructor(rawPiece: ReadonlyObjectDeep<Piece>, parentPart: InfinitePart) {
		this.id = unprotectString(rawPiece._id)
		this.lifespan = new PieceLifespan(rawPiece.lifespan)
		this.enable = rawPiece.enable
		this.part = parentPart
		this.segment = parentPart.segment
		this.rundown = parentPart.rundown
		this.playlist = parentPart.playlist
	}
}
