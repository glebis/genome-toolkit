# Risk Landscape: Demographic Selector + Demographic-Keyed Mortality Data

**Issue:** #27 (continuation)
**Date:** 2026-05-29
**Status:** Draft

## Context

The Risk Landscape view shows leading causes of death as population bars overlaid
with personal genetic factors. Today the demographic is **hardcoded** in
`config/risk-landscape.yaml` (`male / 30-44 / european`) and shown read-only. The
population percentages (`pct`) are fixed for that one demographic.

This is dishonest: leading causes of death differ dramatically by age and sex
(accidents dominate young adults; heart disease and cancer dominate older adults).
Showing a 25-year-old female "31% cardiovascular" is simply wrong.

The honest-risk-communication and action-timeline pieces of #27 (confidence dots,
qualitative disclaimer, screening timeline) are **already implemented**. This spec
covers the remaining gap: a **user-selectable demographic** whose selection actually
swaps the underlying mortality data.

This is **Project A** of a three-part decomposition:

| | Subsystem | Depends on |
|---|---|---|
| **A** (this spec) | Demographic selector + demographic-keyed mortality & life-expectancy data | nothing |
| **B** (future) | Life calendar + timeline visuals (in-app SVG) | A's data |
| **C** (future) | Shareable infographic export via CLI / MCP | B's renderer |

To unblock B without re-touching the data layer, A also carries **life expectancy**
and **healthy life expectancy (HALE / "productive age")** per sex.

## Approach

**Selection is client-side.** The backend serves the full demographic-keyed dataset
(small: ~4 age bands × 2 sexes × ~10 causes). The frontend picks the active band from
a `localStorage`-backed selection. Switching is instant (no loading flicker), the
backend stays a dumb config server, and the logic is trivially unit-testable. A
server-side `?sex=&age=` query was rejected: it adds round-trips and backend branching
for no benefit at this data size.

**Clean separation in the data layer.** Today `useRiskData` rebuilds everything —
including per-gene `fetch` calls for actions — in one effect. We split it:

1. **Gene-merged "cause cores"** (narrative, timeline, confidence, gene minis) are
   demographic-*independent* and computed once (preserving the existing fetch logic).
2. **The demographic mortality table** maps onto the cores as a cheap, pure step
   (`pct` → re-rank by pct desc → bar percentages), recomputed with `useMemo` when the
   selection changes.

Result: toggling sex/age never re-fetches genes.

## 1. Config restructure (`config/risk-landscape.yaml`)

Cause *definitions* (`relevant_genes`, `relevant_systems`, `screenings`,
`description`) stay demographic-independent. Three additions:

```yaml
causes:
  - cause: Cardiovascular Disease
    relevant_genes: [MTHFR, APOE, LPA]
    relevant_systems: [...]
    screenings: [...]
  # ... unchanged ...

# Mortality distribution by sex x age band.
# Approximate, directional figures from CDC/NVSS leading-causes-of-death-by-age-group.
# NOT calibrated risk — population context only. Percentages are share-of-deaths
# within the band and need not sum to 100 (long tail omitted).
mortality:
  default: { sex: male, age_range: "45-64", ancestry: european }
  age_bands: ["18-24", "25-44", "45-64", "65+"]
  bands:
    - sex: male
      age_range: "18-24"
      causes:
        "Accidents & Substance-Related": 45
        "Suicide & Self-harm": 18
        "Cardiovascular Disease": 3
        # ... every cause in `causes` gets an entry (0 allowed) ...
    # ... male x {25-44,45-64,65+}, female x {all bands} ...

# Period life expectancy at birth + WHO healthy life expectancy (HALE).
# Approximate, high-income/US. Used as calendar targets in Project B.
life_expectancy:
  male:   { expected_age: 76, healthy_age: 66 }
  female: { expected_age: 81, healthy_age: 70 }

# Ancestry is a labeled caveat, NOT a data axis. It does not adjust bars.
ancestry_options: [european, african, east_asian, south_asian, admixed, other]
```

Causes irrelevant to a band get a low/zero `pct` (honest: a 20-year-old sees
cardiovascular ≈ 3%). The data file carries a top comment stating the numbers are
approximate population statistics, not fabricated precision.

## 2. New hook: `useDemographic`

**File:** `frontend/src/hooks/useDemographic.ts`

`localStorage`-backed selection, mirroring `useMyMedications`:

```ts
interface Demographic { sex: 'male' | 'female'; ageRange: string; ancestry: string }

function useDemographic(defaultDemographic: Demographic): {
  demographic: Demographic
  setDemographic: (next: Partial<Demographic>) => void
}
```

- Reads `localStorage["genome:risk-demographic"]` on init; falls back to
  `defaultDemographic` (config `mortality.default`) when absent or malformed.
- `setDemographic` merges a partial and persists.
- Guards against malformed JSON (try/catch → fall back to default).

