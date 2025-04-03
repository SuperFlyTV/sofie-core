import { Meteor } from 'meteor/meteor'
import React from 'react'
import { Translated } from '../../lib/ReactMeteorData/react-meteor-data'
import { useTranslation, withTranslation } from 'react-i18next'
import * as CoreIcon from '@nrk/core-icons/jsx'
import ClassNames from 'classnames'
import Escape from '../../lib/Escape'
import Tooltip from 'rc-tooltip'
import { NavLink } from 'react-router-dom'
import { DBRundownPlaylist, RundownHoldState } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { Rundown, getRundownNrcsName } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import { ContextMenu, MenuItem, ContextMenuTrigger } from '@jstarpl/react-contextmenu'
import { PieceUi } from '../SegmentTimeline/SegmentTimelineContainer'
import { RundownSystemStatus } from '../RundownView/RundownSystemStatus'
import { getCurrentTime } from '../../lib/systemTime'
import { ModalDialog, doModalDialog } from '../../lib/ModalDialog'
import { getHelpMode } from '../../lib/localStorage'
import { ClientAPI } from '@sofie-automation/meteor-lib/dist/api/client'
import { scrollToPartInstance } from '../../lib/viewPort'
import { Tracker } from 'meteor/tracker'
import { reloadRundownPlaylistClick } from './RundownNotifier'
import { NotificationCenter, NoticeLevel, Notification } from '../../lib/notifications/notifications'
import { doUserAction, UserAction } from '../../lib/clientUserAction'
import { hashSingleUseToken } from '../../lib/lib'
import { RundownLayoutRundownHeader } from '@sofie-automation/meteor-lib/dist/collections/RundownLayouts'
import { contextMenuHoldToDisplayTime } from '../../lib/lib'
import { MeteorCall } from '../../lib/meteorApi'
import RundownViewEventBus, {
	ActivateRundownPlaylistEvent,
	DeactivateRundownPlaylistEvent,
	IEventContext,
	RundownViewEvents,
} from '@sofie-automation/meteor-lib/dist/triggers/RundownViewEventBus'
import { RundownLayoutsAPI } from '../../lib/rundownLayouts'
import { PlaylistTiming } from '@sofie-automation/corelib/dist/playout/rundownTiming'
import { DBShowStyleVariant } from '@sofie-automation/corelib/dist/dataModel/ShowStyleVariant'
import { BucketAdLibItem } from '../Shelf/RundownViewBuckets'
import { IAdLibListItem } from '../Shelf/AdLibListItem'
import { ShelfDashboardLayout } from '../Shelf/ShelfDashboardLayout'
import { UserError, UserErrorMessage } from '@sofie-automation/corelib/dist/error'
import { UIStudio } from '@sofie-automation/meteor-lib/dist/api/studios'
import { RundownId, RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { UIShowStyleBase } from '@sofie-automation/meteor-lib/dist/api/showStyles'
import { logger } from '../../lib/logging'
import { UserPermissions } from '../UserPermissions'
import * as RundownResolver from '../../lib/RundownResolver'
import Navbar from 'react-bootstrap/Navbar'
import { REHEARSAL_MARGIN, WarningDisplay } from './WarningDisplay'
import { WithTiming, withTiming } from './RundownTiming/withTiming'
import { AutoNextStatus } from './RundownTiming/AutoNextStatus'
import { CurrentPartOrSegmentRemaining } from './RundownTiming/CurrentPartOrSegmentRemaining'
import { NextBreakTiming } from './RundownTiming/NextBreakTiming'
import { PlaylistEndTiming } from './RundownTiming/PlaylistEndTiming'
import { PlaylistStartTiming } from './RundownTiming/PlaylistStartTiming'
import { RundownName } from './RundownTiming/RundownName'
import { TimeOfDay } from './RundownTiming/TimeOfDay'
import { RundownPlaylists, Rundowns } from '../../collections'
import {
	ReloadRundownPlaylistResponse,
	TriggerReloadDataResponse,
} from '@sofie-automation/meteor-lib/dist/api/userActions'
import _ from 'underscore'
import { RundownPlaylistCollectionUtil } from '../../collections/rundownPlaylistUtil'
import * as i18next from 'i18next'

interface ITimingDisplayProps {
	rundownPlaylist: DBRundownPlaylist
	currentRundown: Rundown | undefined
	rundownCount: number
	layout: RundownLayoutRundownHeader | undefined
}

const TimingDisplay = withTiming<ITimingDisplayProps, {}>()(function TimingDisplay({
	rundownPlaylist,
	currentRundown,
	rundownCount,
	layout,
	timingDurations,
}: WithTiming<ITimingDisplayProps>): JSX.Element | null {
	const { t } = useTranslation()

	if (!rundownPlaylist) return null

	const expectedStart = PlaylistTiming.getExpectedStart(rundownPlaylist.timing)
	const expectedEnd = PlaylistTiming.getExpectedEnd(rundownPlaylist.timing)
	const expectedDuration = PlaylistTiming.getExpectedDuration(rundownPlaylist.timing)
	const showEndTiming =
		!timingDurations.rundownsBeforeNextBreak ||
		!layout?.showNextBreakTiming ||
		(timingDurations.rundownsBeforeNextBreak.length > 0 &&
			(!layout?.hideExpectedEndBeforeBreak || (timingDurations.breakIsLastRundown && layout?.lastRundownIsNotBreak)))
	const showNextBreakTiming =
		rundownPlaylist.startedPlayback &&
		timingDurations.rundownsBeforeNextBreak?.length &&
		layout?.showNextBreakTiming &&
		!(timingDurations.breakIsLastRundown && layout.lastRundownIsNotBreak)

	return (
		<div className="timing">
			<div className="timing__header__left">
				<PlaylistStartTiming rundownPlaylist={rundownPlaylist} hideDiff={true} />
				<RundownName rundownPlaylist={rundownPlaylist} currentRundown={currentRundown} rundownCount={rundownCount} />
			</div>
			<div className="timing__header__center">
				<TimeOfDay />
			</div>
			<div className="timing__header__right">
				<div className="timing__header__right__left">
					{rundownPlaylist.currentPartInfo && (
						<span className="timing-clock current-remaining">
							<CurrentPartOrSegmentRemaining
								currentPartInstanceId={rundownPlaylist.currentPartInfo.partInstanceId}
								heavyClassName="overtime"
								preferSegmentTime={true}
							/>
							<AutoNextStatus />
							{rundownPlaylist.holdState && rundownPlaylist.holdState !== RundownHoldState.COMPLETE ? (
								<div className="rundown__header-status rundown__header-status--hold">{t('Hold')}</div>
							) : null}
						</span>
					)}
				</div>
				<div className="timing__header__right__right">
					{showNextBreakTiming ? (
						<NextBreakTiming
							rundownsBeforeBreak={timingDurations.rundownsBeforeNextBreak!}
							breakText={layout?.nextBreakText}
							lastChild={!showEndTiming}
						/>
					) : null}
					{showEndTiming ? (
						<PlaylistEndTiming
							rundownPlaylist={rundownPlaylist}
							loop={RundownResolver.isLoopRunning(rundownPlaylist)}
							expectedStart={expectedStart}
							expectedEnd={expectedEnd}
							expectedDuration={expectedDuration}
							endLabel={layout?.plannedEndText}
						/>
					) : null}
				</div>
			</div>
		</div>
	)
})

interface IRundownHeaderProps {
	playlist: DBRundownPlaylist
	showStyleBase: UIShowStyleBase
	showStyleVariant: DBShowStyleVariant
	currentRundown: Rundown | undefined
	studio: UIStudio
	rundownIds: RundownId[]
	firstRundown: Rundown | undefined
	onActivate?: (isRehearsal: boolean) => void
	inActiveRundownView?: boolean
	layout: RundownLayoutRundownHeader | undefined
	userPermissions: Readonly<UserPermissions>
}

interface IRundownHeaderState {
	isError: boolean
	errorMessage?: string
	shouldQueue: boolean
	selectedPiece: BucketAdLibItem | IAdLibListItem | PieceUi | undefined
}

export const RundownHeader = withTranslation()(
	class RundownHeader extends React.Component<Translated<IRundownHeaderProps>, IRundownHeaderState> {
		bindKeys: Array<{
			key: string
			up?: (e: KeyboardEvent) => any
			down?: (e: KeyboardEvent) => any
			label: string
			global?: boolean
			coolDown?: number
		}> = []
		constructor(props: Translated<IRundownHeaderProps>) {
			super(props)

			this.state = {
				isError: false,
				shouldQueue: false,
				selectedPiece: undefined,
			}
		}
		componentDidMount(): void {
			RundownViewEventBus.on(RundownViewEvents.ACTIVATE_RUNDOWN_PLAYLIST, this.eventActivate)
			RundownViewEventBus.on(RundownViewEvents.DEACTIVATE_RUNDOWN_PLAYLIST, this.eventDeactivate)
			RundownViewEventBus.on(RundownViewEvents.RESYNC_RUNDOWN_PLAYLIST, this.eventResync)
			RundownViewEventBus.on(RundownViewEvents.TAKE, this.eventTake)
			RundownViewEventBus.on(RundownViewEvents.RESET_RUNDOWN_PLAYLIST, this.eventResetRundownPlaylist)
			RundownViewEventBus.on(RundownViewEvents.CREATE_SNAPSHOT_FOR_DEBUG, this.eventCreateSnapshot)

			reloadRundownPlaylistClick.set(this.reloadRundownPlaylist)
		}

		componentWillUnmount(): void {
			RundownViewEventBus.off(RundownViewEvents.ACTIVATE_RUNDOWN_PLAYLIST, this.eventActivate)
			RundownViewEventBus.off(RundownViewEvents.DEACTIVATE_RUNDOWN_PLAYLIST, this.eventDeactivate)
			RundownViewEventBus.off(RundownViewEvents.RESYNC_RUNDOWN_PLAYLIST, this.eventResync)
			RundownViewEventBus.off(RundownViewEvents.TAKE, this.eventTake)
			RundownViewEventBus.off(RundownViewEvents.RESET_RUNDOWN_PLAYLIST, this.eventResetRundownPlaylist)
			RundownViewEventBus.off(RundownViewEvents.CREATE_SNAPSHOT_FOR_DEBUG, this.eventCreateSnapshot)
		}
		eventActivate = (e: ActivateRundownPlaylistEvent) => {
			if (e.rehearsal) {
				this.activateRehearsal(e.context)
			} else {
				this.activate(e.context)
			}
		}
		eventDeactivate = (e: DeactivateRundownPlaylistEvent) => {
			this.deactivate(e.context)
		}
		eventResync = (e: IEventContext) => {
			this.reloadRundownPlaylist(e.context)
		}
		eventTake = (e: IEventContext) => {
			this.take(e.context)
		}
		eventResetRundownPlaylist = (e: IEventContext) => {
			this.resetRundown(e.context)
		}
		eventCreateSnapshot = (e: IEventContext) => {
			this.takeRundownSnapshot(e.context)
		}

		handleDisableNextPiece = (err: ClientAPI.ClientResponse<undefined>) => {
			if (ClientAPI.isClientResponseError(err)) {
				const { t } = this.props

				if (err.error.key === UserErrorMessage.DisableNoPieceFound) {
					NotificationCenter.push(
						new Notification(
							undefined,
							NoticeLevel.WARNING,
							t('Could not find a Piece that can be disabled.'),
							'userAction'
						)
					)
					return false
				}
			}
		}

		disableNextPiece = (e: any) => {
			const { t } = this.props

			if (this.props.userPermissions.studio) {
				doUserAction(
					t,
					e,
					UserAction.DISABLE_NEXT_PIECE,
					(e, ts) => MeteorCall.userAction.disableNextPiece(e, ts, this.props.playlist._id, false),
					this.handleDisableNextPiece
				)
			}
		}

		disableNextPieceUndo = (e: any) => {
			const { t } = this.props

			if (this.props.userPermissions.studio) {
				doUserAction(
					t,
					e,
					UserAction.DISABLE_NEXT_PIECE,
					(e, ts) => MeteorCall.userAction.disableNextPiece(e, ts, this.props.playlist._id, true),
					this.handleDisableNextPiece
				)
			}
		}

		take = (e: any) => {
			const { t } = this.props
			if (this.props.userPermissions.studio) {
				if (!this.props.playlist.activationId) {
					const onSuccess = () => {
						if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
					}
					const handleResult = (err: any) => {
						if (!err) {
							onSuccess()
						} else if (ClientAPI.isClientResponseError(err)) {
							if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
								this.handleAnotherPlaylistActive(this.props.playlist._id, true, err.error, onSuccess)
								return false
							}
						}
					}
					// ask to activate
					doModalDialog({
						title: t('Failed to execute take'),
						message: t(
							'The rundown you are trying to execute a take on is inactive, would you like to activate this rundown?'
						),
						acceptOnly: false,
						warning: true,
						yes: t('Activate "On Air"'),
						no: t('Cancel'),
						discardAsPrimary: true,
						onDiscard: () => {
							// Do nothing
						},
						actions: [
							{
								label: t('Activate "Rehearsal"'),
								classNames: 'btn-secondary',
								on: (e) => {
									doUserAction(
										t,
										e,
										UserAction.DEACTIVATE_OTHER_RUNDOWN_PLAYLIST,
										(e, ts) => MeteorCall.userAction.forceResetAndActivate(e, ts, this.props.playlist._id, true),
										handleResult
									)
								},
							},
						],
						onAccept: () => {
							// nothing
							doUserAction(
								t,
								e,
								UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
								(e, ts) => MeteorCall.userAction.activate(e, ts, this.props.playlist._id, false),
								handleResult
							)
						},
					})
				} else {
					doUserAction(t, e, UserAction.TAKE, (e, ts) =>
						MeteorCall.userAction.take(
							e,
							ts,
							this.props.playlist._id,
							this.props.playlist.currentPartInfo?.partInstanceId ?? null
						)
					)
				}
			}
		}

		discardError = () => {
			this.setState({
				isError: false,
			})
		}

		hold = (e: any) => {
			const { t } = this.props
			if (this.props.userPermissions.studio && this.props.playlist.activationId) {
				doUserAction(t, e, UserAction.ACTIVATE_HOLD, (e, ts) =>
					MeteorCall.userAction.activateHold(e, ts, this.props.playlist._id, false)
				)
			}
		}

		clearQuickLoop = (e: any) => {
			const { t } = this.props
			if (this.props.userPermissions.studio && this.props.playlist.activationId) {
				doUserAction(t, e, UserAction.CLEAR_QUICK_LOOP, (e, ts) =>
					MeteorCall.userAction.clearQuickLoop(e, ts, this.props.playlist._id)
				)
			}
		}

		holdUndo = (e: any) => {
			const { t } = this.props
			if (
				this.props.userPermissions.studio &&
				this.props.playlist.activationId &&
				this.props.playlist.holdState === RundownHoldState.PENDING
			) {
				doUserAction(t, e, UserAction.ACTIVATE_HOLD, (e, ts) =>
					MeteorCall.userAction.activateHold(e, ts, this.props.playlist._id, true)
				)
			}
		}

		rundownShouldHaveStarted() {
			return getCurrentTime() > (PlaylistTiming.getExpectedStart(this.props.playlist.timing) || 0)
		}
		rundownWillShortlyStart() {
			return (
				!this.rundownShouldHaveEnded() &&
				getCurrentTime() > (PlaylistTiming.getExpectedStart(this.props.playlist.timing) || 0) - REHEARSAL_MARGIN
			)
		}
		rundownShouldHaveEnded() {
			return (
				getCurrentTime() >
				(PlaylistTiming.getExpectedStart(this.props.playlist.timing) || 0) +
					(PlaylistTiming.getExpectedDuration(this.props.playlist.timing) || 0)
			)
		}

		handleAnotherPlaylistActive = (
			playlistId: RundownPlaylistId,
			rehersal: boolean,
			err: UserError,
			clb?: Function
		) => {
			const { t } = this.props

			function handleResult(err: any, response: void) {
				if (!err) {
					if (typeof clb === 'function') clb(response)
				} else {
					logger.error(err)
					doModalDialog({
						title: t('Failed to activate'),
						message: t('Something went wrong, please contact the system administrator if the problem persists.'),
						acceptOnly: true,
						warning: true,
						yes: t('OK'),
						onAccept: () => {
							// nothing
						},
					})
				}
			}

			doModalDialog({
				title: t('Another Rundown is Already Active!'),
				message: t(
					'The rundown: "{{rundownName}}" will need to be deactivated in order to activate this one.\n\nAre you sure you want to activate this one anyway?',
					{
						// TODO: this is a bit of a hack, could a better string sent from the server instead?
						rundownName: err.message.args?.names ?? '',
					}
				),
				yes: t('Activate "On Air"'),
				no: t('Cancel'),
				discardAsPrimary: true,
				actions: [
					{
						label: t('Activate "Rehearsal"'),
						classNames: 'btn-secondary',
						on: (e) => {
							doUserAction(
								t,
								e,
								UserAction.DEACTIVATE_OTHER_RUNDOWN_PLAYLIST,
								(e, ts) => MeteorCall.userAction.forceResetAndActivate(e, ts, playlistId, rehersal),
								handleResult
							)
						},
					},
				],
				warning: true,
				onAccept: (e) => {
					doUserAction(
						t,
						e,
						UserAction.DEACTIVATE_OTHER_RUNDOWN_PLAYLIST,
						(e, ts) => MeteorCall.userAction.forceResetAndActivate(e, ts, playlistId, false),
						handleResult
					)
				},
			})
		}

		activate = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (
				this.props.userPermissions.studio &&
				(!this.props.playlist.activationId || (this.props.playlist.activationId && this.props.playlist.rehearsal))
			) {
				const onSuccess = () => {
					this.deferFlushAndRewindSegments()
					if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
				}
				const doActivate = () => {
					doUserAction(
						t,
						e,
						UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
						(e, ts) => MeteorCall.userAction.activate(e, ts, this.props.playlist._id, false),
						(err) => {
							if (!err) {
								if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
							} else if (ClientAPI.isClientResponseError(err)) {
								if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
									this.handleAnotherPlaylistActive(this.props.playlist._id, false, err.error, () => {
										if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
									})
									return false
								}
							}
						}
					)
				}

				const doActivateAndReset = () => {
					this.rewindSegments()
					doUserAction(
						t,
						e,
						UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
						(e, ts) => MeteorCall.userAction.resetAndActivate(e, ts, this.props.playlist._id),
						(err) => {
							if (!err) {
								onSuccess()
							} else if (ClientAPI.isClientResponseError(err)) {
								if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
									this.handleAnotherPlaylistActive(this.props.playlist._id, false, err.error, onSuccess)
									return false
								}
							}
						}
					)
				}

				if (!this.rundownShouldHaveStarted()) {
					// The broadcast hasn't started yet
					doModalDialog({
						title: 'Activate "On Air"',
						message: t('Do you want to activate this Rundown?'),
						yes: 'Reset and Activate "On Air"',
						no: t('Cancel'),
						actions: [
							{
								label: 'Activate "On Air"',
								classNames: 'btn-secondary',
								on: () => {
									doActivate() // this one activates without resetting
								},
							},
						],
						acceptOnly: false,
						onAccept: () => {
							doUserAction(
								t,
								e,
								UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
								(e, ts) => MeteorCall.userAction.resetAndActivate(e, ts, this.props.playlist._id),
								(err) => {
									if (!err) {
										onSuccess()
									} else if (ClientAPI.isClientResponseError(err)) {
										if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
											this.handleAnotherPlaylistActive(this.props.playlist._id, false, err.error, onSuccess)
											return false
										}
									}
								}
							)
						},
					})
				} else if (!this.rundownShouldHaveEnded()) {
					// The broadcast has started
					doActivate()
				} else {
					// The broadcast has ended, going into active mode is probably not what you want to do
					doModalDialog({
						title: 'Activate "On Air"',
						message: t('The planned end time has passed, are you sure you want to activate this Rundown?'),
						yes: 'Reset and Activate "On Air"',
						no: t('Cancel'),
						actions: [
							{
								label: 'Activate "On Air"',
								classNames: 'btn-secondary',
								on: () => {
									doActivate() // this one activates without resetting
								},
							},
						],
						acceptOnly: false,
						onAccept: () => {
							doActivateAndReset()
						},
					})
				}
			}
		}
		activateRehearsal = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (
				this.props.userPermissions.studio &&
				(!this.props.playlist.activationId || (this.props.playlist.activationId && !this.props.playlist.rehearsal))
			) {
				const onSuccess = () => {
					if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
				}
				const doActivateRehersal = () => {
					doUserAction(
						t,
						e,
						UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
						(e, ts) => MeteorCall.userAction.activate(e, ts, this.props.playlist._id, true),
						(err) => {
							if (!err) {
								onSuccess()
							} else if (ClientAPI.isClientResponseError(err)) {
								if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
									this.handleAnotherPlaylistActive(this.props.playlist._id, true, err.error, onSuccess)
									return false
								}
							}
						}
					)
				}
				if (!this.rundownShouldHaveStarted()) {
					// The broadcast hasn't started yet
					if (!this.props.playlist.activationId) {
						// inactive, do the full preparation:
						doUserAction(
							t,
							e,
							UserAction.PREPARE_FOR_BROADCAST,
							(e, ts) => MeteorCall.userAction.prepareForBroadcast(e, ts, this.props.playlist._id),
							(err) => {
								if (!err) {
									onSuccess()
								} else if (ClientAPI.isClientResponseError(err)) {
									if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
										this.handleAnotherPlaylistActive(this.props.playlist._id, true, err.error, onSuccess)
										return false
									}
								}
							}
						)
					} else if (!this.props.playlist.rehearsal) {
						// Active, and not in rehearsal
						doModalDialog({
							title: 'Activate "Rehearsal"',
							message: t('Are you sure you want to activate Rehearsal Mode?'),
							yes: 'Activate "Rehearsal"',
							no: t('Cancel'),
							onAccept: () => {
								doActivateRehersal()
							},
						})
					} else {
						// Already in rehersal, do nothing
					}
				} else {
					// The broadcast has started
					if (!this.rundownShouldHaveEnded()) {
						// We are in the broadcast
						doModalDialog({
							title: 'Activate "Rehearsal"',
							message: t('Are you sure you want to activate Rehearsal Mode?'),
							yes: 'Activate "Rehearsal"',
							no: t('Cancel'),
							onAccept: () => {
								doActivateRehersal()
							},
						})
					} else {
						// The broadcast has ended
						doActivateRehersal()
					}
				}
			}
		}
		deactivate = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (this.props.userPermissions.studio && this.props.playlist.activationId) {
				if (this.rundownShouldHaveStarted()) {
					if (this.props.playlist.rehearsal) {
						// We're in rehearsal mode
						doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e, ts) =>
							MeteorCall.userAction.deactivate(e, ts, this.props.playlist._id)
						)
					} else {
						doModalDialog({
							title: 'Deactivate "On Air"',
							message: t('Are you sure you want to deactivate this rundown?\n(This will clear the outputs.)'),
							warning: true,
							yes: t('Deactivate "On Air"'),
							no: t('Cancel'),
							onAccept: () => {
								doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e, ts) =>
									MeteorCall.userAction.deactivate(e, ts, this.props.playlist._id)
								)
							},
						})
					}
				} else {
					// Do it right away
					doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e, ts) =>
						MeteorCall.userAction.deactivate(e, ts, this.props.playlist._id)
					)
				}
			}
		}
		private activateAdlibTesting = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (
				this.props.userPermissions.studio &&
				this.props.studio.settings.allowAdlibTestingSegment &&
				this.props.playlist.activationId &&
				this.props.currentRundown
			) {
				const rundownId = this.props.currentRundown._id
				doUserAction(t, e, UserAction.ACTIVATE_ADLIB_TESTING, (e, ts) =>
					MeteorCall.userAction.activateAdlibTestingMode(e, ts, this.props.playlist._id, rundownId)
				)
			}
		}

		resetRundown = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			const doReset = () => {
				this.rewindSegments() // Do a rewind right away
				doUserAction(
					t,
					e,
					UserAction.RESET_RUNDOWN_PLAYLIST,
					(e, ts) => MeteorCall.userAction.resetRundownPlaylist(e, ts, this.props.playlist._id),
					() => {
						this.deferFlushAndRewindSegments()
					}
				)
			}
			if (
				this.props.playlist.activationId &&
				!this.props.playlist.rehearsal &&
				!this.props.studio.settings.allowRundownResetOnAir
			) {
				// The rundown is active and not in rehersal
				doModalDialog({
					title: 'Reset Rundown',
					message: t('The rundown can not be reset while it is active'),
					onAccept: () => {
						// nothing
					},
					acceptOnly: true,
					yes: 'OK',
				})
			} else {
				doReset()
			}
		}

		reloadRundownPlaylist = (e: any) => {
			const { t } = this.props
			if (this.props.userPermissions.studio) {
				doUserAction(
					t,
					e,
					UserAction.RELOAD_RUNDOWN_PLAYLIST_DATA,
					(e, ts) => MeteorCall.userAction.resyncRundownPlaylist(e, ts, this.props.playlist._id),
					(err, reloadResponse) => {
						if (!err && reloadResponse) {
							if (!handleRundownPlaylistReloadResponse(t, this.props.userPermissions, reloadResponse)) {
								if (this.props.playlist && this.props.playlist.nextPartInfo) {
									scrollToPartInstance(this.props.playlist.nextPartInfo.partInstanceId).catch((error) => {
										if (!error.toString().match(/another scroll/)) console.warn(error)
									})
								}
							}
						}
					}
				)
			}
		}

		takeRundownSnapshot = (e: any) => {
			const { t } = this.props
			if (this.props.userPermissions.studio) {
				const doneMessage = t('A snapshot of the current Running\xa0Order has been created for troubleshooting.')
				doUserAction(
					t,
					e,
					UserAction.CREATE_SNAPSHOT_FOR_DEBUG,
					(e, ts) =>
						MeteorCall.system.generateSingleUseToken().then((tokenResponse) => {
							if (ClientAPI.isClientResponseError(tokenResponse) || !tokenResponse.result) {
								throw tokenResponse
							}
							return MeteorCall.userAction.storeRundownSnapshot(
								e,
								ts,
								hashSingleUseToken(tokenResponse.result),
								this.props.playlist._id,
								'Taken by user',
								false
							)
						}),
					() => {
						NotificationCenter.push(
							new Notification(
								undefined,
								NoticeLevel.NOTIFICATION,
								doneMessage,
								'userAction',
								undefined,
								false,
								undefined,
								undefined,
								5000
							)
						)
						return false
					},
					doneMessage
				)
			}
		}

		activateRundown = (e: any) => {
			// Called from the ModalDialog, 1 minute before broadcast starts
			if (this.props.userPermissions.studio) {
				const { t } = this.props
				this.rewindSegments() // Do a rewind right away

				doUserAction(
					t,
					e,
					UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
					(e, ts) => MeteorCall.userAction.activate(e, ts, this.props.playlist._id, false),
					(err) => {
						if (!err) {
							if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
						} else if (ClientAPI.isClientResponseError(err)) {
							if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
								this.handleAnotherPlaylistActive(this.props.playlist._id, false, err.error, () => {
									if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
								})
								return false
							}
						}
					}
				)
			}
		}

		resetAndActivateRundown = (e: any) => {
			// Called from the ModalDialog, 1 minute before broadcast starts
			if (this.props.userPermissions.studio) {
				const { t } = this.props
				this.rewindSegments() // Do a rewind right away

				doUserAction(
					t,
					e,
					UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
					(e, ts) => MeteorCall.userAction.resetAndActivate(e, ts, this.props.playlist._id),
					(err) => {
						if (!err) {
							this.deferFlushAndRewindSegments()
							if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
						}
					}
				)
			}
		}

		rewindSegments() {
			RundownViewEventBus.emit(RundownViewEvents.REWIND_SEGMENTS)
		}
		deferFlushAndRewindSegments() {
			// Do a rewind later, when the UI has updated
			Meteor.defer(() => {
				Tracker.flush()
				Meteor.setTimeout(() => {
					this.rewindSegments()
					RundownViewEventBus.emit(RundownViewEvents.GO_TO_TOP)
				}, 500)
			})
		}

		changeQueueAdLib = (shouldQueue: boolean) => {
			this.setState({
				shouldQueue,
			})
		}

		selectPiece = (piece: BucketAdLibItem | IAdLibListItem | PieceUi | undefined) => {
			this.setState({
				selectedPiece: piece,
			})
		}

		render(): JSX.Element {
			const { t } = this.props

			const canClearQuickLoop =
				!!this.props.studio.settings.enableQuickLoop &&
				!RundownResolver.isLoopLocked(this.props.playlist) &&
				RundownResolver.isAnyLoopMarkerDefined(this.props.playlist)

			return (
				<>
					<Escape to="document">
						<ContextMenu id="rundown-context-menu">
							<div className="react-contextmenu-label">{this.props.playlist && this.props.playlist.name}</div>
							{this.props.userPermissions.studio ? (
								<React.Fragment>
									{!(this.props.playlist.activationId && this.props.playlist.rehearsal) ? (
										!this.rundownShouldHaveStarted() && !this.props.playlist.activationId ? (
											<MenuItem onClick={(e) => this.activateRehearsal(e)}>
												{t('Prepare Studio and Activate (Rehearsal)')}
											</MenuItem>
										) : (
											<MenuItem onClick={(e) => this.activateRehearsal(e)}>{t('Activate (Rehearsal)')}</MenuItem>
										)
									) : (
										<MenuItem onClick={(e) => this.activate(e)}>{t('Activate (On-Air)')}</MenuItem>
									)}
									{this.rundownWillShortlyStart() && !this.props.playlist.activationId && (
										<MenuItem onClick={(e) => this.activate(e)}>{t('Activate (On-Air)')}</MenuItem>
									)}
									{this.props.playlist.activationId ? (
										<MenuItem onClick={(e) => this.deactivate(e)}>{t('Deactivate')}</MenuItem>
									) : null}
									{this.props.studio.settings.allowAdlibTestingSegment && this.props.playlist.activationId ? (
										<MenuItem onClick={(e) => this.activateAdlibTesting(e)}>{t('AdLib Testing')}</MenuItem>
									) : null}
									{this.props.playlist.activationId ? (
										<MenuItem onClick={(e) => this.take(e)}>{t('Take')}</MenuItem>
									) : null}
									{this.props.studio.settings.allowHold && this.props.playlist.activationId ? (
										<MenuItem onClick={(e) => this.hold(e)}>{t('Hold')}</MenuItem>
									) : null}
									{this.props.playlist.activationId && canClearQuickLoop ? (
										<MenuItem onClick={(e) => this.clearQuickLoop(e)}>{t('Clear QuickLoop')}</MenuItem>
									) : null}
									{!(
										this.props.playlist.activationId &&
										!this.props.playlist.rehearsal &&
										!this.props.studio.settings.allowRundownResetOnAir
									) ? (
										<MenuItem onClick={(e) => this.resetRundown(e)}>{t('Reset Rundown')}</MenuItem>
									) : null}
									<MenuItem onClick={(e) => this.reloadRundownPlaylist(e)}>
										{t('Reload {{nrcsName}} Data', {
											nrcsName: getRundownNrcsName(this.props.firstRundown),
										})}
									</MenuItem>
									<MenuItem onClick={(e) => this.takeRundownSnapshot(e)}>{t('Store Snapshot')}</MenuItem>
								</React.Fragment>
							) : (
								<React.Fragment>
									<MenuItem>{t('No actions available')}</MenuItem>
								</React.Fragment>
							)}
						</ContextMenu>
					</Escape>
					<Navbar
						data-bs-theme="dark"
						fixed="top"
						expand
						className={ClassNames('rundown-header', {
							active: !!this.props.playlist.activationId,
							'not-active': !this.props.playlist.activationId,
							rehearsal: this.props.playlist.rehearsal,
						})}
					>
						<ContextMenuTrigger
							id="rundown-context-menu"
							attributes={{
								className: 'flex-col col-timing horizontal-align-center',
							}}
							holdToDisplay={contextMenuHoldToDisplayTime()}
						>
							<WarningDisplay
								studioMode={this.props.userPermissions.studio}
								inActiveRundownView={this.props.inActiveRundownView}
								playlist={this.props.playlist}
								oneMinuteBeforeAction={(e, noResetOnActivate) =>
									noResetOnActivate ? this.activateRundown(e) : this.resetAndActivateRundown(e)
								}
							/>
							<div className="header-row flex-row first-row super-dark">
								<div className="flex-col left horizontal-align-left">
									<div className="badge-sofie mt-4 mb-3 mx-4">
										<Tooltip
											overlay={t('Add ?studio=1 to the URL to enter studio mode')}
											visible={getHelpMode() && !this.props.userPermissions.studio}
											placement="bottom"
										>
											<div className="media-elem me-2 sofie-logo" />
										</Tooltip>
									</div>
								</div>
								{this.props.layout && RundownLayoutsAPI.isDashboardLayout(this.props.layout) ? (
									<ShelfDashboardLayout
										rundownLayout={this.props.layout}
										playlist={this.props.playlist}
										showStyleBase={this.props.showStyleBase}
										showStyleVariant={this.props.showStyleVariant}
										studio={this.props.studio}
										studioMode={this.props.userPermissions.studio}
										shouldQueue={this.state.shouldQueue}
										onChangeQueueAdLib={this.changeQueueAdLib}
										selectedPiece={this.state.selectedPiece}
										onSelectPiece={this.selectPiece}
									/>
								) : (
									<>
										<TimingDisplay
											rundownPlaylist={this.props.playlist}
											currentRundown={this.props.currentRundown}
											rundownCount={this.props.rundownIds.length}
											layout={this.props.layout}
										/>
										<RundownSystemStatus
											studioId={this.props.studio._id}
											playlistId={this.props.playlist._id}
											firstRundown={this.props.firstRundown}
										/>
									</>
								)}
								<div className="flex-col right horizontal-align-right">
									<div className="links close">
										<NavLink to="/rundowns" title={t('Exit')}>
											<CoreIcon.NrkClose />
										</NavLink>
									</div>
								</div>
							</div>
						</ContextMenuTrigger>
					</Navbar>

					<ModalDialog
						title={t('Error')}
						acceptText={t('OK')}
						show={!!this.state.isError}
						onAccept={this.discardError}
						onDiscard={this.discardError}
					>
						<p>{this.state.errorMessage}</p>
					</ModalDialog>
				</>
			)
		}
	}
)

