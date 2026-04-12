# Evidence Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expandable side-by-side ClinVar vs MyVariant evidence comparison in the VariantDrawer.

**Architecture:** One new React component (`EvidenceComparison`) rendered inside VariantDrawer's Clinical Annotation section. No backend changes — all data already available via `get_snp()`.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-04-12-evidence-comparison-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/components/EvidenceComparison.tsx` | Expandable two-column comparison component |
| Create | `frontend/src/components/__tests__/EvidenceComparison.test.tsx` | Unit tests |
| Modify | `frontend/src/components/VariantDrawer.tsx:271` | Render EvidenceComparison after clinical table |

---

### Task 1: EvidenceComparison — tests

**Files:**
- Create: `frontend/src/components/__tests__/EvidenceComparison.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EvidenceComparison } from '../EvidenceComparison'

const BASE_PROPS = {
  significance: null,
  mvSignificance: null,
  alleleFreq: null,
  alleleFreqSource: null,
  disease: null,
  reviewStatus: null,
  geneSymbol: null,
}

describe('EvidenceComparison', () => {
  it('returns null when neither source has significance', () => {
    const { container } = render(<EvidenceComparison {...BASE_PROPS} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders collapsed by default with COMPARE SOURCES link', () => {
    render(
      <EvidenceComparison
        {...BASE_PROPS}
        significance="Pathogenic"
      />,
    )
    expect(screen.getByText('COMPARE SOURCES')).toBeTruthy()
    expect(screen.queryByText('CLINVAR')).toBeNull()
  })

  it('expands on click and shows columns', () => {
    render(
      <EvidenceComparison
        {...BASE_PROPS}
        significance="Pathogenic"
        mvSignificance="Pathogenic"
      />,
    )
    fireEvent.click(screen.getByText('COMPARE SOURCES'))
    expect(screen.getByText('CLINVAR')).toBeTruthy()
    expect(screen.getByText('MYVARIANT')).toBeTruthy()
  })

  it('collapses on second click', () => {
    render(
      <EvidenceComparison
        {...BASE_PROPS}
        significance="Pathogenic"
      />,
    )
    fireEvent.click(screen.getByText('COMPARE SOURCES'))
    expect(screen.getByText('CLINVAR')).toBeTruthy()
    fireEvent.click(screen.getByText('COMPARE SOURCES'))
    expect(screen.queryByText('CLINVAR')).toBeNull()
  })

  it('shows SOURCES AGREE when significances match', () => {
    render(
      <EvidenceComparison
        {...BASE_PROPS}
        significance="Pathogenic"
        mvSignificance="pathogenic"
      />,
    )
    fireEvent.click(screen.getByText('COMPARE SOURCES'))
    expect(screen.getByText('SOURCES AGREE')).toBeTruthy()
  })

  it('shows SOURCES DISAGREE when significances differ', () => {
    render(
      <EvidenceComparison
        {...BASE_PROPS}
        significance="Pathogenic"
        mvSignificance="Benign"
      />,
    )
    fireEvent.click(screen.getByText('COMPARE SOURCES'))
    expect(screen.getByText('SOURCES DISAGREE')).toBeTruthy()
  })

  it('shows PARTIAL DATA when only one source has significance', () => {
    render(
      <EvidenceComparison
        {...BASE_PROPS}
        significance="Pathogenic"
      />,
    )
    fireEvent.click(screen.getByText('COMPARE SOURCES'))
    expect(screen.getByText('PARTIAL DATA')).toBeTruthy()
  })

  it('displays -- for missing fields', () => {
    render(
      <EvidenceComparison
        {...BASE_PROPS}
        significance="Pathogenic"
      />,
    )
    fireEvent.click(screen.getByText('COMPARE SOURCES'))
    const dashes = screen.getAllByText('--')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('displays disease and review status under ClinVar column', () => {
    render(
      <EvidenceComparison
        {...BASE_PROPS}
        significance="Pathogenic"
        disease="Alzheimer disease"
        reviewStatus="criteria provided"
      />,
    )
    fireEvent.click(screen.getByText('COMPARE SOURCES'))
    expect(screen.getByText('Alzheimer disease')).toBeTruthy()
    expect(screen.getByText('criteria provided')).toBeTruthy()
  })

  it('displays gene symbol under MyVariant column', () => {
    render(
      <EvidenceComparison
        {...BASE_PROPS}
        significance="Pathogenic"
        geneSymbol="BRCA1"
      />,
    )
    fireEvent.click(screen.getByText('COMPARE SOURCES'))
    expect(screen.getByText('BRCA1')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/EvidenceComparison.test.tsx`
Expected: FAIL — module `../EvidenceComparison` not found

---

### Task 2: EvidenceComparison — implementation

