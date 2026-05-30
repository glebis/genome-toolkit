# Migrant Life-Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone `#/life-map` view that blends multiple countries' life expectancy (Eurostat EU + WHO Russia) as side-by-side anchors plus a clearly-labeled heuristic migration marker, with evidence-gated qualitative stress/mental-health/family modifiers.

**Architecture:** Pure TS blend logic (`lib/lifeBlend.ts`) over a committed, version-stamped life-table JSON produced by a reproducible Python fetch script. A dumb backend endpoint serves the data; React hooks (localStorage-backed input + data fetch) feed a focused set of components. No network at runtime; no genetic data in this MVP.

**Tech Stack:** FastAPI + aiosqlite (backend), React 18 + TypeScript + Vite + Vitest (frontend), Python + httpx (fetch script), Eurostat JSON-stat REST + WHO GHO OData.

---

### Task 1: `lifeBlend.ts` pure module (the contract)

**Files:**
- Create: `frontend/src/lib/lifeBlend.ts`
- Test: `frontend/src/lib/__tests__/lifeBlend.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { lifeExpectancyAtAge, countryAnchors, blendMarker } from '../lifeBlend'

const TABLE = {
  retrieved: '2026-05-30',
  countries: {
    DE: { name: 'Germany', source: 'Eurostat', ex_by_age: { male: { '38': 41.9 }, female: { '38': 45.6 } } },
    RU: { name: 'Russia',  source: 'WHO',      ex_by_age: { male: { '35': 33.0, '40': 29.0 }, female: { '38': 38.0 } } },
  },
}

describe('lifeExpectancyAtAge', () => {
  it('returns exact-age ex', () => {
    expect(lifeExpectancyAtAge(TABLE, 'DE', 'male', 38)).toBe(41.9)
  })
  it('maps to nearest available bracket when exact age missing', () => {
    expect(lifeExpectancyAtAge(TABLE, 'RU', 'male', 38)).toBe(29.0) // nearest of 35/40 -> 40
  })
  it('returns null for unknown country', () => {
    expect(lifeExpectancyAtAge(TABLE, 'XX', 'male', 38)).toBeNull()
  })
})

describe('countryAnchors', () => {
  it('builds target age = age + ex per residence country', () => {
    const a = countryAnchors(TABLE, [{ country: 'DE', years: 5 }, { country: 'RU', years: 33 }], 'male', 38)
    expect(a).toEqual([
      { country: 'DE', name: 'Germany', exAtAge: 41.9, targetAge: 79.9 },
      { country: 'RU', name: 'Russia',  exAtAge: 29.0, targetAge: 67.0 },
    ])
  })
  it('skips unknown countries', () => {
    const a = countryAnchors(TABLE, [{ country: 'XX', years: 5 }], 'male', 38)
    expect(a).toEqual([])
  })
})

describe('blendMarker', () => {
  const anchors = [
    { country: 'DE', name: 'Germany', exAtAge: 41.9, targetAge: 79.9 },
    { country: 'RU', name: 'Russia',  exAtAge: 29.0, targetAge: 67.0 },
  ]
  it('years-weights with current-residence emphasis and reports spread', () => {
    // years RU=33, DE=5; current=DE emphasis x2 => weights DE=10, RU=33 -> blend below midpoint
    const m = blendMarker(anchors, [{ country: 'DE', years: 5 }, { country: 'RU', years: 33 }], 'DE')
    expect(m.heuristic).toBe(true)
    expect(m.spread).toEqual({ min: 67.0, max: 79.9 })
    expect(m.targetAge).toBeGreaterThan(67.0)
    expect(m.targetAge).toBeLessThan(79.9)
  })
  it('single country returns that anchor with no emphasis effect', () => {
    const m = blendMarker([anchors[0]], [{ country: 'DE', years: 5 }], 'DE')
    expect(m.targetAge).toBe(79.9)
  })
  it('zero total years falls back to current country anchor', () => {
    const m = blendMarker(anchors, [{ country: 'DE', years: 0 }, { country: 'RU', years: 0 }], 'DE')
    expect(m.targetAge).toBe(79.9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/lifeBlend.test.ts`