**Type reconciliation:** `useRiskData.ts` currently exports
`interface Demographic { sex; age_range; ancestry }` (snake_case). We consolidate on a
single idiomatic `Demographic` with `ageRange` (camelCase) defined in
`useDemographic.ts` and imported everywhere; mapping to config's `age_range` happens
only at the config-parse boundary in `useRiskData`. Consumers (`formatDemographic` in
`RiskLandscape.tsx`) are updated to `ageRange`.

## 3. New component: `DemographicSelector`

**File:** `frontend/src/components/risk/DemographicSelector.tsx`

Three controls, fully labeled for accessibility:

- **Sex** — segmented toggle (male / female), `role="radiogroup"` + `aria-label`.
- **Age band** — `<select>` from `age_bands`, with associated `<label htmlFor>`.
- **Ancestry** — `<select>` from `ancestry_options`, with associated `<label htmlFor>`.

Below the controls, one honest line:

> Period life expectancy ≈ {expected_age} yrs · healthy years ≈ {healthy_age} yrs
> (approximate, not personalized)

Placed at the top of the content area, above `InfoCallout`. Calls
`setDemographic` on change. Styled with existing theme tokens; no new CSS framework.

## 4. `useRiskData(demographic)` changes

**File:** `frontend/src/hooks/useRiskData.ts`

- Accept the selected `Demographic` as an argument.
- Parse the new config shape: `causes` (definitions), `mortality`, `life_expectancy`,
  `ancestry_options`.
- Build gene-merged **cause cores** once (existing logic), keyed by cause name.
- Derive displayed causes via `useMemo(selection)`:
  - Look up the band matching `(sex, ageRange)`; if missing, fall back to `default`.
  - Assign each core its band `pct`. `populationBarPct` is **derived from `pct`** in
    the hook (currently `pct` is the only population figure in config; the bar percent
    is `pct` clamped to 0–100 for rendering) — there is no separate config field.
    Re-derive `personalBarPct` via the existing factor math against `populationBarPct`.
  - **Re-rank** by `pct` descending, reassign `rank` 1..N.
- Return `lifeExpectancy` for the selected `sex`, plus `ancestryOptions` and
  `ageBands` for the selector.
- **Ancestry does not affect bars** (asserted by test).

Updated return type:

```ts
interface UseRiskDataReturn {
  causes: MortalityCause[]
  lifeExpectancy: { expectedAge: number; healthyAge: number } | null
  ageBands: string[]
  ancestryOptions: string[]
  defaultDemographic: Demographic | null
  loading: boolean
}
```

## 5. Honest-communication copy (`RiskLandscape.tsx`)

`InfoCallout` updated to state that population bars are **approximate statistics for
the selected sex × age band**, and that **ancestry affects screening relevance and
allele frequencies but the bars are not ancestry-adjusted**. The footer demographic
summary reads from the live selection.

`RiskLandscape` wires `useDemographic` (seeded by `useRiskData`'s `defaultDemographic`)
and passes the selection into `useRiskData`, rendering `DemographicSelector` at top.

## 6. Files to change

| File | Change |
|---|---|
| `config/risk-landscape.yaml` | Add `mortality`, `life_expectancy`, `ancestry_options`; keep cause defs |
| `frontend/src/hooks/useDemographic.ts` | **New** localStorage-backed selection hook |
| `frontend/src/hooks/useRiskData.ts` | Demographic arg, split cores from demographic mapping, re-rank, expose life expectancy |
| `frontend/src/components/risk/DemographicSelector.tsx` | **New** accessible selector + life-expectancy line |
| `frontend/src/components/risk/RiskLandscape.tsx` | Wire selector, updated InfoCallout copy, live footer |

## 7. Testing (TDD)

- **`useDemographic.test.ts`** (new): default when storage empty; persists on set;
  recovers from malformed JSON; partial merge.
- **`useRiskData.test.ts`** (extend): selecting a band picks that band's `pct`;
  causes re-rank by pct desc; changing ancestry does **not** change any bar; changing
  demographic does **not** trigger gene/action re-fetch (mock `fetch` call count);
  `lifeExpectancy` reflects selected sex; fallback to `default` for unknown band.
- **`DemographicSelector.test.tsx`** (new): renders sex/age/ancestry controls with
  accessible labels; fires `setDemographic` with the right partial on each change;
  shows the life-expectancy line.
- **`RiskLandscape.test.tsx`** (extend): selector renders; switching sex/age updates
  bars + label + footer; ancestry caveat copy present; selection round-trips through
  `localStorage`.
- **Backend** (`tests/`): `/api/config/risk-landscape` parses and exposes
  `mortality.bands` (every band covers every cause), `life_expectancy.{male,female}`,
  and `ancestry_options`.

## 8. Out of scope

- Life calendar / timeline **visuals** (Project B).
- Shareable infographic via CLI / MCP (Project C).
- PRS / calibrated risk scores.
- Ancestry-adjusted bars (kept a caveat).
- Custom cause pinning; lab/lifestyle integration.
