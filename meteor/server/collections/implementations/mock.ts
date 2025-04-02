import { ProtectedString } from '@sofie-automation/corelib/dist/protectedString'
import { Meteor } from 'meteor/meteor'
import type { AnyBulkWriteOperation } from 'mongodb'
import { AsyncOnlyMongoCollection, TmpCollectionPair } from '../collection'
import { WrappedAsyncMongoCollection } from './asyncCollection'
import { Mongo } from 'meteor/mongo'

/** This is for the mock mongo collection, as internally it is sync and so we dont need or want to play around with fibers */
export class WrappedMockCollection<DBInterface extends { _id: ProtectedString<any> }>
	extends WrappedAsyncMongoCollection<DBInterface>
	implements AsyncOnlyMongoCollection<DBInterface>
{
	constructor(collection: TmpCollectionPair, name: string | null) {
		super(collection, name)

		if (!(Mongo.Collection as any)._isMock)
			throw new Meteor.Error(500, 'WrappedMockCollection is only valid for a mock collection')
	}

	get mutableCollection(): AsyncOnlyMongoCollection<DBInterface> {
		return this
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