Expected: FAIL — module `../lifeBlend` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/lifeBlend.ts
export type Sex = 'male' | 'female'
export interface Residence { country: string; years: number }
export interface LifeTable {
  retrieved: string
  countries: Record<string, { name: string; source: string; ex_by_age: Record<Sex, Record<string, number>> }>
}
export interface CountryAnchor { country: string; name: string; exAtAge: number; targetAge: number }
export interface BlendMarker { targetAge: number; spread: { min: number; max: number }; heuristic: true }

const CURRENT_EMPHASIS = 2 // current residence weighted x2 (heuristic)

export function lifeExpectancyAtAge(table: LifeTable, country: string, sex: Sex, age: number): number | null {
  const c = table.countries[country]
  if (!c) return null
  const ages = c.ex_by_age[sex]
  if (!ages) return null
  if (ages[String(age)] != null) return ages[String(age)]
  const keys = Object.keys(ages).map(Number)
  if (keys.length === 0) return null
  const nearest = keys.reduce((best, k) => (Math.abs(k - age) < Math.abs(best - age) ? k : best), keys[0])
  return ages[String(nearest)]
}

export function countryAnchors(table: LifeTable, residences: Residence[], sex: Sex, age: number): CountryAnchor[] {
  const out: CountryAnchor[] = []
  for (const r of residences) {
    const ex = lifeExpectancyAtAge(table, r.country, sex, age)
    if (ex == null) continue
    out.push({ country: r.country, name: table.countries[r.country].name, exAtAge: ex, targetAge: round1(age + ex) })
  }
  return out
}

export function blendMarker(anchors: CountryAnchor[], residences: Residence[], currentCountry: string): BlendMarker {
  const targets = anchors.map(a => a.targetAge)
  const spread = { min: Math.min(...targets), max: Math.max(...targets) }
  if (anchors.length === 1) return { targetAge: anchors[0].targetAge, spread, heuristic: true }
  const yearsBy = new Map(residences.map(r => [r.country, r.years]))
  let wsum = 0, acc = 0
  for (const a of anchors) {
    let w = yearsBy.get(a.country) ?? 0
    if (a.country === currentCountry) w *= CURRENT_EMPHASIS
    wsum += w; acc += w * a.targetAge
  }
  if (wsum === 0) {
    const cur = anchors.find(a => a.country === currentCountry) ?? anchors[0]
    return { targetAge: cur.targetAge, spread, heuristic: true }
  }
  return { targetAge: round1(acc / wsum), spread, heuristic: true }
}

const round1 = (n: number) => Math.round(n * 10) / 10
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/__tests__/lifeBlend.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/lifeBlend.ts frontend/src/lib/__tests__/lifeBlend.test.ts
git commit -m "feat(life-map): pure country-blend life-expectancy module (#27)"
```

---

### Task 2: Life-table fetch script + committed data file

**Files:**
- Create: `scripts/fetch_life_expectancy.py`
- Create: `backend/app/data/life_tables.json` (generated)
- Test: `tests/test_fetch_life_expectancy.py`
- Test fixtures: `tests/fixtures/eurostat_demo_mlexpec.json`, `tests/fixtures/who_ru_lifetable.json`

- [ ] **Step 1: Write the failing test** (parse recorded fixtures into the expected shape — no live HTTP)

```python
# tests/test_fetch_life_expectancy.py
import json
from pathlib import Path
from scripts.fetch_life_expectancy import parse_eurostat, parse_who, build_life_tables

FIX = Path(__file__).parent / "fixtures"

def test_parse_eurostat_extracts_ex_by_age():
    raw = json.loads((FIX / "eurostat_demo_mlexpec.json").read_text())
    out = parse_eurostat(raw)
    assert out["DE"]["name"] == "Germany"
    assert out["DE"]["ex_by_age"]["male"]["38"] > 0

