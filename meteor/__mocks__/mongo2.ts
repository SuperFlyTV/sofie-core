/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import * as _ from 'underscore'
import { ProtectedString, unprotectString, protectString } from '../server/lib/tempLib'
import { RandomMock } from './random'
import { MeteorMock } from './meteor'
import { Meteor } from 'meteor/meteor'
import type {
	Abortable,
	AnyBulkWriteOperation,
	BulkWriteResult,
	CountDocumentsOptions,
	DeleteResult,
	Filter,
	FindCursor,
	InsertOneResult,
	UpdateResult,
} from 'mongodb'
import { ObserveCallbacks, ObserveChangesCallbacks } from '@sofie-automation/meteor-lib/dist/collections/lib'
import { mongoWhere, mongoFindOptions, mongoModify, MongoQuery } from '@sofie-automation/corelib/dist/mongo'
import { AsyncOnlyMongoCollection } from '../server/collections/collection'
import type { Collection as RawCollection, FindOptions } from 'mongodb'
const clone = require('fast-clone')

export namespace MongoMock {
	export class MongoClient {
		public async connect(): Promise<void> {
			return Promise.resolve()
		}
		public async close(): Promise<void> {
			return Promise.resolve()
		}
		public db(): MockMongoDb {
			return new MockMongoDb()
		}
	}

	export class MockMongoDb {
		public collection<T extends CollectionObject>(name: string): Collection<T> {
			return new Collection(name)
		}
	}

	interface ObserverEntry<T extends CollectionObject> {
		id: string
		query: any
		callbacksChanges?: ObserveChangesCallbacks<T>
		callbacksObserve?: ObserveCallbacks<T>
	}

	export interface MockCollections<T extends CollectionObject> {
		[collectionName: string]: MockCollection<T>
	}
	export interface MockCollection<T extends CollectionObject> {
		[id: string]: T
	}
	interface CollectionObject {
		_id: ProtectedString<any>
	}

