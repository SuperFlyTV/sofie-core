import * as _ from 'underscore'
import { ProtectedString } from './protectedString'
import * as objectPath from 'object-path'
// eslint-disable-next-line node/no-extraneous-import
import type { Condition, Filter, UpdateFilter } from 'mongodb'
// @ts-expect-error No types available
import EJSON from 'ejson'

/** Hack's using typings pulled from meteor */

export type SortSpecifier<T> = {
	[P in keyof T]?: -1 | 1
}

// From Meteor docs: It is not possible to mix inclusion and exclusion styles: the keys must either be all 1 or all 0
export type MongoFieldSpecifierOnes<T> = {
	[P in keyof T]?: 1
}
export type MongoFieldSpecifierZeroes<T> = {
	[P in keyof T]?: 0
}
export type MongoFieldSpecifier<T> =
	| MongoFieldSpecifierOnes<T>
	| MongoFieldSpecifierZeroes<T>
	| MongoFieldSpecifierOnesStrict<Partial<T>>

/**
 * Type helper to construct a field specifier to include all the keys mentioned in a type union.
 * This ensures with Typescript that the fields specified in the query, match what we cast to afterwards
 */
export type MongoFieldSpecifierOnesStrict<T extends Record<string, any>> = {
	[key in keyof T]?: T[key] extends ProtectedString<any>
		? 1
		: T[key] extends object | undefined
		? MongoFieldSpecifierOnesStrict<T[key]> | 1
		: 1
}

export interface FindOneOptions<TDoc> {
	sort?: SortSpecifier<TDoc>
	skip?: number
	/** @deprecated */
	fields?: MongoFieldSpecifier<TDoc>
	projection?: MongoFieldSpecifier<TDoc>
}
export interface FindOptions<TDoc> extends FindOneOptions<TDoc> {
	limit?: number
}
/**
 * Subset of MongoSelector, only allows direct queries, not QueryWithModifiers such as $explain etc.
 * Used for simplified expressions (ie not using $and, $or etc..)
 * */
export type MongoQuery<TDoc> = Filter<TDoc>
export type MongoQueryKey<T> = RegExp | T | Condition<T> // Allowed properties in a MongoQuery
export type MongoModifier<TDoc> = UpdateFilter<TDoc>

/** End of hacks */

export function mongoWhereFilter<T, R extends Record<string, any>>(items: R[], selector: MongoQuery<T>): R[] {
	const results: R[] = []
	for (const item of items) {
		if (mongoWhere(item, selector)) results.push(item)
	}
	return results
}

