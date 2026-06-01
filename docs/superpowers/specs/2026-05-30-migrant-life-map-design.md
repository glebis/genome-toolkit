# Migrant Life-Map (MVP)

**Issue:** #27 (new track A2+F)
**Date:** 2026-05-30
**Status:** Approved (Claude + Codex consult; user delegated decision)

## Context

A person is not one demographic. Someone who lived most of their life in Russia and
now lives in Germany carries a *mixed* mortality picture: early-life environment,
current healthcare access, and a different stress profile. The existing Risk Landscape
hardcodes a single demographic (`male / 30-44 / european`); this feature builds a
separate, migrant-aware **Life-Map** that blends multiple countries' life-expectancy
data and layers qualitative life-context modifiers.

This is track **A2+F** of the larger roadmap (run separately, per user):

| | Track | Status |
|---|---|---|
| A | Risk-Landscape demographic selector | specced (`2026-05-29-…`), foundation, not built |
| **A2+F** (this) | **Migrant Life-Map: multi-country blend + stress/MH/family modifiers** | **this cycle** |
| B | Visuals (life calendar, timelines) | future |
| C | Share (CLI / MCP + GPT-image social cards) | future |
| E | Functional self-tests → functional age | future |

## Design decisions (Claude + Codex agreed)

- **Standalone `#/life-map` view** (new nav route), not folded into Risk Landscape.
- **Country anchors are the primary truth**: each lived-in country's
  life-expectancy-at-current-age is shown side by side. A **blend** is shown only as a
  secondary, explicitly-labeled *"migration context"* marker — never as "your life
  expectancy."
- **Modifiers**: qualitative + supportive by default; opt-in *wide caveated range* for
  well-evidenced factors only; mental-health items stay qualitative (gated by evidence
  level), so the user's anxiety never becomes a scary number.
- **Genetic overlay deferred** out of MVP (link to Risk Landscape later).
- **Real data via reproducible script**, not article scraping: Eurostat (EU) + WHO
  GHO (Russia), written to a committed, version-stamped data file.

## 1. Data pipeline

**`scripts/fetch_life_expectancy.py`** (new) — reproducible fetcher:

- **Eurostat** `demo_mlexpec` (life expectancy by `age` × `sex` × `geo`) via the
  JSON-stat REST API for all EU countries. Gives remaining life expectancy `ex` at each
  age — exactly "life-expectancy-at-current-age."
- **WHO GHO** OData for **Russia** life tables (`ex` by 5-year age bracket; mapped to
  nearest bracket at lookup time). Also pull WHO **HALE** where available.
- Writes **`backend/app/data/life_tables.json`** (committed) with per-country `source`
  string and `retrieved` ISO date. Shape:

```json
{
  "retrieved": "2026-05-30",
  "countries": {
    "DE": {
      "name": "Germany",
      "source": "Eurostat demo_mlexpec",
      "ex_by_age": { "male": { "0": 78.6, "38": 41.9, "...": 0 }, "female": { } }
    },
    "RU": { "name": "Russia", "source": "WHO GHO life tables", "ex_by_age": { } }
  }
}
```

- The app reads the committed file — **no network at runtime**. Re-running the script
  refreshes the file (reproducible). Script unit-tested against **recorded fixtures**
  (no live API calls in CI).

**`config/life-modifiers.yaml`** (new) — modifier catalogue:

```yaml
modifiers:
  - id: chronic-stress
    category: stress            # stress | mental-health | family-history
    label: Chronic stress load
    qualitative: "Sustained high stress is a factor worth attention…"
    actions: ["Regular recovery / sleep", "…"]
    evidence: moderate          # strong | moderate | weak
    # range only honored when evidence == strong
  - id: anxiety-disorder
    category: mental-health
    label: Diagnosed anxiety disorder
    qualitative: "…supportive, non-alarming framing…"
    actions: ["…"]
    evidence: weak              # -> stays qualitative, no range ever
```

## 2. Backend

- **`GET /api/life-map/life-tables`** — serves the committed `life_tables.json`
  (dumb data server, mirrors existing `/api/config/{name}` pattern). Lives in a new
  focused module `backend/app/routes/life_map.py`, registered in `main.py`.
- Modifier catalogue served via existing `GET /api/config/life-modifiers`.
- Register the `life-map` view in `ALL_VIEWS` (`backend/app/main.py`).

