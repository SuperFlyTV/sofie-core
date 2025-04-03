import { Meteor } from 'meteor/meteor'
import React, { useContext } from 'react'
import { parse as queryStringParse } from 'query-string'
// @ts-expect-error No types available
import * as VelocityReact from 'velocity-react'
import {
	Translated,
	translateWithTracker,
	useSubscriptionIfEnabled,
	useSubscriptionIfEnabledReadyOnce,
	useSubscriptions,
	useTracker,
} from '../lib/ReactMeteorData/react-meteor-data'
import { VTContent, TSR, NoteSeverity, ISourceLayer } from '@sofie-automation/blueprints-integration'
import { Spinner } from '../lib/Spinner'
import ClassNames from 'classnames'
import * as _ from 'underscore'
import * as i18next from 'i18next'
import { Route, Prompt } from 'react-router-dom'
import { DBRundownPlaylist, QuickLoopMarker } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { DBRundown, Rundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import { DBSegment, SegmentOrphanedReason } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { StudioRouteSet } from '@sofie-automation/corelib/dist/dataModel/Studio'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { RundownTimingProvider } from './RundownView/RundownTiming/RundownTimingProvider'
import { SegmentTimelineContainer, PieceUi, PartUi, SegmentUi } from './SegmentTimeline/SegmentTimelineContainer'
import { SegmentContextMenu } from './SegmentTimeline/SegmentContextMenu'
import { Shelf, ShelfTabs } from './Shelf/Shelf'
import { unprotectString, protectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import { getCurrentTime } from '../lib/systemTime'
import { RundownUtils } from '../lib/rundown'
import { ErrorBoundary } from '../lib/ErrorBoundary'
import { ModalDialog, doModalDialog, isModalShowing } from '../lib/ModalDialog'
import { ClientAPI } from '@sofie-automation/meteor-lib/dist/api/client'
import {
	scrollToPosition,
	scrollToSegment,
	maintainFocusOnPartInstance,
	scrollToPartInstance,
	getHeaderHeight,
} from '../lib/viewPort'
import { AfterBroadcastForm } from './AfterBroadcastForm'
import { RundownRightHandControls } from './RundownView/RundownRightHandControls'
import { SourceLayers } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { PeripheralDevicesAPI, callPeripheralDeviceAction } from '../lib/clientAPI'
import {
	RONotificationEvent,
	onRONotificationClick as rundownNotificationHandler,
	RundownNotifier,
} from './RundownView/RundownNotifier'
import { NotificationCenterPanel } from '../lib/notifications/NotificationCenterPanel'
import { NotificationCenter, NoticeLevel, Notification } from '../lib/notifications/notifications'
import { SupportPopUp } from './SupportPopUp'
import { KeyboardFocusIndicator } from '../lib/KeyboardFocusIndicator'
import { PeripheralDevice, PeripheralDeviceType } from '@sofie-automation/corelib/dist/dataModel/PeripheralDevice'
import { doUserAction, UserAction } from '../lib/clientUserAction'
import { hashSingleUseToken } from '../lib/lib'
import { ClipTrimDialog } from './ClipTrimPanel/ClipTrimDialog'
import { MeteorPubSub } from '@sofie-automation/meteor-lib/dist/api/pubsub'
import { meteorSubscribe } from '../lib/meteorApi'
import {
	RundownLayoutType,
	RundownLayoutBase,
	RundownViewLayout,
	RundownLayoutShelfBase,
	RundownLayoutRundownHeader,
	RundownLayoutFilterBase,
} from '@sofie-automation/meteor-lib/dist/collections/RundownLayouts'
import { VirtualElement } from '../lib/VirtualElement'
import { SEGMENT_TIMELINE_ELEMENT_ID } from './SegmentTimeline/SegmentTimeline'
import { Bucket } from '@sofie-automation/corelib/dist/dataModel/Bucket'
import { isEventInInputField } from '../lib/lib'
import { OffsetPosition } from '../utils/positions'
import { MeteorCall } from '../lib/meteorApi'
import { Settings } from '../lib/Settings'
import { PointerLockCursor } from '../lib/PointerLockCursor'
import { documentTitle } from '../lib/DocumentTitleProvider'
import { PartInstance } from '@sofie-automation/meteor-lib/dist/collections/PartInstances'
import { RundownDividerHeader } from './RundownView/RundownDividerHeader'
import { PlaylistLoopingHeader } from './RundownView/PlaylistLoopingHeader'
import { memoizedIsolatedAutorun } from '../lib/memoizedIsolatedAutorun'
import RundownViewEventBus, {
	MiniShelfQueueAdLibEvent,
	RundownViewEvents,
} from '@sofie-automation/meteor-lib/dist/triggers/RundownViewEventBus'
import StudioContext from './RundownView/StudioContext'
import { RundownLayoutsAPI } from '../lib/rundownLayouts'
import { TriggersHandler } from '../lib/triggers/TriggersHandler'
import { SorensenContext } from '../lib/SorensenContext'
import { PlaylistTiming } from '@sofie-automation/corelib/dist/playout/rundownTiming'
import { DEFAULT_TSR_ACTION_TIMEOUT_TIME } from '@sofie-automation/shared-lib/dist/core/constants'
import { BreakSegment } from './SegmentTimeline/BreakSegment'
import { DBShowStyleVariant } from '@sofie-automation/corelib/dist/dataModel/ShowStyleVariant'
import { SegmentStoryboardContainer } from './SegmentStoryboard/SegmentStoryboardContainer'
import { SegmentViewMode } from './SegmentContainer/SegmentViewModes'
import { UIStateStorage } from '../lib/UIStateStorage'
import { AdLibPieceUi, AdlibSegmentUi, ShelfDisplayOptions } from '../lib/shelf'
import { fetchAndFilter } from './Shelf/AdLibPanel'
import { matchFilter } from './Shelf/AdLibListView'
import { ExecuteActionResult } from '@sofie-automation/corelib/dist/worker/studio'
import { SegmentListContainer } from './SegmentList/SegmentListContainer'
import { getNextMode as getNextSegmentViewMode } from './SegmentContainer/SwitchViewModeButton'
import { IResolvedSegmentProps } from './SegmentContainer/withResolvedSegment'
import { UIParts, UIShowStyleBases, UIStudios } from './Collections'
import { UIStudio } from '@sofie-automation/meteor-lib/dist/api/studios'
import {
	PartId,
	PartInstanceId,
	RundownId,
	RundownLayoutId,
	RundownPlaylistId,
	SegmentId,
	ShowStyleBaseId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import {
	Buckets,
	PeripheralDevices,
	RundownLayouts,
	RundownPlaylists,
	Rundowns,
	ShowStyleVariants,
} from '../collections'
import { UIShowStyleBase } from '@sofie-automation/meteor-lib/dist/api/showStyles'
import { RundownPlaylistCollectionUtil } from '../collections/rundownPlaylistUtil'
import { SegmentAdlibTestingContainer } from './SegmentAdlibTesting/SegmentAdlibTestingContainer'
import { PromiseButton } from '../lib/Components/PromiseButton'
import { logger } from '../lib/logging'
import { isTranslatableMessage, translateMessage } from '@sofie-automation/corelib/dist/TranslatableMessage'
import { i18nTranslator } from './i18n'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { isEntirePlaylistLooping, PieceExtended } from '../lib/RundownResolver'
import { useRundownAndShowStyleIdsForPlaylist } from './util/useRundownAndShowStyleIdsForPlaylist'
import { RundownPlaylistClientUtil } from '../lib/rundownPlaylistUtil'
import { UserPermissionsContext, UserPermissions } from './UserPermissions'
import { MAGIC_TIME_SCALE_FACTOR } from './SegmentTimeline/Constants'
import { SelectedElementProvider, SelectedElementsContext } from './RundownView/SelectedElementsContext'
import { PropertiesPanel } from './UserEditOperations/PropertiesPanel'
import { PreviewPopUpContextProvider } from './PreviewPopUp/PreviewPopUpContext'
import { RundownHeader } from './RundownView/RundownHeader/RundownHeader'

const HIDE_NOTIFICATIONS_AFTER_MOUNT: number | undefined = 5000

const DEFAULT_SEGMENT_VIEW_MODE = SegmentViewMode.Timeline

interface IProps {
	playlistId: RundownPlaylistId
	inActiveRundownView?: boolean
	onlyShelf?: boolean
}

export interface IContextMenuContext {
	segment?: SegmentUi
	part?: PartUi | null
	piece?: PieceExtended | null

	partDocumentOffset?: OffsetPosition
	timeScale?: number
	mousePosition?: OffsetPosition
	partStartsAt?: number
}

interface IState {
	timeScale: number
	contextMenuContext: IContextMenuContext | null
	bottomMargin: string
	followLiveSegments: boolean
	manualSetAsNext: boolean
	isNotificationsCenterOpen: NoticeLevel | undefined
	isSupportPanelOpen: boolean
	isInspectorShelfExpanded: boolean
	isClipTrimmerOpen: boolean
	selectedPiece: AdLibPieceUi | PieceUi | undefined
	shelfLayout: RundownLayoutShelfBase | undefined
	rundownViewLayout: RundownViewLayout | undefined
	rundownHeaderLayout: RundownLayoutRundownHeader | undefined
	miniShelfLayout: RundownLayoutShelfBase | undefined
	currentRundown: Rundown | undefined
	/** Tracks whether the user has resized the shelf to prevent using default shelf settings */
	wasShelfResizedByUser: boolean
	rundownDefaultSegmentViewMode: SegmentViewMode | undefined
	segmentViewModes: Record<string, SegmentViewMode>
	/** MiniShelf data */
	uiSegmentMap: Map<SegmentId, AdlibSegmentUi>
	uiSegments: AdlibSegmentUi[]
	sourceLayerLookup: SourceLayers
	miniShelfFilter: RundownLayoutFilterBase | undefined
}

export type MinimalRundown = Pick<Rundown, '_id' | 'name' | 'timing' | 'showStyleBaseId' | 'endOfRundownIsShowBreak'>

type MatchedSegment = {
	rundown: MinimalRundown
	segments: DBSegment[]
	segmentIdsBeforeEachSegment: Set<SegmentId>[]
}

interface ITrackedProps {
	rundownPlaylistId: RundownPlaylistId
	rundowns: Rundown[]
	playlist?: DBRundownPlaylist
	currentRundown?: Rundown
	matchedSegments: MatchedSegment[]
	rundownsToShowstyles: Map<RundownId, ShowStyleBaseId>
	studio?: UIStudio
	showStyleBase?: UIShowStyleBase
	showStyleVariant?: DBShowStyleVariant
	rundownLayouts?: Array<RundownLayoutBase>
	buckets: Bucket[]
	casparCGPlayoutDevices?: PeripheralDevice[]
	shelfLayoutId?: RundownLayoutId
	rundownViewLayoutId?: RundownLayoutId
	rundownHeaderLayoutId?: RundownLayoutId
	miniShelfLayoutId?: RundownLayoutId
	shelfDisplayOptions: ShelfDisplayOptions
	bucketDisplayFilter: number[] | undefined
	currentPartInstance: PartInstance | undefined
	nextPartInstance: PartInstance | undefined
	currentSegmentPartIds: PartId[]
	nextSegmentPartIds: PartId[]
}
export function RundownView(props: Readonly<IProps>): JSX.Element {
	const userPermissions = useContext(UserPermissionsContext)

	const playlistId = props.playlistId

	const requiredSubsReady: boolean[] = []
	const auxSubsReady: boolean[] = []
	requiredSubsReady.push(useSubscriptionIfEnabled(CorelibPubSub.rundownPlaylists, true, [playlistId], null))
	requiredSubsReady.push(useSubscriptionIfEnabled(CorelibPubSub.rundownsInPlaylists, true, [playlistId]))

	const playlistStudioId = useTracker(() => {
		const playlist = RundownPlaylists.findOne(playlistId, {
			fields: {
				_id: 1,
				studioId: 1,
			},
		}) as Pick<DBRundownPlaylist, '_id' | 'studioId'> | undefined

		return playlist?.studioId
	}, [playlistId])
	// Load only when the studio is known
	requiredSubsReady.push(
		useSubscriptionIfEnabled(MeteorPubSub.uiStudio, !!playlistStudioId, playlistStudioId ?? protectString(''))
	)
	auxSubsReady.push(
		useSubscriptionIfEnabled(CorelibPubSub.buckets, !!playlistStudioId, playlistStudioId ?? protectString(''), null)
	)

	const playlistActivationId = useTracker(() => {
		const playlist = RundownPlaylists.findOne(playlistId, {
			fields: {
				_id: 1,
				activationId: 1,
			},
		}) as Pick<DBRundownPlaylist, '_id' | 'activationId'> | undefined

		return playlist?.activationId
	}, [playlistId])

	const { rundownIds, showStyleBaseIds, showStyleVariantIds } = useRundownAndShowStyleIdsForPlaylist(playlistId)

	requiredSubsReady.push(
		useSubscriptions(
			MeteorPubSub.uiShowStyleBase,
			showStyleBaseIds.map((id) => [id])
		)
	)
	requiredSubsReady.push(
		useSubscriptionIfEnabledReadyOnce(
			CorelibPubSub.showStyleVariants,
			showStyleVariantIds.length > 0,
			null,
			showStyleVariantIds
		)
	)
	auxSubsReady.push(
		useSubscriptionIfEnabled(MeteorPubSub.rundownLayouts, showStyleBaseIds.length > 0, showStyleBaseIds)
	)

	auxSubsReady.push(useSubscriptionIfEnabled(CorelibPubSub.segments, rundownIds.length > 0, rundownIds, {}))
	auxSubsReady.push(useSubscriptionIfEnabled(CorelibPubSub.adLibPieces, rundownIds.length > 0, rundownIds))
	auxSubsReady.push(
		useSubscriptionIfEnabled(CorelibPubSub.rundownBaselineAdLibPieces, rundownIds.length > 0, rundownIds)
	)
	auxSubsReady.push(useSubscriptionIfEnabled(CorelibPubSub.adLibActions, rundownIds.length > 0, rundownIds))
	auxSubsReady.push(
		useSubscriptionIfEnabled(CorelibPubSub.rundownBaselineAdLibActions, rundownIds.length > 0, rundownIds)
	)
	auxSubsReady.push(useSubscriptionIfEnabled(MeteorPubSub.uiParts, rundownIds.length > 0, playlistId))
	auxSubsReady.push(
		useSubscriptionIfEnabled(MeteorPubSub.uiPartInstances, !!playlistActivationId, playlistActivationId ?? null)
	)

	// Load once the playlist is confirmed to exist
	auxSubsReady.push(useSubscriptionIfEnabled(MeteorPubSub.uiSegmentPartNotes, !!playlistStudioId, playlistId))
	auxSubsReady.push(useSubscriptionIfEnabled(CorelibPubSub.uiPieceContentStatuses, !!playlistStudioId, playlistId))

	useTracker(() => {
		const playlist = RundownPlaylists.findOne(playlistId, {
			fields: {
				currentPartInfo: 1,
				nextPartInfo: 1,
				previousPartInfo: 1,
			},
		}) as Pick<DBRundownPlaylist, '_id' | 'currentPartInfo' | 'nextPartInfo' | 'previousPartInfo'> | undefined
		if (playlist) {
			const rundownIds = RundownPlaylistCollectionUtil.getRundownUnorderedIDs(playlist)
			// Use meteorSubscribe so that this subscription doesn't mess with this.subscriptionsReady()
			// it's run in useTracker, so the subscription will be stopped along with the autorun,
			// so we don't have to manually clean up after ourselves.
			meteorSubscribe(
				CorelibPubSub.pieceInstances,
				rundownIds,
				[
					playlist.currentPartInfo?.partInstanceId,
					playlist.nextPartInfo?.partInstanceId,
					playlist.previousPartInfo?.partInstanceId,
				].filter((p): p is PartInstanceId => p !== null),
				{}
			)
		}
	}, [playlistId])

	auxSubsReady.push(
		useSubscriptionIfEnabled(
			MeteorPubSub.notificationsForRundownPlaylist,
			!!playlistId && !!playlistStudioId,
			playlistStudioId || protectString(''),
			playlistId
		)
	)

	useTracker(() => {
		const rundowns = Rundowns.find(
			{ playlistId },
			{
				fields: {
					_id: 1,
					studioId: 1,
				},
			}
		).fetch() as Pick<DBRundown, '_id' | 'studioId'>[]

		for (const rundown of rundowns) {
			meteorSubscribe(MeteorPubSub.notificationsForRundown, rundown.studioId, rundown._id)
		}
	}, [playlistId])

	const subsReady = requiredSubsReady.findIndex((ready) => !ready) === -1
	return <RundownViewContent {...props} subsReady={subsReady} userPermissions={userPermissions} />
}

interface IPropsWithReady extends IProps {
	subsReady: boolean
	userPermissions: Readonly<UserPermissions>
}

interface IRundownViewContentSnapshot {
	elementId: string
	top: number
}

const RundownViewContent = translateWithTracker<IPropsWithReady, IState, ITrackedProps>((props: Translated<IProps>) => {
	const playlistId = props.playlistId

	const playlist = RundownPlaylists.findOne(playlistId)
	let rundowns: Rundown[] = []
	let studio: UIStudio | undefined
	let currentPartInstance: PartInstance | undefined
	let nextPartInstance: PartInstance | undefined
	let currentRundown: Rundown | undefined = undefined
	if (playlist) {
		studio = UIStudios.findOne({ _id: playlist.studioId })
		rundowns = memoizedIsolatedAutorun(
			(_playlistId: RundownPlaylistId) => RundownPlaylistCollectionUtil.getRundownsOrdered(playlist),
			'playlist.getRundowns',
			playlistId
		)
		;({ currentPartInstance, nextPartInstance } = RundownPlaylistClientUtil.getSelectedPartInstances(playlist))
		const somePartInstance = currentPartInstance || nextPartInstance
		if (somePartInstance) {
			currentRundown = rundowns.find((rundown) => rundown._id === somePartInstance?.rundownId)
		}
	}

	const params = queryStringParse(location.search)

	const displayOptions = ((params['display'] as string) || Settings.defaultShelfDisplayOptions).split(',')
	const bucketDisplayFilter = !(params['buckets'] as string)
		? undefined
		: (params['buckets'] as string).split(',').map((v) => parseInt(v))

	const showStyleBaseId = currentRundown?.showStyleBaseId ?? rundowns[0]?.showStyleBaseId
	const showStyleBase = showStyleBaseId ? UIShowStyleBases.findOne(showStyleBaseId) : undefined
	const showStyleVariantId = currentRundown?.showStyleVariantId ?? rundowns[0]?.showStyleVariantId
	const showStyleVariant = showStyleVariantId ? ShowStyleVariants.findOne(showStyleVariantId) : undefined

	const rundownsToShowStyles: Map<RundownId, ShowStyleBaseId> = new Map()
	for (const rundown of rundowns) {
		rundownsToShowStyles.set(rundown._id, rundown.showStyleBaseId)
	}

	const rundownLayouts = RundownLayouts.find({ showStyleBaseId }).fetch()

	// let rundownDurations = calculateDurations(rundown, parts)
	return {
		rundownPlaylistId: playlistId,
		rundowns,
		currentRundown,
		matchedSegments: playlist
			? RundownPlaylistClientUtil.getRundownsAndSegments(playlist, {}).map((input, rundownIndex, rundownArray) => ({
					...input,
					segmentIdsBeforeEachSegment: input.segments.map(
						(_segment, segmentIndex, segmentArray) =>
							new Set<SegmentId>([
								..._.flatten(
									rundownArray.slice(0, rundownIndex).map((match) => match.segments.map((segment) => segment._id))
								),
								...segmentArray.slice(0, segmentIndex).map((segment) => segment._id),
							])
					),
			  }))
			: [],
		rundownsToShowstyles: rundownsToShowStyles,
		playlist,
		studio: studio,
		showStyleBase,
		showStyleVariant,
		rundownLayouts,
		buckets:
			(playlist &&
				Buckets.find(
					{
						studioId: playlist.studioId,
					},
					{
						sort: {
							_rank: 1,
						},
					}
				).fetch()) ||
			[],
		casparCGPlayoutDevices:
			(studio &&
				PeripheralDevices.find({
					parentDeviceId: {
						$in: PeripheralDevices.find({
							'studioAndConfigId.studioId': studio._id,
						})
							.fetch()
							.map((i) => i._id),
					},
					type: PeripheralDeviceType.PLAYOUT,
					subType: TSR.DeviceType.CASPARCG,
				}).fetch()) ||
			undefined,
		shelfLayoutId: protectString((params['layout'] as string) || (params['shelfLayout'] as string) || ''), // 'layout' kept for backwards compatibility
		rundownViewLayoutId: protectString((params['rundownViewLayout'] as string) || ''),
		rundownHeaderLayoutId: protectString((params['rundownHeaderLayout'] as string) || ''),
		miniShelfLayoutId: protectString((params['miniShelfLayout'] as string) || ''),
		shelfDisplayOptions: {
			// If buckets are enabled in Studiosettings, it can also be filtered in the URLs display options.
			enableBuckets: !!studio?.settings.enableBuckets && displayOptions.includes('buckets'),
			enableLayout: displayOptions.includes('layout') || displayOptions.includes('shelfLayout'),
			enableInspector: displayOptions.includes('inspector'),
		},
		bucketDisplayFilter,
		currentPartInstance,
		nextPartInstance,
		currentSegmentPartIds: currentPartInstance
			? UIParts.find(
					{
						segmentId: currentPartInstance?.part.segmentId,
					},
					{
						fields: {
							_id: 1,
						},
					}
			  ).map((part) => part._id)
			: [],
		nextSegmentPartIds: nextPartInstance
			? UIParts.find(
					{
						segmentId: nextPartInstance?.part.segmentId,
					},
					{
						fields: {
							_id: 1,
						},
					}
			  ).map((part) => part._id)
			: [],
	}
})(
	class RundownViewContent extends React.Component<Translated<IPropsWithReady & ITrackedProps>, IState> {
		private _hideNotificationsAfterMount: number | undefined
		/** MiniShelf data */
		private keyboardQueuedPiece: AdLibPieceUi | undefined = undefined
		private keyboardQueuedPartInstanceId: PartInstanceId | undefined = undefined
		private shouldKeyboardRequeue = false
		private isKeyboardQueuePending = false

		constructor(props: Translated<IPropsWithReady & ITrackedProps>) {
			super(props)

			const shelfLayout = this.props.rundownLayouts?.find((layout) => layout._id === this.props.shelfLayoutId)
			let isInspectorShelfExpanded = false

			if (shelfLayout && RundownLayoutsAPI.isLayoutForShelf(shelfLayout)) {
				isInspectorShelfExpanded = shelfLayout.openByDefault
			}

			this.state = {
				timeScale: MAGIC_TIME_SCALE_FACTOR * Settings.defaultTimeScale,
				contextMenuContext: null,
				bottomMargin: '',
				followLiveSegments: true,
				manualSetAsNext: false,
				isNotificationsCenterOpen: undefined,
				isSupportPanelOpen: false,
				isInspectorShelfExpanded,
				isClipTrimmerOpen: false,
				selectedPiece: undefined,
				shelfLayout: undefined,
				rundownViewLayout: undefined,
				rundownHeaderLayout: undefined,
				miniShelfLayout: undefined,
				currentRundown: undefined,
				wasShelfResizedByUser: false,
				segmentViewModes: this.props.playlist?._id
					? UIStateStorage.getItemRecord(`rundownView.${this.props.playlist._id}`, `segmentViewModes`, {})
					: {},
				rundownDefaultSegmentViewMode: this.props.playlist?._id
					? (UIStateStorage.getItemString(
							`rundownView.${this.props.playlist._id}`,
							`rundownDefaultSegmentViewMode`,
							''
					  ) as SegmentViewMode) || undefined
					: undefined,
				uiSegmentMap: new Map(),
				uiSegments: [],
				sourceLayerLookup: {},
				miniShelfFilter: undefined,
			}
		}

		static getDerivedStateFromProps(props: Translated<IProps & ITrackedProps>): Partial<IState> {
			let selectedShelfLayout: RundownLayoutBase | undefined = undefined
			let selectedViewLayout: RundownViewLayout | undefined = undefined
			let selectedHeaderLayout: RundownLayoutBase | undefined = undefined
			let selectedMiniShelfLayout: RundownLayoutBase | undefined = undefined

			if (props.rundownLayouts) {
				// first try to use the one selected by the user
				if (props.shelfLayoutId) {
					selectedShelfLayout = props.rundownLayouts.find((i) => i._id === props.shelfLayoutId)
				}

				if (props.rundownViewLayoutId) {
					selectedViewLayout = props.rundownLayouts.find(
						(i) => i._id === props.rundownViewLayoutId && RundownLayoutsAPI.isRundownViewLayout(i)
					) as RundownViewLayout
				}

				if (props.rundownHeaderLayoutId) {
					selectedHeaderLayout = props.rundownLayouts.find((i) => i._id === props.rundownHeaderLayoutId)
				}

				if (props.miniShelfLayoutId) {
					selectedMiniShelfLayout = props.rundownLayouts.find((i) => i._id === props.miniShelfLayoutId)
				}

				// if couldn't find based on id, try matching part of the name
				if (props.shelfLayoutId && !selectedShelfLayout) {
					selectedShelfLayout = props.rundownLayouts.find(
						(i) => i.name.indexOf(unprotectString(props.shelfLayoutId!)) >= 0
					)
				}

				if (props.rundownViewLayoutId && !selectedViewLayout) {
					selectedViewLayout = props.rundownLayouts.find(
						(i) =>
							i.name.indexOf(unprotectString(props.rundownViewLayoutId!)) >= 0 &&
							RundownLayoutsAPI.isRundownViewLayout(i)
					) as RundownViewLayout
				}

				if (props.rundownHeaderLayoutId && !selectedHeaderLayout) {
					selectedHeaderLayout = props.rundownLayouts.find(
						(i) => i.name.indexOf(unprotectString(props.rundownHeaderLayoutId!)) >= 0
					)
				}

				if (props.miniShelfLayoutId && !selectedMiniShelfLayout) {
					selectedMiniShelfLayout = props.rundownLayouts.find(
						(i) => i.name.indexOf(unprotectString(props.miniShelfLayoutId!)) >= 0
					)
				}

				// Try to load defaults from rundown view layouts
				if (selectedViewLayout && RundownLayoutsAPI.isLayoutForRundownView(selectedViewLayout)) {
					const rundownLayout = selectedViewLayout
					if (!selectedShelfLayout && rundownLayout.shelfLayout) {
						selectedShelfLayout = props.rundownLayouts.find((i) => i._id === rundownLayout.shelfLayout)
					}

					if (!selectedMiniShelfLayout && rundownLayout.miniShelfLayout) {
						selectedMiniShelfLayout = props.rundownLayouts.find((i) => i._id === rundownLayout.miniShelfLayout)
					}

					if (!selectedHeaderLayout && rundownLayout.rundownHeaderLayout) {
						selectedHeaderLayout = props.rundownLayouts.find((i) => i._id === rundownLayout.rundownHeaderLayout)
					}
				}

				// if not, try the first RUNDOWN_LAYOUT available
				if (!selectedShelfLayout) {
					selectedShelfLayout = props.rundownLayouts.find((i) => i.type === RundownLayoutType.RUNDOWN_LAYOUT)
				}

				// if still not found, use the first one - this is a fallback functionality reserved for Shelf layouts
				// To be removed once Rundown View Layouts/Shelf layouts are refactored
				if (!selectedShelfLayout) {
					selectedShelfLayout = props.rundownLayouts.find((i) => RundownLayoutsAPI.isLayoutForShelf(i))
				}

				if (!selectedViewLayout) {
					selectedViewLayout = props.rundownLayouts.find(
						(layout) => RundownLayoutsAPI.isLayoutForRundownView(layout) && RundownLayoutsAPI.isDefaultLayout(layout)
					) as RundownViewLayout
				}

				if (!selectedHeaderLayout) {
					selectedHeaderLayout = props.rundownLayouts.find(
						(layout) => RundownLayoutsAPI.isLayoutForRundownHeader(layout) && RundownLayoutsAPI.isDefaultLayout(layout)
					)
				}

				if (!selectedMiniShelfLayout) {
					selectedMiniShelfLayout = props.rundownLayouts.find(
						(layout) => RundownLayoutsAPI.isLayoutForMiniShelf(layout) && RundownLayoutsAPI.isDefaultLayout(layout)
					)
				}
			}

			let currentRundown: Rundown | undefined = undefined
			if (props.playlist && props.rundowns.length > 0 && (props.currentPartInstance || props.nextPartInstance)) {
				currentRundown = props.rundowns.find((rundown) => rundown._id === props.currentPartInstance?.rundownId)
				if (!currentRundown) {
					currentRundown = props.rundowns.find((rundown) => rundown._id === props.nextPartInstance?.rundownId)
				}
			}

			const filteredUiSegmentMap: Map<SegmentId, AdlibSegmentUi> = new Map()
			const filteredUiSegments: AdlibSegmentUi[] = []
			let resultSourceLayerLookup: SourceLayers = {}
			let miniShelfFilter: RundownLayoutFilterBase | undefined
			if (props.playlist && props.showStyleBase && props.studio) {
				const possibleMiniShelfFilter =
					selectedMiniShelfLayout && RundownLayoutsAPI.isLayoutForMiniShelf(selectedMiniShelfLayout)
						? selectedMiniShelfLayout.filters[0]
						: undefined // Only allow 1 filter for now

				// Check type of filter
				if (possibleMiniShelfFilter && RundownLayoutsAPI.isFilter(possibleMiniShelfFilter)) {
					miniShelfFilter = possibleMiniShelfFilter
				}
				const { uiSegmentMap, uiSegments, sourceLayerLookup } = fetchAndFilter({
					playlist: props.playlist,
					showStyleBase: props.showStyleBase,
					includeGlobalAdLibs: false,
					filter: miniShelfFilter,
				})
				resultSourceLayerLookup = sourceLayerLookup
				const liveSegment = uiSegments.find((i) => i.isLive === true)

				for (const segment of uiSegmentMap.values()) {
					const uniquenessIds = new Set<string>()
					const filteredPieces = segment.pieces.filter((piece) =>
						matchFilter(
							piece,
							props.showStyleBase!,
							liveSegment,
							miniShelfFilter
								? {
										...miniShelfFilter,
										currentSegment: !(segment.isHidden && segment.showShelf) && miniShelfFilter.currentSegment,
								  }
								: undefined,
							undefined,
							uniquenessIds
						)
					)
					const filteredSegment = {
						...segment,
						pieces: filteredPieces,
					}

					filteredUiSegmentMap.set(segment._id, filteredSegment)
					filteredUiSegments.push(filteredSegment)
				}
			}

			return {
				shelfLayout:
					selectedShelfLayout && RundownLayoutsAPI.isLayoutForShelf(selectedShelfLayout)
						? selectedShelfLayout
						: undefined,
				rundownViewLayout:
					selectedViewLayout && RundownLayoutsAPI.isLayoutForRundownView(selectedViewLayout)
						? selectedViewLayout
						: undefined,
				rundownHeaderLayout:
					selectedHeaderLayout && RundownLayoutsAPI.isLayoutForRundownHeader(selectedHeaderLayout)
						? selectedHeaderLayout
						: undefined,
				miniShelfLayout:
					selectedMiniShelfLayout && RundownLayoutsAPI.isLayoutForMiniShelf(selectedMiniShelfLayout)
						? selectedMiniShelfLayout
						: undefined,
				currentRundown,
				uiSegmentMap: filteredUiSegmentMap,
				uiSegments: filteredUiSegments,
				sourceLayerLookup: resultSourceLayerLookup,
				miniShelfFilter,
			}
		}

		componentDidMount(): void {
			document.body.classList.add('dark', 'vertical-overflow-only')
			document.body.setAttribute('data-bs-theme', 'dark')

			rundownNotificationHandler.set(this.onRONotificationClick)

			RundownViewEventBus.on(RundownViewEvents.GO_TO_LIVE_SEGMENT, this.onGoToLiveSegment)
			RundownViewEventBus.on(RundownViewEvents.GO_TO_TOP, this.onGoToTop)
			RundownViewEventBus.on(RundownViewEvents.MINI_SHELF_QUEUE_ADLIB, this.eventQueueMiniShelfAdLib)

			if (this.props.playlist) {
				documentTitle.set(this.props.playlist.name)
			}

			const themeColor = document.head.querySelector('meta[name="theme-color"]')
			if (themeColor) {
				themeColor.setAttribute('data-content', themeColor.getAttribute('content') || '')
				themeColor.setAttribute('content', '#000000')
			}

			// Snooze notifications for a period after mounting the RundownView
			if (HIDE_NOTIFICATIONS_AFTER_MOUNT) {
				NotificationCenter.isOpen = true
				this._hideNotificationsAfterMount = Meteor.setTimeout(() => {
					NotificationCenter.isOpen = this.state.isNotificationsCenterOpen !== undefined
					this._hideNotificationsAfterMount = undefined
				}, HIDE_NOTIFICATIONS_AFTER_MOUNT)
			}
			NotificationCenter.isConcentrationMode = true
		}

		componentDidUpdate(
			prevProps: IPropsWithReady & ITrackedProps,
			prevState: IState,
			snapshot: IRundownViewContentSnapshot | null
		) {
			this.handleFollowLiveSegment(prevProps, snapshot)

			this.handleBeforeUnloadEventAttach(prevProps, prevState)

			if (
				this.props.playlist &&
				(prevProps.playlist === undefined || this.props.playlist._id !== prevProps.playlist._id)
			) {
				this.setState({
					segmentViewModes: UIStateStorage.getItemRecord(
						`rundownView.${this.props.playlist._id}`,
						`segmentViewModes`,
						{}
					),
					rundownDefaultSegmentViewMode:
						(UIStateStorage.getItemString(
							`rundownView.${this.props.playlist._id}`,
							`rundownDefaultSegmentViewMode`,
							''
						) as SegmentViewMode) || undefined,
				})
			}

			if (this.props.playlist?.name !== prevProps.playlist?.name) {
				if (this.props.playlist?.name) {
					documentTitle.set(this.props.playlist.name)
				} else {
					documentTitle.set(null)
				}
			}

			this.handleMiniShelfRequeue(prevProps)
		}

		public getSnapshotBeforeUpdate(): IRundownViewContentSnapshot | null {
			if (!this.state.followLiveSegments) return null

			let focalElement: HTMLElement | null = null

			const liveSegmentEl = document.querySelector<HTMLElement>('.segment-timeline.live')
			if (liveSegmentEl) focalElement = liveSegmentEl

			if (!focalElement) {
				const nextSegmentEl = document.querySelector<HTMLElement>('.segment-timeline.next')
				if (nextSegmentEl) focalElement = nextSegmentEl
			}

			if (!focalElement) return null

			const { top } = focalElement.getBoundingClientRect()

			return {
				elementId: focalElement.id,
				top: top,
			}
		}

		private handleFollowLiveSegment(
			prevProps: IPropsWithReady & ITrackedProps,
			snapshot: IRundownViewContentSnapshot | null
		) {
			if (this.props.onlyShelf) return

			if (
				this.props.playlist &&
				prevProps.playlist &&
				prevProps.playlist.currentPartInfo?.partInstanceId !== this.props.playlist.currentPartInfo?.partInstanceId &&
				prevProps.playlist.nextPartInfo?.manuallySelected
			) {
				// reset followLiveSegments after a manual set as next
				this.setState({
					manualSetAsNext: false,
					followLiveSegments: true,
				})
				if (this.props.playlist.currentPartInfo) {
					scrollToPartInstance(this.props.playlist.currentPartInfo?.partInstanceId, true).catch((error) => {
						if (!error.toString().match(/another scroll/)) console.warn(error)
					})
				}
			} else if (
				this.props.playlist &&
				prevProps.playlist &&
				prevProps.playlist.activationId &&
				!this.props.playlist.activationId
			) {
				// reset followLiveSegments after deactivating a rundown
				this.setState({
					followLiveSegments: true,
				})
			} else if (
				this.props.playlist &&
				prevProps.playlist &&
				!prevProps.playlist.activationId &&
				this.props.playlist.activationId &&
				this.props.playlist.nextPartInfo
			) {
				// scroll to next after activation
				scrollToPartInstance(this.props.playlist.nextPartInfo.partInstanceId).catch((error) => {
					if (!error.toString().match(/another scroll/)) console.warn(error)
				})
			} else if (
				// after take
				this.props.playlist &&
				prevProps.playlist &&
				this.props.playlist.currentPartInfo?.partInstanceId !== prevProps.playlist.currentPartInfo?.partInstanceId &&
				this.props.playlist.currentPartInfo &&
				this.state.followLiveSegments
			) {
				scrollToPartInstance(this.props.playlist.currentPartInfo.partInstanceId, true).catch((error) => {
					if (!error.toString().match(/another scroll/)) console.warn(error)
				})
			} else if (
				this.props.playlist &&
				prevProps.playlist &&
				this.props.playlist.nextPartInfo?.partInstanceId !== prevProps.playlist.nextPartInfo?.partInstanceId &&
				this.props.playlist.currentPartInfo?.partInstanceId === prevProps.playlist.currentPartInfo?.partInstanceId &&
				this.props.playlist.nextPartInfo &&
				this.props.playlist.nextPartInfo.manuallySelected
			) {
				scrollToPartInstance(this.props.playlist.nextPartInfo.partInstanceId, false).catch((error) => {
					if (!error.toString().match(/another scroll/)) console.warn(error)
				})
			} else if (
				// initial Rundown open
				this.props.playlist &&
				this.props.playlist.currentPartInfo &&
				this.props.subsReady &&
				!prevProps.subsReady
			) {
				// allow for some time for the Rundown to render
				maintainFocusOnPartInstance(this.props.playlist.currentPartInfo.partInstanceId, 7000, true, true)
			} else if (
				this.props.playlist &&
				this.props.playlist.currentPartInfo?.partInstanceId === prevProps.playlist?.currentPartInfo?.partInstanceId &&
				this.props.playlist.nextPartInfo?.partInstanceId === prevProps.playlist?.nextPartInfo?.partInstanceId &&
				this.props.matchedSegments !== prevProps.matchedSegments &&
				this.state.followLiveSegments &&
				snapshot
			) {
				// segments changed before the live segment
				const focalElement = document.getElementById(snapshot.elementId)
				if (!focalElement) return
				const { top } = focalElement.getBoundingClientRect()

				const diff = top - snapshot.top
				window.scrollBy({
					top: diff,
					behavior: 'instant',
				})
			}
		}

		private handleBeforeUnloadEventAttach(prevProps: IPropsWithReady & ITrackedProps, _prevState: IState) {
			if (this.props.onlyShelf) return

			if (
				typeof this.props.playlist !== typeof prevProps.playlist ||
				this.props.playlist?._id !== prevProps.playlist?._id ||
				!!this.props.playlist?.activationId !== !!prevProps.playlist?.activationId ||
				this.props.userPermissions.studio !== prevProps.userPermissions.studio
			) {
				if (
					this.props.playlist &&
					this.props.playlist.activationId &&
					this.props.userPermissions.studio &&
					!this.props.userPermissions.developer
				) {
					window.addEventListener('beforeunload', this.onBeforeUnload)
				} else {
					window.removeEventListener('beforeunload', this.onBeforeUnload)
				}
			}
		}

		private handleMiniShelfRequeue(prevProps: IProps & ITrackedProps) {
			if (this.props.currentPartInstance?.segmentId !== prevProps.currentPartInstance?.segmentId) {
				this.keyboardQueuedPiece = undefined
			} else if (this.props.playlist && prevProps.playlist && this.keyboardQueuedPartInstanceId) {
				if (this.hasCurrentPartChanged(prevProps) && this.isCurrentPartKeyboardQueuedPart()) {
					this.keyboardQueuedPartInstanceId = undefined
				} else if (
					!this.isKeyboardQueuePending &&
					!this.hasCurrentPartChanged(prevProps) &&
					this.hasNextPartChanged(prevProps) &&
					this.isNextPartDifferentFromKeyboardQueuedPart()
				) {
					this.shouldKeyboardRequeue = true
					this.keyboardQueuedPartInstanceId = undefined
				}
			}
		}

		private hasCurrentPartChanged(prevProps: IProps & ITrackedProps) {
			return (
				prevProps.playlist!.currentPartInfo?.partInstanceId !== this.props.playlist!.currentPartInfo?.partInstanceId
			)
		}

		private isCurrentPartKeyboardQueuedPart() {
			return this.props.playlist!.currentPartInfo?.partInstanceId === this.keyboardQueuedPartInstanceId
		}

		private hasNextPartChanged(prevProps: IProps & ITrackedProps) {
			return prevProps.playlist!.nextPartInfo?.partInstanceId !== this.props.playlist!.nextPartInfo?.partInstanceId
		}

		private isNextPartDifferentFromKeyboardQueuedPart() {
			return this.props.playlist!.nextPartInfo?.partInstanceId !== this.keyboardQueuedPartInstanceId
		}

		onSelectPiece = (piece: PieceUi) => {
			if (piece) {
				const vtContent = piece.instance.piece.content as VTContent | undefined
				if (
					vtContent &&
					vtContent.editable &&
					(vtContent.editable.editorialDuration !== undefined || vtContent.editable.editorialStart !== undefined)
				) {
					this.setState({
						isClipTrimmerOpen: true,
						selectedPiece: piece,
					})
				} else {
					RundownViewEventBus.emit(RundownViewEvents.SELECT_PIECE, {
						piece,
					})
				}
			}
		}

		componentWillUnmount(): void {
			document.body.classList.remove('dark', 'vertical-overflow-only')
			document.body.removeAttribute('data-bs-theme')
			window.removeEventListener('beforeunload', this.onBeforeUnload)

			documentTitle.set(null)

			const themeColor = document.head.querySelector('meta[name="theme-color"]')
			if (themeColor) {
				themeColor.setAttribute('content', themeColor.getAttribute('data-content') || '#ffffff')
			}

			if (this._hideNotificationsAfterMount) {
				Meteor.clearTimeout(this._hideNotificationsAfterMount)
			}
			NotificationCenter.isConcentrationMode = false

			RundownViewEventBus.off(RundownViewEvents.GO_TO_LIVE_SEGMENT, this.onGoToLiveSegment)
			RundownViewEventBus.off(RundownViewEvents.GO_TO_TOP, this.onGoToTop)
			RundownViewEventBus.off(RundownViewEvents.MINI_SHELF_QUEUE_ADLIB, this.eventQueueMiniShelfAdLib)
		}

		onBeforeUnload = (e: any) => {
			const { t } = this.props

			e.preventDefault()
			e.returnValue = t('This rundown is now active. Are you sure you want to exit this screen?')

			return t('This rundown is now active. Are you sure you want to exit this screen?')
		}

		onRewindSegments = () => {
			RundownViewEventBus.emit(RundownViewEvents.REWIND_SEGMENTS)
		}

		onTimeScaleChange = (timeScaleVal: number) => {
			if (Number.isFinite(timeScaleVal) && timeScaleVal > 0) {
				this.setState({
					timeScale: timeScaleVal,
				})
			}
		}

		onSegmentScroll = () => {
			if (this.state.followLiveSegments && this.props.playlist && this.props.playlist.activationId) {
				this.setState({
					followLiveSegments: false,
				})
			}
		}

		onWheelScrollInner = _.debounce(() => {
			if (this.state.followLiveSegments && this.props.playlist && this.props.playlist.activationId) {
				const liveSegmentComponent = document.querySelector('.segment-timeline.live')
				if (liveSegmentComponent) {
					const offsetPosition = liveSegmentComponent.getBoundingClientRect()
					// if it's closer to the top edge than the headerHeight
					const segmentComponentTooHigh = offsetPosition.top < getHeaderHeight()
					// or if it's closer to the bottom edge than very close to the top
					const segmentComponentTooLow =
						offsetPosition.bottom < window.innerHeight - getHeaderHeight() - 20 - (offsetPosition.height * 3) / 2
					if (segmentComponentTooHigh || segmentComponentTooLow) {
						this.setState({
							followLiveSegments: false,
						})
					}
				}
			}
		}, 250)

		onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
			if (e.deltaX === 0 && e.deltaY !== 0 && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
				this.onWheelScrollInner()
			}
		}

		onGoToTop = () => {
			scrollToPosition(0).catch((error) => {
				if (!error.toString().match(/another scroll/)) console.warn(error)
			})

			window.requestIdleCallback(
				() => {
					this.setState({
						followLiveSegments: true,
					})
				},
				{ timeout: 1000 }
			)
		}

		onGoToLiveSegment = () => {
			if (
				this.props.playlist &&
				this.props.playlist.activationId &&
				!this.props.playlist.currentPartInfo &&
				this.props.playlist.nextPartInfo
			) {
				this.setState({
					followLiveSegments: true,
				})
				scrollToPartInstance(this.props.playlist.nextPartInfo.partInstanceId, true).catch((error) => {
					if (!error.toString().match(/another scroll/)) console.warn(error)
				})
				setTimeout(() => {
					this.setState({
						followLiveSegments: true,
					})
					RundownViewEventBus.emit(RundownViewEvents.REWIND_SEGMENTS)
				}, 2000)
			} else if (this.props.playlist && this.props.playlist.activationId && this.props.playlist.currentPartInfo) {
				this.setState({
					followLiveSegments: true,
				})
				scrollToPartInstance(this.props.playlist.currentPartInfo.partInstanceId, true).catch((error) => {
					if (!error.toString().match(/another scroll/)) console.warn(error)
				})
				setTimeout(() => {
					this.setState({
						followLiveSegments: true,
					})
					RundownViewEventBus.emit(RundownViewEvents.REWIND_SEGMENTS)
				}, 2000)
			} else {
				this.setState({
					followLiveSegments: true,
				})
			}
		}

		eventQueueMiniShelfAdLib = (e: MiniShelfQueueAdLibEvent) => {
			this.queueMiniShelfAdLib(e.context, e.forward)
		}

		onActivate = () => {
			this.onGoToLiveSegment()
		}

		onContextMenu = (contextMenuContext: IContextMenuContext) => {
			this.setState({
				contextMenuContext,
			})
		}

		onSetNext = (part: DBPart | undefined, e: any, offset?: number, take?: boolean) => {
			const { t } = this.props
			if (this.props.userPermissions.studio && part && part._id && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.SET_NEXT,
					(e, ts) => MeteorCall.userAction.setNext(e, ts, playlistId, part._id, offset),
					(err) => {
						this.setState({
							manualSetAsNext: true,
						})
						if (!err && take && this.props.playlist) {
							const playlistId = this.props.playlist._id
							const currentPartInstanceId = this.props.playlist.currentPartInfo?.partInstanceId ?? null
							doUserAction(t, e, UserAction.TAKE, (e, ts) =>
								MeteorCall.userAction.take(e, ts, playlistId, currentPartInstanceId)
							)
						}
					}
				)
			}
		}

		onSetNextSegment = (segmentId: SegmentId, e: any) => {
			const { t } = this.props
			if (this.props.userPermissions.studio && segmentId && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.SET_NEXT,
					(e, ts) => MeteorCall.userAction.setNextSegment(e, ts, playlistId, segmentId),
					(err) => {
						if (err) logger.error(err)
						this.setState({
							manualSetAsNext: true,
						})
					}
				)
			}
		}

		onQueueNextSegment = (segmentId: SegmentId | null, e: any) => {
			const { t } = this.props
			if (this.props.userPermissions.studio && (segmentId || segmentId === null) && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.QUEUE_NEXT_SEGMENT,
					(e, ts) => MeteorCall.userAction.queueNextSegment(e, ts, playlistId, segmentId),
					(err) => {
						if (err) logger.error(err)
						this.setState({
							manualSetAsNext: true,
						})
					}
				)
			}
		}

		onSetQuickLoopStart = (marker: QuickLoopMarker | null, e: any) => {
			const { t } = this.props
			if (this.props.userPermissions.studio && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.SET_QUICK_LOOP_START,
					(e, ts) => MeteorCall.userAction.setQuickLoopStart(e, ts, playlistId, marker),
					(err) => {
						if (err) logger.error(err)
					}
				)
			}
		}

		onSetQuickLoopEnd = (marker: QuickLoopMarker | null, e: any) => {
			const { t } = this.props
			if (this.props.userPermissions.studio && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.SET_QUICK_LOOP_END,
					(e, ts) => MeteorCall.userAction.setQuickLoopEnd(e, ts, playlistId, marker),
					(err) => {
						if (err) logger.error(err)
					}
				)
			}
		}

		onPieceDoubleClick = (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => {
			const { t } = this.props
			if (
				this.props.userPermissions.studio &&
				item &&
				item.instance &&
				this.props.playlist &&
				this.props.playlist.currentPartInfo &&
				this.props.studio?.settings.allowPieceDirectPlay
			) {
				const idToCopy = item.instance.isTemporary ? item.instance.piece._id : item.instance._id
				const playlistId = this.props.playlist._id
				const currentPartInstanceId = this.props.playlist.currentPartInfo.partInstanceId
				doUserAction(t, e, UserAction.TAKE_PIECE, (e, ts) =>
					MeteorCall.userAction.pieceTakeNow(e, ts, playlistId, currentPartInstanceId, idToCopy)
				)
			}
		}

		onRONotificationClick = (e: RONotificationEvent) => {
			if (e.sourceLocator) {
				let segmentId = e.sourceLocator.segmentId

				if (!segmentId) {
					if (e.sourceLocator.partId) {
						const part = UIParts.findOne(e.sourceLocator.partId)
						if (part) {
							segmentId = part.segmentId
						}
					}
				}
				if (segmentId) {
					scrollToSegment(segmentId)
						.then(() => {
							RundownViewEventBus.emit(RundownViewEvents.HIGHLIGHT, e.sourceLocator)
						})
						.catch((error) => {
							if (!error.toString().match(/another scroll/)) console.warn(error)
						})
				}
			}
		}
		onHeaderNoteClick = (segmentId: SegmentId, level: NoteSeverity) => {
			NotificationCenter.snoozeAll()
			const isOpen = this.state.isNotificationsCenterOpen
			this.setState({
				isNotificationsCenterOpen: level === NoteSeverity.ERROR ? NoticeLevel.CRITICAL : NoticeLevel.WARNING,
			})
			setTimeout(
				function () {
					NotificationCenter.highlightSource(
						segmentId,
						level === NoteSeverity.ERROR ? NoticeLevel.CRITICAL : NoticeLevel.WARNING
					)
				},
				isOpen ? 1 : 1000
			)
		}

		onToggleSupportPanel = () => {
			this.setState({
				isSupportPanelOpen: !this.state.isSupportPanelOpen,
			})
		}

		onSegmentViewModeChange = () => {
			const nextMode = getNextSegmentViewMode(this.state.rundownDefaultSegmentViewMode)
			this.setState(
				{
					segmentViewModes: {},
					rundownDefaultSegmentViewMode: nextMode,
				},
				() => {
					if (!this.props.playlist?._id) return
					UIStateStorage.setItem(`rundownView.${this.props.playlist._id}`, `segmentViewModes`, {})
					UIStateStorage.setItem(`rundownView.${this.props.playlist._id}`, 'rundownDefaultSegmentViewMode', nextMode)
				}
			)
		}

		onStudioRouteSetSwitch = (
			e: React.MouseEvent<HTMLElement, MouseEvent>,
			routeSetId: string,
			_routeSet: StudioRouteSet,
			state: boolean
		) => {
			const { t } = this.props
			if (this.props.studio) {
				doUserAction(t, e, UserAction.SWITCH_ROUTE_SET, (e, ts) =>
					MeteorCall.userAction.switchRouteSet(e, ts, this.props.studio!._id, routeSetId, state)
				)
			}
		}

		onSwitchViewMode = (segmentId: SegmentId, viewMode: SegmentViewMode) => {
			if (!this.props.playlist?._id) return
			this.setState(
				(state) => ({
					segmentViewModes: {
						...state.segmentViewModes,
						[unprotectString(segmentId)]: viewMode,
					},
				}),
				() => {
					if (!this.props.playlist?._id) return
					UIStateStorage.setItem(
						`rundownView.${this.props.playlist._id}`,
						`segmentViewModes`,
						this.state.segmentViewModes
					)
				}
			)
		}

		onPieceQueued = (err: any, res: ExecuteActionResult | void) => {
			if (!err && res) {
				if (res.taken) {
					this.keyboardQueuedPartInstanceId = undefined
				} else {
					this.keyboardQueuedPartInstanceId = res.queuedPartInstanceId
				}
			}
			this.isKeyboardQueuePending = false
		}

		queueAdLibPiece = (adlibPiece: AdLibPieceUi, e: any) => {
			const { t } = this.props
			// TODO: Refactor this code to reduce code duplication

			if (adlibPiece.invalid) {
				NotificationCenter.push(
					new Notification(
						t('Invalid AdLib'),
						NoticeLevel.WARNING,
						t('Cannot play this AdLib because it is marked as Invalid'),
						'toggleAdLib'
					)
				)
				return
			}

			if (adlibPiece.floated) {
				NotificationCenter.push(
					new Notification(
						t('Floated Adlib'),
						NoticeLevel.WARNING,
						t('Cannot play this AdLib because it is marked as Floated'),
						'toggleAdLib'
					)
				)
				return
			}

			const sourceLayer = this.state.sourceLayerLookup[adlibPiece.sourceLayerId]

			if (!adlibPiece.isAction && sourceLayer && !sourceLayer.isQueueable) {
				NotificationCenter.push(
					new Notification(
						t('Not queueable'),
						NoticeLevel.WARNING,
						t('Cannot play this adlib because source layer is not queueable'),
						'toggleAdLib'
					)
				)
				return
			}

			if (this.props.playlist && this.props.playlist.currentPartInfo) {
				const currentPartInstanceId = this.props.playlist.currentPartInfo.partInstanceId
				if (!(sourceLayer && sourceLayer.isClearable)) {
					if (adlibPiece.isAction && adlibPiece.adlibAction) {
						const action = adlibPiece.adlibAction
						doUserAction(
							t,
							e,
							adlibPiece.isGlobal ? UserAction.START_GLOBAL_ADLIB : UserAction.START_ADLIB,
							(e, ts) =>
								MeteorCall.userAction.executeAction(
									e,
									ts,
									this.props.playlist!._id,
									action._id,
									action.actionId,
									action.userData
								),
							this.onPieceQueued
						)
					} else if (!adlibPiece.isGlobal && !adlibPiece.isAction) {
						doUserAction(
							t,
							e,
							UserAction.START_ADLIB,
							(e, ts) =>
								MeteorCall.userAction.segmentAdLibPieceStart(
									e,
									ts,
									this.props.playlist!._id,
									currentPartInstanceId,
									adlibPiece._id,
									true
								),
							this.onPieceQueued
						)
					} else if (adlibPiece.isGlobal && !adlibPiece.isSticky) {
						doUserAction(
							t,
							e,
							UserAction.START_GLOBAL_ADLIB,
							(e, ts) =>
								MeteorCall.userAction.baselineAdLibPieceStart(
									e,
									ts,
									this.props.playlist!._id,
									currentPartInstanceId,
									adlibPiece._id,
									true
								),
							this.onPieceQueued
						)
					} else {
						return
					}
					this.isKeyboardQueuePending = true
				}
			}
		}

		isAdLibQueueable = (piece: AdLibPieceUi) => {
			return !piece.invalid && !piece.floated && (piece.isAction || piece.sourceLayer?.isQueueable)
		}

		findShelfOnlySegment = (begin: number, end: number) => {
			const { uiSegments } = this.state
			for (let i = begin; begin > end ? i > end : i < end; begin > end ? i-- : i++) {
				const queueablePieces = uiSegments[i].pieces.filter(this.isAdLibQueueable)
				if (uiSegments[i].isHidden && uiSegments[i].showShelf && queueablePieces.length) {
					return { segment: uiSegments[i], queueablePieces }
				}
			}
			return undefined
		}

		queueMiniShelfAdLib = (e: any, forward: boolean) => {
			const { uiSegments, uiSegmentMap } = this.state
			let pieceToQueue: AdLibPieceUi | undefined
			let currentSegmentId: SegmentId | undefined
			if (this.keyboardQueuedPiece) {
				currentSegmentId = this.keyboardQueuedPiece.segmentId
				pieceToQueue = this.findPieceToQueueInCurrentSegment(uiSegmentMap, pieceToQueue, forward)
			}
			if (!currentSegmentId) {
				currentSegmentId = this.props.currentPartInstance?.segmentId
			}
			if (!pieceToQueue && currentSegmentId) {
				pieceToQueue = this.findPieceToQueueInOtherSegments(uiSegments, currentSegmentId, forward, pieceToQueue)
			}
			if (pieceToQueue) {
				this.queueAdLibPiece(pieceToQueue, e)
				this.keyboardQueuedPiece = pieceToQueue
				this.shouldKeyboardRequeue = false
			}
		}

		private findPieceToQueueInCurrentSegment(
			uiSegmentMap: Map<SegmentId, AdlibSegmentUi>,
			pieceToQueue: AdLibPieceUi | undefined,
			forward: boolean
		) {
			const uiSegment = this.keyboardQueuedPiece!.segmentId
				? uiSegmentMap.get(this.keyboardQueuedPiece!.segmentId)
				: undefined
			if (uiSegment) {
				const pieces = uiSegment.pieces.filter(this.isAdLibQueueable)
				if (this.shouldKeyboardRequeue) {
					pieceToQueue = pieces.find((piece) => piece._id === this.keyboardQueuedPiece!._id)
				} else {
					const nextPieceInd =
						pieces.findIndex((piece) => piece._id === this.keyboardQueuedPiece!._id) + (forward ? 1 : -1)
					if (nextPieceInd >= 0 && nextPieceInd < pieces.length) {
						pieceToQueue = pieces[nextPieceInd]
					}
				}
			}
			return pieceToQueue
		}

		private findPieceToQueueInOtherSegments(
			uiSegments: AdlibSegmentUi[],
			currentSegmentId: SegmentId | undefined,
			forward: boolean,
			pieceToQueue: AdLibPieceUi | undefined
		) {
			const currentSegmentInd = uiSegments.findIndex((segment) => segment._id === currentSegmentId)
			if (currentSegmentInd >= 0) {
				const nextShelfOnlySegment = forward
					? this.findShelfOnlySegment(currentSegmentInd + 1, uiSegments.length) ||
					  this.findShelfOnlySegment(0, currentSegmentInd)
					: this.findShelfOnlySegment(currentSegmentInd - 1, -1) ||
					  this.findShelfOnlySegment(uiSegments.length - 1, currentSegmentInd)
				if (nextShelfOnlySegment && nextShelfOnlySegment.queueablePieces.length) {
					pieceToQueue =
						nextShelfOnlySegment.queueablePieces[forward ? 0 : nextShelfOnlySegment.queueablePieces.length - 1]
				}
			}
			return pieceToQueue
		}

		renderSegments() {
			if (!this.props.matchedSegments) {
				return null
			}

			let globalIndex = 0
			const rundowns = this.props.matchedSegments.map((m) => m.rundown._id)

			return this.props.matchedSegments.map((rundownAndSegments, rundownIndex, rundownArray) => {
				let currentSegmentIndex = -1
				const rundownIdsBefore = rundowns.slice(0, rundownIndex)
				return (
					<React.Fragment key={unprotectString(rundownAndSegments.rundown._id)}>
						{this.props.matchedSegments.length > 1 && !this.state.rundownViewLayout?.hideRundownDivider && (
							<RundownDividerHeader
								key={`rundown_${rundownAndSegments.rundown._id}`}
								rundown={rundownAndSegments.rundown}
								playlist={this.props.playlist!}
							/>
						)}
						{rundownAndSegments.segments.map((segment, segmentIndex, segmentArray) => {
							if (this.props.studio && this.props.playlist && this.props.showStyleBase) {
								const ownCurrentPartInstance =
									// feed the currentPartInstance into the SegmentTimelineContainer component, if the currentPartInstance
									// is a part of the segment
									(this.props.currentPartInstance && this.props.currentPartInstance.segmentId === segment._id) ||
									// or the nextPartInstance is a part of this segment, and the currentPartInstance is autoNext
									(this.props.nextPartInstance &&
										this.props.nextPartInstance.segmentId === segment._id &&
										this.props.currentPartInstance &&
										this.props.currentPartInstance.part.autoNext)
										? this.props.currentPartInstance
										: undefined
								const ownNextPartInstance =
									this.props.nextPartInstance && this.props.nextPartInstance.segmentId === segment._id
										? this.props.nextPartInstance
										: undefined

								if (ownCurrentPartInstance) {
									currentSegmentIndex = segmentIndex
								}

								const isFollowingOnAirSegment = segmentIndex === currentSegmentIndex + 1

								const isLastSegment =
									rundownIndex === rundownArray.length - 1 && segmentIndex === segmentArray.length - 1

								return (
									<ErrorBoundary key={unprotectString(segment._id)}>
										<VirtualElement
											className={ClassNames({
												'segment-timeline-wrapper--hidden': segment.isHidden,
												'segment-timeline-wrapper--shelf': segment.showShelf,
											})}
											id={SEGMENT_TIMELINE_ELEMENT_ID + segment._id}
											margin={'100% 0px 100% 0px'}
											initialShow={globalIndex++ < window.innerHeight / 260}
											placeholderHeight={260}
											placeholderClassName="placeholder-shimmer-element segment-timeline-placeholder"
											width="auto"
										>
											{this.renderSegmentComponent(
												segment,
												segmentIndex,
												rundownAndSegments,
												this.props.playlist,
												this.props.studio,
												this.props.showStyleBase,
												isLastSegment,
												isFollowingOnAirSegment,
												ownCurrentPartInstance,
												ownNextPartInstance,
												rundownAndSegments.segmentIdsBeforeEachSegment[segmentIndex],
												rundownIdsBefore
											)}
										</VirtualElement>
									</ErrorBoundary>
								)
							}
						})}
						{this.state.rundownViewLayout?.showBreaksAsSegments &&
							rundownAndSegments.rundown.endOfRundownIsShowBreak && (
								<BreakSegment breakTime={PlaylistTiming.getExpectedEnd(rundownAndSegments.rundown.timing)} />
							)}
					</React.Fragment>
				)
			})
		}

		renderSegmentComponent(
			segment: DBSegment,
			_index: number,
			rundownAndSegments: MatchedSegment,
			rundownPlaylist: DBRundownPlaylist,
			studio: UIStudio,
			showStyleBase: UIShowStyleBase,
			isLastSegment: boolean,
			isFollowingOnAirSegment: boolean,
			ownCurrentPartInstance: PartInstance | undefined,
			ownNextPartInstance: PartInstance | undefined,
			segmentIdsBeforeSegment: Set<SegmentId>,
			rundownIdsBefore: RundownId[]
		) {
			const userSegmentViewMode = this.state.segmentViewModes[unprotectString(segment._id)] as
				| SegmentViewMode
				| undefined
			const userRundownSegmentViewMode = this.state.rundownDefaultSegmentViewMode
			const displayMode =
				userSegmentViewMode ?? userRundownSegmentViewMode ?? segment.displayAs ?? DEFAULT_SEGMENT_VIEW_MODE

			const showDurationSourceLayers = this.state.rundownViewLayout?.showDurationSourceLayers
				? new Set<ISourceLayer['_id']>(this.state.rundownViewLayout?.showDurationSourceLayers)
				: undefined

			const resolvedSegmentProps: IResolvedSegmentProps & { id: string } = {
				id: SEGMENT_TIMELINE_ELEMENT_ID + segment._id,
				studio: studio,
				showStyleBase: showStyleBase,
				followLiveSegments: this.state.followLiveSegments,
				rundownViewLayout: this.state.rundownViewLayout,
				rundownId: rundownAndSegments.rundown._id,
				segmentId: segment._id,
				playlist: rundownPlaylist,
				rundown: rundownAndSegments.rundown,
				timeScale: this.state.timeScale,
				onContextMenu: this.onContextMenu,
				onSegmentScroll: this.onSegmentScroll,
				segmentsIdsBefore: segmentIdsBeforeSegment,
				rundownIdsBefore: rundownIdsBefore,
				rundownsToShowstyles: this.props.rundownsToShowstyles,
				isLastSegment: isLastSegment,
				onPieceClick: this.onSelectPiece,
				onPieceDoubleClick: this.onPieceDoubleClick,
				onHeaderNoteClick: this.onHeaderNoteClick,
				onSwitchViewMode: (viewMode) => this.onSwitchViewMode(segment._id, viewMode),
				ownCurrentPartInstance: ownCurrentPartInstance,
				ownNextPartInstance: ownNextPartInstance,
				isFollowingOnAirSegment: isFollowingOnAirSegment,
				miniShelfFilter: this.state.miniShelfFilter,
				countdownToSegmentRequireLayers: this.state.rundownViewLayout?.countdownToSegmentRequireLayers,
				fixedSegmentDuration: this.state.rundownViewLayout?.fixedSegmentDuration,
				studioMode: this.props.userPermissions.studio,
				adLibSegmentUi: this.state.uiSegmentMap.get(segment._id),
				showDurationSourceLayers: showDurationSourceLayers,
			}

			if (segment.orphaned === SegmentOrphanedReason.ADLIB_TESTING) {
				return <SegmentAdlibTestingContainer {...resolvedSegmentProps} />
			}

			switch (displayMode) {
				case SegmentViewMode.Storyboard:
					return <SegmentStoryboardContainer {...resolvedSegmentProps} />
				case SegmentViewMode.List:
					return <SegmentListContainer {...resolvedSegmentProps} />
				case SegmentViewMode.Timeline:
				default:
					return <SegmentTimelineContainer {...resolvedSegmentProps} />
			}
		}

		renderSegmentsList() {
			if (!this.props.playlist || !this.props.rundowns.length) {
				return (
					<div className="m-2">
						<Spinner />
					</div>
				)
			}
			return (
				<React.Fragment>
					{isEntirePlaylistLooping(this.props.playlist) && (
						<PlaylistLoopingHeader position="start" multiRundown={this.props.matchedSegments.length > 1} />
					)}
					<div className="segment-timeline-container" role="main" aria-labelledby="rundown-playlist-name">
						{this.renderSegments()}
					</div>
					{isEntirePlaylistLooping(this.props.playlist) && (
						<PlaylistLoopingHeader
							position="end"
							multiRundown={this.props.matchedSegments.length > 1}
							showCountdowns={!!(this.props.playlist.activationId && this.props.playlist.currentPartInfo)}
						/>
					)}
				</React.Fragment>
			)
		}

		onChangeBottomMargin = (newBottomMargin: string) => {
			this.setState({
				bottomMargin: newBottomMargin,
			})
		}

		onContextMenuTop = (e: React.MouseEvent<HTMLDivElement>): boolean => {
			if (!this.props.userPermissions.developer) {
				e.preventDefault()
				e.stopPropagation()
			}
			return false
		}

		onToggleNotifications = (_e: React.MouseEvent<HTMLElement>, filter: NoticeLevel) => {
			if (!this.state.isNotificationsCenterOpen === true) {
				NotificationCenter.highlightSource(undefined, NoticeLevel.CRITICAL)
			}

			NotificationCenter.isOpen = !(this.state.isNotificationsCenterOpen === filter)

			this.setState({
				isNotificationsCenterOpen: this.state.isNotificationsCenterOpen === filter ? undefined : filter,
			})
		}

		onToggleHotkeys = () => {
			if (!this.state.isInspectorShelfExpanded) {
				this.setState({
					isInspectorShelfExpanded: true,
				})
				RundownViewEventBus.emit(RundownViewEvents.SWITCH_SHELF_TAB, {
					tab: ShelfTabs.SYSTEM_HOTKEYS,
				})
			} else {
				this.setState({
					isInspectorShelfExpanded: false,
				})
			}

			this.setState({
				wasShelfResizedByUser: true,
			})
		}

		onRestartPlayout = (e: React.MouseEvent<HTMLButtonElement>) => {
			const { t, studio } = this.props

			if (!studio) {
				return
			}

			const attachedPlayoutGateways = PeripheralDevices.find({
				'studioAndConfigId.studioId': studio._id,
				connected: true,
				type: PeripheralDeviceType.PLAYOUT,
			}).fetch()
			if (attachedPlayoutGateways.length === 0) {
				NotificationCenter.push(
					new Notification(
						undefined,
						NoticeLevel.CRITICAL,
						t(
							'There are no Playout\xa0Gateways connected and attached to this studio. Please contact the system administrator to start the Playout Gateway.'
						),
						'RundownView'
					)
				)
				return
			}

			e.persist()

			const restartPlayoutGateway = () => {
				attachedPlayoutGateways.forEach((item) => {
					PeripheralDevicesAPI.restartDevice(item, e)
						.then(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.NOTIFICATION,
									t('Playout\xa0Gateway "{{playoutDeviceName}}" is now restarting.', {
										playoutDeviceName: item.name,
									}),
									'RundownView'
								)
							)
						})
						.catch(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.CRITICAL,
									t('Could not restart Playout\xa0Gateway "{{playoutDeviceName}}".', {
										playoutDeviceName: item.name,
									}),
									'RundownView'
								)
							)
						})
				})
			}

			doModalDialog({
				title: t('Restart Playout'),
				message: t('Do you want to restart the Playout\xa0Gateway?'),
				onAccept: restartPlayoutGateway,
			})
		}

		onRestartCasparCG = (e: React.MouseEvent<HTMLButtonElement>, device: PeripheralDevice) => {
			const { t } = this.props

			e.persist()

			doModalDialog({
				title: t('Restart CasparCG Server'),
				message: t('Do you want to restart CasparCG Server "{{device}}"?', { device: device.name }),
				onAccept: () => {
					callPeripheralDeviceAction(e, device._id, DEFAULT_TSR_ACTION_TIMEOUT_TIME, TSR.CasparCGActions.RestartServer)
						.then((r) => {
							if (r?.result === TSR.ActionExecutionResultCode.Error) {
								throw new Error(
									r.response && isTranslatableMessage(r.response)
										? translateMessage(r.response, i18nTranslator)
										: t('Unknown error')
								)
							}

							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.NOTIFICATION,
									t('CasparCG on device "{{deviceName}}" restarting...', { deviceName: device.name }),
									'SystemStatus'
								)
							)
						})
						.catch((err) => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.WARNING,
									t('Failed to restart CasparCG on device: "{{deviceName}}": {{errorMessage}}', {
										deviceName: device.name,
										errorMessage: err + '',
									}),
									'SystemStatus'
								)
							)
						})
				},
			})
		}

		onTakeRundownSnapshot = async (e: React.MouseEvent<HTMLButtonElement>): Promise<boolean> => {
			const { t } = this.props
			if (!this.props.playlist) {
				return Promise.resolve(false)
			}
			const playlistId = this.props.playlist._id
			const doneMessage = t('A snapshot of the current Running\xa0Order has been created for troubleshooting.')
			const errorMessage = t(
				'Something went wrong when creating the snapshot. Please contact the system administrator if the problem persists.'
			)

			return new Promise<boolean>((resolve) => {
				doUserAction(
					t,
					e,
					UserAction.CREATE_SNAPSHOT_FOR_DEBUG,
					async (e, ts) => {
						const tokenResponse = await MeteorCall.system.generateSingleUseToken()

						if (ClientAPI.isClientResponseError(tokenResponse) || !tokenResponse.result) {
							throw tokenResponse
						}
						return MeteorCall.userAction.storeRundownSnapshot(
							e,
							ts,
							hashSingleUseToken(tokenResponse.result),
							playlistId,
							'User requested log at' + getCurrentTime(),
							false
						)
					},
					(err: any) => {
						if (err) {
							NotificationCenter.push(new Notification(undefined, NoticeLevel.WARNING, errorMessage, 'userAction'))
							resolve(false)
						} else {
							NotificationCenter.push(new Notification(undefined, NoticeLevel.NOTIFICATION, doneMessage, 'userAction'))
							resolve(true)
						}

						return false
					}
				)
			})
		}

		isAdLibQueueableAndNonFloated = (piece: AdLibPieceUi) => {
			return (piece.isAction || piece.sourceLayer?.isQueueable) && !piece.invalid && !piece.floated
		}

		onShelfChangeExpanded = (value: boolean) => {
			this.setState({
				isInspectorShelfExpanded: value,
				wasShelfResizedByUser: true,
			})
		}

		onTake = (e: any) => {
			RundownViewEventBus.emit(RundownViewEvents.TAKE, {
				context: e,
			})
		}

		getStyle() {
			return {
				marginBottom: this.state.bottomMargin,
			}
		}

		isHotkeyAllowed(e: KeyboardEvent): boolean {
			if (isModalShowing() || isEventInInputField(e)) {
				return false
			}
			return true
		}

		defaultHotkeys(t: i18next.TFunction) {
			const poisonKey = Settings.poisonKey
			return [
				// Register additional hotkeys or legend entries
				...(poisonKey
					? [
							{
								key: poisonKey,
								label: t('Cancel currently pressed hotkey'),
							},
					  ]
					: []),
				{
					key: 'F11',
					label: t('Change to fullscreen mode'),
				},
			]
		}

		renderRundownView(
			studio: UIStudio,
			playlist: DBRundownPlaylist,
			showStyleBase: UIShowStyleBase,
			showStyleVariant: DBShowStyleVariant
		) {
			const { t } = this.props

			const selectedPiece = this.state.selectedPiece
			const selectedPieceRundown: Rundown | undefined =
				(selectedPiece &&
					RundownUtils.isPieceInstance(selectedPiece) &&
					this.props.rundowns.find((r) => r._id === selectedPiece?.instance.rundownId)) ||
				undefined

			return (
				<RundownTimingProvider playlist={playlist} defaultDuration={Settings.defaultDisplayDuration}>
					<StudioContext.Provider value={studio}>
						<PreviewPopUpContextProvider>
							<SelectedElementProvider>
								<SelectedElementsContext.Consumer>
									{(selectionContext) => {
										return (
											<div
												className={ClassNames('rundown-view', {
													'notification-center-open': this.state.isNotificationsCenterOpen !== undefined,
													'rundown-view--studio-mode': this.props.userPermissions.studio,
													'properties-panel-open': selectionContext.listSelectedElements().length > 0,
												})}
												style={this.getStyle()}
												onWheelCapture={this.onWheel}
												onContextMenu={this.onContextMenuTop}
											>
												{this.renderSegmentsList()}
												<ErrorBoundary>
													{this.props.matchedSegments &&
														this.props.matchedSegments.length > 0 &&
														this.props.userPermissions.studio &&
														studio.settings.enableEvaluationForm && <AfterBroadcastForm playlist={playlist} />}
												</ErrorBoundary>
												<ErrorBoundary>
													<RundownHeader
														playlist={playlist}
														studio={studio}
														rundownIds={this.props.rundowns.map((r) => r._id)}
														firstRundown={this.props.rundowns[0]}
														onActivate={this.onActivate}
														userPermissions={this.props.userPermissions}
														inActiveRundownView={this.props.inActiveRundownView}
														currentRundown={this.state.currentRundown || this.props.rundowns[0]}
														layout={this.state.rundownHeaderLayout}
														showStyleBase={showStyleBase}
														showStyleVariant={showStyleVariant}
													/>
												</ErrorBoundary>
												<ErrorBoundary>
													{this.props.userPermissions.studio && !Settings.disableBlurBorder && (
														<KeyboardFocusIndicator userPermissions={this.props.userPermissions}>
															<div
																className={ClassNames('rundown-view__focus-lost-frame', {
																	'rundown-view__focus-lost-frame--reduce-animation': import.meta.env.DEV,
																})}
															></div>
														</KeyboardFocusIndicator>
													)}
												</ErrorBoundary>
												<ErrorBoundary>
													<RundownRightHandControls
														playlistId={playlist._id}
														isFollowingOnAir={this.state.followLiveSegments}
														onFollowOnAir={this.onGoToLiveSegment}
														onRewindSegments={this.onRewindSegments}
														isNotificationCenterOpen={this.state.isNotificationsCenterOpen}
														onToggleNotifications={this.onToggleNotifications}
														isSupportPanelOpen={this.state.isSupportPanelOpen}
														onToggleSupportPanel={this.onToggleSupportPanel}
														isStudioMode={this.props.userPermissions.studio}
														isUserEditsEnabled={this.props.studio?.settings.enableUserEdits ?? false}
														onTake={this.onTake}
														studioRouteSets={studio.routeSets}
														studioRouteSetExclusivityGroups={studio.routeSetExclusivityGroups}
														onStudioRouteSetSwitch={this.onStudioRouteSetSwitch}
														onSegmentViewMode={this.onSegmentViewModeChange}
													/>
												</ErrorBoundary>
												<ErrorBoundary>{this.renderSorensenContext()}</ErrorBoundary>
												<ErrorBoundary>
													<VelocityReact.VelocityTransitionGroup
														enter={{
															animation: {
																translateX: ['0%', '100%'],
															},
															easing: 'ease-out',
															duration: 300,
														}}
														leave={{
															animation: {
																translateX: ['100%', '0%'],
															},
															easing: 'ease-in',
															duration: 500,
														}}
													>
														{this.state.isNotificationsCenterOpen && (
															<NotificationCenterPanel filter={this.state.isNotificationsCenterOpen} />
														)}
													</VelocityReact.VelocityTransitionGroup>
													{!this.state.isNotificationsCenterOpen &&
														selectionContext.listSelectedElements().length > 0 && (
															<div>
																<PropertiesPanel />
															</div>
														)}
													<VelocityReact.VelocityTransitionGroup
														enter={{
															animation: {
																translateX: ['0%', '100%'],
															},
															easing: 'ease-out',
															duration: 300,
														}}
														leave={{
															animation: {
																translateX: ['100%', '0%'],
															},
															easing: 'ease-in',
															duration: 500,
														}}
													>
														{this.state.isSupportPanelOpen && (
															<SupportPopUp>
																<hr />
																<button className="btn btn-secondary" onClick={this.onToggleHotkeys}>
																	{t('Show Hotkeys')}
																</button>
																<hr />
																<PromiseButton
																	className="btn btn-secondary"
																	onClick={this.onTakeRundownSnapshot}
																	disableDuringFeedback={true}
																>
																	{t('Take a Snapshot')}
																</PromiseButton>
																<hr />
																{this.props.userPermissions.studio && (
																	<>
																		<button className="btn btn-secondary" onClick={this.onRestartPlayout}>
																			{t('Restart Playout')}
																		</button>
																		<hr />
																	</>
																)}
																{this.props.userPermissions.studio &&
																	this.props.casparCGPlayoutDevices &&
																	this.props.casparCGPlayoutDevices.map((i) => (
																		<React.Fragment key={unprotectString(i._id)}>
																			<button
																				className="btn btn-secondary"
																				onClick={(e) => this.onRestartCasparCG(e, i)}
																			>
																				{t('Restart {{device}}', { device: i.name })}
																			</button>
																			<hr />
																		</React.Fragment>
																	))}
															</SupportPopUp>
														)}
													</VelocityReact.VelocityTransitionGroup>
												</ErrorBoundary>
												<ErrorBoundary>
													{this.props.userPermissions.studio && (
														<Prompt
															when={!!playlist.activationId}
															message={t('This rundown is now active. Are you sure you want to exit this screen?')}
														/>
													)}
												</ErrorBoundary>
												<ErrorBoundary>
													<SegmentContextMenu
														contextMenuContext={this.state.contextMenuContext}
														playlist={playlist}
														onSetNext={this.onSetNext}
														onSetNextSegment={this.onSetNextSegment}
														onQueueNextSegment={this.onQueueNextSegment}
														onSetQuickLoopStart={this.onSetQuickLoopStart}
														onSetQuickLoopEnd={this.onSetQuickLoopEnd}
														onEditProps={(selection) => selectionContext.clearAndSetSelection(selection)}
														studioMode={this.props.userPermissions.studio}
														enablePlayFromAnywhere={!!studio.settings.enablePlayFromAnywhere}
														enableQuickLoop={!!studio.settings.enableQuickLoop}
														enableUserEdits={!!studio.settings.enableUserEdits}
													/>
												</ErrorBoundary>
												<ErrorBoundary>
													{this.state.isClipTrimmerOpen &&
														this.state.selectedPiece &&
														RundownUtils.isPieceInstance(this.state.selectedPiece) &&
														(selectedPieceRundown === undefined ? (
															<ModalDialog
																onAccept={() => this.setState({ selectedPiece: undefined })}
																title={t('Rundown not found')}
																acceptText={t('Close')}
															>
																{t('Rundown for piece "{{pieceLabel}}" could not be found.', {
																	pieceLabel: this.state.selectedPiece.instance.piece.name,
																})}
															</ModalDialog>
														) : (
															<ClipTrimDialog
																studio={studio}
																playlistId={playlist._id}
																rundown={selectedPieceRundown}
																selectedPiece={this.state.selectedPiece.instance.piece}
																onClose={() => this.setState({ isClipTrimmerOpen: false })}
															/>
														))}
												</ErrorBoundary>
												<ErrorBoundary>
													<PointerLockCursor />
												</ErrorBoundary>
												<ErrorBoundary>
													<Shelf
														buckets={this.props.buckets}
														isExpanded={
															this.state.isInspectorShelfExpanded ||
															(!this.state.wasShelfResizedByUser && this.state.shelfLayout?.openByDefault)
														}
														onChangeExpanded={this.onShelfChangeExpanded}
														hotkeys={this.defaultHotkeys(t)}
														playlist={this.props.playlist}
														showStyleBase={this.props.showStyleBase}
														showStyleVariant={this.props.showStyleVariant}
														studioMode={this.props.userPermissions.studio}
														onChangeBottomMargin={this.onChangeBottomMargin}
														rundownLayout={this.state.shelfLayout}
														shelfDisplayOptions={this.props.shelfDisplayOptions}
														bucketDisplayFilter={this.props.bucketDisplayFilter}
														studio={this.props.studio}
													/>
												</ErrorBoundary>
												<ErrorBoundary>
													{this.props.playlist && this.props.studio && this.props.showStyleBase && (
														<RundownNotifier playlistId={this.props.playlist._id} studio={this.props.studio} />
													)}
												</ErrorBoundary>
											</div>
										)
									}}
									{
										// USE IN CASE OF DEBUGGING EMERGENCY
										/* getDeveloperMode() && <div id='debug-console' className='debug-console' style={{
							background: 'rgba(255,255,255,0.7)',
							color: '#000',
							position: 'fixed',
							top: '0',
							right: '0',
							zIndex: 10000,
							pointerEvents: 'none'
						}}>
						</div> */
									}
								</SelectedElementsContext.Consumer>
							</SelectedElementProvider>
						</PreviewPopUpContextProvider>
					</StudioContext.Provider>
				</RundownTimingProvider>
			)
		}

		renderDetachedShelf() {
			return (
				<RundownTimingProvider playlist={this.props.playlist} defaultDuration={Settings.defaultDisplayDuration}>
					<PreviewPopUpContextProvider>
						<ErrorBoundary>
							<Shelf
								buckets={this.props.buckets}
								isExpanded={this.state.isInspectorShelfExpanded}
								onChangeExpanded={this.onShelfChangeExpanded}
								hotkeys={this.defaultHotkeys(this.props.t)}
								playlist={this.props.playlist}
								showStyleBase={this.props.showStyleBase}
								showStyleVariant={this.props.showStyleVariant}
								studioMode={this.props.userPermissions.studio}
								onChangeBottomMargin={this.onChangeBottomMargin}
								rundownLayout={this.state.shelfLayout}
								studio={this.props.studio}
								fullViewport={true}
								shelfDisplayOptions={this.props.shelfDisplayOptions}
								bucketDisplayFilter={this.props.bucketDisplayFilter}
							/>
						</ErrorBoundary>
					</PreviewPopUpContextProvider>
					<ErrorBoundary>{this.renderSorensenContext()}</ErrorBoundary>
				</RundownTimingProvider>
			)
		}

		renderSorensenContext() {
			return (
				<SorensenContext.Consumer>
					{(sorensen) =>
						sorensen &&
						this.props.userPermissions.studio &&
						this.props.studio &&
						this.props.showStyleBase && (
							<TriggersHandler
								studioId={this.props.studio._id}
								rundownPlaylistId={this.props.rundownPlaylistId}
								showStyleBaseId={this.props.showStyleBase._id}
								currentRundownId={this.props.currentRundown?._id || null}
								currentPartId={this.props.currentPartInstance?.part._id || null}
								nextPartId={this.props.nextPartInstance?.part._id || null}
								currentSegmentPartIds={this.props.currentSegmentPartIds}
								nextSegmentPartIds={this.props.nextSegmentPartIds}
								sorensen={sorensen}
								global={this.isHotkeyAllowed}
							/>
						)
					}
				</SorensenContext.Consumer>
			)
		}

		renderDataMissing() {
			const { t } = this.props

			return (
				<div className="rundown-view rundown-view--unpublished">
					<div className="rundown-view__label">
						<p className="summary">
							{!this.props.playlist
								? t('This rundown has been unpublished from Sofie.')
								: !this.props.studio
								? t('Error: The studio of this Rundown was not found.')
								: !this.props.rundowns.length
								? t('This playlist is empty')
								: !this.props.showStyleBase || !this.props.showStyleVariant
								? t('Error: The ShowStyle of this Rundown was not found.')
								: t('Unknown error')}
						</p>
						<p>
							<Route
								render={({ history }) => (
									<button
										className="btn btn-primary"
										onClick={() => {
											history.push('/rundowns')
										}}
									>
										{t('Return to list')}
									</button>
								)}
							/>
						</p>
					</div>
				</div>
			)
		}

		render(): JSX.Element {
			if (!this.props.subsReady) {
				return (
					<div className="rundown-view rundown-view--loading">
						<Spinner />
					</div>
				)
			}

			if (
				this.props.playlist &&
				this.props.studio &&
				this.props.showStyleBase &&
				this.props.showStyleVariant &&
				!this.props.onlyShelf
			) {
				return this.renderRundownView(
					this.props.studio,
					this.props.playlist,
					this.props.showStyleBase,
					this.props.showStyleVariant
				)
			} else if (
				this.props.playlist &&
				this.props.studio &&
				this.props.showStyleBase &&
				this.props.showStyleVariant &&
				this.props.onlyShelf
			) {
				return this.renderDetachedShelf()
			} else {
				return this.renderDataMissing()
			}
		}
	}
)
