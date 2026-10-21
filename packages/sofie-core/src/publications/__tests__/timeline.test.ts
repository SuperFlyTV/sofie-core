import '../../collections' // include this in order to get all of the collection set up
import { MeteorPubSub } from '@sofie-automation/meteor-lib/dist/api/pubsub'
import { TimelineComplete } from '@sofie-automation/corelib/dist/dataModel/Timeline'
import type { AbPlaybackDebugInfo } from '@sofie-automation/corelib/dist/dataModel/AbPlaybackDebug'
import { ProtectedString, protectString } from '@sofie-automation/corelib/dist/protectedString'
import type { MinimalMongoCursor } from '../../collections/collection'
import { Studios, Timeline } from '../../collections'
import { setupMockStudio } from '../../__mocks__/helpers/database'
import { PublicationRegistry } from '../../publicationRegistry'
import { PublicationContext } from '../lib/lib'
import { registerTimelinePublications } from '../timeline'

function createMockContext(connection: PublicationContext['connection']): PublicationContext {
	return {
		connection,
		onStop: () => undefined,
		signal: new AbortController().signal,
		ready: () => undefined,
	} as Partial<PublicationContext> as PublicationContext
}

async function fetchCursor<T extends { _id: ProtectedString<any> }>(cursor: MinimalMongoCursor<T>): Promise<T[]> {
	const docs: T[] = []
	const handle = await cursor.observeAsync({
		added: (doc) => {
			docs.push(doc)
		},
	})
	// The in-memory collection delivers the initial documents asynchronously
	await new Promise((resolve) => setImmediate(resolve))
	handle.stop()
	return docs
}

describe('abPlaybackDebugForStudio publication', () => {
	function getPublication() {
		const registry = new PublicationRegistry()
		registerTimelinePublications(registry)

		const publication = registry.get(MeteorPubSub.abPlaybackDebugForStudio)
		if (!publication) throw new Error('Publication not registered')
		return publication
	}

	beforeEach(async () => {
		await Timeline.mutableCollection.removeAsync({})
		await Studios.removeAsync({})
	})

	test('requires a client connection', async () => {
		await setupMockStudio()

		const publication = getPublication()
		await expect(publication(createMockContext(null))).rejects.toThrow(/Can only be invoked by clients/)
	})

	test('throws when there are no studios', async () => {
		const publication = getPublication()
		await expect(publication(createMockContext({} as any))).rejects.toThrow(/No studios found/)
	})

	test('publishes the debug fields of the timeline for the studio', async () => {
		const studio = await setupMockStudio()

		const abPlaybackDebug = { now: 1234 } as Partial<AbPlaybackDebugInfo> as AbPlaybackDebugInfo
		const timeline: TimelineComplete = {
			_id: studio._id,
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
			abPlaybackDebug,
		}
		await Timeline.mutableCollection.insertAsync(timeline)
		// A timeline for another studio should not be published
		await Timeline.mutableCollection.insertAsync({ ...timeline, _id: protectString('otherStudio') })

		const publication = getPublication()
		const cursor = (await publication(createMockContext({} as any))) as MinimalMongoCursor<TimelineComplete>

		expect(await fetchCursor(cursor)).toEqual([
			{
				_id: studio._id,
				timelineHash: timeline.timelineHash,
				generated: timeline.generated,
				timelineBlob: timeline.timelineBlob,
				abPlaybackDebug,
			},
		])
	})
})
