import { UserError, UserErrorMessage } from '@sofie-automation/corelib/dist/error'
import { ClientAPI } from '@sofie-automation/meteor-lib/dist/api/client'
import { UserAction } from '@sofie-automation/meteor-lib/dist/userAction'
import { doUserAction } from '../../../lib/clientUserAction'
import { MeteorCall } from '../../../lib/meteorApi'
import { doModalDialog } from '../../../lib/ModalDialog'
import { useTranslation } from 'react-i18next'
import { useContext, useEffect, useMemo, useRef } from 'react'
import { UserPermissions, UserPermissionsContext } from '../../UserPermissions'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { logger } from '../../../lib/logging'
import * as i18next from 'i18next'
import { NoticeLevel, Notification, NotificationCenter } from '../../../lib/notifications/notifications'
import { Meteor } from 'meteor/meteor'
import { Tracker } from 'meteor/tracker'
import RundownViewEventBus, { RundownViewEvents } from '@sofie-automation/meteor-lib/dist/triggers/RundownViewEventBus'
import { handleRundownPlaylistReloadResponse } from './RundownReloadResponse'
import { scrollToPartInstance } from '../../../lib/viewPort'
import { hashSingleUseToken } from '../../../lib/lib'
import { Rundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import { UIStudio } from '@sofie-automation/meteor-lib/dist/api/studios'
import { getCurrentTime } from '../../../lib/systemTime'
import { PlaylistTiming } from '@sofie-automation/corelib/dist/playout/rundownTiming'
import { REHEARSAL_MARGIN } from '../WarningDisplay'
import { RundownPlaylistTiming } from '@sofie-automation/blueprints-integration'

interface RundownTimesInfo {
	shouldHaveStarted: boolean
	willShortlyStart: boolean
	shouldHaveEnded: boolean
}

export function checkRundownTimes(playlistTiming: RundownPlaylistTiming): RundownTimesInfo {
	const currentTime = getCurrentTime()

	const shouldHaveEnded =
		currentTime >
		(PlaylistTiming.getExpectedStart(playlistTiming) || 0) +
			(PlaylistTiming.getExpectedDuration(playlistTiming) || 0)

	return {
		shouldHaveStarted: currentTime > (PlaylistTiming.getExpectedStart(playlistTiming) || 0),
		willShortlyStart:
			!shouldHaveEnded && currentTime > (PlaylistTiming.getExpectedStart(playlistTiming) || 0) - REHEARSAL_MARGIN,
		shouldHaveEnded,
	}
}

export interface RundownPlaylistOperationsInput {
	studio: UIStudio
	playlist: DBRundownPlaylist
	currentRundown: Rundown | undefined
	onActivate?: (isRehearsal: boolean) => void
}

interface RundownPlaylistOperationsState extends RundownPlaylistOperationsInput {
	userPermissions: UserPermissions
}

export interface RundownPlaylistOperations {
	take: (e: any) => void
	hold: (e: any) => void
	clearQuickLoop: (e: any) => void
	activate: (e: any) => void
	activateRehearsal: (e: any) => void
	deactivate: (e: any) => void
	activateAdlibTesting: (e: any) => void
	resetRundown: (e: any) => void
	reloadRundownPlaylist: (e: any) => void
	takeRundownSnapshot: (e: any) => void
	activateRundown: (e: any) => void
	resetAndActivateRundown: (e: any) => void
}

export function useRundownPlaylistOperations(input0: RundownPlaylistOperationsInput): RundownPlaylistOperations {
	const { t } = useTranslation()

	const userPermissions = useContext(UserPermissionsContext)

	const state = useRef<RundownPlaylistOperationsState>({ ...input0, userPermissions })
	useEffect(() => {
		state.current = { ...input0, userPermissions }
	}, [...Object.values<any>(input0), userPermissions])

	return useMemo(
		() =>
			({
				take: (e: any) => executeTake(t, e, state.current),
				hold: (e: any) => executeHold(t, e, state.current),
				clearQuickLoop: (e: any) => executeClearQuickLoop(t, e, state.current),
				activate: (e: any) => executeActivate(t, e, state.current),
				activateRehearsal: (e: any) => executeActivateRehearsal(t, e, state.current),
				deactivate: (e: any) => executeDeactivate(t, e, state.current),
				activateAdlibTesting: (e: any) => executeActivateAdlibTesting(t, e, state.current),
				resetRundown: (e: any) => executeResetRundown(t, e, state.current),
				reloadRundownPlaylist: (e: any) => executeReloadRundownPlaylist(t, e, state.current),
				takeRundownSnapshot: (e: any) => executeTakeRundownSnapshot(t, e, state.current),
				activateRundown: (e: any) => executeActivateRundown(t, e, state.current),
				resetAndActivateRundown: (e: any) => executeResetAndActivateRundown(t, e, state.current),
			} satisfies RundownPlaylistOperations),
		[state]
	)
}

function executeTake(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState): void {
	if (!state.userPermissions.studio) return

	if (!state.playlist.activationId) {
		const onSuccess = () => {
			if (typeof state.onActivate === 'function') state.onActivate(false)
		}
		const handleResult = (err: any) => {
			if (!err) {
				onSuccess()
			} else if (ClientAPI.isClientResponseError(err)) {
				if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
					handleAnotherPlaylistActive(t, state.playlist._id, true, err.error, onSuccess)
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
							async (e, ts) =>
								MeteorCall.userAction.forceResetAndActivate(e, ts, state.playlist._id, true),
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
					async (e, ts) => MeteorCall.userAction.activate(e, ts, state.playlist._id, false),
					handleResult
				)
			},
		})
	} else {
		doUserAction(t, e, UserAction.TAKE, async (e, ts) =>
			MeteorCall.userAction.take(
				e,
				ts,
				state.playlist._id,
				state.playlist.currentPartInfo?.partInstanceId ?? null
			)
		)
	}
}

