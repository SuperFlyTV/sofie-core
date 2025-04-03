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
import { mongoCompileProjection, mongoWhere } from '@sofie-automation/corelib/dist/mongo'
import { EJSON } from 'meteor/ejson'

type SupportedChangeStreamDocument<TSchema extends { _id: ProtectedString<any> }> =
	| ChangeStreamInsertDocument<TSchema>
	| ChangeStreamUpdateDocument<TSchema>
	| ChangeStreamReplaceDocument<TSchema>
	| ChangeStreamDeleteDocument<TSchema>

interface ObserverInstance<DBInterface extends { _id: ProtectedString<any> }> {
	readonly id: string
	readonly query: MongoQuery<DBInterface> | DBInterface['_id']
	readonly projection: ((doc: any) => any) | undefined

	readonly changeCallback: (
		change: SupportedChangeStreamDocument<DBInterface>,
		instance: ObserverInstance<DBInterface>
	) => Promise<void>

	// Whether the update loop is running
	isRunning: boolean
	// Any unprocessed changes that need to be checked for validity and executed
	queuedDocuments: SupportedChangeStreamDocument<DBInterface>[]

	readonly documentCache: Map<DBInterface['_id'], Partial<DBInterface>>
}

export class CollectionObserver<DBInterface extends { _id: ProtectedString<any> }> {
	readonly #collection: Collection<DBInterface>

	readonly #observers = new Map<string, ObserverInstance<DBInterface>>()
	#stream: ChangeStream<DBInterface, ChangeStreamDocument<DBInterface>> | undefined

	readonly #documentCache = new Map<DBInterface['_id'], DBInterface>()

	constructor(collection: Collection<DBInterface>) {
		this.#collection = collection
	}

	async observeChanges(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveChangesCallbacks<DBInterface>>,
		options?: Pick<FindOptions<DBInterface>, 'projection'>
	): Promise<MongoLiveQueryHandle> {
		const hasCallback = Object.values<any>(callbacks).filter(Boolean).length > 0
		if (!hasCallback) throw new Meteor.Error(500, 'No callbacks provided to observeChanges')

		return this._startObserver(selector, options, async (change, instance) => {
			if (change.operationType === 'delete') {
				const id = change.documentKey._id as DBInterface['_id']
				if (instance.documentCache.has(id)) {
					instance.documentCache.delete(id)

					await callbacks.removed?.(id)
				}

				return
			}

			const newDoc = change.fullDocument as DBInterface
			if (mongoWhere(newDoc, selector)) {
				const oldDoc = instance.documentCache.get(newDoc._id)

				const newDocFiltered = instance.projection ? instance.projection(newDoc) : newDoc

				if (oldDoc) {
					// Update the cache
					instance.documentCache.set(newDoc._id, newDocFiltered)

					// Check if the document has changed
					const fields: Partial<DBInterface> = {}
					const allKeys = new Set<string>([...Object.keys(newDocFiltered), ...Object.keys(oldDoc)])
					for (const key0 of allKeys) {
						const key = key0 as keyof DBInterface
						if (!EJSON.equals(newDocFiltered[key], (oldDoc as any)[key])) {
							fields[key] = newDocFiltered[key]
						}
					}

					if (Object.keys(fields).length > 0) {
						await callbacks.changed?.(newDoc._id, fields)
					}
				} else {
					// New document, add it to the cache
					instance.documentCache.set(newDoc._id, newDocFiltered)

					await callbacks.added?.(newDoc._id, newDocFiltered as DBInterface)
				}
			} else {
				// No match, mark as deleted if needed
				const cachedDoc = instance.documentCache.get(newDoc._id)
				if (cachedDoc) {
					instance.documentCache.delete(newDoc._id)

					await callbacks.removed?.(newDoc._id)
				}
			}
		})
	}

