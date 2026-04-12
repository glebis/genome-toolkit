# ClinVar vs MyVariant Evidence Comparison — Design Spec

**Issue:** #13
**Date:** 2026-04-12
**Status:** Approved

## Goal

Expandable side-by-side comparison of ClinVar and MyVariant evidence for a variant, accessible from the VariantDrawer's Clinical Annotation section.

## Approach

Frontend-only. No backend changes — `get_snp()` already returns all needed fields from both sources. One new component + integration into VariantDrawer.

## 1. `EvidenceComparison` component

**File:** `frontend/src/components/EvidenceComparison.tsx`

**Props:**
```ts
interface EvidenceComparisonProps {
  significance: string | null       // ClinVar clinical_significance
  mvSignificance: string | null     // MyVariant clinvar_significance
  alleleFreq: number | null         // COALESCE'd frequency
  alleleFreqSource: string | null   // MyVariant frequency source
  disease: string | null            // ClinVar disease_name
  reviewStatus: string | null       // ClinVar review_status
  geneSymbol: string | null         // gene_symbol
}
```

**Behavior:**
- Starts collapsed — only a "COMPARE SOURCES" link visible
- Click toggles expanded state
- Expanded: two-column layout (ClinVar | MyVariant) with rows for each field
- Missing data shown as "--" in tertiary color
- Top of expanded block: agreement indicator badge

**Agreement logic:**
- Both have significance and values match (case-insensitive) → "SOURCES AGREE" (green, `--sig-benefit`)
- Both have significance and values differ → "SOURCES DISAGREE" (red, `--sig-risk`)
- Only one source has significance → "PARTIAL DATA" (yellow, `--sig-reduced`)
- Neither has significance → component not rendered

**Field mapping in columns:**

| Row | ClinVar column | MyVariant column |
|-----|---------------|-----------------|
| Significance | `significance` | `mvSignificance` |
| Conditions | `disease` | -- |
| Review status | `reviewStatus` | -- |
| Gene | -- | `geneSymbol` |
| Frequency | `alleleFreq` (if no source) | `alleleFreq` + `alleleFreqSource` |

**Styling:**
- Monospace font (IBM Plex Mono), matches existing VariantDrawer style
- Column headers: `.label` class (uppercase, small)
- Dashed border top/bottom around expanded block
- Collapse/expand link: `var(--primary)` color, cursor pointer

## 2. VariantDrawer integration

**File:** `frontend/src/components/VariantDrawer.tsx`

- Import and render `<EvidenceComparison>` below the SIGNIFICANCE row in Clinical Annotation section
- Pass fields from `detail` object (already available as `d`)
- Only render if `d.significance || d.mv_significance` (at least one source has data)

## 3. Testing

**File:** `frontend/src/components/__tests__/EvidenceComparison.test.tsx`

Tests:
- Renders collapsed by default with "COMPARE SOURCES" link
- Expands on click, collapses on second click
- Shows "SOURCES AGREE" when both significances match
- Shows "SOURCES DISAGREE" when significances differ
- Shows "PARTIAL DATA" when only one source has data
- Returns null when neither source has significance
- Displays "--" for missing fields

## 4. Out of scope

- Raw JSON viewer for enrichment data
- Editing or correcting enrichment data
- Links to external ClinVar/MyVariant pages (already in guidance section)
- Backend changes
