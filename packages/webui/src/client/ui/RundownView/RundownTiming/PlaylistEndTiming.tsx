import React from 'react'
import { useTranslation } from 'react-i18next'
import Moment from 'react-moment'
import { getCurrentTime } from '../../../lib/systemTime.js'
import { RundownUtils } from '../../../lib/rundown.js'
import { useTiming, useTimingPlaylistId } from './withTiming.js'
import { TimerValueMode, useOrderedPartIds, usePartTimingValue } from './usePlaylistTimingValue.js'
import ClassNames from 'classnames'
import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { getPlaylistTimingDiff } from '../../../lib/rundownTiming.js'
import { isLoopRunning } from '@sofie-automation/corelib/src/playout/stateCacheResolver.js'

interface IEndTimingProps {
	rundownPlaylist: DBRundownPlaylist
	loop?: boolean
	expectedStart?: number
	expectedDuration?: number
	expectedEnd?: number
	endLabel?: string
	hidePlannedEndLabel?: boolean
	hideDiffLabel?: boolean
	hidePlannedEnd?: boolean
	hideCountdown?: boolean
	hideDiff?: boolean
}

export function PlaylistEndTiming({
	rundownPlaylist,
	loop,
	expectedStart,
	expectedDuration,
	expectedEnd,
	endLabel,
	hidePlannedEndLabel,
	hideDiffLabel,
	hidePlannedEnd,
	hideCountdown,
	hideDiff,
}: IEndTimingProps): JSX.Element {
	const { t } = useTranslation()

	const timingDurations = useTiming()

	// where a running loop returns to, so the "Next Loop at" clock counts down to it
	const firstPartId = useOrderedPartIds(useTimingPlaylistId())[0]
	const firstPartCountdown = usePartTimingValue(firstPartId, 'countdown', TimerValueMode.Duration)

	const overUnderClock = getPlaylistTimingDiff(rundownPlaylist, timingDurations) ?? 0
	const now = timingDurations.currentTime ?? getCurrentTime()

	return (
		<React.Fragment>
			{!hideDiff ? (
				timingDurations ? (
					<span
						className={ClassNames('timing-clock heavy-light ', {
							heavy: overUnderClock < 0,
							light: overUnderClock >= 0,
						})}
						role="timer"
					>
						{!hideDiffLabel && <span className="timing-clock-label right">{t('Diff')}</span>}
						{RundownUtils.formatDiffToTimecodeOverUnder(overUnderClock, true)}
					</span>
				) : null
			) : null}

			{!loop &&
				!hideCountdown &&
				(expectedEnd ? (
					<span className="timing-clock countdown plan-end" role="timer">
						{RundownUtils.formatDiffToTimecode(now - expectedEnd, true, true, true)}
					</span>
				) : expectedStart && expectedDuration ? (
					<span className="timing-clock countdown plan-end" role="timer">
						{RundownUtils.formatDiffToTimecode(getCurrentTime() - (expectedStart + expectedDuration), true, true, true)}
					</span>
				) : null)}

			{!hidePlannedEnd ? (
				expectedEnd ? (
					!rundownPlaylist.startedPlayback ? (
						<span className="timing-clock plan-end visual-last-child" role="timer">
							{!hidePlannedEndLabel && <span className="timing-clock-label right">{endLabel ?? t('Planned End')}</span>}
							<Moment interval={0} format="HH:mm:ss" date={expectedEnd} />
						</span>
					) : (
						<span className="timing-clock plan-end visual-last-child" role="timer">
							{!hidePlannedEndLabel && (
								<span className="timing-clock-label right">{endLabel ?? t('Expected End')}</span>
							)}
							<Moment interval={0} format="HH:mm:ss" date={expectedEnd} />
						</span>
					)
				) : timingDurations ? (
					isLoopRunning(rundownPlaylist) ? (
						firstPartCountdown !== null && rundownPlaylist.activationId && rundownPlaylist.currentPartInfo ? (
							<span className="timing-clock plan-end visual-last-child" role="timer">
								{!hidePlannedEndLabel && <span className="timing-clock-label right">{t('Next Loop at')}</span>}
								<Moment interval={0} format="HH:mm:ss" date={now + firstPartCountdown} />
							</span>
						) : null
					) : (
						<span className="timing-clock plan-end visual-last-child" role="timer">
							{!hidePlannedEndLabel && (
								<span className="timing-clock-label right">{endLabel ?? t('Expected End')}</span>
							)}
							<Moment
								interval={0}
								format="HH:mm:ss"
								date={(expectedStart || now) + (timingDurations.remainingPlaylistDuration || 0)}
							/>
						</span>
					)
				) : null
			) : null}
		</React.Fragment>
	)
}