	export const mockCollections: MockCollections<any> = {}
	export class Collection<T extends CollectionObject>
		implements
			Pick<
				RawCollection<T>,
				| 'collectionName'
				| 'find'
				| 'findOne'
				| 'countDocuments'
				| 'insertOne'
				| 'replaceOne'
				| 'updateOne'
				| 'updateMany'
				| 'deleteMany'
				| 'bulkWrite'
			>
	{
		public readonly collectionName: string
		private _options: any = {}
		// @ts-expect-error used in test to check that it's a mock
		private static _isMock = true as const
		public observers: ObserverEntry<T>[] = []

		public asyncBulkWriteDelay = 100

		constructor(name: string, options?: { transform?: never }) {
			this._options = options || {}
			this.collectionName = name

			if (this._options.transform) throw new Error('document transform is no longer supported')
		}

		find(query?: any, options?: FindOptions<any>): FindCursor<any> & { _fetchRaw: () => T[] } {
			if (_.isString(query)) query = { _id: query }
			query = query || {}
			const unimplementedUsedOptions = _.without(_.keys(options), 'sort', 'limit', 'fields', 'projection')
			if (options && 'fields' in options && 'projection' in options) {
				throw new Error(`Only one of 'fields' and 'projection' can be specified`)
			}
			if (unimplementedUsedOptions.length > 0) {
				throw new Error(`find being performed using unimplemented options: ${unimplementedUsedOptions}`)
			}
			const docsArray = Object.values<T>(this.documents)
			let docs: T[] = _.compact(
				query._id && typeof query._id === 'string'
					? [this.documents[query._id]]
					: docsArray.filter((doc) => mongoWhere(doc, query))
			)
			docs = mongoFindOptions(docs, options as any)
			// const observers = this.observers
			// const removeObserver = (id: string): void => {
			// 	const index = observers.findIndex((o) => o.id === id)
			// 	if (index === -1) throw new Meteor.Error(500, 'Cannot stop observer that is not registered')
			// 	observers.splice(index, 1)
			// }
			const res: Pick<FindCursor<T>, 'toArray'> & { _fetchRaw: () => T[] } = {
				_fetchRaw: () => {
					return docs
				},
				toArray: async () => {
					// Force this to be performed async
					await MeteorMock.sleepNoFakeTimers(0)

					return clone(docs)
				},
				// async observeAsync(clbs: ObserveCallbacks<T>): Promise<Meteor.LiveQueryHandle> {
				// 	// Force this to be performed async
				// 	await MeteorMock.sleepNoFakeTimers(0)
				// 	const id = Random.id(5)
				// 	observers.push(
				// 		literal<ObserverEntry<T>>({
				// 			id: id,
				// 			callbacksObserve: clbs,
				// 			query: query,
				// 		})
				// 	)
				// 	return {
				// 		stop() {
				// 			removeObserver(id)
				// 		},
				// 	}
				// },
				// async observeChangesAsync(clbs: ObserveChangesCallbacks<T>): Promise<Meteor.LiveQueryHandle> {
				// 	// Force this to be performed async
				// 	await MeteorMock.sleepNoFakeTimers(0)
				// 	// todo - finish implementing uses of callbacks
				// 	const id = Random.id(5)
				// 	observers.push(
				// 		literal<ObserverEntry<T>>({
				// 			id: id,
				// 			callbacksChanges: clbs,
				// 			query: query,
				// 		})
				// 	)
				// 	return {
				// 		stop() {
				// 			removeObserver(id)
				// 		},
				// 	}
				// },
			}
			return res as any
		}

		async findOne(query?: MongoQuery<T>, options?: FindOptions<T>) {
			const docs = await this.find(query, options).toArray()
			return docs[0]
		}

		async countDocuments(
			filter?: Filter<T> | undefined,
			options?: CountDocumentsOptions & Abortable
		): Promise<number> {
			const docs = this.find(filter, options)._fetchRaw()
			return docs.length
		}

		async updateOne(query: any, modifier: any): Promise<UpdateResult> {
			// Force this to be performed async
			await MeteorMock.sleepNoFakeTimers(0)

			const affected = this.updateRaw(query, modifier, false)

			return {
				acknowledged: true,
				matchedCount: affected,
				modifiedCount: affected,
				upsertedCount: 0,
				upsertedId: null,
			}
		}

		async updateMany(query: any, modifier: any): Promise<UpdateResult> {
			// Force this to be performed async
			await MeteorMock.sleepNoFakeTimers(0)

			const affected = this.updateRaw(query, modifier, true)

			return {
				acknowledged: true,
				matchedCount: affected,
				modifiedCount: affected,
				upsertedCount: 0,
				upsertedId: null,
			}
		}

		private updateRaw(query: any, modifier: any, multi: boolean): number {
			let docs = this.find(query)._fetchRaw()

			// By default mongo only updates one doc, unless told multi
			if (this.documents.length && !multi) {
				docs = [docs[0]]
			}

			_.each(docs, (doc) => {
				const modifiedDoc = mongoModify(query, doc, modifier)
				this.documents[unprotectString(doc._id)] = modifiedDoc

				Meteor.defer(() => {
					_.each(_.clone(this.observers), (obs) => {
						if (mongoWhere(doc, obs.query)) {
							if (obs.callbacksChanges?.changed) {
								obs.callbacksChanges.changed(doc._id, {}) // TODO - figure out what changed
							}
							if (obs.callbacksObserve?.changed) {
								obs.callbacksObserve.changed(modifiedDoc, doc)
							}
						}
					})
				})
			})

			return docs.length
		}

		async replaceOne(doc: any): Promise<UpdateResult> {
			// Force this to be performed async
			await MeteorMock.sleepNoFakeTimers(0)

			const existingDoc = await this.findOne(doc._id)
			if (existingDoc) {
				this.updateRaw(doc._id, doc, false)

				return {
					acknowledged: true,
					matchedCount: 1,
					modifiedCount: 1,
					upsertedCount: 1,
					upsertedId: null,
				}
			} else {
				this.insertRaw(doc)

				return {
					acknowledged: true,
					matchedCount: 0,
					modifiedCount: 0,
					upsertedCount: 1,
					upsertedId: doc._id,
				}
			}
		}

		async insertOne(doc: any): Promise<InsertOneResult> {
			// Force this to be performed async
			await MeteorMock.sleepNoFakeTimers(0)

			const insertedId = this.insertRaw(doc)

			return {
				acknowledged: true,
				insertedId: insertedId as any,
			}
		}
		private insertRaw(doc: any): string {
			const d = _.clone(doc)
			if (!d._id) d._id = protectString(RandomMock.id())

			if (this.documents[unprotectString(d._id)]) {
				throw new MeteorMock.Error(500, `Duplicate key '${d._id}'`)
			}

			this.documents[unprotectString(d._id)] = d

			Meteor.defer(() => {
				_.each(_.clone(this.observers), (obs) => {
					if (mongoWhere(d, obs.query)) {
						const fields = _.keys(_.omit(d, '_id'))
						if (obs.callbacksChanges?.addedBefore) {
							obs.callbacksChanges.addedBefore(d._id, fields, null as any)
						}
						if (obs.callbacksChanges?.added) {
							obs.callbacksChanges.added(d._id, fields)
						}
						if (obs.callbacksObserve?.added) {
							obs.callbacksObserve.added(d)
						}
					}
				})
			})

			return d._id
		}

		async deleteMany(query: any): Promise<DeleteResult> {
			// Force this to be performed async
			await MeteorMock.sleepNoFakeTimers(0)

			return this.removeRaw(query)
		}
		// remove(query: any): number {
		// 	if (!this._isTemporaryCollection)
		// 		throw new Meteor.Error(500, 'sync methods can only be used for unnamed collections')

		// 	return this.removeRaw(query)
		// }
		private removeRaw(query: any): DeleteResult {
			const docs = this.find(query)._fetchRaw()

			_.each(docs, (doc) => {
				delete this.documents[unprotectString(doc._id)]

				Meteor.defer(() => {
					_.each(_.clone(this.observers), (obs) => {
						if (mongoWhere(doc, obs.query)) {
							if (obs.callbacksChanges?.removed) {
								obs.callbacksChanges.removed(doc._id)
							}
							if (obs.callbacksObserve?.removed) {
								obs.callbacksObserve.removed(doc)
							}
						}
					})
				})
			})

			return {
				acknowledged: true,
				deletedCount: docs.length,
			}
		}

		createIndex(_obj: any) {
			// todo
		}
		allow() {
			// todo
		}

		async bulkWrite(updates: AnyBulkWriteOperation<any>[], _options: unknown): Promise<BulkWriteResult> {
			await MeteorMock.sleepNoFakeTimers(this.asyncBulkWriteDelay)

			for (const update of updates) {
				if ('insertOne' in update) {
					this.insertRaw(update.insertOne.document)
				} else if ('updateOne' in update) {
					if (update.updateOne.upsert) {
						throw new Error('upsert not supported for updateOne')
						// await this.upsertAsync(update.updateOne.filter, update.updateOne.update as any, {
						// 	multi: false,
						// })
					} else {
						this.updateRaw(update.updateOne.filter, update.updateOne.update as any, false)
					}
				} else if ('updateMany' in update) {
					if (update.updateMany.upsert) {
						throw new Error('upsert not supported for updateMany')
						// await this.upsertAsync(update.updateMany.filter, update.updateMany.update as any, {
						// 	multi: true,
						// })
					} else {
						this.updateRaw(update.updateMany.filter, update.updateMany.update as any, true)
					}
				} else if ('deleteOne' in update) {
					const docs = this.find(update.deleteOne.filter)._fetchRaw()
					if (docs.length) {
						this.removeRaw(docs[0]._id)
					}
				} else if ('deleteMany' in update) {
					this.removeRaw(update.deleteMany.filter)
				} else if (update['replaceOne']) {
					await this.replaceOne({
						...update.replaceOne.replacement,
						_id: update.replaceOne.filter._id,
					})
				}
			}

			return null as any
		}

		private get documents(): MockCollection<T> {
			if (!mockCollections[this.collectionName]) mockCollections[this.collectionName] = {}
			return mockCollections[this.collectionName]
		}
	}
	// Mock functions:
	export function mockSetData<T extends CollectionObject>(
		collection: AsyncOnlyMongoCollection<T>,
		data: MockCollection<T> | Array<T> | null
	) {
		const collectionName = collection.name
		if (collectionName === null) {
			throw new Meteor.Error(500, 'mockSetData can only be done for named collections')
		}

		data = data || {}
		if (_.isArray(data)) {
			const collectionData: MockCollection<T> = {}
			_.each(data, (doc) => {
				if (!doc._id) throw Error(`mockSetData: "${collectionName}": doc._id missing`)
				collectionData[unprotectString(doc._id)] = doc
			})
			mockCollections[collectionName] = collectionData
		} else {
			mockCollections[collectionName] = data
		}
	}

	export function deleteAllData() {
		Object.keys(mockCollections).forEach((id) => {
			mockCollections[id] = {}
		})
	}

	/**
	 * The Mock Collection type does a sleep before starting on executing the bulkWrite.
	 * This simulates the async nature of writes to mongo, and aims to detect race conditions in our code.
	 * This method will change the duration of the sleep, and returns the old delay value
	 */
	export function setCollectionAsyncBulkWriteDelay(collection: AsyncOnlyMongoCollection<any>, delay: number): number {
		const collection2 = collection as any
		if (typeof collection2.asyncWriteDelay !== 'number') {
			throw new Error(
				"asyncWriteDelay must be defined already, or this won't do anything. Perhaps some refactoring?"
			)
		}
		const oldDelay = collection2.asyncWriteDelay
		collection2.asyncWriteDelay = delay
		return oldDelay
	}
}
export function setup(): any {
	return MongoMock
}
