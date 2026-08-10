import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { timerStateToZeroTime } from '@sofie-automation/corelib/dist/dataModel/TimerState'
import { useTranslation } from 'react-i18next'
import { Countdown } from './Countdown'
import { usePlaylistTimingValue } from '../RundownTiming/usePlaylistTimingValue.js'

export function RundownHeaderExpectedEnd({
	playlist,
	simplified,
}: {
	readonly playlist: DBRundownPlaylist
	readonly simplified?: boolean
}): JSX.Element | null {
	const { t } = useTranslation()
	const { value: plannedEnd, now } = usePlaylistTimingValue(playlist._id, 'plannedEnd')
	const { value: estimatedEnd } = usePlaylistTimingValue(playlist._id, 'estimatedEnd')

	const expectedEnd = plannedEnd ? timerStateToZeroTime(plannedEnd, now) : undefined
	const estEnd = estimatedEnd ? timerStateToZeroTime(estimatedEnd, now) : undefined

	if (expectedEnd === undefined && estEnd === undefined) return null

	return (
		<div className="rundown-header__show-timers-endtimes">
			{!simplified && expectedEnd !== undefined ? (
				<Countdown label={t('Plan. End')} time={expectedEnd} className="rundown-header__show-timers-countdown" />
			) : null}
			{estEnd !== undefined ? (
				<Countdown label={t('Est. End')} time={estEnd} className="rundown-header__show-timers-countdown" />
			) : null}
		</div>
	)
}