export function mongoWhere<T>(o: Record<string, any>, selector: MongoQuery<T>): boolean {
	if (typeof selector !== 'object') {
		// selector must be an object
		return false
	}

	let ok = true
	for (const [key, s] of Object.entries<any>(selector)) {
		if (!ok) break

		try {
			const keyWords = key.split('.')
			if (keyWords.length > 1) {
				const oAttr = o[keyWords[0]]
				if (_.isObject(oAttr) || oAttr === undefined) {
					const innerSelector: any = {}
					innerSelector[keyWords.slice(1).join('.')] = s
					ok = mongoWhere(oAttr || {}, innerSelector)
				} else {
					ok = false
				}
			} else if (key === '$or') {
				if (_.isArray(s)) {
					let ok2 = false
					for (const innerSelector of s) {
						ok2 = ok2 || mongoWhere(o, innerSelector)
					}
					ok = ok2
				} else {
					throw new Error('An $or filter must be an array')
				}
			} else if (key === '$and') {
				if (Array.isArray(s) && s.length >= 1) {
					let ok2 = true
					for (const innerSelector of s) {
						ok2 = ok2 && mongoWhere(o, innerSelector)
						if (!ok2) break
					}
					ok = ok2
				} else {
					throw new Error('An $and filter must be an array')
				}
			} else if (key.startsWith('$')) {
				throw new Error(`Operand "${key}" is not implemented`)
			} else {
				const oAttr = o[key]

				if (_.isObject(s)) {
					if (_.has(s, '$gt')) {
						ok = oAttr > s.$gt
					} else if (_.has(s, '$gte')) {
						ok = oAttr >= s.$gte
					} else if (_.has(s, '$lt')) {
						ok = oAttr < s.$lt
					} else if (_.has(s, '$lte')) {
						ok = oAttr <= s.$lte
					} else if (_.has(s, '$eq')) {
						ok = oAttr === s.$eq
					} else if (_.has(s, '$ne')) {
						ok = oAttr !== s.$ne
					} else if (_.has(s, '$in')) {
						ok = s.$in.indexOf(oAttr) !== -1
					} else if (_.has(s, '$nin')) {
						ok = s.$nin.indexOf(oAttr) === -1
					} else if (_.has(s, '$exists')) {
						ok = (o[key] !== undefined) === !!s.$exists
					} else if (_.has(s, '$not')) {
						const innerSelector: any = {}
						innerSelector[key] = s.$not
						ok = !mongoWhere(o, innerSelector)
					} else {
						if (_.isObject(oAttr) || oAttr === undefined) {
							ok = mongoWhere(oAttr || {}, s)
						} else {
							ok = false
						}
					}
				} else {
					const innerSelector: any = {}
					innerSelector[key] = { $eq: s }
					ok = mongoWhere(o, innerSelector)
				}
			}
		} catch (e) {
			ok = false
		}
	}
	return ok
}
export function mongoFindOptions<TDoc extends { _id: ProtectedString<any> }>(
	docs0: ReadonlyArray<TDoc>,
	options?: FindOptions<TDoc>
): TDoc[] {
	let docs = [...docs0] // Shallow clone it
	if (options) {
		const sortOptions = options.sort as any
		if (sortOptions) {
			// Underscore doesnt support desc order, or multiple fields, so we have to do it manually
			const keys = Object.keys(sortOptions).filter((k) => sortOptions[k])
			const doSort = (a: any, b: any, i: number): number => {
				if (i >= keys.length) return 0

				const key = keys[i]
				const order = sortOptions[key]

				// Get the values, and handle asc vs desc
				const val1 = objectPath.get(order > 0 ? a : b, key)
				const val2 = objectPath.get(order > 0 ? b : a, key)

				if (_.isEqual(val1, val2)) {
					return doSort(a, b, i + 1)
				} else if (val1 > val2) {
					return 1
				} else {
					return -1
				}
			}

			if (keys.length > 0) {
				docs.sort((a, b) => doSort(a, b, 0))
			}
		}

		if (options.skip) {
			docs = docs.slice(options.skip)
		}
		if (options.limit !== undefined) {
			docs = _.take(docs, options.limit)
		}

		if ('fields' in options && 'projection' in options) {
			throw new Error(`Only one of 'fields' and 'projection' can be specified`)
		}
		const projection = (options.projection || options.fields) as any
		if (projection !== undefined) {
			docs = mongoApplyProjection(docs, projection) as TDoc[]
		}

		// options.reactive // Not used server-side
	}
	return docs
}

export function mongoApplyProjection<TDoc extends { _id: ProtectedString<any> }>(
	docs: TDoc[],
	projection0: MongoFieldSpecifier<TDoc>
): Partial<TDoc>[] {
	const compiledFn = mongoCompileProjection(projection0)
	return docs.map((doc) => compiledFn(doc))
}

export function mongoModify<TDoc extends { _id: ProtectedString<any> }>(
	selector: MongoQuery<TDoc>,
	doc: TDoc,
	modifier: MongoModifier<TDoc>
): TDoc {
	let replace = false
	for (const [key, value] of Object.entries<any>(modifier)) {
		if (key === '$set') {
			_.each(value, (value: any, key: string) => {
				setOntoPath(doc, key, selector, value)
			})
		} else if (key === '$unset') {
			_.each(value, (_value: any, key: string) => {
				unsetPath(doc, key, selector)
			})
		} else if (key === '$push') {
			_.each(value, (value: any, key: string) => {
				pushOntoPath(doc, key, value)
			})
		} else if (key === '$pull') {
			_.each(value, (value: any, key: string) => {
				pullFromPath(doc, key, value)
			})
		} else if (key === '$rename') {
			_.each(value, (value: any, key: string) => {
				renamePath(doc, key, value)
			})
		} else {
			if (key[0] === '$') {
				throw Error(`Update method "${key}" not implemented yet`)
			} else {
				replace = true
			}
		}
	}
	if (replace) {
		const newDoc = modifier as TDoc
		if (!newDoc._id) newDoc._id = doc._id
		return newDoc
	} else {
		return doc
	}
}