def test_parse_who_russia():
    raw = json.loads((FIX / "who_ru_lifetable.json").read_text())
    out = parse_who(raw)
    assert "RU" in out
    assert out["RU"]["ex_by_age"]["female"]

def test_build_life_tables_has_retrieved_and_sources():
    eu = json.loads((FIX / "eurostat_demo_mlexpec.json").read_text())
    who = json.loads((FIX / "who_ru_lifetable.json").read_text())
    tables = build_life_tables(parse_eurostat(eu), parse_who(who), retrieved="2026-05-30")
    assert tables["retrieved"] == "2026-05-30"
    assert tables["countries"]["DE"]["source"].startswith("Eurostat")
    assert tables["countries"]["RU"]["source"].startswith("WHO")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/glebkalinin/genome-toolkit && python -m pytest tests/test_fetch_life_expectancy.py -v`
Expected: FAIL — module/fixtures missing.

- [ ] **Step 3: Create fixtures + implement parsers**

Create trimmed fixtures (hand-built minimal JSON-stat + WHO OData shapes covering DE male/female age 38 and RU male/female). Then implement `scripts/fetch_life_expectancy.py` with:
- `parse_eurostat(raw)` — decode JSON-stat dimension indices (`geo`, `sex`, `age`) into `{CC: {name, source:"Eurostat demo_mlexpec", ex_by_age:{male/female:{age:ex}}}}`.
- `parse_who(raw)` — decode WHO OData rows into `{RU: {name:"Russia", source:"WHO GHO life tables", ex_by_age:{...}}}`.
- `build_life_tables(eu, who, retrieved)` — merge + stamp.
- `fetch_eurostat()` / `fetch_who()` using `httpx` (live), guarded under `if __name__ == "__main__":` which writes `backend/app/data/life_tables.json`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_fetch_life_expectancy.py -v`
Expected: PASS.

- [ ] **Step 5: Generate the committed data file (live, once)**

Run: `python scripts/fetch_life_expectancy.py` (network). Verify `backend/app/data/life_tables.json` has DE/NL/RU + others, sex×age coverage, `retrieved` date. If network unavailable, document and seed from fixtures with an explicit partial-coverage note.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch_life_expectancy.py backend/app/data/life_tables.json tests/test_fetch_life_expectancy.py tests/fixtures/
git commit -m "feat(life-map): reproducible Eurostat+WHO life-table fetch script + data (#27)"
```

---

### Task 3: Backend endpoint + view registration

**Files:**
- Create: `backend/app/routes/life_map.py`
- Modify: `backend/app/main.py` (include router; add `life-map` to `ALL_VIEWS`)
- Create: `config/life-modifiers.yaml`
- Test: `tests/test_life_map_routes.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_life_map_routes.py
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_life_tables_endpoint_returns_countries():
    r = client.get("/api/life-map/life-tables")
    assert r.status_code == 200
    body = r.json()
    assert "retrieved" in body and "countries" in body
    assert "DE" in body["countries"]

def test_life_modifiers_config_served():
    r = client.get("/api/config/life-modifiers")
    assert r.status_code == 200
    assert "modifiers" in r.json()
```

- [ ] **Step 2: Run to verify fail**

Run: `python -m pytest tests/test_life_map_routes.py -v` → FAIL (404).

- [ ] **Step 3: Implement**

`life_map.py`: `APIRouter(prefix="/api/life-map")` with `GET /life-tables` reading `backend/app/data/life_tables.json`. Register in `main.py`; add `"life-map"` to `ALL_VIEWS`. Create `config/life-modifiers.yaml` with at least one `stress`, one `mental-health` (evidence: weak), one `family-history` entry per the spec schema.

- [ ] **Step 4: Run to verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/life_map.py backend/app/main.py config/life-modifiers.yaml tests/test_life_map_routes.py
git commit -m "feat(life-map): backend life-tables endpoint + view registration (#27)"
```

