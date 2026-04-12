import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import { useTableKeyboardNav } from '../useTableKeyboardNav'

function createTbody(rowCount: number): HTMLTableSectionElement {
  const tbody = document.createElement('tbody')
  for (let i = 0; i < rowCount; i++) {
    const tr = document.createElement('tr')
    tr.tabIndex = -1
    tbody.appendChild(tr)
  }
  document.body.appendChild(tbody)
  return tbody
}

describe('useTableKeyboardNav', () => {
  it('first row gets tabIndex 0, others get -1', () => {
    const tbody = createTbody(3)
    const onSelect = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef(tbody)
      return useTableKeyboardNav({ rowCount: 3, onSelect, tableRef: ref })
    })
    expect(result.current.getRowTabIndex(0)).toBe(0)
    expect(result.current.getRowTabIndex(1)).toBe(-1)
    expect(result.current.getRowTabIndex(2)).toBe(-1)
    tbody.remove()
  })

  it('ArrowDown moves focus to next row', () => {
    const tbody = createTbody(3)
    const onSelect = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef(tbody)
      return useTableKeyboardNav({ rowCount: 3, onSelect, tableRef: ref })
    })
    const event = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(event, 0))
    expect(result.current.focusedIndex).toBe(1)
    expect(result.current.getRowTabIndex(1)).toBe(0)
    tbody.remove()
  })

  it('ArrowUp moves focus to previous row', () => {
    const tbody = createTbody(3)
    const onSelect = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef(tbody)
      return useTableKeyboardNav({ rowCount: 3, onSelect, tableRef: ref })
    })
    const downEvent = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(downEvent, 0))
    const upEvent = { key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(upEvent, 1))
    expect(result.current.focusedIndex).toBe(0)
    tbody.remove()
  })

  it('ArrowDown wraps from last to first', () => {
    const tbody = createTbody(3)
    const onSelect = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef(tbody)
      return useTableKeyboardNav({ rowCount: 3, onSelect, tableRef: ref })
    })
    const event = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(event, 2))
    expect(result.current.focusedIndex).toBe(0)
    tbody.remove()
  })

  it('ArrowUp wraps from first to last', () => {
    const tbody = createTbody(3)
    const onSelect = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef(tbody)
      return useTableKeyboardNav({ rowCount: 3, onSelect, tableRef: ref })
    })
    const event = { key: 'ArrowUp', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(event, 0))
    expect(result.current.focusedIndex).toBe(2)
    tbody.remove()
  })

  it('Home jumps to first row', () => {
    const tbody = createTbody(5)
    const onSelect = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef(tbody)
      return useTableKeyboardNav({ rowCount: 5, onSelect, tableRef: ref })
    })
    const down = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(down, 0))
    act(() => result.current.onRowKeyDown(down, 1))
    act(() => result.current.onRowKeyDown(down, 2))
    const home = { key: 'Home', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(home, 3))
    expect(result.current.focusedIndex).toBe(0)
    tbody.remove()
  })

  it('End jumps to last row', () => {
    const tbody = createTbody(5)
    const onSelect = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef(tbody)
      return useTableKeyboardNav({ rowCount: 5, onSelect, tableRef: ref })
    })
    const end = { key: 'End', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(end, 0))
    expect(result.current.focusedIndex).toBe(4)
    tbody.remove()
  })

  it('Enter calls onSelect with focused index', () => {
    const tbody = createTbody(3)
    const onSelect = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef(tbody)
      return useTableKeyboardNav({ rowCount: 3, onSelect, tableRef: ref })
    })
    const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(event, 2))
    expect(onSelect).toHaveBeenCalledWith(2)
    tbody.remove()
  })

  it('resets focusedIndex to 0 when rowCount changes', () => {
    const tbody = createTbody(5)
    const onSelect = vi.fn()
    const { result, rerender } = renderHook(
      ({ rowCount }) => {
        const ref = useRef(tbody)
        return useTableKeyboardNav({ rowCount, onSelect, tableRef: ref })
      },
      { initialProps: { rowCount: 5 } },
    )
    const down = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(down, 0))
    act(() => result.current.onRowKeyDown(down, 1))
    act(() => result.current.onRowKeyDown(down, 2))
    expect(result.current.focusedIndex).toBe(3)
    rerender({ rowCount: 10 })
    expect(result.current.focusedIndex).toBe(0)
    tbody.remove()
  })

  it('does nothing when enabled is false', () => {
    const tbody = createTbody(3)
    const onSelect = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef(tbody)
      return useTableKeyboardNav({ rowCount: 3, onSelect, tableRef: ref, enabled: false })
    })
    const event = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(event, 0))
    expect(result.current.focusedIndex).toBe(0)
    expect(event.preventDefault).not.toHaveBeenCalled()
    tbody.remove()
  })
})
