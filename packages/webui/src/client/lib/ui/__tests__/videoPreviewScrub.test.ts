import { setVideoElementPosition } from '../videoPreviewScrub'

function makeVideo(duration: number): HTMLVideoElement {
	return { duration, currentTime: 0 } as HTMLVideoElement
}

describe('setVideoElementPosition', () => {
	it('sets currentTime from timePosition + seek', () => {
		const vEl = makeVideo(10)
		setVideoElementPosition(vEl, 1500, 10000, 500, false)
		expect(vEl.currentTime).toBe(2)
	})

	it('does not throw when the computed currentTime would be non-finite', () => {
		const vEl = makeVideo(Number.POSITIVE_INFINITY)
		expect(() => setVideoElementPosition(vEl, 1500, 0, 0, true)).not.toThrow()
		expect(vEl.currentTime).toBe(0)
	})
})
