import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { timerStateToDuration } from '@sofie-automation/corelib/dist/dataModel/TimerState'
import { useTranslation } from 'react-i18next'
import { Countdown } from './Countdown'
import { usePlaylistTimingValue } from '../RundownTiming/usePlaylistTimingValue.js'
import { RundownUtils } from '../../../lib/rundown.js'

export function RundownHeaderDurations({
	playlist,
	simplified,
}: {
	readonly playlist: DBRundownPlaylist
	readonly simplified?: boolean
}): JSX.Element | null {
	const { t } = useTranslation()
	const { value: plannedDuration, now } = usePlaylistTimingValue(playlist._id, 'plannedDuration')
	const { value: remainingDuration } = usePlaylistTimingValue(playlist._id, 'remainingDuration')

	const expectedDuration = plannedDuration ? timerStateToDuration(plannedDuration, now) : undefined
	const estDuration = remainingDuration ? timerStateToDuration(remainingDuration, now) : undefined

	if (expectedDuration == undefined && estDuration == undefined) return null

	const clampedEstDuration = estDuration !== undefined ? Math.max(0, estDuration) : undefined

	return (
		<div className="rundown-header__show-timers-endtimes">
			{!simplified && expectedDuration ? (
				<Countdown label={t('Plan. Dur')} className="rundown-header__show-timers-countdown" ms={expectedDuration}>
					{RundownUtils.formatDiffToTimecode(expectedDuration, false, true, true, true, true, undefined, true, true)}
				</Countdown>
			) : null}
			{clampedEstDuration !== undefined ? (
				<Countdown label={t('Rem. Dur')} className="rundown-header__show-timers-countdown" ms={clampedEstDuration}>
					{RundownUtils.formatDiffToTimecode(-clampedEstDuration, false, true, true, true, true, '', true, true)}
				</Countdown>
			) : null}
		</div>
	)
}
