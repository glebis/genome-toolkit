# Keyboard Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full keyboard navigation — arrow keys in the SNP table, focus traps in all overlays, visible focus indicators, return-focus-on-close.

**Architecture:** Two custom hooks (`useTableKeyboardNav`, `useFocusTrap`) integrated into 4 existing components. No new dependencies.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-04-12-keyboard-navigation-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/hooks/useTableKeyboardNav.ts` | Roving tabindex, arrow/Home/End/Enter handling |
| Create | `frontend/src/hooks/useFocusTrap.ts` | Focus trap, Escape, auto-focus, return focus |
| Create | `frontend/src/hooks/__tests__/useTableKeyboardNav.test.ts` | Unit tests for table nav hook |
| Create | `frontend/src/hooks/__tests__/useFocusTrap.test.ts` | Unit tests for focus trap hook |
| Modify | `frontend/src/components/SNPTable.tsx` | Integrate useTableKeyboardNav |
| Modify | `frontend/src/components/VariantDrawer.tsx` | Integrate useFocusTrap, remove manual Escape |
| Modify | `frontend/src/components/mental-health/ChecklistSidebar.tsx` | Integrate useFocusTrap |
| Modify | `frontend/src/components/CommandPalette.tsx` | Integrate useFocusTrap, remove manual Escape |
| Modify | `frontend/src/styles/theme.css` | Focus indicator styles |

---

### Task 1: `useFocusTrap` hook — tests

**Files:**
- Create: `frontend/src/hooks/__tests__/useFocusTrap.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useFocusTrap } from '../useFocusTrap'

function createContainer(): HTMLDivElement {
  const container = document.createElement('div')
  const btn1 = document.createElement('button')
  btn1.textContent = 'First'
  const btn2 = document.createElement('button')
  btn2.textContent = 'Second'
  const btn3 = document.createElement('button')
  btn3.textContent = 'Third'
  container.append(btn1, btn2, btn3)
  document.body.appendChild(container)
  return container
}

function Wrapper({ containerEl, isOpen, onEscape, autoFocus, returnFocus }: {
  containerEl: HTMLElement
  isOpen: boolean
  onEscape?: () => void
  autoFocus?: boolean
  returnFocus?: boolean
}) {
  const ref = useRef(containerEl)
  useFocusTrap(ref, isOpen, { onEscape, autoFocus, returnFocus })
  return null
}

