import type {
	ChangeStream,
	ChangeStreamDeleteDocument,
	ChangeStreamDocument,
	ChangeStreamInsertDocument,
	ChangeStreamReplaceDocument,
	ChangeStreamUpdateDocument,
	Collection,
	FindOptions,
	WithId,
} from 'mongodb'
import type { ProtectedString } from '@sofie-automation/corelib/dist/protectedString'
import {
	MongoLiveQueryHandle,
	ObserveCallbacks,
	ObserveChangesCallbacks,
} from '@sofie-automation/meteor-lib/dist/collections/lib'
import { MongoQuery } from '@sofie-automation/corelib/dist/db/collections'
import { PromisifyCallbacks } from '@sofie-automation/shared-lib/dist/lib/types'
import { assertNever, getRandomString, normalizeArrayToMap } from '@sofie-automation/corelib/dist/lib'
import { logger } from '../../logging'
import { stringifyError } from '@sofie-automation/shared-lib/dist/lib/stringifyError'
import { Meteor } from 'meteor/meteor'
import { LiveQueryHandle } from '../../lib/lib'

type SupportedChangeStreamDocument<TSchema extends { _id: ProtectedString<any> }> =
	| ChangeStreamInsertDocument<TSchema>
	| ChangeStreamUpdateDocument<TSchema>
	| ChangeStreamReplaceDocument<TSchema>
	| ChangeStreamDeleteDocument<TSchema>

interface ObserverInstance<DBInterface extends { _id: ProtectedString<any> }> {
	readonly id: string
	readonly query: MongoQuery<DBInterface> | DBInterface['_id']

	readonly changeCallback: (change: SupportedChangeStreamDocument<DBInterface>) => Promise<void>

	// Whether the update loop is running
	isRunning: boolean
	// Any unprocessed changes that need to be checked for validity and executed
	queuedDocuments: SupportedChangeStreamDocument<DBInterface>[]

	readonly knownDocumentIds: Set<DBInterface['_id']>
}

export class CollectionObserver<DBInterface extends { _id: ProtectedString<any> }> {
	readonly #collection: Collection<DBInterface>

	readonly #observers = new Map<string, ObserverInstance<DBInterface>>()
	#stream: ChangeStream<DBInterface, ChangeStreamDocument<DBInterface>> | undefined

	constructor(collection: Collection<DBInterface>) {
		this.#collection = collection
	}

	async observeChanges(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveChangesCallbacks<DBInterface>>,
		options?: FindOptions<DBInterface>
	): Promise<MongoLiveQueryHandle> {
		const hasCallback = Object.values<any>(callbacks).filter(Boolean).length > 0
		if (!hasCallback) throw new Meteor.Error(500, 'No callbacks provided to observeChanges')

		return this._startObserver(selector, options, async (change) => {
			// nocommit - apply selector, and options?
			switch (change.operationType) {
				case 'insert':
					if (callbacks.added) {
						await callbacks.added(change.fullDocument._id, change.fullDocument)
					}
					break
				case 'update':
					if (callbacks.changed) {
						const changes: Record<string, any> = {
							...change.updateDescription.updatedFields,
						}
						for (const field of change.updateDescription.removedFields || []) {
							changes[field] = undefined
						}
						await callbacks.changed(change.documentKey._id, changes)
					}
					break
				case 'replace':
					if (callbacks.changed) {
						// Lets be lazy, and claim the whole doc changed.
						await callbacks.changed(change.documentKey._id, change.fullDocument)
					}
					break
				case 'delete':
					if (callbacks.removed) {
						await callbacks.removed(change.documentKey._id as any)
					}
					break
				default:
					assertNever(change)
					break
			}
		})
	}

	async observe(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveCallbacks<DBInterface>>,
		options?: FindOptions<DBInterface>
	): Promise<MongoLiveQueryHandle> {
		const hasCallback = Object.values<any>(callbacks).filter(Boolean).length > 0
		if (!hasCallback) throw new Meteor.Error(500, 'No callbacks provided to observe')

		return this._startObserver(selector, options, async (change) => {
			// nocommit - apply selector, and options?
			switch (change.operationType) {
				case 'insert':
					if (callbacks.added) {
						await callbacks.added(change.fullDocument)
					}
					break
				case 'update':
				case 'replace':
					if (callbacks.changed) {
						await callbacks.changed(change.fullDocument!, change.fullDocumentBeforeChange!)
					}
					break
				case 'delete':
					if (callbacks.removed) {
						await callbacks.removed(change.documentKey._id as any)
					}
					break
				default:
					assertNever(change)
					break
			}
		})
	}