export function handleAnotherPlaylistActive(
	t: i18next.TFunction,
	playlistId: RundownPlaylistId,
	rehersal: boolean,
	err: UserError,
	clb?: Function
): void {
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
						async (e, ts) => MeteorCall.userAction.forceResetAndActivate(e, ts, playlistId, rehersal),
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
				async (e, ts) => MeteorCall.userAction.forceResetAndActivate(e, ts, playlistId, false),
				handleResult
			)
		},
	})
}

function executeHold(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState): void {
	if (state.userPermissions.studio && state.playlist.activationId) {
		doUserAction(t, e, UserAction.ACTIVATE_HOLD, async (e, ts) =>
			MeteorCall.userAction.activateHold(e, ts, state.playlist._id, false)
		)
	}
}

function executeClearQuickLoop(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	if (state.userPermissions.studio && state.playlist.activationId) {
		doUserAction(t, e, UserAction.CLEAR_QUICK_LOOP, async (e, ts) =>
			MeteorCall.userAction.clearQuickLoop(e, ts, state.playlist._id)
		)
	}
}

function executeActivate(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	if (e.persist) e.persist()

	if (
		state.userPermissions.studio &&
		(!state.playlist.activationId || (state.playlist.activationId && state.playlist.rehearsal))
	) {
		const onSuccess = () => {
			deferFlushAndRewindSegments()
			if (typeof state.onActivate === 'function') state.onActivate(false)
		}
		const doActivate = () => {
			doUserAction(
				t,
				e,
				UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
				async (e, ts) => MeteorCall.userAction.activate(e, ts, state.playlist._id, false),
				(err) => {
					if (!err) {
						if (typeof state.onActivate === 'function') state.onActivate(false)
					} else if (ClientAPI.isClientResponseError(err)) {
						if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
							handleAnotherPlaylistActive(t, state.playlist._id, false, err.error, () => {
								if (typeof state.onActivate === 'function') state.onActivate(false)
							})
							return false
						}
					}
				}
			)
		}

		const doActivateAndReset = () => {
			rewindSegments()
			doUserAction(
				t,
				e,
				UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
				async (e, ts) => MeteorCall.userAction.resetAndActivate(e, ts, state.playlist._id),
				(err) => {
					if (!err) {
						onSuccess()
					} else if (ClientAPI.isClientResponseError(err)) {
						if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
							handleAnotherPlaylistActive(t, state.playlist._id, false, err.error, onSuccess)
							return false
						}
					}
				}
			)
		}

		if (!checkRundownTimes(state.playlist.timing).shouldHaveStarted) {
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
						async (e, ts) => MeteorCall.userAction.resetAndActivate(e, ts, state.playlist._id),
						(err) => {
							if (!err) {
								onSuccess()
							} else if (ClientAPI.isClientResponseError(err)) {
								if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
									handleAnotherPlaylistActive(t, state.playlist._id, false, err.error, onSuccess)
									return false
								}
							}
						}
					)
				},
			})
		} else if (!checkRundownTimes(state.playlist.timing).shouldHaveEnded) {
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

function executeActivateRehearsal(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	if (e.persist) e.persist()

	if (
		state.userPermissions.studio &&
		(!state.playlist.activationId || (state.playlist.activationId && !state.playlist.rehearsal))
	) {
		const onSuccess = () => {
			if (typeof state.onActivate === 'function') state.onActivate(false)
		}
		const doActivateRehersal = () => {
			doUserAction(
				t,
				e,
				UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
				async (e, ts) => MeteorCall.userAction.activate(e, ts, state.playlist._id, true),
				(err) => {
					if (!err) {
						onSuccess()
					} else if (ClientAPI.isClientResponseError(err)) {
						if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
							handleAnotherPlaylistActive(t, state.playlist._id, true, err.error, onSuccess)
							return false
						}
					}
				}
			)
		}
		if (!checkRundownTimes(state.playlist.timing).shouldHaveStarted) {
			// The broadcast hasn't started yet
			if (!state.playlist.activationId) {
				// inactive, do the full preparation:
				doUserAction(
					t,
					e,
					UserAction.PREPARE_FOR_BROADCAST,
					async (e, ts) => MeteorCall.userAction.prepareForBroadcast(e, ts, state.playlist._id),
					(err) => {
						if (!err) {
							onSuccess()
						} else if (ClientAPI.isClientResponseError(err)) {
							if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
								handleAnotherPlaylistActive(t, state.playlist._id, true, err.error, onSuccess)
								return false
							}
						}
					}
				)
			} else if (!state.playlist.rehearsal) {
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
			if (!checkRundownTimes(state.playlist.timing).shouldHaveEnded) {
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

function executeDeactivate(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	if (e.persist) e.persist()

	if (state.userPermissions.studio && state.playlist.activationId) {
		if (checkRundownTimes(state.playlist.timing).shouldHaveStarted) {
			if (state.playlist.rehearsal) {
				// We're in rehearsal mode
				doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, async (e, ts) =>
					MeteorCall.userAction.deactivate(e, ts, state.playlist._id)
				)
			} else {
				doModalDialog({
					title: 'Deactivate "On Air"',
					message: t('Are you sure you want to deactivate this rundown?\n(This will clear the outputs.)'),
					warning: true,
					yes: t('Deactivate "On Air"'),
					no: t('Cancel'),
					onAccept: () => {
						doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, async (e, ts) =>
							MeteorCall.userAction.deactivate(e, ts, state.playlist._id)
						)
					},
				})
			}
		} else {
			// Do it right away
			doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, async (e, ts) =>
				MeteorCall.userAction.deactivate(e, ts, state.playlist._id)
			)
		}
	}
}
function executeActivateAdlibTesting(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	if (e.persist) e.persist()

	if (
		state.userPermissions.studio &&
		state.studio.settings.allowAdlibTestingSegment &&
		state.playlist.activationId &&
		state.currentRundown
	) {
		const rundownId = state.currentRundown._id
		doUserAction(t, e, UserAction.ACTIVATE_ADLIB_TESTING, async (e, ts) =>
			MeteorCall.userAction.activateAdlibTestingMode(e, ts, state.playlist._id, rundownId)
		)
	}
}

function executeResetRundown(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	if (e.persist) e.persist()

	const doReset = () => {
		rewindSegments() // Do a rewind right away
		doUserAction(
			t,
			e,
			UserAction.RESET_RUNDOWN_PLAYLIST,
			async (e, ts) => MeteorCall.userAction.resetRundownPlaylist(e, ts, state.playlist._id),
			() => {
				deferFlushAndRewindSegments()
			}
		)
	}
	if (state.playlist.activationId && !state.playlist.rehearsal && !state.studio.settings.allowRundownResetOnAir) {
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

function executeReloadRundownPlaylist(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	if (!state.userPermissions.studio) return

	doUserAction(
		t,
		e,
		UserAction.RELOAD_RUNDOWN_PLAYLIST_DATA,
		async (e, ts) => MeteorCall.userAction.resyncRundownPlaylist(e, ts, state.playlist._id),
		(err, reloadResponse) => {
			if (!err && reloadResponse) {
				if (!handleRundownPlaylistReloadResponse(t, state.userPermissions, reloadResponse)) {
					if (state.playlist && state.playlist.nextPartInfo) {
						scrollToPartInstance(state.playlist.nextPartInfo.partInstanceId).catch((error) => {
							if (!error.toString().match(/another scroll/)) console.warn(error)
						})
					}
				}
			}
		}
	)
}

function executeTakeRundownSnapshot(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	if (!state.userPermissions.studio) return

	const doneMessage = t('A snapshot of the current Running\xa0Order has been created for troubleshooting.')
	doUserAction(
		t,
		e,
		UserAction.CREATE_SNAPSHOT_FOR_DEBUG,
		async (e, ts) =>
			MeteorCall.system.generateSingleUseToken().then(async (tokenResponse) => {
				if (ClientAPI.isClientResponseError(tokenResponse) || !tokenResponse.result) {
					throw tokenResponse
				}
				return MeteorCall.userAction.storeRundownSnapshot(
					e,
					ts,
					hashSingleUseToken(tokenResponse.result),
					state.playlist._id,
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

function executeActivateRundown(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	// Called from the ModalDialog, 1 minute before broadcast starts
	if (!state.userPermissions.studio) return

	rewindSegments() // Do a rewind right away

	doUserAction(
		t,
		e,
		UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
		async (e, ts) => MeteorCall.userAction.activate(e, ts, state.playlist._id, false),
		(err) => {
			if (!err) {
				if (typeof state.onActivate === 'function') state.onActivate(false)
			} else if (ClientAPI.isClientResponseError(err)) {
				if (err.error.key === UserErrorMessage.RundownAlreadyActiveNames) {
					handleAnotherPlaylistActive(t, state.playlist._id, false, err.error, () => {
						if (typeof state.onActivate === 'function') state.onActivate(false)
					})
					return false
				}
			}
		}
	)
}

function executeResetAndActivateRundown(t: i18next.TFunction, e: any, state: RundownPlaylistOperationsState) {
	// Called from the ModalDialog, 1 minute before broadcast starts
	if (!state.userPermissions.studio) return

	rewindSegments() // Do a rewind right away

	doUserAction(
		t,
		e,
		UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
		async (e, ts) => MeteorCall.userAction.resetAndActivate(e, ts, state.playlist._id),
		(err) => {
			if (!err) {
				deferFlushAndRewindSegments()
				if (typeof state.onActivate === 'function') state.onActivate(false)
			}
		}
	)
}

function deferFlushAndRewindSegments() {
	// Do a rewind later, when the UI has updated
	Meteor.defer(() => {
		Tracker.flush()
		Meteor.setTimeout(() => {
			rewindSegments()
			RundownViewEventBus.emit(RundownViewEvents.GO_TO_TOP)
		}, 500)
	})
}

function rewindSegments() {
	RundownViewEventBus.emit(RundownViewEvents.REWIND_SEGMENTS)
}
