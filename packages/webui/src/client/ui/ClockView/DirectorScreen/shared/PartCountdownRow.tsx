import { calculatePartInstanceExpectedDurationWithTransition } from '@sofie-automation/corelib/src/playout/timings'
import { CurrentPartOrSegmentRemaining } from '../../../RundownView/RundownHeader/CurrentPartOrSegmentRemaining'
import { AutoNextStatus } from '../../../RundownView/RundownTiming/AutoNextStatus'
import { PieceFreezeContainer } from '../../ClockViewPieceIcons/ClockViewFreezeCount'
import type { DBRundownPlaylist } from '@sofie-automation/corelib/src/dataModel/RundownPlaylist/RundownPlaylist'
import type { RundownId, ShowStyleBaseId } from '@sofie-automation/corelib/src/dataModel/Ids'
import type { PartExtended } from '@sofie-automation/corelib/src/dataModel/Part'

interface WithPartCountdownRowProps {
	playlist: DBRundownPlaylist
	partInstance: PartExtended
	showStyleBaseId: ShowStyleBaseId
	rundownIds: RundownId[]
}

type PartCountdownRowProps = React.HTMLAttributes<HTMLDivElement> & WithPartCountdownRowProps

export function PartCountdownRow({
	playlist,
	partInstance,
	showStyleBaseId,
	rundownIds,
	...divProps
}: PartCountdownRowProps) {
	return (
		<div {...divProps} className={`director-screen__body__part__piece-countdown ${divProps.className}`}>
			<CurrentPartOrSegmentRemaining
				currentPartInstanceId={playlist.currentPartInfo?.partInstanceId ?? null}
				heavyClassName="overtime"
			/>
			<span className="auto-next-status">
				<AutoNextStatus />
			</span>{' '}
			<span className="freeze-counter">
				<PieceFreezeContainer
					partInstanceId={partInstance.instance._id}
					showStyleBaseId={showStyleBaseId}
					rundownIds={rundownIds}
					partAutoNext={partInstance.instance.part.autoNext || false}
					partExpectedDuration={calculatePartInstanceExpectedDurationWithTransition(partInstance.instance)}
					partStartedPlayback={partInstance.instance.timings?.plannedStartedPlayback}
					playlistActivationId={playlist?.activationId}
				/>
			</span>
		</div>
	)
}