describe('useFocusTrap', () => {
  it('focuses first focusable element on open', () => {
    const container = createContainer()
    const { unmount } = renderHook(() => {
      const ref = useRef(container)
      useFocusTrap(ref, true)
    })
    expect(document.activeElement).toBe(container.querySelector('button'))
    unmount()
    container.remove()
  })

  it('calls onEscape when Escape is pressed', () => {
    const container = createContainer()
    const onEscape = vi.fn()
    const { unmount } = renderHook(() => {
      const ref = useRef(container)
      useFocusTrap(ref, true, { onEscape })
    })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onEscape).toHaveBeenCalledOnce()
    unmount()
    container.remove()
  })

  it('does not call onEscape when closed', () => {
    const container = createContainer()
    const onEscape = vi.fn()
    const { unmount } = renderHook(() => {
      const ref = useRef(container)
      useFocusTrap(ref, false, { onEscape })
    })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onEscape).not.toHaveBeenCalled()
    unmount()
    container.remove()
  })

  it('traps Tab forward — wraps from last to first', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    const { unmount } = renderHook(() => {
      const ref = useRef(container)
      useFocusTrap(ref, true)
    })
    // Focus last button
    ;(buttons[2] as HTMLElement).focus()
    // Press Tab
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
    container.dispatchEvent(event)
    expect(document.activeElement).toBe(buttons[0])
    unmount()
    container.remove()
  })

  it('traps Shift+Tab backward — wraps from first to last', () => {
    const container = createContainer()
    const buttons = container.querySelectorAll('button')
    const { unmount } = renderHook(() => {
      const ref = useRef(container)
      useFocusTrap(ref, true)
    })
    // Focus first button
    ;(buttons[0] as HTMLElement).focus()
    // Press Shift+Tab
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
    container.dispatchEvent(event)
    expect(document.activeElement).toBe(buttons[2])
    unmount()
    container.remove()
  })

  it('restores focus to previously focused element on close', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Trigger'
    document.body.appendChild(trigger)
    trigger.focus()

    const container = createContainer()
    const { rerender, unmount } = renderHook(
      ({ isOpen }) => {
        const ref = useRef(container)
        useFocusTrap(ref, isOpen, { returnFocus: true })
      },
      { initialProps: { isOpen: true } }
    )
    // Focus moved into container
    expect(document.activeElement).toBe(container.querySelector('button'))
    // Close
    rerender({ isOpen: false })
    expect(document.activeElement).toBe(trigger)
    unmount()
    container.remove()
    trigger.remove()
  })

  it('skips auto-focus when autoFocus is false', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Trigger'
    document.body.appendChild(trigger)
    trigger.focus()

    const container = createContainer()
    const { unmount } = renderHook(() => {
      const ref = useRef(container)
      useFocusTrap(ref, true, { autoFocus: false })
    })
    expect(document.activeElement).toBe(trigger)
    unmount()
    container.remove()
    trigger.remove()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useFocusTrap.test.ts`
Expected: FAIL — module `../useFocusTrap` not found

---

### Task 2: `useFocusTrap` hook — implementation

**Files:**
- Create: `frontend/src/hooks/useFocusTrap.ts`

- [ ] **Step 1: Implement the hook**

```ts
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  opts?: {
    onEscape?: () => void
    autoFocus?: boolean
    returnFocus?: boolean
  },
): void {
  const previousFocus = useRef<Element | null>(null)
  const autoFocus = opts?.autoFocus ?? true
  const returnFocus = opts?.returnFocus ?? true

  // Save previous focus & auto-focus on open
  useEffect(() => {
    if (!isOpen) return
    previousFocus.current = document.activeElement
    if (autoFocus) {
      const first = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
    }
  }, [isOpen, autoFocus, containerRef])

  // Return focus on close
  useEffect(() => {
    if (isOpen) return
    if (returnFocus && previousFocus.current instanceof HTMLElement) {
      previousFocus.current.focus()
      previousFocus.current = null
    }
  }, [isOpen, returnFocus])

  // Trap Tab and handle Escape
  useEffect(() => {
    if (!isOpen) return
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        opts?.onEscape?.()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last || !container.contains(document.activeElement)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    // Listen on container for Tab, window for Escape
    container.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, containerRef, opts?.onEscape])
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useFocusTrap.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useFocusTrap.ts frontend/src/hooks/__tests__/useFocusTrap.test.ts
git commit -m "feat(#19): add useFocusTrap hook with tests"
```

---

### Task 3: `useTableKeyboardNav` hook — tests

**Files:**
- Create: `frontend/src/hooks/__tests__/useTableKeyboardNav.test.ts`

- [ ] **Step 1: Create the test file**

```ts
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
    // Move to row 1 first
    const downEvent = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(downEvent, 0))
    // Move back up
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
    // Move to row 3
    const down = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(down, 0))
    act(() => result.current.onRowKeyDown(down, 1))
    act(() => result.current.onRowKeyDown(down, 2))
    // Press Home
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
    // Move to row 3
    const down = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as React.KeyboardEvent
    act(() => result.current.onRowKeyDown(down, 0))
    act(() => result.current.onRowKeyDown(down, 1))
    act(() => result.current.onRowKeyDown(down, 2))
    expect(result.current.focusedIndex).toBe(3)
    // Page change — rowCount changes
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useTableKeyboardNav.test.ts`
Expected: FAIL — module `../useTableKeyboardNav` not found

---

### Task 4: `useTableKeyboardNav` hook — implementation

**Files:**
- Create: `frontend/src/hooks/useTableKeyboardNav.ts`

- [ ] **Step 1: Implement the hook**

```ts
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

  // Reset on page change (rowCount changes)
  useEffect(() => {
    setFocusedIndex(0)
  }, [rowCount])

  // Focus the DOM row when focusedIndex changes
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
    (e: React.KeyboardEvent, _index: number) => {
      if (!enabled) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex(prev => (prev + 1) % rowCount)
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex(prev => (prev - 1 + rowCount) % rowCount)
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
          onSelect(focusedIndex)
          break
      }
    },
    [enabled, rowCount, onSelect, focusedIndex],
  )

  return { focusedIndex, getRowTabIndex, onRowKeyDown }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useTableKeyboardNav.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useTableKeyboardNav.ts frontend/src/hooks/__tests__/useTableKeyboardNav.test.ts
git commit -m "feat(#19): add useTableKeyboardNav hook with tests"
```

---

### Task 5: Integrate `useTableKeyboardNav` into SNPTable

**Files:**
- Modify: `frontend/src/components/SNPTable.tsx:255-293` (row rendering)

- [ ] **Step 1: Add hook import and setup**

At the top of `SNPTable.tsx`, add the import:

```ts
import { useTableKeyboardNav } from '../hooks/useTableKeyboardNav'
```

Inside the component, after the `useReactTable` call, add:

```ts
const tbodyRef = useRef<HTMLTableSectionElement>(null)
const rows = table.getRowModel().rows
const { getRowTabIndex, onRowKeyDown } = useTableKeyboardNav({
  rowCount: rows.length,
  onSelect: (index) => onRowClick?.(rows[index].original),
  tableRef: tbodyRef,
})
```

Add `ref={tbodyRef}` to the `<tbody>` element.

- [ ] **Step 2: Update row rendering**

Replace the current row props:

```tsx
tabIndex={0}
```

with:

```tsx
tabIndex={getRowTabIndex(i)}
```

Replace the current `onKeyDown`:

```tsx
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onRowClick?.(row.original)
  }
}}
```

with:

```tsx
onKeyDown={(e) => onRowKeyDown(e, i)}
```

- [ ] **Step 3: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SNPTable.tsx
git commit -m "feat(#19): integrate keyboard navigation into SNPTable"
```

