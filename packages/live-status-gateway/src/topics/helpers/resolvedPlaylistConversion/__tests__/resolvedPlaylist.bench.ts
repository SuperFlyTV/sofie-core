/**
 * Benchmark for the `resolvedPlaylist` build, on a realistically sized active playlist.
 *
 * This is a plain script rather than a jest test, as jest's sandbox makes every lookup of a global (`Array`, `Object`,
 * `Set`, ...) much slower, which distorts the timings by an order of magnitude. Build the dependencies first, then run
 * it from the repository root with:
 *   npx tsx packages/live-status-gateway/src/topics/helpers/resolvedPlaylistConversion/__tests__/resolvedPlaylist.bench.ts
 *
 * Options, as environment variables:
 *   RESOLVED_PLAYLIST_BENCH_ITERATIONS=<n>  number of timed iterations (default 20)
 *   RESOLVED_PLAYLIST_BENCH_OUT=<path>      also write the generated event as JSON, so that the output of two
 *                                           implementations can be compared for parity
 */
import { writeFileSync } from 'fs'
import { toResolvedPlaylistStatus } from '../events/toResolvedPlaylistStatus.js'
import { makeLargeActivePlaylist } from './resolvedPlaylistConversionTestUtils.js'

const FIXED_NOW = 1_700_000_000_000
const ITERATIONS = Number(process.env.RESOLVED_PLAYLIST_BENCH_ITERATIONS) || 20
const WARMUP = 3

// The resolved output depends on the current time, so pin it to make the output comparable between runs
Date.now = () => FIXED_NOW

const props = makeLargeActivePlaylist({
	rundowns: 3,
	segmentsPerRundown: 30,
	partsPerSegment: 5,
	piecesPerPart: 8,
	playedParts: 20,
	now: FIXED_NOW,
})

let result = toResolvedPlaylistStatus(props)
for (let i = 1; i < WARMUP; i++) result = toResolvedPlaylistStatus(props)

const durations: number[] = []
for (let i = 0; i < ITERATIONS; i++) {
	const start = performance.now()
	result = toResolvedPlaylistStatus(props)
	durations.push(performance.now() - start)
}
durations.sort((a, b) => a - b)

const outPath = process.env.RESOLVED_PLAYLIST_BENCH_OUT
if (outPath) writeFileSync(outPath, JSON.stringify(result, undefined, 2))

const median = durations[Math.floor(durations.length / 2)]
const mean = durations.reduce((a, b) => a + b, 0) / durations.length
console.log(
	[
		`resolvedPlaylist: ${props.segmentsState.length} segments, ${props.partsState.length} parts, ` +
			`${props.piecesInPlaylistState.length} pieces, ${props.partInstancesInPlaylistState.length} part instances, ` +
			`${props.pieceInstancesInPlaylistState.length} piece instances`,
		`  median ${median.toFixed(1)}ms, mean ${mean.toFixed(1)}ms, min ${durations[0].toFixed(1)}ms, ` +
			`max ${durations.at(-1)?.toFixed(1)}ms over ${ITERATIONS} iterations`,
	].join('\n')
)