---

### Task 4: `useResidenceHistory` + `useLifeMap` hooks

**Files:**
- Create: `frontend/src/hooks/useResidenceHistory.ts`
- Create: `frontend/src/hooks/useLifeMap.ts`
- Test: `frontend/src/__tests__/useResidenceHistory.test.ts`, `frontend/src/__tests__/useLifeMap.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// useResidenceHistory.test.ts — mirrors useMyMedications localStorage pattern
import { renderHook, act } from '@testing-library/react'
import { useResidenceHistory } from '../hooks/useResidenceHistory'

beforeEach(() => localStorage.clear())

it('defaults to empty residences with sane sex/age', () => {
  const { result } = renderHook(() => useResidenceHistory())
  expect(result.current.state.residences).toEqual([])
  expect(result.current.state.sex).toBe('male')
})
it('adds/updates/removes and persists', () => {
  const { result } = renderHook(() => useResidenceHistory())
  act(() => result.current.addResidence({ country: 'RU', years: 33 }))
  act(() => result.current.setCurrentCountry('DE'))
  expect(JSON.parse(localStorage.getItem('genome_residence_history')!).currentCountry).toBe('DE')
})
it('recovers from malformed JSON', () => {
  localStorage.setItem('genome_residence_history', '{not json')
  const { result } = renderHook(() => useResidenceHistory())
  expect(result.current.state.residences).toEqual([])
})
```

```ts
// useLifeMap.test.ts — mock fetch for life-tables + modifiers
import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { useLifeMap } from '../hooks/useLifeMap'

it('computes anchors + blend marker from fetched table', async () => {
  global.fetch = vi.fn((url: string) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(
      String(url).includes('life-tables')
        ? { retrieved: 'x', countries: { DE: { name: 'Germany', source: 'Eurostat', ex_by_age: { male: { '38': 41.9 }, female: {} } } } }
        : { modifiers: [] }) }) as any) as any
  const { result } = renderHook(() => useLifeMap({ residences: [{ country: 'DE', years: 5 }], currentCountry: 'DE', sex: 'male', age: 38 }))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.anchors[0].targetAge).toBe(79.9)
})
```

- [ ] **Step 2: Run to verify fail** → `cd frontend && npx vitest run src/__tests__/useResidenceHistory.test.ts src/__tests__/useLifeMap.test.ts` → FAIL.

- [ ] **Step 3: Implement hooks** — `useResidenceHistory` (localStorage key `genome_residence_history`, shape `{residences, currentCountry, sex, age}`, try/catch load like `useMyMedications`). `useLifeMap(input)` fetches `/api/life-map/life-tables` + `/api/config/life-modifiers` once, memoizes `countryAnchors`/`blendMarker` over `input`.

- [ ] **Step 4: Run to verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useResidenceHistory.ts frontend/src/hooks/useLifeMap.ts frontend/src/__tests__/useResidenceHistory.test.ts frontend/src/__tests__/useLifeMap.test.ts
git commit -m "feat(life-map): residence-history + life-map data hooks (#27)"
```

---

### Task 5: `LifeMap` view + sub-components + nav wiring

**Files:**
- Create: `frontend/src/components/lifemap/LifeMap.tsx`, `ResidenceHistoryInput.tsx`, `CountryAnchors.tsx`, `MigrationContextMarker.tsx`
- Modify: `frontend/src/App.tsx` (route `#/life-map` + nav entry)
- Test: `frontend/src/__tests__/LifeMap.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { LifeMap } from '../components/lifemap/LifeMap'
// mock useLifeMap to return DE+RU anchors + a blend marker
it('renders country anchors as primary truth and a labeled heuristic marker', () => {
  render(<LifeMap />)
  expect(screen.getByText(/Germany/)).toBeInTheDocument()
  expect(screen.getByText(/heuristic/i)).toBeInTheDocument()      // marker caveat
  expect(screen.getByText(/period life expectancy/i)).toBeInTheDocument() // disclaimer
})
```

