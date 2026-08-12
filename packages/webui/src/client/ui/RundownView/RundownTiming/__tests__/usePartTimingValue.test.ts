import { renderHook, act } from '@testing-library/react'
import { protectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import type { PartId, RundownPlaylistId, SegmentId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { getPartTimingStateDocId, type PartTimingStateDoc } from '@sofie-automation/corelib/dist/dataModel/TimingState'

const PLAYLIST_ID = protectString<RundownPlaylistId>('playlist0')
const SEGMENT_ID = protectString<SegmentId>('segment0')
const PART_ID = protectString<PartId>('part0')
const NOW = 100000

/** The document the mocked collection will return */
let publishedDoc: PartTimingStateDoc | undefined

jest.mock('../../../Collections.js', () => ({
	PlaylistTimingStates: {
		findOne: (id: unknown) => (publishedDoc && publishedDoc._id === id ? publishedDoc : undefined),
	},
}))
// The reactive layer is not what is under test here, so run the tracked function directly
jest.mock('../../../../lib/ReactMeteorData/ReactMeteorData.js', () => ({
	useTracker: (fn: () => unknown) => fn(),
}))
jest.mock('../../../../lib/systemTime.js', () => ({
	getCurrentTime: () => NOW,
}))

import { TimerValueMode, usePartTimingValue } from '../usePlaylistTimingValue.js'
import { RundownTiming } from '../RundownTiming.js'

function makeDoc(fields: Partial<PartTimingStateDoc>): PartTimingStateDoc {
	return {
		_id: getPartTimingStateDocId(PART_ID),
		type: 'part',
		playlistId: PLAYLIST_ID,
		segmentId: SEGMENT_ID,
		partId: PART_ID,
		rank: 0,
		isInQuickLoop: false,
		countsTowardsTiming: true,
		...fields,
	}
}

/** Dispatch a timing tick, as RundownTimingProvider does */
function tick(currentTime: number): void {
	act(() => {
		window.dispatchEvent(new CustomEvent(RundownTiming.Events.timeupdateSynced, { detail: { currentTime } }))
	})
}

describe('usePartTimingValue', () => {
	beforeEach(() => {
		publishedDoc = undefined
	})

	it('returns null when nothing is published for the part', () => {
		const { result } = renderHook(() => usePartTimingValue(PART_ID, 'countdown', TimerValueMode.Duration))

		expect(result.current).toBeNull()
	})

	it('returns null when the countdown is absent, meaning the part will not be played in order', () => {
		publishedDoc = makeDoc({ expectedDuration: { paused: true, duration: 10000 } })

		const { result } = renderHook(() => usePartTimingValue(PART_ID, 'countdown', TimerValueMode.Duration))

		expect(result.current).toBeNull()
	})

	it('reads a static duration', () => {
		publishedDoc = makeDoc({ expectedDuration: { paused: true, duration: 10000 } })

		const { result } = renderHook(() => usePartTimingValue(PART_ID, 'expectedDuration', TimerValueMode.Duration))
		expect(result.current).toBe(10000)

		tick(NOW + 60000)
		expect(result.current).toBe(10000)
	})

	it('counts a countdown down, holding once the on-air part overruns', () => {
		// the part is 30s away, and the on-air part is due to end at 130000
		publishedDoc = makeDoc({ countdown: { paused: false, zeroTime: 130000, pauseTime: 130000 } })

		const { result } = renderHook(() => usePartTimingValue(PART_ID, 'countdown', TimerValueMode.Duration))
		expect(result.current).toBe(30000)

		tick(120000)
		expect(result.current).toBe(10000)

		// once the on-air part is overrunning, the countdown cannot fall any further
		tick(140000)
		expect(result.current).toBe(0)
	})

	describe('count-up values', () => {
		it('reads played time as a positive, growing number', () => {
			// on air since 95000
			publishedDoc = makeDoc({ played: { paused: true, duration: 0, resumesAt: 95000 } })

			const { result } = renderHook(() => usePartTimingValue(PART_ID, 'played', TimerValueMode.CountUp))
			expect(result.current).toBe(5000)

			tick(105000)
			expect(result.current).toBe(10000)
		})

		it('reads a finished part as its frozen played time', () => {
			publishedDoc = makeDoc({ played: { paused: true, duration: 0 - 8000 } })

			const { result } = renderHook(() => usePartTimingValue(PART_ID, 'played', TimerValueMode.CountUp))
			expect(result.current).toBe(8000)

			tick(NOW + 60000)
			expect(result.current).toBe(8000)
		})

		it('stays at zero until a start that is still in the future', () => {
			// a take in a multi-gateway studio, where the part starts a moment from now
			publishedDoc = makeDoc({ played: { paused: true, duration: 0, resumesAt: 100200 } })

			const { result } = renderHook(() => usePartTimingValue(PART_ID, 'played', TimerValueMode.CountUp))
			expect(result.current).toBe(0)

			tick(100100)
			expect(result.current).toBe(0)

			// and starts counting the moment it arrives, with no new document needed
			tick(100200)
			expect(result.current).toBe(0)
			tick(101200)
			expect(result.current).toBe(1000)
		})

		it('holds the display duration at its planned value until the part overruns it', () => {
			// on air since 95000, planned for 10s, so it starts growing at 105000
			publishedDoc = makeDoc({ liveDisplayDuration: { paused: true, duration: 0 - 10000, resumesAt: 105000 } })

			const { result } = renderHook(() =>
				usePartTimingValue(PART_ID, 'liveDisplayDuration', TimerValueMode.CountUp)
			)
			expect(result.current).toBe(10000)

			tick(104000)
			expect(result.current).toBe(10000)

			tick(112000)
			expect(result.current).toBe(17000)
		})

		it('gives zero rather than -0 for nothing elapsed', () => {
			publishedDoc = makeDoc({ played: { paused: true, duration: 0 } })

			const { result } = renderHook(() => usePartTimingValue(PART_ID, 'played', TimerValueMode.CountUp))

			expect(Object.is(result.current, 0)).toBe(true)
		})
	})

	it('ignores a document of another type sharing the collection', () => {
		publishedDoc = {
			...makeDoc({ expectedDuration: { paused: true, duration: 10000 } }),
			type: 'segment' as unknown as 'part',
		}

		const { result } = renderHook(() => usePartTimingValue(PART_ID, 'expectedDuration', TimerValueMode.Duration))

		expect(result.current).toBeNull()
	})
})