	async observe(
		selector: MongoQuery<DBInterface> | DBInterface['_id'],
		callbacks: PromisifyCallbacks<ObserveCallbacks<DBInterface>>,
		options?: Pick<FindOptions<DBInterface>, 'projection'>
	): Promise<MongoLiveQueryHandle> {
		const hasCallback = Object.values<any>(callbacks).filter(Boolean).length > 0
		if (!hasCallback) throw new Meteor.Error(500, 'No callbacks provided to observe')

		return this._startObserver(selector, options, async (change, instance) => {
			if (change.operationType === 'delete') {
				const id = change.documentKey._id as DBInterface['_id']
				const cachedDoc = instance.documentCache.get(id)
				if (cachedDoc) {
					instance.documentCache.delete(id)

					await callbacks.removed?.(cachedDoc as DBInterface)
				}

				return
			}

			const newDoc = change.fullDocument as DBInterface
			if (mongoWhere(newDoc, selector)) {
				const oldDoc = instance.documentCache.get(newDoc._id)

				const newDocFiltered = instance.projection ? instance.projection(newDoc) : newDoc

				if (oldDoc) {
					// Update the cache
					instance.documentCache.set(newDoc._id, newDocFiltered)

					// Check if the document has changed
					if (!EJSON.equals(newDocFiltered, oldDoc as any)) {
						await callbacks.changed?.(newDocFiltered, oldDoc as DBInterface)
					}
				} else {
					// New document, add it to the cache
					instance.documentCache.set(newDoc._id, newDocFiltered)

					await callbacks.added?.(newDocFiltered as DBInterface)
				}
			} else {
				// No match, mark as deleted if needed
				const cachedDoc = instance.documentCache.get(newDoc._id)
				if (cachedDoc) {
					instance.documentCache.delete(newDoc._id)

					await callbacks.removed?.(cachedDoc as DBInterface)
				}
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
			projection: options?.projection ? mongoCompileProjection(options.projection) : undefined,

			changeCallback,

			isRunning: true,
			queuedDocuments: [],

			documentCache: new Map(),
		}

		try {
			this.#observers.set(instance.id, instance)

			// Load the initial version of the matched documents, and apply any concurrent changes
			// Note: we have to load the full document here, as it gets cached
			const initialDocuments = await this.#collection.find(selector).toArray()
			const processedDocuments = applyChangesToDocuments(initialDocuments, instance.queuedDocuments)
			instance.queuedDocuments = []
			// TODO: is this safe? could there be some non-idempotent changes?

			// Store in the root cache
			for (const doc of processedDocuments) {
				this.#documentCache.set(doc._id, doc as DBInterface)
			}

			// Perform the initial callbacks, terminating the observer if any of them throw
			for (const doc of processedDocuments) {
				await changeCallback(
					{
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
					},
					instance
				)
			}

			instance.isRunning = false

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

		this.#stream = this.#collection.watch(
			[
				{
					$match: {
						operationType: {
							$in: ['insert', 'update', 'replace', 'delete'],
						},
					},
				},
			],
			{
				fullDocument: 'whenAvailable', // nocommit this isnt working, which is causing everything to fail due to not having documents...
				batchSize: 1,
			}
		)

		this.#stream.on('change', (change) => {
			console.log('change', JSON.stringify(change, undefined, 4))

			switch (change.operationType) {
				case 'insert':
					this.#documentCache.set(change.fullDocument._id, change.fullDocument as DBInterface)
					break
				case 'delete':
					this.#documentCache.delete(change.documentKey._id as DBInterface['_id'])
					break
				case 'update':
					if (change.fullDocument) {
						this.#documentCache.set(change.fullDocument._id, change.fullDocument as DBInterface)
					} else {
						const cachedDoc = this.#documentCache.get(change.documentKey._id as DBInterface['_id'])
						if (!cachedDoc) {
							logger.warn(
								`Change stream update without fullDocument or cached document: ${stringifyError(
									change
								)}`
							)
							return
						}

						const clonedDoc = EJSON.clone(cachedDoc)
						// TODO - apply changes

						this.#documentCache.set(clonedDoc._id, clonedDoc as DBInterface)
						change.fullDocument = clonedDoc
					}
					break
				case 'replace':
					if (!change.fullDocument) {
						logger.warn(`Change stream replace without fullDocument: ${stringifyError(change)}`)
						return
					}

					this.#documentCache.set(change.fullDocument._id, change.fullDocument as DBInterface)
					break
				default:
					// Unsupported operation
					return
			}

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
				.changeCallback(change, observer)
				.catch((e) => {
					logger.error(`Failed to process change stream for observer ${observer.id}: ${stringifyError(e)}`)
				})
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
