import type {
	AnyBulkWriteOperation,
	Filter,
	FindOptions,
	UpdateFilter,
	Collection as MongoCollection,
	CountOptions,
} from 'mongodb'
import { ProtectedString } from '../protectedString'
import { ReadonlyDeep } from 'type-fest'

export type MongoQuery<TDoc> = Filter<TDoc>
export type MongoModifier<TDoc> = UpdateFilter<TDoc>

export interface IReadOnlyCollectionCore<TDoc extends { _id: ProtectedString<any> }> {
	readonly name: string

	readonly rawCollection: MongoCollection<TDoc>

	findFetch(selector?: MongoQuery<TDoc>, options?: FindOptions<TDoc>): Promise<Array<TDoc>>
	findOne(selector?: MongoQuery<TDoc> | TDoc['_id'], options?: FindOptions<TDoc>): Promise<TDoc | undefined>
	count(selector?: MongoQuery<TDoc> | TDoc['_id'], options?: CountOptions): Promise<number>
}

export interface ICollectionCore<TDoc extends { _id: ProtectedString<any> }> extends IReadOnlyCollectionCore<TDoc> {
	insertOne(doc: TDoc | ReadonlyDeep<TDoc>): Promise<TDoc['_id']>
	// insertMany(docs: Array<TDoc | ReadonlyDeep<TDoc>>): Promise<Array<TDoc['_id']>>
	remove(selector: MongoQuery<TDoc> | TDoc['_id']): Promise<number>
	update(selector: MongoQuery<TDoc> | TDoc['_id'], modifier: MongoModifier<TDoc>): Promise<number>

	/** Returns true if a doc was replaced, false if inserted */
	replace(doc: TDoc | ReadonlyDeep<TDoc>): Promise<boolean>

	bulkWrite(ops: Array<AnyBulkWriteOperation<TDoc>>): Promise<unknown>
}
