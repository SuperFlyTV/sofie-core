import { ProtectedString } from '@sofie-automation/shared-lib/dist/lib/protectedString'

export interface MediaObjects {
	_id: ProtectedString<'MediaObjId'>
	mediainfo?: {
		format?: {
			duration: number
		}
	}
}