/**
 * Mutate a value on a object
 * @param obj Object
 * @param path Path to value in object
 * @param substitutions Object any query values to use instead of $
 * @param mutator Operation to run on the object value
 */
export function mutatePath<T>(
	obj: Record<string, unknown>,
	path: string,
	substitutions: Record<string, unknown>,
	mutator: (parentObj: Record<string, unknown>, key: string) => T
): void {
	if (!path) throw new Error('parameter path missing')

	const attrs = path.split('.')

	const lastAttr = _.last(attrs)
	const attrsExceptLast = attrs.slice(0, -1)

	const generateWildcardAttrInfo = () => {
		const keys = _.filter(_.keys(substitutions), (k) => k.indexOf(currentPath) === 0)
		if (keys.length === 0) {
			// This might be a bad assumption, but as this is for tests, lets go with it for now
			throw new Error(`missing parameters for $ in "${path}"`)
		}

		const query: any = {}
		const trimmedSubstitutions: any = {}
		_.each(keys, (key) => {
			// Create a mini 'query' and new substitutions with trimmed keys
			const remainingKey = key.substr(currentPath.length)
			if (remainingKey.indexOf('$') === -1) {
				query[remainingKey] = substitutions[key]
			} else {
				trimmedSubstitutions[remainingKey] = substitutions[key]
			}
		})

		return {
			query,
			trimmedSubstitutions,
		}
	}

	let o: any = obj
	let currentPath = ''
	for (const attr of attrsExceptLast) {
		if (attr === '$') {
			if (!_.isArray(o))
				throw new Error(
					'Object at "' + currentPath + '" is not an array ("' + o + '") (in path "' + path + '")'
				)

			const info = generateWildcardAttrInfo()
			for (const obj of o) {
				// mutate any objects which match
				if (_.isMatch(obj, info.query)) {
					mutatePath(obj, path.substr(currentPath.length + 2), info.trimmedSubstitutions, mutator)
				}
			}

			// Break the outer loop, as it gets handled with the for loop above
			break
		} else {
			if (!_.has(o, attr)) {
				o[attr] = {}
			} else {
				if (!_.isObject(o[attr]))
					throw new Error(
						'Object propery "' + attr + '" is not an object ("' + o[attr] + '") (in path "' + path + '")'
					)
			}
			o = o[attr]
		}
		currentPath += `${attr}.`
	}
	if (!lastAttr) throw new Error('Bad lastAttr')

	if (lastAttr === '$') {
		if (!_.isArray(o))
			throw new Error('Object at "' + currentPath + '" is not an array ("' + o + '") (in path "' + path + '")')

		const info = generateWildcardAttrInfo()
		o.forEach((val, i) => {
			// mutate any objects which match
			if (_.isMatch(val, info.query)) {
				mutator(o, i + '')
			}
		})
	} else {
		mutator(o, lastAttr)
	}
}
/**
 * Push a value into a object, and ensure the array exists
 * @param obj Object
 * @param path Path to array in object
 * @param valueToPush Value to push onto array
 */
export function pushOntoPath<T>(obj: Record<string, unknown>, path: string, valueToPush: T): void {
	const mutator = (o: Record<string, unknown>, lastAttr: string) => {
		if (!_.has(o, lastAttr)) {
			o[lastAttr] = []
		} else {
			if (!_.isArray(o[lastAttr]))
				throw new Error(
					'Object propery "' + lastAttr + '" is not an array ("' + o[lastAttr] + '") (in path "' + path + '")'
				)
		}
		const arr: any = o[lastAttr]

		arr.push(valueToPush)
		return arr
	}
	mutatePath(obj, path, {}, mutator)
}
/**
 * Push a value from a object, when the value matches
 * @param obj Object
 * @param path Path to array in object
 * @param valueToPush Value to push onto array
 */
export function pullFromPath<T>(obj: Record<string, unknown>, path: string, matchValue: T): void {
	const mutator = (o: Record<string, unknown>, lastAttr: string) => {
		if (_.has(o, lastAttr)) {
			if (!_.isArray(o[lastAttr]))
				throw new Error(
					'Object propery "' + lastAttr + '" is not an array ("' + o[lastAttr] + '") (in path "' + path + '")'
				)

			return (o[lastAttr] = _.filter(o[lastAttr] as any, (entry: T) => !_.isMatch(entry, matchValue)))
		} else {
			return undefined
		}
	}
	mutatePath(obj, path, {}, mutator)
}
/**
 * Set a value into a object
 * @param obj Object
 * @param path Path to value in object
 * @param substitutions Object any query values to use instead of $
 * @param valueToPush Value to set
 */
