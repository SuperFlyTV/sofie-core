import { useMemo } from 'react'
import { TimingTickResolution } from '../RundownView/RundownTiming/RundownTiming.js'
import { TimerValueMode, usePartTimingValue } from '../RundownView/RundownTiming/usePlaylistTimingValue.js'
import type { PartId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { RundownUtils } from '../../lib/rundown.js'
import { FreezeFrameIcon } from '../../lib/ui/icons/freezeFrame.js'
import classNames from 'classnames'
import { FREEZE_FRAME_FLASH } from '../SegmentContainer/withResolvedSegment.js'

interface IProps {
	partId: PartId
	maxDuration: number
	timelineBase: number
	mainSourceEnd: number
	endsInFreeze: boolean
	partRenderedDuration: number
	partActualDuration: number | undefined
	isPartZeroBudget: boolean
	isLive: boolean
	hasAlreadyPlayed: boolean
}

function timeToPosition(time: number, timelineBase: number, maxDuration: number): string {
	const position = Math.min(1, Math.min(time, maxDuration) / timelineBase)

	return `${position * 100}%`
}

export function OvertimeShadow({
	partId,
	timelineBase,
	mainSourceEnd,
	endsInFreeze,
	partRenderedDuration,
	partActualDuration,
	isPartZeroBudget,
	isLive,
	hasAlreadyPlayed,
}: IProps): JSX.Element {
	// a TimerState, so this moves smoothly at 60Hz without the publication having to say anything
	const livePosition =
		usePartTimingValue(partId, 'played', TimerValueMode.CountUp, { tickResolution: TimingTickResolution.High }) ?? 0

	const contentVsPartDiff = mainSourceEnd - partRenderedDuration
	const toFreezeFrame =
		mainSourceEnd > partRenderedDuration
			? mainSourceEnd - Math.max(livePosition, partRenderedDuration)
			: mainSourceEnd - livePosition

	const overtimeShadowStyle = useMemo<React.CSSProperties>(
		() => ({
			left:
				partActualDuration !== undefined
					? timeToPosition(partActualDuration, timelineBase, timelineBase)
					: endsInFreeze && mainSourceEnd && contentVsPartDiff >= 0
						? timeToPosition(
								Math.min(mainSourceEnd, Math.max(livePosition, partRenderedDuration)),
								timelineBase,
								timelineBase
							)
						: timeToPosition(Math.max(livePosition, partRenderedDuration), timelineBase, timelineBase),
			display: endsInFreeze && livePosition > timelineBase ? 'none' : undefined,
		}),
		[livePosition, timelineBase, mainSourceEnd, partActualDuration, partRenderedDuration, toFreezeFrame]
	)

	const idealTakeTimeStyle = useMemo<React.CSSProperties>(
		() => ({
			left: timeToPosition(partActualDuration ?? partRenderedDuration, timelineBase, timelineBase),
		}),
		[timelineBase, partActualDuration, partRenderedDuration]
	)

	const freezeFrameIconStyle = useMemo<React.CSSProperties>(
		() => ({
			left: timeToPosition(mainSourceEnd, timelineBase, timelineBase),
		}),
		[mainSourceEnd, timelineBase]
	)

	const shouldShowOvertimeTimer = !!(
		mainSourceEnd &&
		!isLive &&
		!hasAlreadyPlayed &&
		Math.floor(Math.abs(contentVsPartDiff) / 1000) !== 0
	)
	const shouldShowFreezeFrameTimer = !!(mainSourceEnd && isLive)

	return (
		//mainSourceEnd && (originalDiff < 0 || diff > 0) ?
		<>
			{!isPartZeroBudget && (
				<>
					<div
						className={classNames('segment-opl__overtime-shadow', {
							'segment-opl__overtime-shadow--no-end': isPartZeroBudget && !endsInFreeze,
						})}
						style={overtimeShadowStyle}
					>
						{shouldShowOvertimeTimer && (
							<span className="segment-opl__overtime-timer" role="timer">
								{RundownUtils.formatDiffToTimecode(
									contentVsPartDiff,
									true,
									false,
									true,
									false,
									true,
									undefined,
									false,
									true
								)}
							</span>
						)}
					</div>
					<div className="segment-opl__ideal-take-time" style={idealTakeTimeStyle}></div>
				</>
			)}
			{endsInFreeze && (
				<div className="segment-opl__freeze-marker" style={freezeFrameIconStyle}>
					<FreezeFrameIcon
						className={isLive && mainSourceEnd - livePosition < FREEZE_FRAME_FLASH ? 'flash' : undefined}
					/>
					{!isPartZeroBudget &&
						shouldShowFreezeFrameTimer &&
						((contentVsPartDiff < 0 && Math.floor(toFreezeFrame / 1000) > 0) ||
							(contentVsPartDiff >= 0 &&
								Math.floor(toFreezeFrame / 1000) > 0 &&
								livePosition > partRenderedDuration)) && (
							<span className="segment-opl__freeze-marker-timer" role="timer">
								{RundownUtils.formatDiffToTimecode(
									toFreezeFrame,
									false,
									false,
									true,
									false,
									true,
									undefined,
									false,
									true
								)}
							</span>
						)}
					{isPartZeroBudget && shouldShowFreezeFrameTimer && livePosition < mainSourceEnd && (
						<span className="segment-opl__freeze-marker-timer" role="timer">
							{RundownUtils.formatDiffToTimecode(
								mainSourceEnd - livePosition,
								true,
								false,
								true,
								false,
								true,
								undefined,
								false,
								true
							)}
						</span>
					)}
				</div>
			)}
		</>
	)
}
