# PGx: My Medications — Design Spec

**Issue:** #25 (partial — proposal 1 of 4)
**Date:** 2026-04-21
**Status:** Approved

## Problem

PGx panel has no way to express which drugs the user is currently taking. Filter chips are fixed (antidepressants/pain/substances/safety) and unaware of the user's actual medication list. Drug cards with direct relevance are not surfaced prominently.

## Scope

This spec covers proposal 1 from issue #25: "My Medications" input pinning user's drugs to top with dynamic enzyme filtering. Proposals 2–4 (multi-enzyme aggregation, structured dosing, interaction checker) are out of scope.

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Storage | Vault-first (`Medications.md`) | Matches existing biomarker pattern; vault is the canonical store for user health data; no write endpoint needed |
| Input UX | Read from vault, no in-app input | User authors in Obsidian; same workflow as lab results |
| Visual | Summary banner at top + highlight within enzyme sections | Full context at a glance + in-place relevance |
| Persistence | Vault file, read-only API | Consistent with `Biomarkers/` pattern; Obsidian-editable |

**Why not SQLite:** Codex (gpt-5.4) recommended SQLite for queryability. Reversed after discovering the existing biomarker pattern — vault is the established store for user health data in this project. The vault-first workflow (author in Obsidian, read via API) is already proven.

## Architecture

```
~/Brains/genome/Biomarkers/Medications.md   ← user authors in Obsidian
  ↓
GET /api/pgx/medications                     ← new backend endpoint
  ↓
useMedications() hook                        ← new frontend hook
  ↓
MyMedicationsPanel (top of PGxPanel)         ← new component
PGxPanel drug card sorting + highlight       ← modified component
```

## Vault Note Format

File: `~/Brains/genome/Biomarkers/Medications.md`

```markdown
---
type: medications
medications:
  - name: sertraline
    dose: 50mg
    frequency: daily
    started_at: '2026-01-01'
    is_active: true
  - name: cannabis
    frequency: daily
    is_active: true
tags:
  - medications
  - pgx
---

# My Medications

Notes and context here. Can include wikilinks to gene notes, protocols, etc.
```

Mirrors the `Biomarkers/YYYY-MM-DD Lab Results.md` frontmatter structure exactly. Template goes in `Templates/Medications.md`.

## Backend

**New file:** `backend/app/routes/pgx.py`

```python
GET /api/pgx/medications
```

- Reads `{vault_path}/Biomarkers/Medications.md`
- Parses YAML frontmatter `medications` list
- Filters `is_active: true` entries
- Returns `{ medications: [{ name, dose, frequency }] }`
- `503` if vault not configured
- `404` if `Medications.md` not found (frontend treats as empty list)
- Register router in `backend/app/main.py`

## Frontend

### `useMedications()` hook

**File:** `frontend/src/hooks/useMedications.ts`

- Fetches `GET /api/pgx/medications` on mount
- Returns `{ medications: MedicationEntry[], loading: boolean }`
- Graceful empty array on 503/404 — feature silently absent when vault not set up
- No write path

```typescript
interface MedicationEntry {
  name: string
  dose?: string
  frequency?: string
}
```

### `MyMedicationsPanel` component

**File:** `frontend/src/components/pgx/MyMedicationsPanel.tsx`

Rendered at top of `PGxPanel` when `medications.length > 0`.

For each active medication, matches against `DrugCardData.drugList` strings (case-insensitive substring match) across all enzyme sections to determine enzyme impacts. Displays a compact summary row per medication:

```
┌─ My Medications ──────────────────────────────────────┐
│ sertraline   CYP2D6 IM → ⚠ warn   CYP2C19 → ✓ ok     │
│ cannabis     CYP1A2 → adjust       CYP2C19 → ⚠ warn   │
└───────────────────────────────────────────────────────┘
```

If no medications match any drug card, renders nothing (not an error state).

### PGxPanel changes

**File:** `frontend/src/components/pgx/PGxPanel.tsx`

- Import `useMedications`
- Compute `pinnedDrugClasses`: set of `DrugCardData` entries whose `drugList` contains any active medication name
- Within each enzyme section, sort `pinnedDrugClasses` to top
- Add `data-pinned` prop to matched `DrugCard` instances → highlighted left border (accent color, consistent with existing `dangerNote` styling)
- Render `<MyMedicationsPanel>` above enzyme sections

## Drug Matching

Case-insensitive substring match: `drugCard.drugList.toLowerCase().includes(medName.toLowerCase())`.

Example: medication `"sertraline"` matches `DrugCard.drugList = "Sertraline (Zoloft), Citalopram, Escitalopram"`.

No fuzzy matching needed — the drug list is controlled (20–30 classes from YAML config).

## Error Handling

| Condition | Backend | Frontend |
|---|---|---|
| No vault configured | 503 | silently render nothing |
| `Medications.md` missing | 404 | silently render nothing |
| Malformed frontmatter | 200 with `[]` | silently render nothing |
| Network error | — | silently render nothing |

The feature is purely additive — its absence never breaks the PGx panel.

## Vault Template

**File:** `~/Brains/genome/Templates/Medications.md`

Provides the frontmatter scaffold with inline comments explaining each field. Created as part of this feature alongside the skill.

## Skill

**Name:** `genome-medication-entry`
**Location:** `.claude/skills/genome-medication-entry/SKILL.md`

Conversational workflow for adding a new medication:
1. Ask for medication name and dose
2. Look up which enzyme sections in `pgx-drugs.yaml` are affected
3. Surface relevant impacts (e.g., "sertraline is a CYP2D6 substrate — you're IM, expect higher plasma levels")
4. Write the new entry into `Biomarkers/Medications.md`

## Files Changed

| File | Change |
|---|---|
| `backend/app/routes/pgx.py` | New — medications read endpoint |
| `backend/app/main.py` | Register pgx router |
| `frontend/src/hooks/useMedications.ts` | New hook |
| `frontend/src/components/pgx/MyMedicationsPanel.tsx` | New component |
| `frontend/src/components/pgx/PGxPanel.tsx` | Wire hook, add sorting + highlight |
| `frontend/src/types/genomics.ts` | Add `MedicationEntry` type |
| `~/Brains/genome/Templates/Medications.md` | New vault template |
| `.claude/skills/genome-medication-entry/SKILL.md` | New skill |

## Testing

- Backend: parse Medications.md with valid/missing/malformed frontmatter
- Frontend: `useMedications` hook (mock API), `MyMedicationsPanel` renders correct enzyme impacts, drug card sorting
- Integration: no vault → panel renders normally with no medications section
