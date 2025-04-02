import { ProtectedString } from '@sofie-automation/corelib/dist/protectedString'
import { Meteor } from 'meteor/meteor'
import type { AnyBulkWriteOperation, FindOptions } from 'mongodb'
import { AsyncOnlyMongoCollection } from '../collection'
import { WrappedAsyncMongoCollection } from './asyncCollection'
import { MongoQuery } from '@sofie-automation/corelib/dist/mongo'
import { ObserveCallbacks, ObserveChangesCallbacks } from '@sofie-automation/meteor-lib/dist/collections/lib'
import { PromisifyCallbacks } from '@sofie-automation/shared-lib/dist/lib/types'
import { WrappedCollection } from '../new-collection'
import type { MongoMock } from '../../../__mocks__/mongo2'

/** This is for the mock mongo collection, as internally it is sync and so we dont need or want to play around with fibers */
export class WrappedMockCollection<DBInterface extends { _id: ProtectedString<any> }>
	extends WrappedAsyncMongoCollection<DBInterface>
	implements AsyncOnlyMongoCollection<DBInterface>
{
	constructor(collection: Promise<WrappedCollection<any>>, name: string | null) {
		super(collection, name)

		// if (!(Mongo.Collection as any)._isMock)
		// 	throw new Meteor.Error(500, 'WrappedMockCollection is only valid for a mock collection')
	}

	get mutableCollection(): AsyncOnlyMongoCollection<DBInterface> {
		return this
	}

	private get mockCollection(): Promise<MongoMock.Collection<DBInterface>> {
		return this.rawCollection() as unknown as Promise<MongoMock.Collection<DBInterface>>
	}

	override async observe(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveCallbacks<DBInterface>>,
		options?: Pick<FindOptions<DBInterface>, 'projection'> | undefined
	): Promise<Meteor.LiveQueryHandle> {
		const collection = await this.mockCollection

		return collection.mockObserve(selector, callbacks, options)
	}

	override async observeChanges(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveChangesCallbacks<DBInterface>>,
		options?: Pick<FindOptions<DBInterface>, 'projection'> | undefined
	): Promise<Meteor.LiveQueryHandle> {
		const collection = await this.mockCollection

		return collection.mockObserveChanges(selector, callbacks, options)
	}

	override async bulkWriteAsync(ops: Array<AnyBulkWriteOperation<DBInterface>>): Promise<void> {
		if (ops.length > 0) {
			const rawCollection = await this.rawCollection()
			const bulkWriteResult = await rawCollection.bulkWrite(ops, {
				ordered: false,
			})
			if (bulkWriteResult && bulkWriteResult.hasWriteErrors()) {
				throw new Meteor.Error(
					500,
					`Errors in rawCollection.bulkWrite: ${bulkWriteResult.getWriteErrors().join(',')}`
				)
			}
		}
	}
}
