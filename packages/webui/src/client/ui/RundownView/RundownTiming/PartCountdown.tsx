import type { ReactNode } from 'react'
import Moment from 'react-moment'
import { RundownUtils } from '../../../lib/rundown.js'
import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import type { PartId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { TimerValueMode, usePartTimingValue, usePlaylistTimingValue, useTimingNow } from './usePlaylistTimingValue.js'

interface IPartCountdownProps {
	partId?: PartId
	hideOnZero?: boolean
	label?: ReactNode
	useWallClock?: boolean
	playlist: DBRundownPlaylist
}

/**
 * A presentational component that will render a countdown to a given Part
 */
export function PartCountdown(props: IPartCountdownProps): JSX.Element | null {
	// absent when the Part will probably not be played out, if played in order
	const thisPartCountdown = usePartTimingValue(props.partId, 'countdown', TimerValueMode.Duration)
	const plannedStart = usePlaylistTimingValue(props.playlist._id, 'plannedStart', TimerValueMode.Timestamp)
	const now = useTimingNow()

	if (thisPartCountdown === null || (props.hideOnZero === true && thisPartCountdown <= 0)) return null

	return (
		<>
			{props.label}
			<span role="timer">
				{props.useWallClock ? (
					<Moment
						interval={0}
						format="HH:mm:ss"
						date={
							(props.playlist.activationId
								? // if show is activated, use currentTime as base
									now
								: // if show is not activated, use the planned start or currentTime, whichever is later
									Math.max(plannedStart ?? 0, now)) + thisPartCountdown
						}
					/>
				) : (
					RundownUtils.formatTimeToShortTime(thisPartCountdown)
				)}
			</span>
		</>
	)
}
