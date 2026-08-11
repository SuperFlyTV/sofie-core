import React, { type PropsWithChildren } from 'react'
import { Meteor } from 'meteor/meteor'
import { withTracker } from '../../../lib/ReactMeteorData/react-meteor-data.js'
import type { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { RundownTiming, type TimeEventArgs } from './RundownTiming.js'
import type { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import {
	type MinimalPartInstance,
	RundownTimingCalculator,
	type RundownTimingContext,
	type TimingId,
} from '../../../lib/rundownTiming.js'
import type { SegmentId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { prepareTimingPartInstances } from '@sofie-automation/meteor-lib/dist/rundownTiming/prepareTimingInputs'
import { RundownPlaylistClientUtil } from '../../../lib/rundownPlaylistUtil.js'
import { getCurrentTime } from '../../../lib/systemTime.js'
import { type IRundownTimingProviderValues, RundownTimingProviderContext } from './withTiming.js'
import type { PartInstance } from '@sofie-automation/corelib/src/dataModel/PartInstance.js'

const TIMING_DEFAULT_REFRESH_INTERVAL = 1000 / 60 // the interval for high-resolution events (timeupdateHR)
const LOW_RESOLUTION_TIMING_DECIMATOR = 15

// LOW_RESOLUTION_TIMING_DECIMATOR-th time of the high-resolution events

const CURRENT_TIME_GRANULARITY = 1000 / 60

/**
 * RundownTimingProvider properties.
 * @interface IRundownTimingProviderProps
 */
interface IRundownTimingProviderProps {
	/** Rundown Playlist that is to be used for generating the timing information. */
	playlist?: DBRundownPlaylist

	/** Interval for high-resolution timing events. If undefined, it will fall back
	 * onto TIMING_DEFAULT_REFRESH_INTERVAL.
	 */
	refreshInterval?: number
	/** Fallback duration for Parts that have no as-played duration of their own (the Studio's `defaultDisplayDuration`). */
	defaultDuration: number
}

interface IRundownTimingProviderState {}
interface IRundownTimingProviderTrackedProps {
	partInstances: Array<MinimalPartInstance>
	segments: DBSegment[]
	segmentsMap: Map<SegmentId, DBSegment>
	partsInQuickLoop: Record<TimingId, boolean>
}

/**
 * RundownTimingProvider is a container component that provides a timing context to all child elements.
 * It allows calculating a single
 * @class RundownTimingProvider
 * @extends React.Component<PropsWithChildren<IRundownTimingProviderProps>>
 */
export const RundownTimingProvider = withTracker<
	PropsWithChildren<IRundownTimingProviderProps>,
	IRundownTimingProviderState,
	IRundownTimingProviderTrackedProps
>(({ playlist }) => {
	if (!playlist) {
		return {
			partInstances: [],
			segments: [],
			segmentsMap: new Map(),
			partsInQuickLoop: {},
		}
	}

	const segments = RundownPlaylistClientUtil.getSegments(playlist)
	const segmentsMap = new Map<SegmentId, DBSegment>(segments.map((segment) => [segment._id, segment]))
	const unorderedParts = RundownPlaylistClientUtil.getUnorderedParts(playlist)
	const activePartInstances = RundownPlaylistClientUtil.getActivePartInstances(playlist, undefined, {
		projection: {
			_id: 1,
			rundownId: 1,
			segmentId: 1,
			isTemporary: 1,
			segmentPlayoutId: 1,
			takeCount: 1,
			part: 1,
			timings: 1,
			orphaned: 1,
		},
	}) as Array<
		Pick<
			PartInstance,
			| '_id'
			| 'rundownId'
			| 'segmentId'
			| 'isTemporary'
			| 'segmentPlayoutId'
			| 'takeCount'
			| 'part'
			| 'timings'
			| 'orphaned'
		>
	>

	const { partInstances, partsInQuickLoop } = prepareTimingPartInstances(
		playlist,
		segments,
		unorderedParts,
		activePartInstances
	)

	return {
		partInstances,
		segments,
		segmentsMap,
		partsInQuickLoop,
	}
})(
	class RundownTimingProvider extends React.Component<
		PropsWithChildren<IRundownTimingProviderProps> & IRundownTimingProviderTrackedProps,
		IRundownTimingProviderState
	> {
		private durations: RundownTimingContext = {
			isLowResolution: false,
		}
		private syncedDurations: RundownTimingContext = {
			isLowResolution: true,
		}
		/**
		 * This context works in an unusual way.
		 * It contains a constant value which gets mutated in place, with the consumer expected to setup a timer to poll for changes.
		 * The exception is `playlistId`, which consumers do need to re-render on, so a new object is
		 * created on the rare occasions it changes - see `contextValue()`.
		 */
		private childContextValue: IRundownTimingProviderValues = {
			durations: this.durations,
			syncedDurations: this.syncedDurations,
			playlistId: undefined,
		}

		private contextValue(): IRundownTimingProviderValues {
			const playlistId = this.props.playlist?._id
			if (this.childContextValue.playlistId !== playlistId) {
				this.childContextValue = { ...this.childContextValue, playlistId }
			}
			return this.childContextValue
		}

		private refreshTimer: number | undefined
		private refreshTimerInterval: number
		private refreshDecimator: number

		private timingCalculator: RundownTimingCalculator = new RundownTimingCalculator()
		/** last time (ms rounded down to full seconds) for which the timeupdateSynced event was dispatched */
		private lastSyncedTime = 0

		constructor(props: IRundownTimingProviderProps & IRundownTimingProviderTrackedProps) {
			super(props)

			this.refreshTimerInterval = props.refreshInterval || TIMING_DEFAULT_REFRESH_INTERVAL

			this.refreshDecimator = 0
		}

		private calmDownTiming = (time: number) => {
			return Math.round(time / CURRENT_TIME_GRANULARITY) * CURRENT_TIME_GRANULARITY
		}

		private onRefreshTimer = () => {
			const now = getCurrentTime()
			const calmedDownNow = this.calmDownTiming(now)
			this.updateDurations(calmedDownNow, false)
			this.dispatchHREvent(calmedDownNow)

			const dispatchLowResolution = this.refreshDecimator % LOW_RESOLUTION_TIMING_DECIMATOR === 0
			if (dispatchLowResolution) {
				this.dispatchLREvent(calmedDownNow)
			}

			const syncedEventTimeNow = Math.floor(now / 1000) * 1000
			const dispatchSynced = Math.abs(syncedEventTimeNow - this.lastSyncedTime) >= 1000
			if (dispatchSynced) {
				this.lastSyncedTime = syncedEventTimeNow
				this.updateDurations(syncedEventTimeNow, true)
				this.dispatchSyncedEvent(syncedEventTimeNow)
			}

			this.refreshDecimator++
		}

		componentDidMount(): void {
			this.refreshTimer = Meteor.setInterval(this.onRefreshTimer, this.refreshTimerInterval)
			this.onRefreshTimer()
			;(window as any)['rundownTimingContext'] = this.durations
		}

		componentDidUpdate(prevProps: IRundownTimingProviderProps & IRundownTimingProviderTrackedProps) {
			// change refresh interval if needed
			if (this.refreshTimerInterval !== this.props.refreshInterval && this.refreshTimer) {
				this.refreshTimerInterval = this.props.refreshInterval || TIMING_DEFAULT_REFRESH_INTERVAL
				Meteor.clearInterval(this.refreshTimer)
				this.refreshTimer = Meteor.setInterval(this.onRefreshTimer, this.refreshTimerInterval)
			}
			if (
				prevProps.partInstances !== this.props.partInstances ||
				prevProps.playlist?.nextPartInfo?.partInstanceId !== this.props.playlist?.nextPartInfo?.partInstanceId ||
				prevProps.playlist?.currentPartInfo?.partInstanceId !== this.props.playlist?.currentPartInfo?.partInstanceId
			) {
				this.refreshDecimator = 0 // Force LR update
				this.lastSyncedTime = 0 // Force synced update
				this.onRefreshTimer()
			}
		}

		componentWillUnmount(): void {
			delete (window as any)['rundownTimingContext']
			if (this.refreshTimer !== undefined) Meteor.clearInterval(this.refreshTimer)
		}

		private dispatchHREvent(now: number) {
			const event = new CustomEvent<TimeEventArgs>(RundownTiming.Events.timeupdateHighResolution, {
				detail: {
					currentTime: now,
				},
				cancelable: false,
			})
			window.dispatchEvent(event)
		}

		private dispatchLREvent(now: number) {
			const event = new CustomEvent<TimeEventArgs>(RundownTiming.Events.timeupdateLowResolution, {
				detail: {
					currentTime: now,
				},
				cancelable: false,
			})
			window.dispatchEvent(event)
		}

		private dispatchSyncedEvent(now: number) {
			const event = new CustomEvent<TimeEventArgs>(RundownTiming.Events.timeupdateSynced, {
				detail: {
					currentTime: now,
				},
				cancelable: false,
			})
			window.dispatchEvent(event)
		}

		private updateDurations(now: number, isSynced: boolean) {
			const { playlist, partInstances, segmentsMap } = this.props

			const updatedDurations = this.timingCalculator.updateDurations(
				now,
				isSynced,
				playlist,
				partInstances,
				segmentsMap,
				this.props.defaultDuration,
				this.props.partsInQuickLoop
			)
			if (!isSynced) {
				this.durations = Object.assign(this.durations, updatedDurations)
			} else {
				this.syncedDurations = Object.assign(this.syncedDurations, updatedDurations)
			}
		}

		render(): React.ReactNode {
			return (
				<RundownTimingProviderContext.Provider value={this.contextValue()}>
					{this.props.children}
				</RundownTimingProviderContext.Provider>
			)
		}
	}
)
