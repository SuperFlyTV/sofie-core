import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { timerStateToZeroTime } from '@sofie-automation/corelib/dist/dataModel/TimerState'
import { useTranslation } from 'react-i18next'
import { usePlaylistTimingValue } from '../RundownTiming/usePlaylistTimingValue.js'
import { OverUnderChip } from '../../../lib/Components/OverUnderChip'

export interface IRundownHeaderTimingDisplayProps {
	playlist: DBRundownPlaylist
}

export function RundownHeaderTimingDisplay({ playlist }: IRundownHeaderTimingDisplayProps): JSX.Element | null {
	const { t } = useTranslation()
	const { value: overUnder, now } = usePlaylistTimingValue(playlist._id, 'overUnder')

	// The server omits overUnder when there is no meaningful diff to show
	// (e.g. an untimed playlist that has never been played)
	if (!overUnder) return null

	// over = projected - target (positive = over / behind schedule)
	const overUnderClock = timerStateToZeroTime(overUnder.projected, now) - timerStateToZeroTime(overUnder.target, now)

	const isUnder = overUnderClock <= 0

	return (
		<div className="rundown-header__clocks-timing-display">
			<span className="rundown-header__clocks-diff">
				<span className="rundown-header__clocks-diff__label">{isUnder ? t('Under') : t('Over')}</span>
				<OverUnderChip valueMs={overUnderClock} format="playlistDiff" />
			</span>
		</div>
	)
}
