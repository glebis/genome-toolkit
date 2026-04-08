# Mental Health UX — Foundation Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared types, core UI components (EvidenceBadge, GeneCard, NarrativeBlock, FilterBar), and backend API that all mental health screens depend on.

**Architecture:** New React components in `frontend/src/components/mental-health/`, shared types in `frontend/src/types/genomics.ts`, new FastAPI routes in `backend/app/routes/mental_health.py`. Components use inline styles with CSS vars (existing pattern). No routing library — views toggled by state in App.tsx. Data comes from vault notes + SQLite via new API endpoints.

**Tech Stack:** React 19, TypeScript, Vite, FastAPI, Vitest (new — no frontend tests exist yet), existing CSS variable system from theme.css.

**Spec:** `docs/superpowers/specs/2026-04-04-mental-health-ux-design.md`
**Mockups:** `.superpowers/brainstorm/` — `01-mental-health-dashboard.html` is the primary reference.

---

## File Structure

```
frontend/src/
  types/
    genomics.ts              # Shared types: Gene, Action, EvidenceTier, GeneStatus, etc.
  components/
    mental-health/
      EvidenceBadge.tsx       # E1-E5 badge with study count
      GeneCard.tsx            # Single gene card (border color, evidence, actions)
      NarrativeBlock.tsx      # Pathway narrative panel with tab label
      FilterBar.tsx           # Dual filter: category + action type + export buttons
      index.ts                # Re-exports
  hooks/
    useMentalHealthFilters.ts # Filter state: category, action type, combination logic

frontend/
  vitest.config.ts            # NEW — test runner config
  src/__tests__/
    EvidenceBadge.test.tsx
    GeneCard.test.tsx
    NarrativeBlock.test.tsx
    FilterBar.test.tsx
    useMentalHealthFilters.test.ts

backend/app/
  routes/
    mental_health.py          # GET /api/mental-health/dashboard, /api/mental-health/genes/:symbol
```

---

### Task 1: Set up frontend testing with Vitest

**Files:**
- Create: `frontend/vitest.config.ts`
- Modify: `frontend/package.json` (add devDependencies)
- Create: `frontend/src/__tests__/setup.ts`

- [ ] **Step 1: Install vitest and testing-library**

```bash
cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @testing-library/user-event
```

- [ ] **Step 2: Create vitest config**

```typescript
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.ts',
  },
})
```

- [ ] **Step 3: Create test setup file**

```typescript
// frontend/src/__tests__/setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test script to package.json**

Add to `"scripts"` in `frontend/package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify setup with a smoke test**

```typescript
// frontend/src/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `cd frontend && npm test`
Expected: 1 test PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/vitest.config.ts frontend/src/__tests__/setup.ts frontend/src/__tests__/smoke.test.ts frontend/package.json frontend/package-lock.json
git commit -m "chore: add vitest + testing-library for frontend tests"
```

---

### Task 2: Define shared genomics types

**Files:**
- Create: `frontend/src/types/genomics.ts`

- [ ] **Step 1: Write type definitions**

```typescript
// frontend/src/types/genomics.ts

export type EvidenceTier = 'E1' | 'E2' | 'E3' | 'E4' | 'E5'

export const EVIDENCE_LABELS: Record<EvidenceTier, string> = {
  E1: 'GOLD STANDARD',
  E2: 'STRONG',
  E3: 'MODERATE',
  E4: 'PRELIMINARY',
  E5: 'THEORETICAL',
}

export type GeneStatus = 'actionable' | 'monitor' | 'optimal' | 'neutral'

export const STATUS_COLORS: Record<GeneStatus, string> = {
  actionable: 'var(--sig-risk)',
  monitor: 'var(--sig-reduced)',
  optimal: 'var(--sig-benefit)',
  neutral: 'var(--sig-neutral)',
}

export type ActionType = 'consider' | 'monitor' | 'discuss' | 'try'

export const ACTION_TYPE_COLORS: Record<ActionType, string> = {
  consider: 'var(--sig-risk)',
  monitor: 'var(--sig-reduced)',
  discuss: 'var(--primary)',
  try: 'var(--sig-benefit)',
}

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  consider: 'Consider',
  monitor: 'Monitor',
  discuss: 'Discuss',
  try: 'Try',
}

export type Category = 'mood' | 'stress' | 'sleep' | 'focus'

export interface GeneData {
  symbol: string
  variant: string
  rsid: string
  chromosome?: string
  position?: number
  genotype: string
  status: GeneStatus
  evidenceTier: EvidenceTier
  studyCount: number
  description: string
  actionCount: number
  categories: Category[]
  pathway: string
}

export interface ActionData {
  id: string
  type: ActionType
  title: string
  description: string
  detail?: string          // expandable: form, dosage, timing
  evidenceTier: EvidenceTier
  studyCount: number
  tags: string[]
  geneSymbol: string
  done: boolean
}

export interface NarrativeData {
  pathway: string
  status: GeneStatus
  body: string
  priority: string
  hint: string
  geneCount: number
  actionCount: number
}

export interface PathwaySection {
  narrative: NarrativeData
  genes: GeneData[]
}

export interface MentalHealthDashboard {
  sections: PathwaySection[]
  totalGenes: number
  totalActions: number
  lastUpdated: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/genomics.ts
git commit -m "feat: add shared genomics types for mental health UI"
```

