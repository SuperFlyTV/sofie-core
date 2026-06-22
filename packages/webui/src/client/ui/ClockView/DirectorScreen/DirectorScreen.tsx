import ClassNames from 'classnames'
import type { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import type { PartUi } from '../../SegmentTimeline/SegmentTimelineContainer.js'
import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import type { Rundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import {
	useSubscription,
	useSubscriptions,
	useTracker,
	withTracker,
} from '../../../lib/ReactMeteorData/ReactMeteorData.js'
import { getCurrentTime } from '../../../lib/systemTime.js'
import { MeteorPubSub } from '@sofie-automation/meteor-lib/dist/api/pubsub'
import { PieceIconContainer } from '../ClockViewPieceIcons/ClockViewPieceIcon.js'
import { PieceNameContainer } from '../ClockViewPieceIcons/ClockViewPieceName.js'
import { Timediff } from '../Timediff.js'
import { RundownUtils } from '../../../lib/rundown.js'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'
import type { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { PlaylistTiming } from '@sofie-automation/corelib/dist/playout/rundownTiming'
import type {
	RundownId,
	RundownPlaylistId,
	ShowStyleBaseId,
	ShowStyleVariantId,
	StudioId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import type { DBShowStyleVariant } from '@sofie-automation/corelib/dist/dataModel/ShowStyleVariant'
import { UIShowStyleBases, UIStudios } from '../../Collections.js'
import { PieceInstances, RundownPlaylists, Rundowns, ShowStyleVariants } from '../../../collections/index.js'
import { RundownPlaylistCollectionUtil } from '../../../collections/rundownPlaylistUtil.js'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { useSetDocumentClass } from '../../util/useSetDocumentClass.js'
import { useRundownAndShowStyleIdsForPlaylist } from '../../util/useRundownAndShowStyleIdsForPlaylist.js'
import { RundownPlaylistClientUtil } from '../../../lib/rundownPlaylistUtil.js'
import { CurrentPartOrSegmentRemaining } from '../../RundownView/RundownHeader/CurrentPartOrSegmentRemaining.js'

import { AdjustLabelFit } from '../../util/AdjustLabelFit.js'
import { useTranslation } from 'react-i18next'
import type { UIShowStyleBase } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { DirectorScreenTop } from './DirectorScreenTop.js'
import { useTiming } from '../../RundownView/RundownTiming/withTiming.js'
import type { UIStudio } from '@sofie-automation/corelib/src/dataModel/Studio.js'
import type { PartInstance } from '@sofie-automation/corelib/src/dataModel/PartInstance.js'
import { RundownStatusBar } from '../RundownStatusBar.js'
import { ClipPlayerIcon } from './shared/ClipPlayerIcon.js'
import { findClipPlayer } from './utils/findClipPlayer.js'
import { PartCountdownRow } from './shared/PartCountdownRow.js'

interface SegmentUi extends DBSegment {
	items: Array<PartUi>
}

interface TimeMap {
	[key: string]: number
}

interface DirectorScreenProps {
	studioId: StudioId
	playlistId: RundownPlaylistId
	segmentLiveDurations?: TimeMap
}
export interface DirectorScreenTrackedProps {
	studio: UIStudio | undefined
	playlist: DBRundownPlaylist | undefined
	rundowns: Rundown[]
	segments: Array<SegmentUi>
	currentSegment: SegmentUi | undefined
	currentPartInstance: PartUi | undefined
	nextSegment: SegmentUi | undefined
	nextPartInstance: PartUi | undefined
	currentShowStyleBaseId: ShowStyleBaseId | undefined
	currentShowStyleBase: UIShowStyleBase | undefined
	currentShowStyleVariantId: ShowStyleVariantId | undefined
	currentShowStyleVariant: DBShowStyleVariant | undefined
	nextShowStyleBaseId: ShowStyleBaseId | undefined
	showStyleBaseIds: ShowStyleBaseId[]
	rundownIds: RundownId[]
}

function getShowStyleBaseIdSegmentPartUi(
	partInstance: PartInstance,
	playlist: DBRundownPlaylist,
	orderedSegmentsAndParts: {
		segments: DBSegment[]
		parts: DBPart[]
	},
	rundownsToShowStyles: Map<RundownId, ShowStyleBaseId>,
	currentPartInstance: PartInstance | undefined,
	nextPartInstance: PartInstance | undefined
): {
	showStyleBaseId: ShowStyleBaseId | undefined
	showStyleBase: UIShowStyleBase | undefined
	showStyleVariantId: ShowStyleVariantId | undefined
	showStyleVariant: DBShowStyleVariant | undefined
	segment: SegmentUi | undefined
	partInstance: PartUi | undefined
} {
	let studioId: StudioId | undefined = undefined
	let showStyleBaseId: ShowStyleBaseId | undefined = undefined
	let studio: UIStudio | undefined = undefined
	let showStyleBase: UIShowStyleBase | undefined = undefined
	let showStyleVariantId: ShowStyleVariantId | undefined = undefined
	let showStyleVariant: DBShowStyleVariant | undefined = undefined
	let segment: SegmentUi | undefined = undefined
	let partInstanceUi: PartUi | undefined = undefined

	const currentRundown = Rundowns.findOne(partInstance.rundownId, {
		fields: {
			_id: 1,
			showStyleBaseId: 1,
			showStyleVariantId: 1,
			name: 1,
			timing: 1,
		},
	})
	studioId = currentRundown?.studioId
	showStyleBaseId = currentRundown?.showStyleBaseId
	showStyleVariantId = currentRundown?.showStyleVariantId

	const segmentIndex = orderedSegmentsAndParts.segments.findIndex((s) => s._id === partInstance.segmentId)
	if (currentRundown && segmentIndex >= 0) {
		const rundownOrder = RundownPlaylistCollectionUtil.getRundownOrderedIDs(playlist)
		const rundownIndex = rundownOrder.indexOf(partInstance.rundownId)
		studio = UIStudios.findOne(studioId)
		showStyleBase = UIShowStyleBases.findOne(showStyleBaseId)
		showStyleVariant = ShowStyleVariants.findOne(showStyleVariantId)

		if (showStyleBase) {
			// This registers a reactive dependency on infinites-capping pieces, so that the segment can be
			// re-evaluated when a piece like that appears.

			const o = RundownUtils.getResolvedSegment(
				{
					showStyleBase,
					studio,
					playlist,
					rundown: currentRundown,
					segment: orderedSegmentsAndParts.segments[segmentIndex],
					segmentsToReceiveOnRundownEndFromSet: new Set(
						orderedSegmentsAndParts.segments.map((s) => s._id).slice(0, segmentIndex)
					),
					rundownsToReceiveOnShowStyleEndFrom: rundownOrder.slice(0, rundownIndex),
					rundownsToShowStyles,
					orderedAllPartIds: orderedSegmentsAndParts.parts.map((part) => part._id),
					currentPartInstance,
					nextPartInstance,
				},
				{
					pieceInstanceSimulation: true,
					includeDisabledPieces: true,
				}
			)

			segment = {
				...o.segmentExtended,
				items: o.parts,
			}

			partInstanceUi = o.parts.find((part) => part.instance._id === partInstance._id)
		}
	}

	return {
		showStyleBaseId: showStyleBaseId,
		showStyleBase,
		showStyleVariantId,
		showStyleVariant,
		segment: segment,
		partInstance: partInstanceUi,
	}
}

const getDirectorScreenReactive = (props: DirectorScreenProps): DirectorScreenTrackedProps => {
	const studio = UIStudios.findOne(props.studioId)

	let playlist: DBRundownPlaylist | undefined

	if (props.playlistId)
		playlist = RundownPlaylists.findOne(props.playlistId, {
			fields: {
				lastIncorrectPartPlaybackReported: 0,
				modified: 0,
				publicPlayoutPersistentState: 0,
				privatePlayoutPersistentState: 0,
				rundownRanksAreSetInSofie: 0,
				// Note: Do not exclude assignedAbSessions/trackedAbSessions so they stay reactive
				restoredFromSnapshotId: 0,
			},
		})

	const segments: Array<SegmentUi> = []
	let showStyleBaseIds: ShowStyleBaseId[] = []
	let rundowns: Rundown[] = []
	let rundownIds: RundownId[] = []

	let currentSegment: SegmentUi | undefined = undefined
	let currentPartInstanceUi: PartUi | undefined = undefined
	let currentShowStyleBaseId: ShowStyleBaseId | undefined = undefined
	let currentShowStyleBase: UIShowStyleBase | undefined = undefined
	let currentShowStyleVariantId: ShowStyleVariantId | undefined = undefined
	let currentShowStyleVariant: DBShowStyleVariant | undefined = undefined

	let nextSegment: SegmentUi | undefined = undefined
	let nextPartInstanceUi: PartUi | undefined = undefined
	let nextShowStyleBaseId: ShowStyleBaseId | undefined = undefined

	if (playlist) {
		rundowns = RundownPlaylistCollectionUtil.getRundownsOrdered(playlist)

		const orderedSegmentsAndParts = RundownPlaylistClientUtil.getSegmentsAndPartsSync(playlist)
		rundownIds = rundowns.map((rundown) => rundown._id)
		const rundownsToShowstyles: Map<RundownId, ShowStyleBaseId> = new Map()
		for (const rundown of rundowns) {
			rundownsToShowstyles.set(rundown._id, rundown.showStyleBaseId)
		}

		showStyleBaseIds = rundowns.map((rundown) => rundown.showStyleBaseId)
		const { currentPartInstance, nextPartInstance } = RundownPlaylistClientUtil.getSelectedPartInstances(playlist)

		const partInstance = currentPartInstance ?? nextPartInstance
		if (partInstance) {
			// This is to register a reactive dependency on Rundown-spanning PieceInstances, that we may miss otherwise.
			PieceInstances.find({
				rundownId: {
					$in: rundownIds,
				},
				dynamicallyInserted: {
					$exists: true,
				},
				'infinite.fromPreviousPart': false,
				'piece.lifespan': {
					$in: [PieceLifespan.OutOnRundownEnd, PieceLifespan.OutOnRundownChange, PieceLifespan.OutOnShowStyleEnd],
				},
				reset: {
					$ne: true,
				},
			}).fetch()

			if (currentPartInstance) {
				const current = getShowStyleBaseIdSegmentPartUi(
					currentPartInstance,
					playlist,
					orderedSegmentsAndParts,
					rundownsToShowstyles,
					currentPartInstance,
					nextPartInstance
				)
				currentSegment = current.segment
				currentPartInstanceUi = current.partInstance
				currentShowStyleBaseId = current.showStyleBaseId
				currentShowStyleBase = current.showStyleBase
				currentShowStyleVariantId = current.showStyleVariantId
				currentShowStyleVariant = current.showStyleVariant
			}

			if (nextPartInstance) {
				const next = getShowStyleBaseIdSegmentPartUi(
					nextPartInstance,
					playlist,
					orderedSegmentsAndParts,
					rundownsToShowstyles,
					currentPartInstance,
					nextPartInstance
				)
				nextSegment = next.segment
				nextPartInstanceUi = next.partInstance
				nextShowStyleBaseId = next.showStyleBaseId
			}
		}
	}

	return {
		studio,
		segments,
		playlist,
		rundowns,
		showStyleBaseIds,
		rundownIds,
		currentSegment,
		currentPartInstance: currentPartInstanceUi,
		currentShowStyleBaseId,
		currentShowStyleBase,
		currentShowStyleVariantId,
		currentShowStyleVariant,
		nextSegment,
		nextPartInstance: nextPartInstanceUi,
		nextShowStyleBaseId,
	}
}

function useDirectorScreenSubscriptions(props: DirectorScreenProps): void {
	useSubscription(MeteorPubSub.uiStudio, props.studioId)

	const playlist = useTracker(
		() =>
			RundownPlaylists.findOne(props.playlistId, {
				fields: {
					_id: 1,
					activationId: 1,
				},
			}) as Pick<DBRundownPlaylist, '_id' | 'activationId'> | undefined,
		[props.playlistId]
	)

	useSubscription(CorelibPubSub.rundownsInPlaylists, playlist ? [playlist._id] : [])

	const { rundownIds, showStyleBaseIds, showStyleVariantIds } = useRundownAndShowStyleIdsForPlaylist(playlist?._id)

	useSubscription(CorelibPubSub.segments, rundownIds, {})
	useSubscription(CorelibPubSub.parts, rundownIds, null)
	useSubscription(MeteorPubSub.uiParts, playlist?._id ?? null)
	useSubscription(MeteorPubSub.uiPartInstances, playlist?.activationId ?? null)
	useSubscriptions(
		MeteorPubSub.uiShowStyleBase,
		showStyleBaseIds.map((id) => [id])
	)
	useSubscription(CorelibPubSub.showStyleVariants, null, showStyleVariantIds)
	useSubscription(MeteorPubSub.rundownLayouts, showStyleBaseIds)

	const { currentPartInstance, nextPartInstance } = useTracker(
		() => {
			const playlist = RundownPlaylists.findOne(props.playlistId, {
				fields: {
					_id: 1,
					currentPartInfo: 1,
					nextPartInfo: 1,
					previousPartInfo: 1,
				},
			}) as Pick<DBRundownPlaylist, '_id' | 'currentPartInfo' | 'nextPartInfo' | 'previousPartInfo'> | undefined

			if (playlist) {
				return RundownPlaylistClientUtil.getSelectedPartInstances(playlist)
			} else {
				return {
					currentPartInstance: undefined,
					nextPartInstance: undefined,
					previousPartInstance: undefined,
				}
			}
		},
		[props.playlistId],
		{
			currentPartInstance: undefined,
			nextPartInstance: undefined,
			previousPartInstance: undefined,
		}
	)

	useSubscriptions(CorelibPubSub.pieceInstances, [
		currentPartInstance && [[currentPartInstance.rundownId], [currentPartInstance._id], {}],
		nextPartInstance && [[nextPartInstance.rundownId], [nextPartInstance._id], {}],
	])
}

function DirectorScreenWithSubscription(props: DirectorScreenProps & DirectorScreenTrackedProps): JSX.Element {
	useDirectorScreenSubscriptions(props)

	return <DirectorScreenRender {...props} />
}

function DirectorScreenRender({
	playlist,
	segments,
	currentShowStyleBaseId,
	currentShowStyleBase,
	nextShowStyleBaseId,
	playlistId,
	currentPartInstance,
	currentSegment,
	nextPartInstance,
	nextSegment,
	rundownIds,
}: Readonly<DirectorScreenProps & DirectorScreenTrackedProps>) {
	useSetDocumentClass('dark', 'xdark')
	const { t } = useTranslation()

	useTiming()

	// Compute current and next clip player ids (for pieces with AB sessions)
	const currentClipPlayer: string | undefined = useTracker(() => {
		return findClipPlayer(playlist, currentShowStyleBase, currentPartInstance, PieceInstances)
	}, [currentPartInstance?.instance._id, currentShowStyleBase?._id, playlist?.assignedAbSessions])

	const nextShowStyleBase = UIShowStyleBases.findOne(nextShowStyleBaseId)
	const nextClipPlayer: string | undefined = useTracker(() => {
		return findClipPlayer(playlist, nextShowStyleBase, nextPartInstance, PieceInstances)
	}, [nextPartInstance?.instance._id, nextShowStyleBaseId, playlist?.assignedAbSessions])

	if (playlist && playlistId && segments) {
		const expectedStart = PlaylistTiming.getExpectedStart(playlist.timing) || 0

		// Show countdown if it is the first segment and the current part is untimed:
		const currentSegmentIsFirst = currentSegment?._rank === 0
		const isFirstPieceAndNoDuration =
			(currentSegmentIsFirst && currentPartInstance?.instance.part.untimed) ||
			(currentSegment === undefined && nextPartInstance?.instance.part.untimed)

		return (
			<div className="director-screen">
				<DirectorScreenTop playlist={playlist} />
				<div className="director-screen__body">
					{
						// Current Part:
					}
					<div className="director-screen__body__part">
						{!isFirstPieceAndNoDuration ? (
							<>
								<div
									className={ClassNames('director-screen__body__segment-name', {
										live: currentSegment !== undefined,
									})}
								>
									<AdjustLabelFit
										label={currentSegment?.name || ''}
										width={'80vw'}
										fontFamily="Roboto Flex"
										fontSize="0.9em"
										minFontWidth={70}
										defaultWidth={100}
										defaultOpticalSize={100}
										useLetterSpacing={false}
										hardCutText={true}
									/>
									{playlist.currentPartInfo?.partInstanceId ? (
										<span className="director-screen__body__segment__countdown">
											<CurrentPartOrSegmentRemaining
												currentPartInstanceId={playlist.currentPartInfo?.partInstanceId || null}
												heavyClassName="overtime"
												preferSegmentTime={true}
											/>
										</span>
									) : null}
								</div>

								{currentPartInstance && currentShowStyleBaseId && (
									<>
										<div className="director-screen__body__part__piece-icon">
											<PieceIconContainer
												partInstanceId={currentPartInstance.instance._id}
												showStyleBaseId={currentShowStyleBaseId}
												rundownIds={rundownIds}
												playlistActivationId={playlist?.activationId}
											/>
										</div>
										<div className="director-screen__body__part__piece-content">
											<div className="director-screen__body__part__piece-name">
												<PieceNameContainer
													partName={currentPartInstance.instance.part.title}
													partInstanceId={currentPartInstance.instance._id}
													showStyleBaseId={currentShowStyleBaseId}
													rundownIds={rundownIds}
													playlistActivationId={playlist?.activationId}
													autowidth={{
														label: '',
														width: '90vw',
														fontFamily: 'Roboto Flex',
														fontSize: '1.5em',
														minFontWidth: 55,
														defaultWidth: 100,
														useLetterSpacing: false,
														defaultOpticalSize: 100,
													}}
												/>
												{currentClipPlayer ? <ClipPlayerIcon clipPlayer={currentClipPlayer} /> : null}
											</div>
											<PartCountdownRow
												playlist={playlist}
												partInstance={currentPartInstance}
												showStyleBaseId={currentShowStyleBaseId}
												rundownIds={rundownIds}
											/>
										</div>
									</>
								)}
							</>
						) : expectedStart ? (
							<div className="director-screen__body__part__timeto-content">
								<div className="director-screen__body__part__timeto-countdown">
									<Timediff time={expectedStart - getCurrentTime()} />
								</div>
								<div className="director-screen__body__part__timeto-name">{t('Time to planned start')}</div>
							</div>
						) : null}
					</div>
					{
						// Next Part:
					}
					<div className="director-screen__body__part director-screen__body__part--next-part">
						<div
							className={ClassNames('director-screen__body__segment-name', {
								next: nextSegment !== undefined && nextSegment?._id !== currentSegment?._id,
								notext: nextSegment === undefined || nextSegment?._id === currentSegment?._id,
							})}
						>
							{nextSegment?._id === currentSegment?._id ? undefined : (
								<AdjustLabelFit
									label={nextSegment?.name || ''}
									width={'80vw'}
									fontFamily="Roboto Flex"
									fontSize="0.9em"
									minFontWidth={70}
									defaultWidth={90}
									defaultOpticalSize={100}
									useLetterSpacing={false}
									hardCutText={true}
								/>
							)}
						</div>
						{nextPartInstance && nextShowStyleBaseId ? (
							<>
								{currentPartInstance?.instance.part.autoNext ? (
									<span
										className={ClassNames('director-screen__body__part__auto-icon', {
											'director-screen__body__part__auto-icon--notext':
												nextSegment === undefined || nextSegment?._id === currentSegment?._id,
										})}
									>
										{t('Auto')}
									</span>
								) : (
									<span
										className={ClassNames('director-screen__body__part__next-icon', {
											'director-screen__body__part__next-icon--notext':
												nextSegment === undefined || nextSegment?._id === currentSegment?._id,
										})}
									>
										{t('Next')}
									</span>
								)}
								<div className="director-screen__body__part__piece-icon">
									<PieceIconContainer
										partInstanceId={nextPartInstance.instance._id}
										showStyleBaseId={nextShowStyleBaseId}
										rundownIds={rundownIds}
										playlistActivationId={playlist?.activationId}
									/>
								</div>
								<div className="director-screen__body__part__piece-content">
									<div className="director-screen__body__part__piece-name">
										{nextPartInstance && nextShowStyleBaseId && nextPartInstance.instance.part.title ? (
											<PieceNameContainer
												partName={nextPartInstance.instance.part.title}
												partInstanceId={nextPartInstance.instance._id}
												showStyleBaseId={nextShowStyleBaseId}
												rundownIds={rundownIds}
												playlistActivationId={playlist?.activationId}
												autowidth={{
													label: '',
													width: '90vw',
													fontFamily: 'Roboto Flex',
													fontSize: '1.5em',
													minFontWidth: 55,
													defaultWidth: 100,
													useLetterSpacing: false,
													defaultOpticalSize: 100,
												}}
											/>
										) : (
											'_'
										)}
										{nextClipPlayer ? <ClipPlayerIcon clipPlayer={nextClipPlayer} /> : null}
									</div>
								</div>
							</>
						) : null}
					</div>
				</div>
				<RundownStatusBar playlist={playlist} className="director-screen__bottom-bar" showPlaylistName={false} />
			</div>
		)
	}
	return null
}

/**
 * This component renders the Director screen for a given playlist
 */
export const DirectorScreen = withTracker<DirectorScreenProps, {}, DirectorScreenTrackedProps>(
	getDirectorScreenReactive
)(DirectorScreenWithSubscription)
