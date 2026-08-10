import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { timerStateToDuration, timerStateToZeroTime } from '@sofie-automation/corelib/dist/dataModel/TimerState'
import { useTranslation } from 'react-i18next'
import { Countdown } from './Countdown'
import { usePlaylistTimingValue } from '../RundownTiming/usePlaylistTimingValue.js'
import { RundownUtils } from '../../../lib/rundown.js'

export function RundownHeaderPlannedStart({
	playlist,
	simplified,
}: {
	playlist: DBRundownPlaylist
	simplified?: boolean
}): JSX.Element | null {
	const { t } = useTranslation()
	const { value: plannedStart, now } = usePlaylistTimingValue(playlist._id, 'plannedStart')
	const { value: startedPlaybackState } = usePlaylistTimingValue(playlist._id, 'startedPlayback')

	const expectedStart = plannedStart ? timerStateToZeroTime(plannedStart, now) : undefined
	// the countdown read of plannedStart is (expectedStart - now); startsIn is its negation
	const startsIn = plannedStart ? -timerStateToDuration(plannedStart, now) : 0
	const startedPlayback = startedPlaybackState ? timerStateToZeroTime(startedPlaybackState, now) : undefined

	return (
		<div className="rundown-header__show-timers-endtimes">
			{!simplified && expectedStart !== undefined && (
				<Countdown label={t('Plan. Start')} time={expectedStart} className="rundown-header__show-timers-countdown" />
			)}
			{startedPlayback !== undefined && <Countdown label={t('Started')} time={startedPlayback} />}
			{startedPlayback === undefined && expectedStart !== undefined && (
				<Countdown label={t('Start In')} className="rundown-header__show-timers-countdown" ms={startsIn}>
					{`${startsIn > -1000 ? '+' : ''}${RundownUtils.formatDiffToTimecode(
						-startsIn,
						false,
						false,
						true,
						true,
						true,
						'',
						true,
						true
					)}`}
				</Countdown>
			)}
		</div>
	)
}
