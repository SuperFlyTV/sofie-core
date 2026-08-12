import classNames from 'classnames'
import { useTranslation } from 'react-i18next'
import Moment from 'react-moment'
import { LoopingIcon } from '../../lib/ui/icons/looping.js'
import { useTimingPlaylistId } from './RundownTiming/withTiming.js'
import {
	TimerValueMode,
	useOrderedPartIds,
	usePartTimingValue,
	useTimingNow,
} from './RundownTiming/usePlaylistTimingValue.js'
import { RundownUtils } from '../../lib/rundown.js'

function NextLoopClock({ useWallClock }: { useWallClock?: boolean }) {
	const playlistId = useTimingPlaylistId()
	// the countdown to the first part of the rundown, which is where the loop returns to
	const firstPartId = useOrderedPartIds(playlistId)[0]
	const thisPartCountdown = usePartTimingValue(firstPartId, 'countdown', TimerValueMode.Duration)
	const now = useTimingNow()

	if (thisPartCountdown === null) return null

	return (
		<span>
			{useWallClock ? (
				<Moment interval={0} format="HH:mm:ss" date={now + thisPartCountdown} />
			) : (
				RundownUtils.formatTimeToShortTime(thisPartCountdown)
			)}
		</span>
	)
}

interface ILoopingHeaderProps {
	position: 'start' | 'end'
	multiRundown?: boolean
	showCountdowns?: boolean
}
export function PlaylistLoopingHeader({ position, multiRundown, showCountdowns }: ILoopingHeaderProps): JSX.Element {
	const { t } = useTranslation()

	return (
		<div
			className={classNames('playlist-looping-header', {
				'multi-rundown': multiRundown,
			})}
		>
			<h3 className="playlist-looping-header__label">
				<LoopingIcon />
				&nbsp;
				{position === 'start' ? t('Loop Start') : t('Loop End')}
			</h3>
			{showCountdowns ? (
				<>
					<div className="playlist-looping-header__countdown playlist-looping-header__countdown--time-of-day">
						<NextLoopClock useWallClock={true} />
					</div>
					<div className="playlist-looping-header__countdown playlist-looping-header__countdown--countdown">
						<NextLoopClock />
					</div>
				</>
			) : null}
		</div>
	)
}