function handleRundownPlaylistReloadResponse(
	t: i18next.TFunction,
	userPermissions: Readonly<UserPermissions>,
	result: ReloadRundownPlaylistResponse
): boolean {
	const rundownsInNeedOfHandling = result.rundownsResponses.filter(
		(r) => r.response === TriggerReloadDataResponse.MISSING
	)
	const firstRundownId = _.first(rundownsInNeedOfHandling)?.rundownId
	let allRundownsAffected = false

	if (firstRundownId) {
		const firstRundown = Rundowns.findOne(firstRundownId)
		const playlist = RundownPlaylists.findOne(firstRundown?.playlistId)
		const allRundownIds = playlist ? RundownPlaylistCollectionUtil.getRundownUnorderedIDs(playlist) : []
		if (
			allRundownIds.length > 0 &&
			_.difference(
				allRundownIds,
				rundownsInNeedOfHandling.map((r) => r.rundownId)
			).length === 0
		) {
			allRundownsAffected = true
		}
	}

	const actionsTaken: RundownReloadResponseUserAction[] = []
	function onActionTaken(action: RundownReloadResponseUserAction): void {
		actionsTaken.push(action)
		if (actionsTaken.length === rundownsInNeedOfHandling.length) {
			// the user has taken action on all of the missing rundowns
			if (allRundownsAffected && actionsTaken.filter((actionTaken) => actionTaken !== 'removed').length === 0) {
				// all rundowns in the playlist were affected and all of them were removed
				// we redirect to the Lobby
				window.location.assign('/')
			}
		}
	}

	const handled = rundownsInNeedOfHandling.map((r) =>
		handleRundownReloadResponse(t, userPermissions, r.rundownId, r.response, onActionTaken)
	)
	return handled.reduce((previousValue, value) => previousValue || value, false)
}

