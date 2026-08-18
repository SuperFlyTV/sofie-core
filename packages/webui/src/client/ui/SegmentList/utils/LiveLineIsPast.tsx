import React from 'react'
import { TimingTickResolution } from '../../RundownView/RundownTiming/RundownTiming.js'
import { TimerValueMode, usePartTimingValue } from '../../RundownView/RundownTiming/usePlaylistTimingValue.js'
import type { PartId } from '@sofie-automation/corelib/dist/dataModel/Ids'

export const LiveLineIsPast = React.memo(function LiveLineIsPast({
	partId,
	time,
	children,
}: {
	partId: PartId
	time: number
	children?: (isPast: boolean) => JSX.Element | null
}) {
	const livePosition =
		usePartTimingValue(partId, 'played', TimerValueMode.CountUp, { tickResolution: TimingTickResolution.High }) ?? 0

	return children ? children(livePosition > time) : null
})
