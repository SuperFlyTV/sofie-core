import type { Collection, FindOptions } from 'mongodb'
import type { ProtectedString } from '@sofie-automation/corelib/dist/protectedString'
import {
	MongoLiveQueryHandle,
	ObserveCallbacks,
	ObserveChangesCallbacks,
} from '@sofie-automation/meteor-lib/dist/collections/lib'
import { MongoQuery } from '@sofie-automation/corelib/dist/db/collections'
import { PromisifyCallbacks } from '@sofie-automation/shared-lib/dist/lib/types'

export class CollectionObserver<DBInterface extends { _id: ProtectedString<any> }> {
	// TODO

	readonly #collection: Collection<DBInterface>

	constructor(collection: Collection<DBInterface>) {
		this.#collection = collection
	}

	async observeChanges(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveChangesCallbacks<DBInterface>>,
		options?: FindOptions<DBInterface>
	): Promise<MongoLiveQueryHandle> {
		// const span = profiler.startSpan(`MongoCollection.${this.name}.observeChanges`)
		// if (span) {
		// 	span.addLabels({
		// 		collection: this.name,
		// 		query: JSON.stringify(selector),
		// 	})
		// }
		// try {
		// 	const collection = await this._collection
		// 	const res = await collection.find((selector ?? {}) as any, options as any).observeChangesAsync(callbacks)
		// 	if (span) span.end()
		// 	return res
		// } catch (e) {
		// 	if (span) span.end()
		// 	this.wrapMongoError(e)
		// }
	}

	async observe(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveCallbacks<DBInterface>>,
		options?: FindOptions<DBInterface>
	): Promise<MongoLiveQueryHandle> {
		// const span = profiler.startSpan(`MongoCollection.${this.name}.observe`)
		// if (span) {
		// 	span.addLabels({
		// 		collection: this.name,
		// 		query: JSON.stringify(selector),
		// 	})
		// }
		// try {
		// 	const collection = await this._collection
		// 	const res = await collection.find((selector ?? {}) as any, options as any).observeAsync(callbacks)
		// 	if (span) span.end()
		// 	return res
		// } catch (e) {
		// 	if (span) span.end()
		// 	this.wrapMongoError(e)
		// }
	}
}
