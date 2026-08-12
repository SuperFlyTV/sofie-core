import type { ReactNode } from 'react'
import Moment from 'react-moment'
import { RundownUtils } from '../../../lib/rundown.js'
import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { PlaylistTiming } from '@sofie-automation/corelib/dist/playout/rundownTiming'
import type { PartId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { TimerValueMode, usePartTimingValue, useTimingNow } from './usePlaylistTimingValue.js'

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
								: // if show is not activated, use expectedStart or currentTime, whichever is later
									Math.max(PlaylistTiming.getExpectedStart(props.playlist.timing) ?? 0, now)) + thisPartCountdown
						}
					/>
				) : (
					RundownUtils.formatTimeToShortTime(thisPartCountdown)
				)}
			</span>
		</>
	)
}
