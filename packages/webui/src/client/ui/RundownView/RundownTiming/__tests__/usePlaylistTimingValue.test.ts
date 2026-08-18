import { renderHook, act } from '@testing-library/react'
import { protectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import type { RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import {
	getPlaylistTimingStateDocId,
	type PlaylistTimingStateDoc,
} from '@sofie-automation/corelib/dist/dataModel/TimingState'
import { PlaylistTimingType } from '@sofie-automation/blueprints-integration'

const PLAYLIST_ID = protectString<RundownPlaylistId>('playlist0')
const NOW = 100000

/** The document the mocked collection will return */
let publishedDoc: PlaylistTimingStateDoc | undefined

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

import { TimerValueMode, usePlaylistTimingValue } from '../usePlaylistTimingValue.js'
import { RundownTiming, TimingTickResolution } from '../RundownTiming.js'

function makeDoc(fields: Partial<PlaylistTimingStateDoc>): PlaylistTimingStateDoc {
	return {
		_id: getPlaylistTimingStateDocId(PLAYLIST_ID),
		type: 'playlist',
		playlistId: PLAYLIST_ID,
		timingType: PlaylistTimingType.ForwardTime,
		currentPartWillAutoNext: false,
		...fields,
	}
}

/** Dispatch a timing tick, as RundownTimingProvider does */
function dispatchTick(event: RundownTiming.Events, currentTime: number): void {
	act(() => {
		window.dispatchEvent(new CustomEvent(event, { detail: { currentTime } }))
	})
}

describe('usePlaylistTimingValue', () => {
	beforeEach(() => {
		publishedDoc = undefined
	})

	it('returns null when nothing is published for the playlist', () => {
		const { result } = renderHook(() => usePlaylistTimingValue(PLAYLIST_ID, 'plannedEnd', TimerValueMode.Timestamp))

		expect(result.current).toBeNull()
	})

	it('returns null when the document omits the requested timer', () => {
		publishedDoc = makeDoc({ plannedStart: { paused: false, zeroTime: 120000 } })

		const { result } = renderHook(() => usePlaylistTimingValue(PLAYLIST_ID, 'plannedEnd', TimerValueMode.Timestamp))

		expect(result.current).toBeNull()
	})

	it('reads a timer as a timestamp', () => {
		publishedDoc = makeDoc({ plannedEnd: { paused: false, zeroTime: 160000 } })

		const { result } = renderHook(() => usePlaylistTimingValue(PLAYLIST_ID, 'plannedEnd', TimerValueMode.Timestamp))

		expect(result.current).toBe(160000)
	})

	it('reads the same timer as a duration', () => {
		publishedDoc = makeDoc({ plannedEnd: { paused: false, zeroTime: 160000 } })

		const { result } = renderHook(() => usePlaylistTimingValue(PLAYLIST_ID, 'plannedEnd', TimerValueMode.Duration))

		// 60s from NOW until it reaches zero
		expect(result.current).toBe(60000)
	})

	it('recomputes on each tick, so a countdown advances without a new document', () => {
		publishedDoc = makeDoc({ remainingDuration: { paused: false, zeroTime: 160000 } })

		const { result } = renderHook(() =>
			usePlaylistTimingValue(PLAYLIST_ID, 'remainingDuration', TimerValueMode.Duration)
		)
		expect(result.current).toBe(60000)

		dispatchTick(RundownTiming.Events.timeupdateSynced, NOW + 10000)
		expect(result.current).toBe(50000)

		dispatchTick(RundownTiming.Events.timeupdateSynced, NOW + 25000)
		expect(result.current).toBe(35000)
	})

	it('freezes at the breakpoint of a state that pauses', () => {
		// counts down to 160000, but freezes when the on-air part ends at 130000
		publishedDoc = makeDoc({
			remainingDuration: { paused: false, zeroTime: 160000, pauseTime: 130000 },
		})

		const { result } = renderHook(() =>
			usePlaylistTimingValue(PLAYLIST_ID, 'remainingDuration', TimerValueMode.Duration)
		)
		expect(result.current).toBe(60000)

		dispatchTick(RundownTiming.Events.timeupdateSynced, 129000)
		expect(result.current).toBe(31000)

		// past the breakpoint it holds, however much time passes
		dispatchTick(RundownTiming.Events.timeupdateSynced, 131000)
		expect(result.current).toBe(30000)
		dispatchTick(RundownTiming.Events.timeupdateSynced, 200000)
		expect(result.current).toBe(30000)
	})

	it('subscribes to the requested tick resolution only', () => {
		publishedDoc = makeDoc({ remainingDuration: { paused: false, zeroTime: 160000 } })

		const { result } = renderHook(() =>
			usePlaylistTimingValue(PLAYLIST_ID, 'remainingDuration', TimerValueMode.Duration, {
				tickResolution: TimingTickResolution.High,
			})
		)

		// the synced tick is not the one it listens to
		dispatchTick(RundownTiming.Events.timeupdateSynced, NOW + 10000)
		expect(result.current).toBe(60000)

		dispatchTick(RundownTiming.Events.timeupdateHighResolution, NOW + 10000)
		expect(result.current).toBe(50000)
	})

	it('ignores a document for a different area of the union', () => {
		// a hypothetical future per-segment document sharing the collection
		publishedDoc = {
			...makeDoc({ plannedEnd: { paused: false, zeroTime: 160000 } }),
			type: 'segment' as unknown as 'playlist',
		}

		const { result } = renderHook(() => usePlaylistTimingValue(PLAYLIST_ID, 'plannedEnd', TimerValueMode.Timestamp))

		expect(result.current).toBeNull()
	})

	it('stops listening once unmounted', () => {
		publishedDoc = makeDoc({ remainingDuration: { paused: false, zeroTime: 160000 } })
		const removeSpy = jest.spyOn(window, 'removeEventListener')

		const { unmount } = renderHook(() =>
			usePlaylistTimingValue(PLAYLIST_ID, 'remainingDuration', TimerValueMode.Duration)
		)
		unmount()

		expect(removeSpy).toHaveBeenCalledWith(RundownTiming.Events.timeupdateSynced, expect.any(Function))
		removeSpy.mockRestore()
	})
})
