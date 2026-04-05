# Action Checklist — Design Spec

**Date:** 2026-04-05
**Status:** Approved
**Scope:** Persistent sidebar checklist, multi-dimensional grouping, export, research prompt generator

**Mockups:** `.superpowers/brainstorm/80373-*/content/`:
- `01-checklist-sidebar.html` — Initial sidebar layout
- `02-checklist-views.html` — Three group-by views side by side
- `03-checklist-domain-view.html` — Final design: domain view + collapsible actions + delete confirmation
- `04-research-prompt.html` — Research prompt generator modal with editable markdown textarea

---

## 1. Overview

A persistent sidebar panel accessible from any page. Shows all action items with multi-dimensional grouping, filtering, and export. Items persist in SQLite (`action_progress` table). Supports custom free-text items.

---

## 2. UI Pattern: Sidebar + Badge

- **Badge** in header nav: "CHECKLIST" with count of pending items (amber badge)
- **Click badge** opens sidebar panel (420px wide, right side)
- Main content dims but remains visible
- **ESC or Close** dismisses sidebar
- Sidebar accessible from any view (SNP Browser, Mental Health, PGx, etc.)

---

## 3. Three-Dimensional Tagging

Each action item has three tag dimensions:

### 3.1 Evidence Type (existing)
How confident the recommendation is:
- **Consider** (amber) — evidence-backed suggestion
- **Monitor** (gold) — worth tracking
- **Discuss** (blue) — bring to doctor/prescriber
- **Try** (green) — lifestyle intervention

### 3.2 Practical Category (new)
What the user actually needs to do:
- **Buy** — supplements, vitamins, equipment
- **Practice** — free actions: meditation, exercise, breathwork, sleep hygiene
- **Test** — bloodwork, biomarkers, lab orders
- **Prescribe** — needs doctor/prescription: medication changes, clinical PGx
- **Habit** — daily patterns: caffeine timing, alcohol limits, sleep schedule
- **Research** — learn more, ask AI, read studies

### 3.3 Health Domain (new)
Which area of health this relates to:
- **Mental Health**
- **Harm Reduction**
- **Physical Health**
- **Nutrition**
- **Sleep**
- **Cardiovascular**
- **Longevity**
- (extensible — new domains added as features grow)

---

## 4. Grouping & Sorting

Switcher bar at top of sidebar with 5 options:

| View | Groups by | Shows |
|------|-----------|-------|
| Evidence | Consider / Monitor / Discuss / Try | Evidence type badge |
| What To Do | Buy / Practice / Test / Prescribe / Habit / Research | Practical category |
| Gene | MTHFR / COMT / GAD1 / ... | Gene symbol |
| Domain | Mental Health / Harm Reduction / Physical Health / ... | Health area |
| Status | Pending / Done | Completion state |

Each group header shows item count. Empty groups shown with "0" (collapsed).

Filter bar below switcher: All / Pending / Done (combinable with any grouping).

---

## 5. Action Item UI

Each item shows:
- Checkbox (left) — toggle done/undone
- Left border colored by evidence type
- Title (10px, medium weight)
- Meta row: tags from all three dimensions + gene link + evidence tier
- **On hover**: delete button (x) appears at right
- **Delete flow**: click x -> inline "Delete? **yes** no" confirmation -> second click confirms

Done items: 50% opacity, strikethrough title, "done X ago" in meta.

---

## 6. Custom Items

Input field at bottom of item list: "+ Add action item (or paste from any page)..."
- Free-text entry, no gene required
- Gets "custom" tag in meta, gray left border
- User can optionally set practical category and domain after adding

---

## 7. Collapsible Actions Menu

Bottom of sidebar: "&#9654; ACTIONS" label with toggleable arrow.

Click expands inline panel with:
- Print for doctor — generates PDF with Discuss items + gene context
- Print for prescriber — generates PDF with PGx metabolizer status + medication impacts
- Generate research prompt — opens modal (see section 8)
- Export PDF / Export Markdown — links, respects active filters

Arrow rotates 90deg on toggle (CSS transform, not text replacement).

---

## 8. Research Prompt Generator

Modal (700px) triggered from Actions menu.

### 8.1 Header
"Research Validation Prompt" + subtitle explaining purpose.

### 8.2 Polymorphism Chips
Row of chips showing all genes referenced by checklist items. Each chip:
- Gene name + variant
- Genotype in status color (amber for actionable, gold for monitor, green for optimal)

### 8.3 Editable Textarea
Large textarea with pre-generated markdown prompt containing:

**Sections:**
1. **Context** — what this is, what help is needed
2. **My Genotypes** — numbered list with rsIDs, genotypes, functional impact
3. **Known Gene Interactions** — how variants interact with each other
4. **Recommendations To Validate** — each checklist item with specific validation questions (form, dosage, evidence tier, alternatives, interactions)
5. **Questions** — meta-questions: contradictions, missing interactions, additional recommendations, evidence quality, retractions
6. **Important Notes** — framing: not medical advice, cite studies, flag weak evidence

User can edit the markdown directly before copying.

### 8.4 Footer
- **Regenerate** — re-generates from current checklist state
- **Save as note** — saves to vault as markdown file
- **Copy to clipboard** — primary action button

---

## 9. Persistence

### 9.1 Backend
Table: `action_progress` (already exists in migration 003)

```sql
action_progress (
  id TEXT PRIMARY KEY,
  gene_symbol TEXT NOT NULL,
  action_type TEXT NOT NULL,  -- consider/monitor/discuss/try
  title TEXT NOT NULL,
  done BOOLEAN DEFAULT 0,
  done_at TEXT,
  notes TEXT,
  profile_id TEXT DEFAULT 'default',
  created_at TEXT DEFAULT datetime('now')
)
```

Add columns for new dimensions (migration 004):
```sql
ALTER TABLE action_progress ADD COLUMN practical_category TEXT;  -- buy/practice/test/prescribe/habit/research
ALTER TABLE action_progress ADD COLUMN health_domain TEXT;       -- mental_health/harm_reduction/physical_health/...
```

### 9.2 API Endpoints
- `GET /api/actions` — list all items (with filters)
- `POST /api/actions` — create item
- `PATCH /api/actions/:id` — toggle done, update notes
- `DELETE /api/actions/:id` — delete item
- `POST /api/actions/research-prompt` — generate research prompt from current items

### 9.3 Frontend
- `useChecklist` hook — fetches from API, optimistic updates, local state sync
- Checklist sidebar component
- Research prompt modal component

---

## 10. Color System (consistent with rest of app)

- Evidence type colors: same as dashboard (amber=consider, gold=monitor, blue=discuss, green=try)
- Genotype colors in research prompt chips: amber for actionable, gold for monitor, green for optimal
- No red anywhere — same rule as mental health dashboard

---

## 11. Implementation Priority

1. Migration 004: add practical_category + health_domain columns
2. Backend API endpoints (CRUD)
3. `useChecklist` hook
4. Sidebar component with grouping switcher
5. Wire checkbox toggle to API (replace mock)
6. Custom item input
7. Delete with inline confirmation
8. Research prompt generator modal
9. Export PDF/MD (filter-aware)
10. Print for doctor / Print for prescriber variants