---

### Task 6: Integrate `useFocusTrap` into VariantDrawer

**Files:**
- Modify: `frontend/src/components/VariantDrawer.tsx:152-156` (remove Escape handler), add ref + hook

- [ ] **Step 1: Add hook import and ref**

At the top of `VariantDrawer.tsx`, add:

```ts
import { useFocusTrap } from '../hooks/useFocusTrap'
```

Inside the component, add:

```ts
const drawerRef = useRef<HTMLDivElement>(null)
useFocusTrap(drawerRef, true, { onEscape: onClose })
```

- [ ] **Step 2: Remove the manual Escape listener**

Delete lines 152-156:

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [onClose])
```

- [ ] **Step 3: Add ref to the container div**

Add `ref={drawerRef}` to the outermost `<div>` of the drawer.

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/VariantDrawer.tsx
git commit -m "feat(#19): integrate useFocusTrap into VariantDrawer"
```

---

### Task 7: Integrate `useFocusTrap` into ChecklistSidebar

**Files:**
- Modify: `frontend/src/components/mental-health/ChecklistSidebar.tsx:86-99` (add ref + hook)

- [ ] **Step 1: Add hook import and ref**

At the top of `ChecklistSidebar.tsx`, add:

```ts
import { useFocusTrap } from '../../hooks/useFocusTrap'
```

Inside the component, add:

```ts
const sidebarRef = useRef<HTMLDivElement>(null)
useFocusTrap(sidebarRef, true, { onEscape: onClose })
```

- [ ] **Step 2: Add ref to the container div**

On the outermost `<div className="sidebar-drawer"` (line 87), add `ref={sidebarRef}`.

- [ ] **Step 3: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/mental-health/ChecklistSidebar.tsx
git commit -m "feat(#19): integrate useFocusTrap into ChecklistSidebar"
```

---

### Task 8: Integrate `useFocusTrap` into CommandPalette

**Files:**
- Modify: `frontend/src/components/CommandPalette.tsx:434-440` (remove Escape handler), add ref + hook

- [ ] **Step 1: Add hook import and ref**

At the top of `CommandPalette.tsx`, add:

```ts
import { useFocusTrap } from '../hooks/useFocusTrap'
```

Inside the component, add:

```ts
const paletteRef = useRef<HTMLDivElement>(null)
useFocusTrap(paletteRef, open, { onEscape: onClose })
```

- [ ] **Step 2: Remove the manual Escape listener**

Delete lines 434-440:

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) onClose()
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [open, onClose])
```

- [ ] **Step 3: Add ref to the container div**

Add `ref={paletteRef}` to the outermost `<div>` that renders when `open` is true.

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CommandPalette.tsx
git commit -m "feat(#19): integrate useFocusTrap into CommandPalette"
```

---

### Task 9: Focus indicator styles

**Files:**
- Modify: `frontend/src/styles/theme.css`

- [ ] **Step 1: Add focus-visible styles**

At the end of `frontend/src/styles/theme.css`, add:

```css
/* Keyboard focus indicators (#19) */
table tbody tr:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
  background: var(--bg-inset) !important;
}

table tbody tr:focus:not(:focus-visible) {
  outline: none;
}
```

- [ ] **Step 2: Verify visually**

Run: `cd frontend && npm run dev`
Open the app, press Tab into the table, use Arrow keys. Verify:
- Focused row has a visible blue outline
- Mouse clicks do NOT show the outline
- Arrow Up/Down moves the focus indicator
- Enter opens the VariantDrawer

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/theme.css
git commit -m "feat(#19): add focus-visible indicator for table rows"
```

---

### Task 10: Final integration test

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS (including existing 362+ tests)

- [ ] **Step 2: Run backend tests**

Run: `python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 3: Manual smoke test**

Open the app and verify:
1. Arrow keys navigate SNP table rows
2. Home/End jump to first/last row
3. Enter opens VariantDrawer
4. Escape closes VariantDrawer, focus returns to the table row
5. Cmd+K opens CommandPalette, Tab stays trapped inside
6. Escape closes CommandPalette, focus returns to previous element
7. ChecklistSidebar traps focus and closes on Escape

- [ ] **Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "feat(#19): keyboard navigation — final adjustments"
```
