import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { useTranslation } from 'react-i18next'
import { Countdown } from './Countdown'
import { TimerValueMode, usePlaylistTimingValue } from '../RundownTiming/usePlaylistTimingValue.js'
import { RundownUtils } from '../../../lib/rundown.js'

export function RundownHeaderPlannedStart({
	playlist,
	simplified,
}: {
	playlist: DBRundownPlaylist
	simplified?: boolean
}): JSX.Element | null {
	const { t } = useTranslation()
	const expectedStart = usePlaylistTimingValue(playlist._id, 'plannedStart', TimerValueMode.Timestamp)
	const untilStart = usePlaylistTimingValue(playlist._id, 'plannedStart', TimerValueMode.Duration)
	const startedPlayback = usePlaylistTimingValue(playlist._id, 'startedPlayback', TimerValueMode.Timestamp)

	// The countdown is displayed as time-since-planned-start, so it is negative until we get there
	const startsIn = -(untilStart ?? 0)

	return (
		<div className="rundown-header__show-timers-endtimes">
			{!simplified && expectedStart !== null && (
				<Countdown label={t('Plan. Start')} time={expectedStart} className="rundown-header__show-timers-countdown" />
			)}
			{startedPlayback !== null && <Countdown label={t('Started')} time={startedPlayback} />}
			{startedPlayback === null && expectedStart !== null && (
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
