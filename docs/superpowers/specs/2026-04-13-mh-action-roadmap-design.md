# Mental Health: Action Roadmap

**Issue:** #24 (remaining item — dynamic systems and gene_meta already done)
**Date:** 2026-04-13
**Status:** Approved

## Overview

A collapsible ranked action list at the top of the Mental Health dashboard. Aggregates all actions across all genes/pathways and sorts by composite priority score. Answers "what should I do first?"

## Placement

Between FilterBar and the color Legend in MentalHealthDashboard. Collapsible — shows top 5 by default, "SHOW ALL N" expands.

## Scoring Algorithm

Each action gets a composite priority score:

```
score = statusScore + evidenceScore + typeScore
```

| Factor | Values |
|---|---|
| Gene status | actionable=30, monitor=20, optimal=10, neutral=0 |
| Evidence tier | E1=25, E2=20, E3=15, E4=10, E5=5 |
| Action type | discuss=4, monitor=3, consider=2, try=1 |

Higher score = higher priority. Actions sorted descending. Ties broken by gene symbol alphabetically.

## Visual Design

Each item in the ranked list:

- **Rank circle** (22px, colored): amber (#e8a040) for score >= 50, gold (#c89040) for >= 30, green (#70b070) for rest
- **Action title** (13px)
- **Metadata line** (10px, secondary): `{GENE} · {Status} · {EvidenceTier} · {ActionType}`
- **Checklist button** (+) — reuses existing add-to-checklist pattern

Header row: "ACTION ROADMAP" label left, "SHOW ALL {n}" toggle right.

Collapsed: top 5 items. Expanded: all items. Toggle text changes to "SHOW LESS".

## Filter Interaction

ActionRoadmap respects the active filters from `useMentalHealthFilters`:
- **Category filter** (mood/stress/sleep/focus): only show actions from genes matching the category
- **Action type filter** (consider/monitor/discuss/try): only show actions of that type

When all filters are cleared, roadmap shows all actions.

## Data Source

Uses the existing `actions` prop (Record<string, ActionData[]>) and `data` prop (PathwaySection[]) already passed to MentalHealthDashboard. No new API calls needed.

To compute scores, each action's gene symbol is looked up in the sections data to get `status` and `evidenceTier`. The action itself provides `type`.

## Types

```typescript
interface RankedAction {
  action: ActionData
  gene: GeneData
  score: number
  rank: number
}
```

## Files

| File | Change |
|---|---|
| `frontend/src/components/mental-health/ActionRoadmap.tsx` | New component — scored list with collapse/expand |
| `frontend/src/components/mental-health/MentalHealthDashboard.tsx` | Insert `<ActionRoadmap>` between FilterBar and Legend |
| `frontend/src/__tests__/ActionRoadmap.test.tsx` | New test file |

## Out of Scope

- Drag-and-drop reordering
- Persisted roadmap state (collapse/expand resets on navigation)
- Custom user priority overrides
