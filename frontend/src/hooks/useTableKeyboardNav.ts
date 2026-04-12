import { useState, useEffect, useCallback, type RefObject } from 'react'

interface TableKeyboardNavOpts {
  rowCount: number
  onSelect: (index: number) => void
  tableRef: RefObject<HTMLTableSectionElement | null>
  enabled?: boolean
}

interface TableKeyboardNavResult {
  focusedIndex: number
  getRowTabIndex: (index: number) => 0 | -1
  onRowKeyDown: (e: React.KeyboardEvent, index: number) => void
}

export function useTableKeyboardNav(opts: TableKeyboardNavOpts): TableKeyboardNavResult {
  const { rowCount, onSelect, tableRef, enabled = true } = opts
  const [focusedIndex, setFocusedIndex] = useState(0)

  useEffect(() => {
    setFocusedIndex(0)
  }, [rowCount])

  useEffect(() => {
    if (!enabled) return
    const rows = tableRef.current?.querySelectorAll<HTMLElement>('tr')
    rows?.[focusedIndex]?.focus()
  }, [focusedIndex, enabled, tableRef])

  const getRowTabIndex = useCallback(
    (index: number): 0 | -1 => (index === focusedIndex ? 0 : -1),
    [focusedIndex],
  )

  const onRowKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (!enabled) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex((index + 1) % rowCount)
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex((index - 1 + rowCount) % rowCount)
          break
        case 'Home':
          e.preventDefault()
          setFocusedIndex(0)
          break
        case 'End':
          e.preventDefault()
          setFocusedIndex(rowCount - 1)
          break
        case 'Enter':
          e.preventDefault()
          onSelect(index)
          break
      }
    },
    [enabled, rowCount, onSelect],
  )

  return { focusedIndex, getRowTabIndex, onRowKeyDown }
}