**Files:**
- Create: `frontend/src/components/EvidenceComparison.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { useState } from 'react'

interface EvidenceComparisonProps {
  significance: string | null
  mvSignificance: string | null
  alleleFreq: number | null
  alleleFreqSource: string | null
  disease: string | null
  reviewStatus: string | null
  geneSymbol: string | null
}

type Agreement = 'agree' | 'disagree' | 'partial'

function getAgreement(a: string | null, b: string | null): Agreement {
  if (a && b) {
    return a.toLowerCase() === b.toLowerCase() ? 'agree' : 'disagree'
  }
  return 'partial'
}

const AGREEMENT_DISPLAY: Record<Agreement, { label: string; color: string }> = {
  agree: { label: 'SOURCES AGREE', color: 'var(--sig-benefit)' },
  disagree: { label: 'SOURCES DISAGREE', color: 'var(--sig-risk)' },
  partial: { label: 'PARTIAL DATA', color: 'var(--sig-reduced)' },
}

function Cell({ value }: { value: string | null | undefined }) {
  if (!value) return <span style={{ color: 'var(--text-tertiary)' }}>--</span>
  return <span>{value}</span>
}

export function EvidenceComparison({
  significance,
  mvSignificance,
  alleleFreq,
  alleleFreqSource,
  disease,
  reviewStatus,
  geneSymbol,
}: EvidenceComparisonProps) {
  const [expanded, setExpanded] = useState(false)

  if (!significance && !mvSignificance) return null

  const agreement = getAgreement(significance, mvSignificance)
  const badge = AGREEMENT_DISPLAY[agreement]

  const cellStyle = {
    padding: '4px 0',
    fontSize: 'var(--font-size-xs)' as const,
    verticalAlign: 'top' as const,
  }

  return (
    <div style={{ marginBottom: 'var(--space-sm)' }}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter') setExpanded(v => !v) }}
        style={{
          color: 'var(--primary)',
          cursor: 'pointer',
          fontSize: 'var(--font-size-xs)',
          letterSpacing: '0.05em',
        }}
      >
        COMPARE SOURCES {expanded ? '[-]' : '[+]'}
      </span>

      {expanded && (
        <div style={{
          marginTop: 'var(--space-sm)',
          padding: 'var(--space-sm) 0',
          borderTop: '1px dashed var(--border-dashed)',
          borderBottom: '1px dashed var(--border-dashed)',
        }}>
          <div style={{
            marginBottom: 'var(--space-sm)',
          }}>
            <span style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              color: badge.color,
              letterSpacing: '0.08em',
            }}>
              {badge.label}
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="label" style={{ textAlign: 'left', padding: '4px 0', width: '30%' }}></th>
                <th className="label" style={{ textAlign: 'left', padding: '4px 0', width: '35%' }}>CLINVAR</th>
                <th className="label" style={{ textAlign: 'left', padding: '4px 0', width: '35%' }}>MYVARIANT</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="label" style={cellStyle}>SIGNIFICANCE</td>
                <td style={cellStyle}><Cell value={significance} /></td>
                <td style={cellStyle}><Cell value={mvSignificance} /></td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="label" style={cellStyle}>CONDITIONS</td>
                <td style={cellStyle}><Cell value={disease} /></td>
                <td style={cellStyle}><Cell value={null} /></td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="label" style={cellStyle}>REVIEW</td>
                <td style={cellStyle}><Cell value={reviewStatus} /></td>
                <td style={cellStyle}><Cell value={null} /></td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="label" style={cellStyle}>GENE</td>
                <td style={cellStyle}><Cell value={null} /></td>
                <td style={cellStyle}><Cell value={geneSymbol} /></td>
              </tr>
              <tr>
                <td className="label" style={cellStyle}>FREQUENCY</td>
                <td style={cellStyle}>
                  <Cell value={alleleFreq != null && !alleleFreqSource ? `${(alleleFreq * 100).toFixed(2)}%` : null} />
                </td>
                <td style={cellStyle}>
                  <Cell value={alleleFreq != null && alleleFreqSource ? `${(alleleFreq * 100).toFixed(2)}% (${alleleFreqSource})` : null} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/__tests__/EvidenceComparison.test.tsx`
Expected: All 9 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EvidenceComparison.tsx frontend/src/components/__tests__/EvidenceComparison.test.tsx
git commit -m "feat(#13): add EvidenceComparison component with tests"
```

---

### Task 3: Integrate into VariantDrawer

**Files:**
- Modify: `frontend/src/components/VariantDrawer.tsx:1-3` (add import), `:271` (render component)

- [ ] **Step 1: Add import**

After line 3 (`import { useFocusTrap } from '../hooks/useFocusTrap'`), add:

```ts
import { EvidenceComparison } from './EvidenceComparison'
```

- [ ] **Step 2: Render EvidenceComparison after clinical annotation table**

After line 271 (`</table>`), before line 272 (`</>`), insert:

```tsx
                <EvidenceComparison
                  significance={d.significance}
                  mvSignificance={(detail as VariantDetail)?.mv_significance ?? null}
                  alleleFreq={(detail as VariantDetail)?.allele_freq ?? null}
                  alleleFreqSource={(detail as VariantDetail)?.allele_freq_source ?? null}
                  disease={d.disease}
                  reviewStatus={(detail as VariantDetail)?.review_status ?? null}
                  geneSymbol={d.gene_symbol}
                />
```

- [ ] **Step 3: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/VariantDrawer.tsx
git commit -m "feat(#13): integrate EvidenceComparison into VariantDrawer"
```