---

### Task 3: Build EvidenceBadge component

**Files:**
- Create: `frontend/src/components/mental-health/EvidenceBadge.tsx`
- Create: `frontend/src/__tests__/EvidenceBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/__tests__/EvidenceBadge.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvidenceBadge } from '../components/mental-health/EvidenceBadge'

describe('EvidenceBadge', () => {
  it('renders tier and label', () => {
    render(<EvidenceBadge tier="E2" />)
    expect(screen.getByText('E2 STRONG')).toBeInTheDocument()
  })

  it('renders with study count', () => {
    render(<EvidenceBadge tier="E2" studyCount={12} />)
    expect(screen.getByText('E2 STRONG')).toBeInTheDocument()
    expect(screen.getByText('12 studies')).toBeInTheDocument()
  })

  it('renders all tier labels correctly', () => {
    const { rerender } = render(<EvidenceBadge tier="E1" />)
    expect(screen.getByText('E1 GOLD STANDARD')).toBeInTheDocument()

    rerender(<EvidenceBadge tier="E3" />)
    expect(screen.getByText('E3 MODERATE')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/EvidenceBadge.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```typescript
// frontend/src/components/mental-health/EvidenceBadge.tsx
import type { EvidenceTier, GeneStatus } from '../../types/genomics'
import { EVIDENCE_LABELS, STATUS_COLORS } from '../../types/genomics'

interface EvidenceBadgeProps {
  tier: EvidenceTier
  status?: GeneStatus
  studyCount?: number
}