export function setOntoPath<T>(
	obj: Record<string, unknown>,
	path: string,
	substitutions: Record<string, unknown>,
	valueToSet: T
): void {
	mutatePath(
		obj,
		path,
		substitutions,
		(parentObj: Record<string, unknown>, key: string) => (parentObj[key] = valueToSet)
	)
}
/**
 * Remove a value from a object
 * @param obj Object
 * @param path Path to value in object
 * @param substitutions Object any query values to use instead of $
 */
export function unsetPath(obj: Record<string, unknown>, path: string, substitutions: Record<string, unknown>): void {
	mutatePath(obj, path, substitutions, (parentObj: Record<string, unknown>, key: string) => delete parentObj[key])
}
/**
 * Rename a path to value
 * @param obj Object
 * @param oldPath Old path to value in object
 * @param newPath New path to value
 */
export function renamePath(obj: Record<string, unknown>, oldPath: string, newPath: string): void {
	mutatePath(obj, oldPath, {}, (parentObj: Record<string, unknown>, key: string) => {
		setOntoPath(obj, newPath, {}, parentObj[key])
		delete parentObj[key]
	})
}

// nocommit - testing here

// Knows how to compile a fields projection to a predicate function.
// @returns - Function: a closure that filters out an object according to the
//            fields projection rules:
//            @param obj - Object: MongoDB-styled document
//            @returns - Object: a document with the fields filtered out
//                       according to projection rules. Doesn't retain subfields
//                       of passed argument.
export function mongoCompileProjection(fields: MongoFieldSpecifier<any>): (doc: any) => any {
	checkSupportedProjection(fields)

	const _idProjection = fields._id === undefined ? true : fields._id
	const details = projectionDetails(fields)

	// returns transformed doc according to ruleTree
	const transform = (doc: any | any[], ruleTree: PathsTreeNode): any | any[] => {
		// Special case for "sets"
		if (Array.isArray(doc)) {
			return doc.map((subdoc) => transform(subdoc, ruleTree))
		}

		const result = details.including ? {} : EJSON.clone(doc)

		Object.keys(ruleTree).forEach((key) => {
			if (doc == null || !Object.prototype.hasOwnProperty.call(doc, key)) {
				return
			}

			const rule = ruleTree[key]

			if (rule === Object(rule)) {
				// For sub-objects/subsets we branch
				if (doc[key] === Object(doc[key])) {
					result[key] = transform(doc[key], rule as PathsTreeNode)
				}
			} else if (details.including) {
				// Otherwise we don't even touch this subfield
				result[key] = EJSON.clone(doc[key])
			} else {
				delete result[key]
			}
		})

		return doc != null ? result : doc
	}

	return (doc) => {
		const result = transform(doc, details.tree)

		if (_idProjection && Object.prototype.hasOwnProperty.call(doc, '_id')) {
			result._id = doc._id
		}

		if (!_idProjection && Object.prototype.hasOwnProperty.call(result, '_id')) {
			delete result._id
		}

		return result
	}
}

function checkSupportedProjection(fields: MongoFieldSpecifier<any>): void {
	if (fields !== Object(fields) || Array.isArray(fields)) {
		throw Error('fields option must be an object')
	}

	Object.keys(fields).forEach((keyPath) => {
		if (keyPath.split('.').includes('$')) {
			throw Error("Minimongo doesn't support $ operator in projections yet.")
		}

		const value = fields[keyPath]

		if (
			typeof value === 'object' &&
			['$elemMatch', '$meta', '$slice'].some((key) => Object.prototype.hasOwnProperty.call(value, key))
		) {
			throw Error("Minimongo doesn't support operators in projections yet.")
		}

		if (![1, 0, true, false].includes(value as any)) {
			throw Error('Projection values should be one of 1, 0, true, or false')
		}
	})
}