type RundownReloadResponseUserAction = 'removed' | 'unsynced' | 'error'

export function handleRundownReloadResponse(
	t: i18next.TFunction,
	userPermissions: Readonly<UserPermissions>,
	rundownId: RundownId,
	result: TriggerReloadDataResponse,
	clb?: (action: RundownReloadResponseUserAction) => void
): boolean {
	let hasDoneSomething = false

	if (result === TriggerReloadDataResponse.MISSING) {
		const rundown = Rundowns.findOne(rundownId)
		const playlist = RundownPlaylists.findOne(rundown?.playlistId)

		hasDoneSomething = true
		const notification = new Notification(
			undefined,
			NoticeLevel.CRITICAL,
			t(
				'Rundown {{rundownName}} in Playlist {{playlistName}} is missing in the data from {{nrcsName}}. You can either leave it in Sofie and mark it as Unsynced or remove the rundown from Sofie. What do you want to do?',
				{
					nrcsName: getRundownNrcsName(rundown),
					rundownName: rundown?.name || t('(Unknown rundown)'),
					playlistName: playlist?.name || t('(Unknown playlist)'),
				}
			),
			'userAction',
			undefined,
			true,
			[
				// actions:
				{
					label: t('Leave Unsynced'),
					type: 'default',
					disabled: !userPermissions.studio,
					action: () => {
						doUserAction(
							t,
							'Missing rundown action',
							UserAction.UNSYNC_RUNDOWN,
							(e, ts) => MeteorCall.userAction.unsyncRundown(e, ts, rundownId),
							(err) => {
								if (!err) {
									notificationHandle.stop()
									clb && clb('unsynced')
								} else {
									clb && clb('error')
								}
							}
						)
					},
				},
				{
					label: t('Remove'),
					type: 'default',
					action: () => {
						doModalDialog({
							title: t('Remove rundown'),
							message: t(
								'Do you really want to remove just the rundown "{{rundownName}}" in the playlist {{playlistName}} from Sofie? \n\nThis cannot be undone!',
								{
									rundownName: rundown?.name || 'N/A',
									playlistName: playlist?.name || 'N/A',
								}
							),
							onAccept: () => {
								// nothing
								doUserAction(
									t,
									'Missing rundown action',
									UserAction.REMOVE_RUNDOWN,
									(e, ts) => MeteorCall.userAction.removeRundown(e, ts, rundownId),
									(err) => {
										if (!err) {
											notificationHandle.stop()
											clb && clb('removed')
										} else {
											clb && clb('error')
										}
									}
								)
							},
						})
					},
				},
			]
		)
		const notificationHandle = NotificationCenter.push(notification)

		if (rundown) {
			// This allows the semi-modal dialog above to be closed automatically, once the rundown stops existing
			// for whatever reason
			const comp = Tracker.autorun(() => {
				const rundown = Rundowns.findOne(rundownId, {
					fields: {
						_id: 1,
						orphaned: 1,
					},
				})
				// we should hide the message
				if (!rundown || !rundown.orphaned) {
					notificationHandle.stop()
				}
			})
			notification.on('dropped', () => {
				// clean up the reactive computation above when the notification is closed. Will be also executed by
				// the notificationHandle.stop() above, so the Tracker.autorun will clean up after itself as well.
				comp.stop()
			})
		}
	}
	return hasDoneSomething
}
