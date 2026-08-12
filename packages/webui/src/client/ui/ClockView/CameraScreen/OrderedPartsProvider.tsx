import React, { type PropsWithChildren } from 'react'
import type { PartId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { useOrderedPartIds } from '../../RundownView/RundownTiming/usePlaylistTimingValue.js'
import { useTimingPlaylistId } from '../../RundownView/RundownTiming/withTiming.js'

export const OrderedPartsContext = React.createContext<PartId[]>([])

export function OrderedPartsProvider({ children }: PropsWithChildren): JSX.Element {
	const playlistId = useTimingPlaylistId()
	const orderedPartIds = useOrderedPartIds(playlistId)

	return <OrderedPartsContext.Provider value={orderedPartIds}>{children}</OrderedPartsContext.Provider>
}