	private async _startObserver(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		options: FindOptions<DBInterface> | undefined,
		changeCallback: ObserverInstance<DBInterface>['changeCallback']
	): Promise<LiveQueryHandle> {
		this._startChangeStreamIfStopped()
		const instance: ObserverInstance<DBInterface> = {
			id: getRandomString(),
			query: selector,

			changeCallback,

			isRunning: true,
			queuedDocuments: [],

			knownDocumentIds: new Set(),
		}

		try {
			this.#observers.set(instance.id, instance)

			// Load the initial version of the matched documents, and apply any concurrent changes
			const initialDocuments = await this.#collection.find(selector, options).toArray()
			const processedDocuments = applyChangesToDocuments(initialDocuments, instance.queuedDocuments)
			instance.queuedDocuments = []
			// TODO: is this safe? could there be some non-idempotent changes?

			// Perform the initial callbacks, terminating the observer if any of them throw
			for (const doc of processedDocuments) {
				await changeCallback({
					_id: null,
					operationType: 'insert',
					fullDocument: doc as DBInterface,
					ns: {
						db: '',
						coll: '',
					},
					documentKey: {
						_id: doc._id,
					},
					collectionUUID: null as any,
				})
			}

			return {
				stop: () => {
					this.#observers.delete(instance.id)
					this._checkForUnobserved()
				},
			}
		} catch (e) {
			this.#observers.delete(instance.id)
			this._checkForUnobserved()

			throw e
		}
	}

	private _checkForUnobserved() {
		if (!this.#stream || this.#observers.size > 0) return

		this.#stream.close().catch((e) => {
			logger.warn(`Failed to close change stream: ${stringifyError(e)}`)
		})
		this.#stream = undefined
	}

	private _startChangeStreamIfStopped() {
		if (this.#stream) return

		this.#stream = this.#collection.watch(undefined, {
			fullDocument: 'whenAvailable',
			batchSize: 1,
		})

		this.#stream.on('change', (change) => {
			console.log('change', change)

			if (
				change.operationType !== 'insert' &&
				change.operationType !== 'update' &&
				change.operationType !== 'replace' &&
				change.operationType !== 'delete'
			)
				return

			for (const observer of this.#observers.values()) {
				observer.queuedDocuments.push(change)

				if (!observer.isRunning) this._triggerObserverUpdate(observer)
			}
		})
		this.#stream.on('end', () => {
			logger.warn(`Changes stream for ${this.#collection.collectionName} ended`)
		})
	}

	private _triggerObserverUpdate(observer: ObserverInstance<DBInterface>): void {
		observer.isRunning = true
		setImmediate(() => {
			const change = observer.queuedDocuments.pop()
			if (!change) {
				observer.isRunning = false
				return
			}

			observer
				.changeCallback(change)
				.then(
					() => {
						this._triggerObserverUpdate(observer)
					},
					(e) => {
						logger.error(
							`Failed to process change stream for observer ${observer.id}: ${stringifyError(e)}`
						)
					}
				)
				.finally(() => {
					// Try again in case there are more updates
					this._triggerObserverUpdate(observer)
				})
		})
	}
}

function applyChangesToDocuments<DBInterface extends { _id: ProtectedString<any> }>(
	initialDocuments: WithId<DBInterface>[],
	queuedDocuments: SupportedChangeStreamDocument<DBInterface>[]
): WithId<DBInterface>[] {
	if (queuedDocuments.length === 0) return initialDocuments

	const initialDocumentsMap = normalizeArrayToMap(initialDocuments, '_id')
	for (const change of queuedDocuments) {
		switch (change.operationType) {
			case 'insert':
				initialDocumentsMap.set(change.fullDocument._id as any, change.fullDocument as any)
				break
			case 'replace':
				initialDocumentsMap.set(change.documentKey._id as any, change.fullDocument as any)
				break
			case 'update':
				initialDocumentsMap.set(change.documentKey._id as any, change.fullDocument! as any)
				break
			case 'delete':
				initialDocumentsMap.delete(change.documentKey._id as any)
				break
			default:
				assertNever(change)
				break
		}
	}

	return Array.from(initialDocumentsMap.values())
}