## 3. Frontend

**Pure logic — `frontend/src/lib/lifeBlend.ts`** (no React, fully unit-testable):

```ts
interface Residence { country: string; years: number }
interface CountryAnchor { country: string; name: string; exAtAge: number; targetAge: number }

function lifeExpectancyAtAge(table, country, sex, age): number | null
function countryAnchors(table, residences, sex, age): CountryAnchor[]
function blendMarker(anchors, residences, currentCountry): {
  targetAge: number; spread: { min: number; max: number }; heuristic: true
}
```

Blend = years-lived-weighted average of per-country `targetAge`, with a modest fixed
emphasis multiplier on `currentCountry`. Edge cases: single country → that anchor
(no emphasis); zero total years → fall back to current country; unknown country →
skipped with a surfaced note. The blend is **always** accompanied by the anchor spread.

**Hooks:**

- **`useResidenceHistory`** — `localStorage`-backed `{ residences: Residence[],
  currentCountry, sex, age }` with add/remove/update; malformed-JSON recovery; mirrors
  `useMyMedications`.
- **`useLifeMap`** — fetches life tables (once) + modifier catalogue; returns anchors,
  blend marker, modifiers, loading/error.

**Components (`frontend/src/components/lifemap/`):**

- `LifeMap.tsx` — the view: hero, `ResidenceHistoryInput`, `CountryAnchors`,
  `MigrationContextMarker`, `LifeModifiers`, disclaimers, footer.
- `ResidenceHistoryInput.tsx` — sex, current age, and add/remove country-years rows;
  "current country" toggle. Fully labeled for accessibility.
- `CountryAnchors.tsx` — per-country target age side by side (the primary truth).
- `MigrationContextMarker.tsx` — the blended marker + spread, with the explicit
  "heuristic, not an epidemiological model; healthy-migrant effects and risk
  convergence apply" caveat.
- `LifeModifiers.tsx` — qualitative modifier cards grouped by category; opt-in range
  reveal **gated to `evidence === 'strong'`**, with a "population-level, not you"
  banner.

**Routing/nav:** add `#/life-map` route in `App.tsx` and a nav entry (per AGENTS.md
"Add a new view").

## 4. Honesty / safety guardrails

- Country numbers labeled **period life expectancy** (not a personal prediction).
- Blend marker permanently labeled a heuristic, never "your life expectancy."
- Mental-health modifiers cannot produce a number (evidence-gated); supportive tone per
  the project's mental-health UX spec.
- Every data point traceable to `source` + `retrieved` in the committed file.

## 5. Testing (TDD — tests lead each slice)

- **`lib/__tests__/lifeBlend.test.ts`**: `ex` lookup + age→bracket mapping; target age;
  years-weighting; current-residence emphasis; anchor transparency; single-country;
  zero-years fallback; unknown country skipped.
- **`useResidenceHistory.test.ts`**: default, persist, add/remove/update, malformed JSON.
- **`useLifeMap.test.ts`**: fetch + compose; loading; error; no refetch on input change.
- **`ResidenceHistoryInput.test.tsx`**: add/remove rows; accessible labels; onChange.
- **`LifeModifiers.test.tsx`**: qualitative default; range gated to strong evidence;
  mental-health stays qualitative; caveat banner present.
- **`LifeMap.test.tsx`**: input → anchors + marker render; disclaimers present;
  localStorage round-trip.
- **Backend** (`tests/`): fetch script parses recorded fixtures into expected shape;
  committed `life_tables.json` parses with required country/sex/age coverage;
  `/api/life-map/life-tables` returns it.

## 6. Build order

1. `lifeBlend.ts` pure module (+ tests) — no deps, defines the contract.
2. `fetch_life_expectancy.py` (+ fixture tests) → produce committed `life_tables.json`.
3. Backend endpoint + view registration (+ tests).
4. `useResidenceHistory` + `useLifeMap` hooks (+ tests).
5. `LifeMap` view + sub-components (+ tests), wired into nav.
6. `life-modifiers.yaml` + `LifeModifiers` (+ tests).

## 7. Out of scope

Visuals/calendar (B), CLI/MCP share + social cards (C), genetic overlay, functional
self-tests (E), PRS, ancestry-as-data-axis, calibrated risk.
