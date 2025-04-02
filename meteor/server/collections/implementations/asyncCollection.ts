import { MongoModifier, MongoQuery } from '@sofie-automation/corelib/dist/mongo'
import { ProtectedString, protectString } from '@sofie-automation/corelib/dist/protectedString'
import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import {
	UpsertOptions,
	IndexSpecifier,
	MongoCursor,
	ObserveChangesCallbacks,
	ObserveCallbacks,
} from '@sofie-automation/meteor-lib/dist/collections/lib'
import type { AnyBulkWriteOperation, Collection as RawCollection, FindOptions } from 'mongodb'
import { stringifyError } from '@sofie-automation/shared-lib/dist/lib/stringifyError'
import { NpmModuleMongodb } from 'meteor/npm-mongo'
import { profiler } from '../../api/profiler'
import { PromisifyCallbacks } from '@sofie-automation/shared-lib/dist/lib/types'
import { AsyncOnlyMongoCollection, TmpCollectionPair } from '../collection'
import { WrappedCollection } from '../new-collection'

/**
 * A stripped down version of Meteor's Mongo.Cursor, with only the async methods
 * @deprecated
 */
export type MinimalMongoCursor<T extends { _id: ProtectedString<any> }> = Pick<
	MongoCursor<T>,
	'fetchAsync' | 'observeChangesAsync' | 'observeAsync' | 'countAsync'
	// | 'forEach' | 'map' |
>
/**
 * A stripped down version of Meteor's Mongo.Collection, with only the async methods
 */
export type MinimalMeteorMongoCollection<T extends { _id: ProtectedString<any> }> = Pick<
	Mongo.Collection<T>,
	'insertAsync' | 'removeAsync' | 'updateAsync' | 'upsertAsync' | 'rawCollection' | 'rawDatabase' | 'createIndex'
> & {
	find: (...args: Parameters<Mongo.Collection<T>['find']>) => MinimalMongoCursor<T>
}

