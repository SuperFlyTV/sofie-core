import { check, Match } from '../lib/check'
import { meteorPublishObserver } from './lib/lib'
import { MeteorPubSub } from '@sofie-automation/meteor-lib/dist/api/pubsub'
import { PeripheralDevice } from '@sofie-automation/corelib/dist/dataModel/PeripheralDevice'
import { MongoFieldSpecifierZeroes, MongoQuery } from '@sofie-automation/corelib/dist/mongo'
import { PeripheralDeviceId, StudioId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { MediaWorkFlows, MediaWorkFlowSteps, PeripheralDeviceCommands, PeripheralDevices } from '../collections'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { PeripheralDevicePubSub } from '@sofie-automation/shared-lib/dist/pubsub/peripheralDevice'
import { clone } from '@sofie-automation/corelib/dist/lib'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../security/securityVerify'
import { checkAccessAndGetPeripheralDevice } from '../security/check'

/*
 * This file contains publications for the peripheralDevices, such as playout-gateway, mos-gateway and package-manager
 */

const peripheralDeviceProjection: MongoFieldSpecifierZeroes<PeripheralDevice> = {
	token: 0,
	secretSettings: 0,
}

meteorPublishObserver(
	CorelibPubSub.peripheralDevices,
	async function (callbacks, peripheralDeviceIds: PeripheralDeviceId[] | null, token: string | undefined) {
		check(peripheralDeviceIds, Match.Maybe(Array))

		triggerWriteAccessBecauseNoCheckNecessary()

		// If values were provided, they must have values
		if (peripheralDeviceIds && peripheralDeviceIds.length === 0) return null

		// Add the requested filter
		const selector: MongoQuery<PeripheralDevice> = {}
		if (peripheralDeviceIds) selector._id = { $in: peripheralDeviceIds }

		const projection = clone(peripheralDeviceProjection)
		if (selector._id && token) {
			// in this case, send the secretSettings:
			delete projection.secretSettings
		}
		return PeripheralDevices.observeChanges(selector, callbacks, {
			projection,
		})
	}
)

meteorPublishObserver(CorelibPubSub.peripheralDevicesAndSubDevices, async function (callbacks, studioId: StudioId) {
	triggerWriteAccessBecauseNoCheckNecessary()

	const selector: MongoQuery<PeripheralDevice> = {
		'studioAndConfigId.studioId': studioId,
	}

	// TODO - this is not correctly reactive when changing the `studioId` property of a parent device
	const parents = (await PeripheralDevices.findFetchAsync(selector, { projection: { _id: 1 } })) as Array<
		Pick<PeripheralDevice, '_id'>
	>

	return PeripheralDevices.observeChanges(
		{
			$or: [
				{
					parentDeviceId: { $in: parents.map((i) => i._id) },
				},
				selector,
			],
		},
		callbacks,
		{
			projection: peripheralDeviceProjection,
		}
	)
})
meteorPublishObserver(
	PeripheralDevicePubSub.peripheralDeviceCommands,
	async function (callbacks, deviceId: PeripheralDeviceId, token: string | undefined) {
		await checkAccessAndGetPeripheralDevice(deviceId, token, this)

		return PeripheralDeviceCommands.observeChanges({ deviceId: deviceId }, callbacks)
	}
)
meteorPublishObserver(MeteorPubSub.mediaWorkFlows, async function (callbacks, _token: string | undefined) {
	triggerWriteAccessBecauseNoCheckNecessary()

	return MediaWorkFlows.observeChanges({}, callbacks)
})
meteorPublishObserver(MeteorPubSub.mediaWorkFlowSteps, async function (callbacks, _token: string | undefined) {
	triggerWriteAccessBecauseNoCheckNecessary()

	return MediaWorkFlowSteps.observeChanges({}, callbacks)
})
