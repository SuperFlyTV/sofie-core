import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { JobContext } from '../../jobs/index.js'
import { ReadonlyDeep } from 'type-fest'
import { ReadonlyObjectDeep } from 'type-fest/source/readonly-deep'
import { extractInfinitesFromPart } from './extractInfinitesFromPart.js'

export function resolveInfinites(
	context: JobContext,
	originPart: ReadonlyDeep<DBPartInstance> | undefined,
	destinationPart: ReadonlyDeep<DBPart>
): ReadonlyObjectDeep<Piece>[] {
	// here we collect all infinites that are present in the origin part. this makes sure that adlibs are respected and playhead tracking infinites can continue.
	const baseInfinites: ReadonlyObjectDeep<Piece>[] = extractInfinitesFromPart(context, originPart)

	// resolve any infinites that might become active because we jumped after a forward scope piece
	const newForwardScopeInfinites: ReadonlyObjectDeep<Piece>[] = findForwardScopeInfinitesInPart(
		context,
		destinationPart
	)

	// we merge the two arrays, and deduplicate them, keeping the already playing infinite in case there is a conflict
	const consideredInfinites: ReadonlyObjectDeep<Piece>[] = [
		...baseInfinites,
		...newForwardScopeInfinites.filter((newForwardScopeInfinite) =>
			baseInfinites.some((baseInfinite) => baseInfinite._id === newForwardScopeInfinite._id)
		),
	]

	// we filter to the infinites that are actually in the scope of the destination part. This is important because we don't want to continue infinites that are not in scope anymore
	const correctlyScopedInfinites = consideredInfinites.filter((infinite) =>
		isInfiniteInPartScope(infinite, destinationPart)
	)

	// stop on override gets applied here we are changing the end time of an infinite
	const continuedInfinites: ReadonlyObjectDeep<Piece>[] = normalizeEndTimes(
		context,
		correctlyScopedInfinites,
		destinationPart
	)

	return continuedInfinites
}

function findForwardScopeInfinitesInPart(
	context: JobContext,
	part: ReadonlyDeep<DBPart> | undefined
): ReadonlyObjectDeep<Piece>[] {
	throw new Error('Function not implemented.')
}

function normalizeEndTimes(
	context: JobContext,
	consideredInfinites: ReadonlyObjectDeep<Piece>[],
	destinationPart: ReadonlyObjectDeep<DBPart>
): ReadonlyObjectDeep<Piece>[] {
	throw new Error('Function not implemented.')
}

function isInfiniteInPartScope(
	infinite: ReadonlyObjectDeep<Piece>,
	destinationPart: ReadonlyObjectDeep<DBPart>
): unknown {
	throw new Error('Function not implemented.')
}