export function EvidenceBadge({ tier, status = 'neutral', studyCount }: EvidenceBadgeProps) {
  const bgColor = STATUS_COLORS[status]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 500,
          padding: '2px 6px',
          borderRadius: 3,
          letterSpacing: '0.1em',
          color: 'var(--bg-raised)',
          background: bgColor,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {tier} {EVIDENCE_LABELS[tier]}
      </span>
      {studyCount !== undefined && (
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--primary)',
            border: '1px solid var(--primary)',
            padding: '1px 5px',
            borderRadius: 2,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {studyCount} studies
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/EvidenceBadge.test.tsx`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mental-health/EvidenceBadge.tsx frontend/src/__tests__/EvidenceBadge.test.tsx
git commit -m "feat: add EvidenceBadge component with tier labels and study count"
```

---

### Task 4: Build GeneCard component

**Files:**
- Create: `frontend/src/components/mental-health/GeneCard.tsx`
- Create: `frontend/src/__tests__/GeneCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/__tests__/GeneCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GeneCard } from '../components/mental-health/GeneCard'
import type { GeneData } from '../types/genomics'

const mockGene: GeneData = {
  symbol: 'MTHFR',
  variant: 'C677T',
  rsid: 'rs1801133',
  genotype: 'T/T',
  status: 'actionable',
  evidenceTier: 'E2',
  studyCount: 12,
  description: 'Reduced folate conversion. T/T homozygous — ~30% enzyme activity.',
  actionCount: 2,
  categories: ['mood'],
  pathway: 'Methylation Pathway',
}

describe('GeneCard', () => {
  it('renders gene name and variant', () => {
    render(<GeneCard gene={mockGene} />)
    expect(screen.getByText('MTHFR')).toBeInTheDocument()
    expect(screen.getByText(/C677T/)).toBeInTheDocument()
    expect(screen.getByText(/rs1801133/)).toBeInTheDocument()
  })

  it('renders description', () => {
    render(<GeneCard gene={mockGene} />)
    expect(screen.getByText(/Reduced folate conversion/)).toBeInTheDocument()
  })

  it('renders action count for actionable genes', () => {
    render(<GeneCard gene={mockGene} />)
    expect(screen.getByText('2 actions available')).toBeInTheDocument()
  })

  it('does not render action count for optimal genes', () => {
    const optimal = { ...mockGene, status: 'optimal' as const, actionCount: 0 }
    render(<GeneCard gene={optimal} />)
    expect(screen.queryByText(/actions available/)).not.toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<GeneCard gene={mockGene} onClick={onClick} />)
    fireEvent.click(screen.getByText('MTHFR'))
    expect(onClick).toHaveBeenCalledWith(mockGene)
  })

  it('renders evidence badge', () => {
    render(<GeneCard gene={mockGene} />)
    expect(screen.getByText('E2 STRONG')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/GeneCard.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```typescript
// frontend/src/components/mental-health/GeneCard.tsx
import type { GeneData } from '../../types/genomics'
import { STATUS_COLORS } from '../../types/genomics'
import { EvidenceBadge } from './EvidenceBadge'

interface GeneCardProps {
  gene: GeneData
  onClick?: (gene: GeneData) => void
}

export function GeneCard({ gene, onClick }: GeneCardProps) {
  const borderColor = STATUS_COLORS[gene.status]

  return (
    <div
      onClick={() => onClick?.(gene)}
      style={{
        background: 'var(--bg-raised)',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 6,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = 'var(--bg-inset)' }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.background = 'var(--bg-raised)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span style={{
            fontSize: 'var(--font-size-md)',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}>
            {gene.symbol}
          </span>
          <span style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
            marginLeft: 6,
          }}>
            {gene.variant} &middot; {gene.rsid}
          </span>
        </div>
        <EvidenceBadge tier={gene.evidenceTier} status={gene.status} />
      </div>

      <div style={{
        fontSize: 'var(--font-size-sm)',
        color: 'var(--text-secondary)',
        marginTop: 5,
        lineHeight: 1.5,
      }}>
        {gene.description}
      </div>

      {gene.actionCount > 0 && (
        <div style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 500,
          marginTop: 6,
          color: borderColor,
        }}>
          {gene.actionCount} actions available
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/GeneCard.test.tsx`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mental-health/GeneCard.tsx frontend/src/__tests__/GeneCard.test.tsx
git commit -m "feat: add GeneCard component with status colors and evidence badge"
```

---

### Task 5: Build NarrativeBlock component

**Files:**
- Create: `frontend/src/components/mental-health/NarrativeBlock.tsx`
- Create: `frontend/src/__tests__/NarrativeBlock.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/__tests__/NarrativeBlock.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NarrativeBlock } from '../components/mental-health/NarrativeBlock'
import type { NarrativeData } from '../types/genomics'

const mockNarrative: NarrativeData = {
  pathway: 'Methylation Pathway',
  status: 'actionable',
  body: 'Your methylation cycle runs at reduced capacity.',
  priority: 'Priority: methylation support',
  hint: 'Consider methylfolate + monitor homocysteine',
  geneCount: 2,
  actionCount: 3,
}

describe('NarrativeBlock', () => {
  it('renders pathway label', () => {
    render(<NarrativeBlock narrative={mockNarrative} />)
    expect(screen.getByText('Methylation Pathway')).toBeInTheDocument()
  })

  it('renders body text', () => {
    render(<NarrativeBlock narrative={mockNarrative} />)
    expect(screen.getByText(/reduced capacity/)).toBeInTheDocument()
  })

  it('renders priority and hint', () => {
    render(<NarrativeBlock narrative={mockNarrative} />)
    expect(screen.getByText(/methylation support/)).toBeInTheDocument()
    expect(screen.getByText(/methylfolate/)).toBeInTheDocument()
  })

  it('renders gene and action counts', () => {
    render(<NarrativeBlock narrative={mockNarrative} />)
    expect(screen.getByText('2 GENES / 3 ACTIONS')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/NarrativeBlock.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```typescript
// frontend/src/components/mental-health/NarrativeBlock.tsx
import type { NarrativeData } from '../../types/genomics'
import { STATUS_COLORS } from '../../types/genomics'

interface NarrativeBlockProps {
  narrative: NarrativeData
}

export function NarrativeBlock({ narrative }: NarrativeBlockProps) {
  const borderColor = STATUS_COLORS[narrative.status]

  return (
    <div style={{
      flex: 1,
      background: 'var(--bg-raised)',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 6,
      padding: 18,
      position: 'relative',
      minHeight: 130,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Tab label */}
      <div style={{
        position: 'absolute',
        top: -1,
        left: 16,
        background: borderColor,
        color: 'var(--bg-raised)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 600,
        letterSpacing: '0.15em',
        padding: '2px 10px',
        borderRadius: '0 0 4px 4px',
        textTransform: 'uppercase',
      }}>
        {narrative.pathway}
      </div>

      {/* Body */}
      <div style={{
        marginTop: 14,
        fontSize: 'var(--font-size-md)',
        lineHeight: 1.7,
        flex: 1,
      }}
        dangerouslySetInnerHTML={{ __html: narrative.body }}
      />

      {/* Footer */}
      <div style={{
        marginTop: 12,
        borderTop: '1px dashed var(--border-dashed)',
        paddingTop: 10,
        fontSize: 'var(--font-size-sm)',
      }}>
        <div style={{ fontWeight: 500, marginBottom: 3, color: borderColor }}>
          {narrative.priority}
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>
          {narrative.hint}
        </div>
      </div>

      {/* Count */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        right: 14,
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-tertiary)',
        letterSpacing: '0.1em',
      }}>
        {narrative.geneCount} GENES / {narrative.actionCount} ACTIONS
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/NarrativeBlock.test.tsx`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mental-health/NarrativeBlock.tsx frontend/src/__tests__/NarrativeBlock.test.tsx
git commit -m "feat: add NarrativeBlock component with pathway tab and footer"
```

---

### Task 6: Build FilterBar component

**Files:**
- Create: `frontend/src/hooks/useMentalHealthFilters.ts`
- Create: `frontend/src/components/mental-health/FilterBar.tsx`
- Create: `frontend/src/__tests__/FilterBar.test.tsx`
- Create: `frontend/src/__tests__/useMentalHealthFilters.test.ts`

- [ ] **Step 1: Write the filter hook test**

```typescript
// frontend/src/__tests__/useMentalHealthFilters.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMentalHealthFilters } from '../hooks/useMentalHealthFilters'

describe('useMentalHealthFilters', () => {
  it('starts with all filters showing everything', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    expect(result.current.activeCategory).toBe(null)
    expect(result.current.activeActionType).toBe(null)
  })

  it('toggles category filter', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    act(() => result.current.setCategory('mood'))
    expect(result.current.activeCategory).toBe('mood')

    // Toggle same category off
    act(() => result.current.setCategory('mood'))
    expect(result.current.activeCategory).toBe(null)
  })

  it('toggles action type filter', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    act(() => result.current.setActionType('consider'))
    expect(result.current.activeActionType).toBe('consider')
  })

  it('clears all filters', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    act(() => {
      result.current.setCategory('mood')
      result.current.setActionType('consider')
    })
    act(() => result.current.clearAll())
    expect(result.current.activeCategory).toBe(null)
    expect(result.current.activeActionType).toBe(null)
  })

  it('filters genes by category', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    const genes = [
      { categories: ['mood', 'stress'] },
      { categories: ['sleep'] },
      { categories: ['mood'] },
    ]
    act(() => result.current.setCategory('mood'))
    const filtered = genes.filter(g =>
      result.current.matchesGene(g as any)
    )
    expect(filtered).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/useMentalHealthFilters.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the filter hook**

```typescript
// frontend/src/hooks/useMentalHealthFilters.ts
import { useState, useCallback } from 'react'
import type { Category, ActionType, GeneData, ActionData } from '../types/genomics'

export function useMentalHealthFilters() {
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [activeActionType, setActiveActionType] = useState<ActionType | null>(null)

  const setCategory = useCallback((cat: Category) => {
    setActiveCategory(prev => prev === cat ? null : cat)
  }, [])

  const setActionType = useCallback((type: ActionType) => {
    setActiveActionType(prev => prev === type ? null : type)
  }, [])

  const clearAll = useCallback(() => {
    setActiveCategory(null)
    setActiveActionType(null)
  }, [])

  const matchesGene = useCallback((gene: GeneData): boolean => {
    if (activeCategory && !gene.categories.includes(activeCategory)) return false
    return true
  }, [activeCategory])

  const matchesAction = useCallback((action: ActionData): boolean => {
    if (activeActionType && action.type !== activeActionType) return false
    return true
  }, [activeActionType])

  return {
    activeCategory,
    activeActionType,
    setCategory,
    setActionType,
    clearAll,
    matchesGene,
    matchesAction,
  }
}
```

- [ ] **Step 4: Run hook test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/useMentalHealthFilters.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Write the FilterBar test**

```typescript
// frontend/src/__tests__/FilterBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from '../components/mental-health/FilterBar'

describe('FilterBar', () => {
  it('renders category filter chips', () => {
    render(
      <FilterBar
        activeCategory={null}
        activeActionType={null}
        onCategoryChange={vi.fn()}
        onActionTypeChange={vi.fn()}
        onClearAll={vi.fn()}
        onExport={vi.fn()}
      />
    )
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Mood')).toBeInTheDocument()
    expect(screen.getByText('Stress')).toBeInTheDocument()
    expect(screen.getByText('Sleep')).toBeInTheDocument()
    expect(screen.getByText('Focus')).toBeInTheDocument()
  })

  it('renders action type filter chips', () => {
    render(
      <FilterBar
        activeCategory={null}
        activeActionType={null}
        onCategoryChange={vi.fn()}
        onActionTypeChange={vi.fn()}
        onClearAll={vi.fn()}
        onExport={vi.fn()}
      />
    )
    expect(screen.getByText('Consider')).toBeInTheDocument()
    expect(screen.getByText('Monitor')).toBeInTheDocument()
    expect(screen.getByText('Discuss')).toBeInTheDocument()
    expect(screen.getByText('Try')).toBeInTheDocument()
  })

  it('calls onCategoryChange when chip clicked', () => {
    const onChange = vi.fn()
    render(
      <FilterBar
        activeCategory={null}
        activeActionType={null}
        onCategoryChange={onChange}
        onActionTypeChange={vi.fn()}
        onClearAll={vi.fn()}
        onExport={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Mood'))
    expect(onChange).toHaveBeenCalledWith('mood')
  })

  it('renders export buttons', () => {
    render(
      <FilterBar
        activeCategory={null}
        activeActionType={null}
        onCategoryChange={vi.fn()}
        onActionTypeChange={vi.fn()}
        onClearAll={vi.fn()}
        onExport={vi.fn()}
      />
    )
    expect(screen.getByText('Export PDF')).toBeInTheDocument()
    expect(screen.getByText('Export MD')).toBeInTheDocument()
    expect(screen.getByText('Print for doctor')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Write the FilterBar component**

```typescript
// frontend/src/components/mental-health/FilterBar.tsx
import type { Category, ActionType } from '../../types/genomics'

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'mood', label: 'Mood' },
  { key: 'stress', label: 'Stress' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'focus', label: 'Focus' },
]

const ACTION_TYPES: { key: ActionType; label: string }[] = [
  { key: 'consider', label: 'Consider' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'discuss', label: 'Discuss' },
  { key: 'try', label: 'Try' },
]

interface FilterBarProps {
  activeCategory: Category | null
  activeActionType: ActionType | null
  onCategoryChange: (cat: Category) => void
  onActionTypeChange: (type: ActionType) => void
  onClearAll: () => void
  onExport: (format: 'pdf' | 'md' | 'doctor') => void
}

const chipStyle = (active: boolean) => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  fontWeight: active ? 600 : 500,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  padding: '4px 10px',
  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
  background: 'transparent',
  color: active ? 'var(--primary)' : 'var(--text-secondary)',
  cursor: 'pointer',
})

const exportStyle = (accent: boolean) => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 500,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  padding: '4px 10px',
  border: `1px solid ${accent ? 'var(--accent)' : 'var(--border-strong)'}`,
  background: 'transparent',
  color: accent ? 'var(--accent)' : 'var(--text-secondary)',
  cursor: 'pointer',
})

export function FilterBar({
  activeCategory,
  activeActionType,
  onCategoryChange,
  onActionTypeChange,
  onClearAll,
  onExport,
}: FilterBarProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 24px',
      borderBottom: '1px dashed var(--border-dashed)',
    }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          style={chipStyle(activeCategory === null && activeActionType === null)}
          onClick={onClearAll}
        >
          All
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            style={chipStyle(activeCategory === c.key)}
            onClick={() => onCategoryChange(c.key)}
          >
            {c.label}
          </button>
        ))}

        <span style={{ width: 1, background: 'var(--border)', margin: '0 6px' }} />

        {ACTION_TYPES.map(t => (
          <button
            key={t.key}
            style={chipStyle(activeActionType === t.key)}
            onClick={() => onActionTypeChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button style={exportStyle(false)} onClick={() => onExport('pdf')}>Export PDF</button>
        <button style={exportStyle(false)} onClick={() => onExport('md')}>Export MD</button>
        <button style={exportStyle(true)} onClick={() => onExport('doctor')}>Print for doctor</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: all tests PASS (smoke + EvidenceBadge + GeneCard + NarrativeBlock + FilterBar + useMentalHealthFilters)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/useMentalHealthFilters.ts frontend/src/components/mental-health/FilterBar.tsx frontend/src/__tests__/FilterBar.test.tsx frontend/src/__tests__/useMentalHealthFilters.test.ts
git commit -m "feat: add FilterBar component and useMentalHealthFilters hook"
```

---

### Task 7: Create index re-export and add CSS vars

**Files:**
- Create: `frontend/src/components/mental-health/index.ts`
- Modify: `frontend/src/styles/theme.css` (add missing color var)

- [ ] **Step 1: Create index.ts**

```typescript
// frontend/src/components/mental-health/index.ts
export { EvidenceBadge } from './EvidenceBadge'
export { GeneCard } from './GeneCard'
export { NarrativeBlock } from './NarrativeBlock'
export { FilterBar } from './FilterBar'
```

- [ ] **Step 2: Add missing CSS variable**

The existing theme uses `--sig-reduced` for amber/gold but the spec uses it for "monitor" status. Verify it exists in `frontend/src/styles/theme.css`. If `--sig-reduced` is already `#c49a4e`, no change needed. This is the gold/amber used for "monitor" status.

Run: `grep 'sig-reduced' frontend/src/styles/theme.css`

If present, no change. If not, add after `--sig-benefit`:
```css
--sig-reduced: #c49a4e;
```

- [ ] **Step 3: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/mental-health/index.ts
git commit -m "feat: add mental-health component index re-exports"
```

---

### Task 8: Backend — mental health dashboard API

**Files:**
- Create: `backend/app/routes/mental_health.py`
- Modify: `backend/app/main.py` (register router)

- [ ] **Step 1: Create the mental health API route**

```python
# backend/app/routes/mental_health.py
"""Mental health dashboard API — reads vault notes, returns structured dashboard data."""
import json
from pathlib import Path

from fastapi import APIRouter

from backend.app.agent.tools import _vault_path

router = APIRouter(prefix="/api/mental-health")


def _read_gene_note(symbol: str) -> dict | None:
    """Read a gene note from the vault and extract structured data."""
    if not _vault_path:
        return None
    gene_file = Path(_vault_path) / "Genes" / f"{symbol}.md"
    if not gene_file.exists():
        return None
    content = gene_file.read_text()
    # Return raw content — frontend or agent will parse
    return {"symbol": symbol, "content": content}


@router.get("/genes")
async def list_mental_health_genes():
    """List genes relevant to mental health with their vault note status."""
    # Core mental health genes
    mh_genes = [
        "MTHFR", "COMT", "MAO-A", "SLC6A4", "BDNF",
        "GAD1", "CRHR1", "FKBP5", "TPH2", "HTR2A",
        "DRD2", "DRD4", "OPRM1", "GABRA2", "SLC6A3",
    ]
    result = []
    for symbol in mh_genes:
        note = _read_gene_note(symbol)
        result.append({
            "symbol": symbol,
            "has_vault_note": note is not None,
        })
    return {"genes": result}


@router.get("/genes/{symbol}")
async def get_gene_detail(symbol: str):
    """Get full gene detail from vault."""
    note = _read_gene_note(symbol.upper())
    if not note:
        return {"error": f"No vault note found for {symbol}"}
    return note
```

- [ ] **Step 2: Register router in main.py**

Add to `backend/app/main.py` after the existing router imports:

```python
from backend.app.routes.mental_health import router as mental_health_router
```

And after `app.include_router(tts_router)`:

```python
app.include_router(mental_health_router)
```

- [ ] **Step 3: Test manually**

Run: `cd /Users/glebkalinin/genome-toolkit && python -c "from backend.app.routes.mental_health import router; print('Mental health router OK')"` 
Expected: prints "Mental health router OK"

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/mental_health.py backend/app/main.py
git commit -m "feat: add mental health API routes for gene listing and detail"
```

---

### Task 9: Run full test suite and final verification

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: all tests PASS

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Backend import check**

Run: `python -c "from backend.app.main import app; print('Backend OK')"`
Expected: prints "Backend OK"

- [ ] **Step 4: Final commit if any changes**

```bash
git status
# If clean, no commit needed
```
