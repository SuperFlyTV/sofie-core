import { PeripheralDevicePubSubCollectionsNames } from '@sofie-automation/shared-lib/dist/pubsub/peripheralDevice'
import {
	createSyncPeripheralDeviceCustomPublicationMongoCollection,
	createSyncReadOnlyMongoCollection,
} from '../../collections/lib'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import type { TimelineComplete } from '@sofie-automation/corelib/dist/dataModel/Timeline'

/**
 * These collections are not public and are for the use of the TestTools only.
 * They are defined in this file, as hot reloading them is not supported
 */

export const IngestRundownStatuses = createSyncPeripheralDeviceCustomPublicationMongoCollection(
	PeripheralDevicePubSubCollectionsNames.ingestRundownStatus
)

export const MountedTriggers = createSyncPeripheralDeviceCustomPublicationMongoCollection(
	PeripheralDevicePubSubCollectionsNames.mountedTriggers
)
export const MountedTriggersPreviews = createSyncPeripheralDeviceCustomPublicationMongoCollection(
	PeripheralDevicePubSubCollectionsNames.mountedTriggersPreviews
)

export const StudioMappings = createSyncPeripheralDeviceCustomPublicationMongoCollection(
	PeripheralDevicePubSubCollectionsNames.studioMappings
)

export const StudioTimeline = createSyncPeripheralDeviceCustomPublicationMongoCollection(
	PeripheralDevicePubSubCollectionsNames.studioTimeline
)

export const TimelineDatastore = createSyncPeripheralDeviceCustomPublicationMongoCollection(
	PeripheralDevicePubSubCollectionsNames.timelineDatastore
)

/**
 * The unrouted timeline, with the AB playback debug information
 */
export const AbPlaybackTimeline = createSyncReadOnlyMongoCollection<TimelineComplete>(CollectionName.Timelines)