- [ ] **Step 2: Run to verify fail** → FAIL.

- [ ] **Step 3: Implement** components using existing theme tokens (no CSS framework); `ResidenceHistoryInput` fully labeled (`<label htmlFor>` / `aria-label`); `MigrationContextMarker` shows blend target age + spread + permanent "heuristic, not an epidemiological model" caveat; register route + nav in `App.tsx`.

- [ ] **Step 4: Run to verify pass** → PASS. Also run full suite: `cd frontend && npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/lifemap/ frontend/src/App.tsx frontend/src/__tests__/LifeMap.test.tsx
git commit -m "feat(life-map): Life-Map view with anchors + migration marker (#27)"
```

---

### Task 6: `LifeModifiers` (qualitative + evidence-gated opt-in range)

**Files:**
- Create: `frontend/src/components/lifemap/LifeModifiers.tsx`
- Modify: `frontend/src/components/lifemap/LifeMap.tsx` (render modifiers)
- Test: `frontend/src/__tests__/LifeModifiers.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { LifeModifiers } from '../components/lifemap/LifeModifiers'

const MODS = [
  { id: 'chronic-stress', category: 'stress', label: 'Chronic stress', qualitative: 'Worth attention', actions: [], evidence: 'strong', range: { lowYears: 1, highYears: 5 } },
  { id: 'anxiety', category: 'mental-health', label: 'Anxiety disorder', qualitative: 'Supportive note', actions: [], evidence: 'weak' },
]
it('shows qualitative text for all modifiers by default', () => {
  render(<LifeModifiers modifiers={MODS} />)
  expect(screen.getByText('Supportive note')).toBeInTheDocument()
  expect(screen.queryByText(/1–5 years/)).not.toBeInTheDocument()
})
it('reveals caveated range ONLY for strong-evidence items on opt-in', () => {
  render(<LifeModifiers modifiers={MODS} />)
  fireEvent.click(screen.getByRole('button', { name: /show range/i })) // only rendered for strong item
  expect(screen.getByText(/population-level, not you/i)).toBeInTheDocument()
})
it('never offers a range for mental-health/weak items', () => {
  render(<LifeModifiers modifiers={[MODS[1]]} />)
  expect(screen.queryByRole('button', { name: /show range/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify fail** → FAIL.

- [ ] **Step 3: Implement** — group by category; render `qualitative` + `actions`; "Show range" button rendered only when `evidence === 'strong' && range`; on click reveal `{low}–{high} years` with a permanent "population-level, not you" banner. Wire into `LifeMap`.

- [ ] **Step 4: Run to verify pass** → PASS. Full suites: `cd frontend && npx vitest run` and `python -m pytest tests/ -q`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/lifemap/LifeModifiers.tsx frontend/src/components/lifemap/LifeMap.tsx frontend/src/__tests__/LifeModifiers.test.tsx
git commit -m "feat(life-map): evidence-gated qualitative life modifiers (#27)"
```

---

## Self-Review

- **Spec coverage:** data pipeline → Task 2; backend endpoint + view reg → Task 3; `lifeBlend` → Task 1; hooks → Task 4; view + anchors + marker → Task 5; modifiers + gating → Task 6; honesty guardrails → Tasks 5/6 (caveats, disclaimers, evidence gate); tests → every task. All spec sections mapped.
- **Placeholder scan:** fixtures in Task 2 are described, not pasted (built during the step) — acceptable as a data-generation step, not a logic placeholder. All logic steps show code.
- **Type consistency:** `Sex`, `Residence`, `LifeTable`, `CountryAnchor`, `BlendMarker` defined in Task 1 and reused by hooks/components. localStorage keys: `genome_residence_history`. Endpoints: `/api/life-map/life-tables`, `/api/config/life-modifiers`. Modifier fields: `id, category, label, qualitative, actions, evidence, range?{lowYears,highYears}` — consistent across Tasks 3 and 6.
