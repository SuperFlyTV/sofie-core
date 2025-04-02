import { WrappedCollectionCore } from '@sofie-automation/corelib/dist/db/collection'
import { ProtectedString } from '@sofie-automation/corelib/dist/protectedString'

export class WrappedCollection<TDoc extends { _id: ProtectedString<any> }> extends WrappedCollectionCore<TDoc> {
	// Future use :)
}
