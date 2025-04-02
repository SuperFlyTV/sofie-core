import { Meteor } from 'meteor/meteor'
import { check, Match } from '../lib/check'
import { meteorPublishObserver } from './lib/lib'
import { MeteorPubSub } from '@sofie-automation/meteor-lib/dist/api/pubsub'
import { getActiveRoutes, getRoutedMappings } from '@sofie-automation/meteor-lib/dist/collections/Studios'
import { ExternalMessageQueueObj } from '@sofie-automation/corelib/dist/dataModel/ExternalMessageQueue'
import {
	CustomPublish,
	meteorCustomPublish,
	SetupObserversResult,
	setUpOptimizedObserverArray,
	TriggerUpdate,
} from '../lib/customPublication'
import { literal } from '../lib/tempLib'
import { ReadonlyDeep } from 'type-fest'
import type { FindOptions } from 'mongodb'
import { applyAndValidateOverrides } from '@sofie-automation/corelib/dist/settings/objectWithOverrides'
import { PeripheralDeviceId, StudioId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import {
	ExpectedPackages,
	ExpectedPackageWorkStatuses,
	ExternalMessageQueue,
	PackageContainerStatuses,
	PackageInfos,
	Studios,
} from '../collections'
import { MongoQuery } from '@sofie-automation/corelib/dist/mongo'
import { RoutedMappings } from '@sofie-automation/shared-lib/dist/core/model/Timeline'
import { DBStudio } from '@sofie-automation/corelib/dist/dataModel/Studio'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import {
	PeripheralDevicePubSub,
	PeripheralDevicePubSubCollectionsNames,
} from '@sofie-automation/shared-lib/dist/pubsub/peripheralDevice'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../security/securityVerify'
import { checkAccessAndGetPeripheralDevice } from '../security/check'
import { assertConnectionHasOneOfPermissions } from '../security/auth'

meteorPublishObserver(
	CorelibPubSub.studios,
	async function (callbacks, studioIds: StudioId[] | null, _token: string | undefined) {
		check(studioIds, Match.Maybe(Array))

		triggerWriteAccessBecauseNoCheckNecessary()

		// If values were provided, they must have values
		if (studioIds && studioIds.length === 0) return null

		// Add the requested filter
		const selector: MongoQuery<DBStudio> = {}
		if (studioIds) selector._id = { $in: studioIds }

		return Studios.observeChanges(selector, callbacks)
	}
)

meteorPublishObserver(
	CorelibPubSub.externalMessageQueue,
	async function (callbacks, selector: MongoQuery<ExternalMessageQueueObj>, _token: string | undefined) {
		triggerWriteAccessBecauseNoCheckNecessary()

		if (!selector) throw new Meteor.Error(400, 'selector argument missing')
		const modifier: FindOptions<ExternalMessageQueueObj> = {
			projection: {},
		}

		return ExternalMessageQueue.observeChanges(selector, callbacks, modifier)
	}
)

meteorPublishObserver(
	CorelibPubSub.expectedPackages,
	async function (callbacks, studioIds: StudioId[], _token: string | undefined) {
		// Note: This differs from the expected packages sent to the Package Manager, instead @see PubSub.expectedPackagesForDevice
		check(studioIds, Array)

		triggerWriteAccessBecauseNoCheckNecessary()

		if (studioIds.length === 0) return null

		return ExpectedPackages.observeChanges(
			{
				studioId: { $in: studioIds },
			},
			callbacks
		)
	}
)
meteorPublishObserver(
	CorelibPubSub.expectedPackageWorkStatuses,
	async function (callbacks, studioIds: StudioId[], _token: string | undefined) {
		check(studioIds, Array)
		triggerWriteAccessBecauseNoCheckNecessary()

		if (studioIds.length === 0) return null

		return ExpectedPackageWorkStatuses.observeChanges(
			{
				studioId: { $in: studioIds },
			},
			callbacks
		)
	}
)
meteorPublishObserver(
	CorelibPubSub.packageContainerStatuses,
	async function (callbacks, studioIds: StudioId[], _token: string | undefined) {
		check(studioIds, Array)

		triggerWriteAccessBecauseNoCheckNecessary()

		if (studioIds.length === 0) return null

		return PackageContainerStatuses.observeChanges(
			{
				studioId: { $in: studioIds },
			},
			callbacks
		)
	}
)

meteorPublishObserver(
	CorelibPubSub.packageInfos,
	async function (callbacks, deviceId: PeripheralDeviceId, _token: string | undefined) {
		check(deviceId, String)

		triggerWriteAccessBecauseNoCheckNecessary()

		return PackageInfos.observeChanges({ deviceId }, callbacks)
	}
)

meteorCustomPublish(
	PeripheralDevicePubSub.mappingsForDevice,
	PeripheralDevicePubSubCollectionsNames.studioMappings,
	async function (pub, deviceId: PeripheralDeviceId, token: string | undefined) {
		check(deviceId, String)

		const peripheralDevice = await checkAccessAndGetPeripheralDevice(deviceId, token, this)

		const studioId = peripheralDevice.studioAndConfigId?.studioId
		if (!studioId) return

		await createObserverForMappingsPublication(pub, studioId)
	}
)

meteorCustomPublish(
	MeteorPubSub.mappingsForStudio,
	PeripheralDevicePubSubCollectionsNames.studioMappings,
	async function (pub, studioId: StudioId, _token: string | undefined) {
		check(studioId, String)

		assertConnectionHasOneOfPermissions(this.connection, 'testing')

		await createObserverForMappingsPublication(pub, studioId)
	}
)

interface RoutedMappingsArgs {
	readonly studioId: StudioId
}

type RoutedMappingsState = Record<string, never>

interface RoutedMappingsUpdateProps {
	invalidateStudio: boolean
}

async function setupMappingsPublicationObservers(
	args: ReadonlyDeep<RoutedMappingsArgs>,
	triggerUpdate: TriggerUpdate<RoutedMappingsUpdateProps>
): Promise<SetupObserversResult> {
	// Set up observers:
	return [
		Studios.observeChanges(
			args.studioId,
			{
				added: () => triggerUpdate({ invalidateStudio: true }),
				changed: () => triggerUpdate({ invalidateStudio: true }),
				removed: () => triggerUpdate({ invalidateStudio: true }),
			},
			{
				projection: {
					// It should be enough to watch the mappingsHash, since that should change whenever there is a
					// change to the mappings or the routes
					mappingsHash: 1,
				},
			}
		),
	]
}
async function manipulateMappingsPublicationData(
	args: RoutedMappingsArgs,
	_state: Partial<RoutedMappingsState>,
	_updateProps: Partial<RoutedMappingsUpdateProps> | undefined
): Promise<RoutedMappings[] | null> {
	// Prepare data for publication:

	// Ignore _updateProps, as we arent caching anything so we have to rerun from scratch no matter what

	const studio = await Studios.findOneAsync(args.studioId)
	if (!studio) return []

	const routes = getActiveRoutes(applyAndValidateOverrides(studio.routeSetsWithOverrides).obj)
	const rawMappings = applyAndValidateOverrides(studio.mappingsWithOverrides)
	const routedMappings = getRoutedMappings(rawMappings.obj, routes)

	return [
		literal<RoutedMappings>({
			_id: studio._id,
			mappingsHash: studio.mappingsHash,
			mappings: routedMappings,
		}),
	]
}

/** Create an observer for each publication, to simplify the stop conditions */
async function createObserverForMappingsPublication(pub: CustomPublish<RoutedMappings>, studioId: StudioId) {
	await setUpOptimizedObserverArray<
		RoutedMappings,
		RoutedMappingsArgs,
		RoutedMappingsState,
		RoutedMappingsUpdateProps
	>(
		`${PeripheralDevicePubSubCollectionsNames.studioMappings}_${studioId}`,
		{ studioId },
		setupMappingsPublicationObservers,
		manipulateMappingsPublicationData,
		pub
	)
}
