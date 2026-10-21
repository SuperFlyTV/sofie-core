import type * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import Classnames from 'classnames'
import Form from 'react-bootstrap/Form'

export type FilterInputValue = RegExp | string | undefined
interface FilterInputProps {
	filterChanged: (val: FilterInputValue) => void
}
export function FilterInput({ filterChanged }: Readonly<FilterInputProps>): JSX.Element {
	const [filterText, setFilterText] = useState<string>('')
	const changeFilter = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setFilterText(e.target.value)
	}, [])
	const [isError, setIsError] = useState(false)

	useEffect(() => {
		if (!filterText || typeof filterText !== 'string') {
			filterChanged(undefined)
			setIsError(false)
		} else if (RegExp(/^\/.+\/$/).exec(filterText)) {
			try {
				filterChanged(new RegExp(filterText.substr(1, filterText.length - 2)))
				setIsError(false)
			} catch (_e) {
				setIsError(true)
			}
		} else {
			filterChanged(filterText)
			setIsError(false)
		}
	}, [filterText])

	return (
		<Form.Control
			type="text"
			value={filterText}
			onChange={changeFilter}
			placeholder="Text or /RegEx/"
			className={Classnames({
				'highlight-is-error': isError,
			})}
		/>
	)
}

/** Check whether a value matches the filter from a FilterInput */
export function matchesFilter(value: string, filter: FilterInputValue): boolean {
	if (!filter) return true
	if (typeof filter === 'string') return value.includes(filter)
	return !!filter.exec(value)
}