// Traverses the keys of passed projection and constructs a tree where all
// leaves are either all True or all False
// @returns Object:
//  - tree - Object - tree representation of keys involved in projection
//  (exception for '_id' as it is a special case handled separately)
//  - including - Boolean - "take only certain fields" type of projection
function projectionDetails(fields: MongoFieldSpecifier<any>) {
	// Find the non-_id keys (_id is handled specially because it is included
	// unless explicitly excluded). Sort the keys, so that our code to detect
	// overlaps like 'foo' and 'foo.bar' can assume that 'foo' comes first.
	let fieldsKeys = Object.keys(fields).sort()

	// If _id is the only field in the projection, do not remove it, since it is
	// required to determine if this is an exclusion or exclusion. Also keep an
	// inclusive _id, since inclusive _id follows the normal rules about mixing
	// inclusive and exclusive fields. If _id is not the only field in the
	// projection and is exclusive, remove it so it can be handled later by a
	// special case, since exclusive _id is always allowed.
	if (!(fieldsKeys.length === 1 && fieldsKeys[0] === '_id') && !(fieldsKeys.includes('_id') && fields._id)) {
		fieldsKeys = fieldsKeys.filter((key) => key !== '_id')
	}

	let including: boolean | null = null // Unknown

	for (const keyPath of fieldsKeys) {
		const rule = !!fields[keyPath]

		if (including === null) {
			including = rule
		}

		// This error message is copied from MongoDB shell
		if (including !== rule) {
			throw Error('You cannot currently mix including and excluding fields.')
		}
	}

	const projectionRulesTree = pathsToTree(
		fieldsKeys,
		(_path) => including,
		(_node, path, fullPath) => {
			// Check passed projection fields' keys: If you have two rules such as
			// 'foo.bar' and 'foo.bar.baz', then the result becomes ambiguous. If
			// that happens, there is a probability you are doing something wrong,
			// framework should notify you about such mistake earlier on cursor
			// compilation step than later during runtime.  Note, that real mongo
			// doesn't do anything about it and the later rule appears in projection
			// project, more priority it takes.
			//
			// Example, assume following in mongo shell:
			// > db.coll.insert({ a: { b: 23, c: 44 } })
			// > db.coll.find({}, { 'a': 1, 'a.b': 1 })
			// {"_id": ObjectId("520bfe456024608e8ef24af3"), "a": {"b": 23}}
			// > db.coll.find({}, { 'a.b': 1, 'a': 1 })
			// {"_id": ObjectId("520bfe456024608e8ef24af3"), "a": {"b": 23, "c": 44}}
			//
			// Note, how second time the return set of keys is different.
			const currentPath = fullPath
			const anotherPath = path
			throw Error(
				`both ${currentPath} and ${anotherPath} found in fields option, ` +
					'using both of them may trigger unexpected behavior. Did you mean to ' +
					'use only one of them?'
			)
		}
	)

	return { including, tree: projectionRulesTree }
}

interface PathsTreeNode {
	[key: string]: PathsTreeNode | boolean | null | undefined
}

// paths - Array: list of mongo style paths
// newLeafFn - Function: of form function(path) should return a scalar value to
//                       put into list created for that path
// conflictFn - Function: of form function(node, path, fullPath) is called
//                        when building a tree path for 'fullPath' node on
//                        'path' was already a leaf with a value. Must return a
//                        conflict resolution.
// initial tree - Optional Object: starting tree.
// @returns - Object: tree represented as a set of nested objects
function pathsToTree(
	paths: string[],
	newLeafFn: (path: string) => boolean | null,
	conflictFn: (node: unknown, path: string, fullPath: string) => boolean | null,
	root: PathsTreeNode = {}
): PathsTreeNode {
	for (const path of paths) {
		const pathArray = path.split('.')
		let tree = root

		// use .every just for iteration with break
		const success = pathArray.slice(0, -1).every((key, i) => {
			if (!Object.prototype.hasOwnProperty.call(tree, key)) {
				tree[key] = {}
			} else if (tree[key] !== Object(tree[key])) {
				tree[key] = conflictFn(tree[key], pathArray.slice(0, i + 1).join('.'), path)

				// break out of loop if we are failing for this path
				if (tree[key] !== Object(tree[key])) {
					return false
				}
			}

			tree = tree[key] as PathsTreeNode

			return true
		})

		if (success) {
			const lastKey = pathArray[pathArray.length - 1]
			if (Object.prototype.hasOwnProperty.call(tree, lastKey)) {
				tree[lastKey] = conflictFn(tree[lastKey], path, path)
			} else {
				tree[lastKey] = newLeafFn(path)
			}
		}
	}

	return root
}
