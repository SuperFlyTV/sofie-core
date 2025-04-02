import { ProtectedString, unprotectString } from '../protectedString'
import { AnyBulkWriteOperation, Collection as MongoCollection, FindOptions, CountOptions } from 'mongodb'
import type { ICollectionCore, MongoModifier, MongoQuery } from './collections'
// eslint-disable-next-line node/no-extraneous-import
import type { Span as ApmSpan } from 'elastic-apm-node'

/** Wrap some APM and better error small query modifications around a Mongo.Collection */
export class WrappedCollectionCore<TDoc extends { _id: ProtectedString<any> }> implements ICollectionCore<TDoc> {
	readonly #collection: MongoCollection<TDoc>
	readonly #startSpan: (name: string) => ApmSpan | null | undefined

	constructor(collection: MongoCollection<TDoc>, startSpan: (name: string) => ApmSpan | null | undefined) {
		this.#collection = collection
		this.#startSpan = startSpan
	}

	get name(): string {
		return this.#collection.collectionName
	}

	get rawCollection(): MongoCollection<TDoc> {
		return this.#collection
	}

	async findFetch(selector: MongoQuery<TDoc>, options?: FindOptions<TDoc>): Promise<Array<TDoc>> {
		const span = this.#startSpan('WrappedCollection.findFetch')
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}
		const res = await this.#collection.find(selector as any, options).toArray()
		if (span) span.end()
		return res as any
	}

	async findOne(selector: MongoQuery<TDoc> | TDoc['_id'], options?: FindOptions<TDoc>): Promise<TDoc | undefined> {
		const span = this.#startSpan('WrappedCollection.findOne')
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}

		if (typeof selector === 'string') {
			selector = { _id: selector }
		}
		const res = await this.#collection.findOne(selector, options)
		if (span) span.end()
		return res ?? undefined
	}

	async count(selector: MongoQuery<TDoc> | TDoc['_id'], options?: CountOptions): Promise<number> {
		const span = this.#startSpan('WrappedCollection.count')
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}
		const res = await this.#collection.countDocuments(selector as any, options)
		if (span) span.end()
		return res
	}

	async insertOne(doc: TDoc): Promise<TDoc['_id']> {
		const span = this.#startSpan('WrappedCollection.insertOne')
		if (span) {
			span.addLabels({
				collection: this.name,
				id: unprotectString(doc._id),
			})
		}

		const res = await this.#collection.insertOne(doc as any)
		if (span) span.end()
		return res.insertedId
	}

	// async insertMany(docs: Array<TDoc>): Promise<Array<TDoc['_id']>> {
	// 	const span = this.#startSpan('WrappedCollection.insertMany')
	// 	if (span) {
	// 		span.addLabels({
	// 			collection: this.name,
	// 			ids: unprotectStringArray(docs.map((d) => d._id)).join(','),
	// 		})
	// 	}

	// 	const res = await this.#collection.insertMany(docs as any)
	// 	if (span) span.end()
	// 	return res.insertedIds
	// }

	async replace(doc: TDoc): Promise<boolean> {
		const span = this.#startSpan('WrappedCollection.replace')
		if (span) {
			span.addLabels({
				collection: this.name,
				id: unprotectString(doc._id),
			})
		}

		const res = await this.#collection.replaceOne({ _id: doc._id }, doc, {
			upsert: true,
		})
		if (span) span.end()
		return res.matchedCount > 0
	}

	async update(
		selector: MongoQuery<TDoc> | TDoc['_id'],
		modifier: MongoModifier<TDoc>
		// options?: UpdateOptions
	): Promise<number> {
		const span = this.#startSpan('WrappedCollection.update')
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}

		if (typeof selector === 'string') {
			selector = { _id: selector }
		}

		const res = await this.#collection.updateMany(selector, modifier)
		if (span) span.end()
		return res.upsertedCount
	}

	async remove(selector: MongoQuery<TDoc> | TDoc['_id']): Promise<number> {
		const span = this.#startSpan('WrappedCollection.remove')
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}

		if (typeof selector === 'string') {
			selector = { _id: selector }
		}

		const res = await this.#collection.deleteMany(selector)
		if (span) span.end()
		return res.deletedCount
	}

	async bulkWrite(ops: Array<AnyBulkWriteOperation<TDoc>>): Promise<void> {
		const span = this.#startSpan('WrappedCollection.bulkWrite')
		if (span) {
			span.addLabels({
				collection: this.name,
				opCount: ops.length,
			})
		}

		if (ops.length > 0) {
			const bulkWriteResult = await this.#collection.bulkWrite(ops, {
				ordered: false,
			})
			if (bulkWriteResult && bulkWriteResult.hasWriteErrors()) {
				throw new Error(`Errors in rawCollection.bulkWrite: ${bulkWriteResult.getWriteErrors().join(',')}`)
			}
		}

		if (span) span.end()
	}
}
