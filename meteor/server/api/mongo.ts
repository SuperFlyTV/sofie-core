import { registerClassToMeteorMethods } from '../methods'
import { MethodContextAPI } from './methodContext'
import { MongoAPI, MongoAPIMethods } from '@sofie-automation/meteor-lib/dist/api/mongo'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import { ProtectedString } from '../lib/tempLib'
import { logger } from '../logging'
import { collectionsAllowDenyCache, collectionsCache } from '../collections/collection'
import { Meteor } from 'meteor/meteor'
import { checkHasOneOfPermissions, parseConnectionPermissions } from '../security/auth'

class MongoAPIClass extends MethodContextAPI implements MongoAPI {
	async insertDocument(collectionName: CollectionName, _newDocument: any): Promise<ProtectedString<any>> {
		logger.error(`MongoAPI.insertDocument for "${collectionName}"`)
		throw new Error('Not supported')
	}

	async updateDocument(collectionName: CollectionName, selector: any, modifier: any, options: any): Promise<any> {
		if (!this.connection) throw new Meteor.Error(403, 'Only supported from the client')

		// We don't check permissions here, that is expected to be done inside of the method
		// TODO - this should be pulled out to be its own property to statically enforce this check

		const validator = collectionsAllowDenyCache.get(collectionName)
		if (!validator) throw new Meteor.Error(403, `Not allowed to update collection: "${collectionName}`)

		const collection = collectionsCache.get(collectionName)
		if (!collection) throw new Meteor.Error(403, `Unknown collection: "${collectionName}`)

		const permissions = parseConnectionPermissions(this.connection)
		if (!checkHasOneOfPermissions(permissions, collectionName, ...validator.requiredPermissions))
			throw new Meteor.Error(403, `Not allowed to update collection: "${collectionName}"`)

		let documentId: string | null = null
		if (typeof selector === 'string') {
			documentId = selector
		} else if (selector && typeof selector === 'object') {
			documentId = selector._id
		}
		if (!documentId || typeof documentId !== 'string') {
			throw new Meteor.Error(403, `Update operations can only do so by id: "${collectionName}"`)
		}

		const currentDocument = await collection.findOneAsync(selector, options)
		if (!currentDocument) throw new Meteor.Error(404, `Document not found`)

		// TODO - meteor is doing more validation of the modifier, and is doing a 'better' extraction of the changed fieldnames

		// Perform check
		const isAllowed = validator.update(permissions, currentDocument, Object.keys(modifier), modifier)
		if (!isAllowed) throw new Meteor.Error(403, `Not allowed to update collection: "${collectionName}"`)

		// Perform update
		await collection.updateAsync(currentDocument._id, modifier, options)
	}

	async removeDocument(collectionName: CollectionName, _selector: any): Promise<any> {
		logger.error(`MongoAPI.insertDocument for "${collectionName}"`)
		throw new Meteor.Error(500, 'Not supported')
	}
}
registerClassToMeteorMethods(MongoAPIMethods, MongoAPIClass, true)
