import { TimelineComplete } from '@sofie-automation/corelib/dist/dataModel/Timeline'
import type { AbPlaybackDebugInfo } from '@sofie-automation/corelib/dist/dataModel/AbPlaybackDebug'
import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { setupDefaultJobEnvironment } from '../../../__mocks__/context.js'
import type { WorkerDataCache } from '../../caches.js'
import { LocksManager } from '../../locks.js'
import { JobContextImpl } from '../JobContextImpl.js'
import type { FastTrackTimelineFunc } from '../../../main.js'

describe('JobContextImpl', () => {
	function createContext(fastTrackTimeline: FastTrackTimelineFunc | null) {
		const mockContext = setupDefaultJobEnvironment()
		const mockCache = {
			rawStudio: mockContext.rawStudio,
			jobStudio: mockContext.studio,
		} as Partial<WorkerDataCache> as WorkerDataCache

		return new JobContextImpl(
			mockContext.directCollections,
			mockCache,
			new LocksManager(async () => Promise.resolve()),
			undefined,
			async () => Promise.resolve(),
			'test',
			fastTrackTimeline
		)
	}

	describe('hackPublishTimelineToFastTrack', () => {
		const timeline: TimelineComplete = {
			_id: protectString('studio0'),
			timelineHash: protectString('hash0'),
			generated: 1234,
			timelineBlob: protectString('[]'),
			generationVersions: {
				core: '1',
				blueprintId: protectString('blueprint0'),
				blueprintVersion: '1',
				studio: '1',
			},
			regenerateTimelineToken: 'token0',
			abPlaybackDebug: { now: 1234 } as Partial<AbPlaybackDebugInfo> as AbPlaybackDebugInfo,
		}

		test('omits the ab playback debug', () => {
			const fastTrackTimeline = jest.fn<Promise<void>, [TimelineComplete]>(async () => Promise.resolve())
			const context = createContext(fastTrackTimeline)

			context.hackPublishTimelineToFastTrack(timeline)

			expect(fastTrackTimeline).toHaveBeenCalledTimes(1)
			expect(fastTrackTimeline).toHaveBeenCalledWith({ ...timeline, abPlaybackDebug: undefined })

			// The original timeline must not be modified, as it is also saved to the database
			expect(timeline.abPlaybackDebug).toBeTruthy()
		})

		test('does nothing without a fast track', () => {
			const context = createContext(null)

			expect(() => context.hackPublishTimelineToFastTrack(timeline)).not.toThrow()
		})
	})
})