export class WrappedAsyncMongoCollection<DBInterface extends { _id: ProtectedString<any> }>
	implements AsyncOnlyMongoCollection<DBInterface>
{
	protected readonly _collection: Promise<MinimalMeteorMongoCollection<DBInterface>>
	protected readonly _rawCollection: Promise<WrappedCollection<DBInterface>>

	public readonly name: string | null

	constructor(collection: TmpCollectionPair, name: string | null) {
		this._collection = Promise.resolve(collection.meteorCollection) as any
		this._rawCollection = collection.rawCollection as any
		this.name = name
	}

	protected get _isMock(): boolean {
		// @ts-expect-error re-export private property
		return Mongo.Collection._isMock
	}

	public get mockCollection(): Promise<MinimalMeteorMongoCollection<DBInterface>> {
		return this._collection
	}

	get mutableCollection(): AsyncOnlyMongoCollection<DBInterface> {
		return this
	}

	protected wrapMongoError(e: unknown): never {
		const str = stringifyError(e) || 'Unknown MongoDB Error'
		throw new Meteor.Error(e instanceof Meteor.Error ? e.error : 500, `Collection "${this.name}": ${str}`)
	}

	async rawCollection(): Promise<RawCollection<DBInterface>> {
		return (await this._rawCollection).rawCollection
	}

	async findFetchAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		options?: FindOptions<DBInterface>
	): Promise<Array<DBInterface>> {
		try {
			const collection = await this._rawCollection
			return collection.findFetch(selector, options)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}

	async findOneAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		options?: FindOptions<DBInterface>
	): Promise<DBInterface | undefined> {
		try {
			const collection = await this._rawCollection
			return collection.findOne(selector, options)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}

	async observeChanges(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveChangesCallbacks<DBInterface>>,
		options?: FindOptions<DBInterface>
	): Promise<Meteor.LiveQueryHandle> {
		const span = profiler.startSpan(`MongoCollection.${this.name}.observeChanges`)
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}
		try {
			const collection = await this._collection
			const res = await collection.find((selector ?? {}) as any, options as any).observeChangesAsync(callbacks)
			if (span) span.end()
			return res
		} catch (e) {
			if (span) span.end()
			this.wrapMongoError(e)
		}
	}

	async observe(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveCallbacks<DBInterface>>,
		options?: FindOptions<DBInterface>
	): Promise<Meteor.LiveQueryHandle> {
		const span = profiler.startSpan(`MongoCollection.${this.name}.observe`)
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}
		try {
			const collection = await this._collection
			const res = await collection.find((selector ?? {}) as any, options as any).observeAsync(callbacks)
			if (span) span.end()
			return res
		} catch (e) {
			if (span) span.end()
			this.wrapMongoError(e)
		}
	}

	public async countDocuments(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		options?: FindOptions<DBInterface>
	): Promise<number> {
		try {
			const collection = await this._rawCollection
			return collection.count(selector, options)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}

	public async insertAsync(doc: DBInterface): Promise<DBInterface['_id']> {
		try {
			const collection = await this._rawCollection
			return collection.insertOne(doc)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}

	async insertManyAsync(docs: DBInterface[]): Promise<Array<DBInterface['_id']>> {
		return Promise.all(docs.map(async (doc) => this.insertAsync(doc)))
	}

	public async removeAsync(selector: MongoQuery<DBInterface> | DBInterface['_id']): Promise<number> {
		try {
			const collection = await this._rawCollection
			return collection.remove(selector)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}
	public async updateAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'] | { _id: DBInterface['_id'] },
		modifier: MongoModifier<DBInterface>
	): Promise<number> {
		try {
			const collection = await this._rawCollection
			return collection.update(selector, modifier)
		} catch (e) {
			this.wrapMongoError(e)
		}
	}
	public async upsertAsync(
		selector: MongoQuery<DBInterface> | DBInterface['_id'] | { _id: DBInterface['_id'] },
		modifier: MongoModifier<DBInterface>,
		options?: UpsertOptions
	): Promise<{
		numberAffected?: number
		insertedId?: DBInterface['_id']
	}> {
		const span = profiler.startSpan(`MongoCollection.${this.name}.upsert`)
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}
		try {
			const collection = await this._collection
			const result = await collection.upsertAsync(selector as any, modifier as any, options)
			if (span) span.end()
			return {
				numberAffected: result.numberAffected,
				insertedId: protectString(result.insertedId),
			}
		} catch (e) {
			if (span) span.end()
			this.wrapMongoError(e)
		}
	}

	async upsertManyAsync(docs: DBInterface[]): Promise<{ numberAffected: number; insertedIds: DBInterface['_id'][] }> {
		const result: {
			numberAffected: number
			insertedIds: DBInterface['_id'][]
		} = {
			numberAffected: 0,
			insertedIds: [],
		}
		await Promise.all(
			docs.map(async (doc) =>
				this.upsertAsync(doc._id, { $set: doc }).then((r) => {
					if (r.numberAffected) result.numberAffected += r.numberAffected
					if (r.insertedId) result.insertedIds.push(r.insertedId)
				})
			)
		)
		return result
	}

	async bulkWriteAsync(ops: Array<AnyBulkWriteOperation<DBInterface>>): Promise<void> {
		try {
			const rawCollection = await this._rawCollection
			await rawCollection.bulkWrite(ops)
		} catch (e) {
			if (e instanceof Error) {
				throw new Meteor.Error(500, e.message)
			} else {
				this.wrapMongoError(e)
			}
		}
	}

	async createIndex(
		keys: IndexSpecifier<DBInterface> | string,
		options?: NpmModuleMongodb.CreateIndexesOptions
	): Promise<void> {
		const span = profiler.startSpan(`MongoCollection.${this.name}.createIndex`)
		if (span) {
			span.addLabels({
				collection: this.name,
				keys: JSON.stringify(keys),
			})
		}
		try {
			const collection = await this._collection
			const res = collection.createIndex(keys as any, options)
			if (span) span.end()
			return res
		} catch (e) {
			if (span) span.end()
			this.wrapMongoError(e)
		}
	}
}
