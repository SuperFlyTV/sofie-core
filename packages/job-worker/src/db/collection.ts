import { ProtectedString } from '@sofie-automation/corelib/dist/protectedString'
import { EventEmitter } from 'events'
import { ChangeStream, Collection as MongoCollection } from 'mongodb'
import { IChangeStreamEvents } from '.'
import { startSpanManual } from '../profiler'
import { IChangeStream, ICollection } from './collections'
import { WrappedCollectionCore } from '@sofie-automation/corelib/dist/db/collection'

/** Wrap some APM and better error small query modifications around a Mongo.Collection */
class WrappedCollection<TDoc extends { _id: ProtectedString<any> }>
	extends WrappedCollectionCore<TDoc>
	implements ICollection<TDoc>
{
	readonly #collection: MongoCollection<TDoc>

	/**
	 * We don't always want to allow using collection watchers, because of their lifetime and potential for blocking up workqueues.
	 * But we do want them (and the wrapped api) in cases where we are spawning background tasks that run by themselves.
	 */
	readonly #allowWatchers

	constructor(collection: MongoCollection<TDoc>, allowWatchers: boolean) {
		super(collection, startSpanManual)

		this.#collection = collection
		this.#allowWatchers = allowWatchers
	}

	watch(pipeline: any[]): IChangeStream<TDoc> {
		if (!this.#allowWatchers) throw new Error(`Watching collections is not allowed here`)

		const rawStream = this.#collection.watch(pipeline, {
			batchSize: 1,
		})

		return new WrappedChangeStream(rawStream)
	}
}

/**
 * Minimal wrapper around a MongoDB ChangeStream
 * This allows us to alter how errors are handled and to perform additional checks
 */
class WrappedChangeStream<TDoc extends { _id: ProtectedString<any> }>
	extends EventEmitter<IChangeStreamEvents<TDoc>>
	implements IChangeStream<TDoc>
{
	readonly #stream: ChangeStream<TDoc>

	constructor(stream: ChangeStream<TDoc>) {
		super()

		this.#stream = stream

		// Forward events
		this.#stream.on('end', () => this.emit('end'))
		this.#stream.on('error', (e) => this.emit('error', e))
		this.#stream.on('change', (change) => this.emit('change', change))
	}

	get closed(): boolean {
		return this.#stream.closed
	}
	async close(): Promise<void> {
		await this.#stream.close()
	}
}

/**
 * Wrap an existing MongoCollection into our wrapper
 * @param rawCollection Collection to wrap
 * @param allowWatchers Whether watchers are allowed in this context
 * @returns Wrapped collection
 */
export function wrapMongoCollection<TDoc extends { _id: ProtectedString<any> }>(
	rawCollection: MongoCollection<TDoc>,
	allowWatchers: boolean
): ICollection<TDoc> {
	return new WrappedCollection(rawCollection, allowWatchers)
}
