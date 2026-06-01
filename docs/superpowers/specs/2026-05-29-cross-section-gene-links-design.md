# Cross-section gene links — design

**Issue:** #35 (child of epic #28)
**Date:** 2026-05-29

## Problem

Many genes are relevant in more than one section of the app. COMT appears in
Mental Health, Addiction, and Risk; CYP2D6 in PGx and Risk. Each section
currently renders its genes in isolation — there is no indicator that a gene is
also relevant elsewhere, and no way to jump there.

## Goal

On every gene card / detail, show a small badge for each *other* section the
gene appears in. Clicking the badge navigates to that section.

## Data model

Each view sources its genes differently, so the cross-reference index must
combine three config sources to match what is actually rendered:

| Section          | Gene source                                                         |
|------------------|---------------------------------------------------------------------|
| `mental-health`  | tag-match: `config/pathway-systems.yaml` systems with that `domain` |
| `addiction`      | tag-match: `config/pathway-systems.yaml` systems with that `domain` |
| `risk`           | `config/risk-landscape.yaml` `relevant_genes` (union over causes)   |
| `pgx`            | enzyme `symbol`s in `config/pgx-drugs.yaml`                          |

`Section` = `'mental-health' | 'addiction' | 'risk' | 'pgx'`.

The index maps each gene symbol (upper-cased) to a **sorted, de-duplicated**
list of the sections it belongs to.

## Architecture

Single source of truth on the backend, consumed by a cached hook and a shared
badge component rendered across all four views.

### 1. Backend — `GET /api/vault/gene-sections`

New function `build_gene_section_index()` in `backend/app/routes/vault.py`.

- Reuse `_load_pathway_systems()` + the vault gene tag map already built in
  `list_vault_systems` to collect mental-health / addiction members.
- Load `config/risk-landscape.yaml`; every symbol in any cause's
  `relevant_genes` → `risk`.
- Load `config/pgx-drugs.yaml`; every enzyme `symbol` → `pgx`.
- Merge into `dict[str, list[str]]`, symbol upper-cased, sections sorted.

Endpoint returns `{ "index": { "COMT": ["addiction","mental-health","risk"], ... } }`.

Pure helper extracted so it can be unit-tested without HTTP:
`build_gene_section_index(systems_config, system_genes, risk_genes, pgx_symbols)`.

### 2. Frontend hook — `useGeneSections()`

`frontend/src/hooks/useGeneSections.ts`, cached module-level like `useSystems`.
Fetches `/api/vault/gene-sections`. Returns:

```ts
{
  loading: boolean
  getSectionsForGene(symbol: string): Section[]   // upper-cased lookup
}
```

### 3. Shared component — `common/GeneCrossRefBadges.tsx`

Props: `{ symbol: string; currentSection: Section }`.

- Looks up sections via `useGeneSections`, filters out `currentSection`.
- Renders one pill per remaining section with a short label + `title` tooltip:
  `mental-health → "MH"`, `pgx → "PGx"`, `addiction → "Addiction"`,
  `risk → "Risk"`.
- Click sets `window.location.hash` to the section route
  (`#/mental-health`, `#/pgx`, `#/addiction`, `#/risk`). App already listens to
  `hashchange`.
- Renders nothing if there are no other sections.

### 4. Integration

Render `<GeneCrossRefBadges>` where genes are shown in each view:

- Mental Health — `mental-health/GeneCard.tsx` (or `GeneDetail.tsx`)
- PGx — `pgx/DrugCard`/enzyme header in `PGxPanel.tsx`
- Addiction — `addiction/AddictionProfile.tsx`
- Risk — gene minis in `risk/RiskLandscape.tsx`

## Out of scope (YAGNI)

- Scroll-to-gene / highlight on the target view. Navigation jumps to the
  section only; a deep-link (`?gene=COMT`) can be a follow-up.

## Testing

- **Backend (pytest):** `build_gene_section_index` returns correct multi-section
  membership; a PGx-only gene (e.g. CYP2C9) → `["pgx"]`; a multi-section gene
  (COMT) includes all expected sections; endpoint shape.
- **Frontend (vitest):** `GeneCrossRefBadges` renders the right pills, excludes
  the current section, renders nothing when alone, and sets the hash on click.
- **/real-browser:** verify badges render and navigate in the running app across
  the four views.
