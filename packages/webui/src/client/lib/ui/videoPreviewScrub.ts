export function setVideoElementPosition(
	vEl: HTMLVideoElement,
	timePosition: number,
	itemDuration: number,
	seek: number,
	loop: boolean
): void {
	let targetTime = timePosition + seek
	if (loop && vEl.duration > 0) {
		const loopWindowMs = itemDuration > 0 ? Math.min(vEl.duration * 1000, itemDuration) : vEl.duration * 1000
		targetTime = ((targetTime % loopWindowMs) + loopWindowMs) % loopWindowMs
	} else if (itemDuration > 0) {
		targetTime = Math.max(0, Math.min(targetTime, itemDuration))
	}
	const currentTimeSeconds = targetTime / 1000
	if (Number.isFinite(currentTimeSeconds)) {
		vEl.currentTime = currentTimeSeconds
	} else {
		console.error('Invalid current time', currentTimeSeconds, 'for video ', vEl.src)
		console.error('parameters: ', {
			vEl: HTMLVideoElement,
			timePosition,
			itemDuration,
			seek,
			loop,
		})
	}
}
