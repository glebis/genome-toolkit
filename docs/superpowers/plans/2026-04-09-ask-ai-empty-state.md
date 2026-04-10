# Ask.ai Empty State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cold empty chat state with a guided experience: capability tags, personalized starter prompts from the backend, and universal explore prompts.

**Architecture:** New FastAPI endpoint `/api/starter-prompts?view=X` reads genome.db + vault + GWAS config to generate 3 personalized prompts per view. Frontend hook `useStarterPrompts` fetches on mount, caches in sessionStorage. CommandPalette renders an EmptyState block when no messages exist.

**Tech Stack:** FastAPI (Python), React + TypeScript, Vitest, aiosqlite, YAML/JSON config files

**Spec:** `docs/superpowers/specs/2026-04-09-ask-ai-empty-state-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/routes/starter_prompts.py` | Create | FastAPI router: `/api/starter-prompts?view=X` |
| `backend/app/main.py` | Modify (lines 81-99) | Register new router |
| `frontend/src/hooks/useStarterPrompts.ts` | Create | Fetch + sessionStorage cache hook |
| `frontend/src/components/CommandPalette.tsx` | Modify | Add EmptyState rendering, new props |
| `frontend/src/App.tsx` | Modify | Wire hook to CommandPalette |
| `frontend/src/__tests__/useStarterPrompts.test.ts` | Create | Hook tests |
| `frontend/src/__tests__/CommandPalette.test.tsx` | Create | EmptyState rendering tests |

---

### Task 1: Backend endpoint — starter_prompts.py

**Files:**
- Create: `backend/app/routes/starter_prompts.py`
- Modify: `backend/app/main.py:81-99`

- [ ] **Step 1: Create the route file with basic structure**

```python
# backend/app/routes/starter_prompts.py
"""Starter prompts for Ask.ai empty state — personalized per view."""
import json
import os
from pathlib import Path

import yaml
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api")

# Hardcoded fallback capabilities (used if data unavailable)
DEFAULT_CAPABILITIES = [
    "Read your vault notes",
    "Search variants",
    "Check drug interactions",
    "Add to checklist",
]

EXPLORE_PROMPTS = [
    "What's interesting in my genome?",
    "What should I bring to my next doctor visit?",
]


def _make_prompt(text: str, subtitle: str, priority: int) -> dict:
    return {"text": text, "subtitle": subtitle, "priority": priority}
```

- [ ] **Step 2: Add the SNP view prompt generator**

```python
async def _snps_prompts(genome_db) -> list[dict]:
    """Generate prompts for SNP Browser view."""
    prompts = []

    # Count pathogenic variants
    insights = await genome_db.get_insights()
    pathogenic = insights.get("pathogenic_count", 0)
    if pathogenic > 0:
        prompts.append(_make_prompt(
            "What are my most clinically significant variants?",
            f"You have {pathogenic} variants flagged as pathogenic or likely pathogenic",
            1,
        ))
    else:
        prompts.append(_make_prompt(
            "Do I have any clinically significant variants?",
            "Searches ClinVar annotations across your genome",
            1,
        ))

    # Drug response variants
    drug_response = insights.get("drug_response_count", 0)
    prompts.append(_make_prompt(
        "Which of my variants have drug interactions?",
        f"{drug_response} drug-response variants found" if drug_response > 0
        else "Cross-references your SNPs with pharmacogenomic databases",
        2,
    ))

    # Top gene
    top_genes = insights.get("top_genes", [])
    if top_genes:
        gene = top_genes[0].get("gene", "")
        count = top_genes[0].get("count", 0)
        prompts.append(_make_prompt(
            f"Explain my {gene} variants",
            f"Your most annotated gene with {count} variants",
            3,
        ))
    else:
        prompts.append(_make_prompt(
            "Show me my most actionable findings",
            f"{insights.get('actionable_count', 0)} actionable variants detected",
            3,
        ))

    return prompts[:3]
```

- [ ] **Step 3: Add the mental health prompt generator**

```python
async def _mental_health_prompts(genome_db, gwas_config_dir: Path) -> list[dict]:
    """Generate prompts for Mental Health view."""
    prompts = []

    # Find trait with most GWAS hits
    best_trait = ""
    best_display = ""
    best_count = 0

    if gwas_config_dir.exists():
        for f in sorted(gwas_config_dir.glob("*-hits.json")):
            try:
                data = json.loads(f.read_text())
            except Exception:
                continue
            trait = data.get("trait", "")
            # Only mental-health relevant traits
            if trait not in ("depression", "anxiety", "bipolar", "schizophrenia", "ptsd", "adhd"):
                continue
            n_hits = len(data.get("hits", []))
            if n_hits > best_count:
                best_count = n_hits
                best_trait = trait
                best_display = data.get("display_name", trait)

    if best_trait:
        prompts.append(_make_prompt(
            f"What do my GWAS hits mean for {best_display.lower()} risk?",
            f"{best_count} hits found in PGC {best_display} GWAS",
            1,
        ))
    else:
        prompts.append(_make_prompt(
            "What do my genetics say about mental health?",
            "Reviews GWAS data and vault notes for your profile",
            1,
        ))

    prompts.append(_make_prompt(
        "Which supplements might help based on my genetics?",
        "Reviews vault notes for evidence-backed recommendations",
        2,
    ))

    # Top two genes from vault by evidence tier
    vault_genes = _get_top_mental_health_genes(genome_db)
    if len(vault_genes) >= 2:
        prompts.append(_make_prompt(
            f"How do my {vault_genes[0]} and {vault_genes[1]} variants interact?",
            "Your top two genes by evidence tier in mental health",
            3,
        ))
    else:
        prompts.append(_make_prompt(
            "How do my gene variants interact with each other?",
            "Explores gene-gene interactions relevant to mental health",
            3,
        ))

    return prompts[:3]
```

- [ ] **Step 4: Add helper to get top mental health genes from vault**

```python
def _get_top_mental_health_genes(vault_path: str | None) -> list[str]:
    """Return top 2 gene symbols from vault with mental health relevance, sorted by evidence tier."""
    if not vault_path:
        return []

    TIER_ORDER = {"E1": 0, "E2": 1, "E3": 2, "E4": 3, "E5": 4}
    MH_SYSTEMS = {"Serotonin", "Dopamine", "GABA", "HPA Axis", "Glutamate", "Neuroplasticity"}

    genes_dir = Path(vault_path) / "Genes"
    if not genes_dir.is_dir():
        return []

    scored: list[tuple[str, int]] = []
    for f in genes_dir.glob("*.md"):
        try:
            text = f.read_text()
        except Exception:
            continue
        if not text.startswith("---"):
            continue
        try:
            end = text.index("---", 3)
            fm = yaml.safe_load(text[3:end]) or {}
        except Exception:
            continue

        systems = fm.get("systems", [])
        if isinstance(systems, list):
            systems = [s.strip("[]") for s in systems]
        if not any(s in MH_SYSTEMS for s in systems):
            continue

        tier = fm.get("evidence_tier", "E5")
        score = TIER_ORDER.get(tier, 4)
        symbol = fm.get("gene_symbol", f.stem)
        scored.append((symbol, score))

    scored.sort(key=lambda x: x[1])
    return [s[0] for s in scored[:2]]
```

- [ ] **Step 5: Add PGx prompt generator**

```python
async def _pgx_prompts(vault_path: str | None, config_dir: Path) -> list[dict]:
    """Generate prompts for PGx / Drugs view."""
    prompts = []

    # Read pgx-drugs.yaml for enzyme list
    pgx_config_path = config_dir / "pgx-drugs.yaml"
    enzymes = []
    if pgx_config_path.exists():
        try:
            cfg = yaml.safe_load(pgx_config_path.read_text())
            enzymes = cfg.get("enzymes", [])
        except Exception:
            pass

    # Find actionable metabolizer status from vault
    actionable_enzyme = ""
    actionable_status = ""
    drug_gene_count = 0

    if vault_path:
        genes_dir = Path(vault_path) / "Genes"
        enzyme_symbols = {e["symbol"] for e in enzymes}
        for symbol in enzyme_symbols:
            gene_file = genes_dir / f"{symbol}.md"
            if not gene_file.exists():
                continue
            try:
                text = gene_file.read_text()
                if not text.startswith("---"):
                    continue
                end = text.index("---", 3)
                fm = yaml.safe_load(text[3:end]) or {}
            except Exception:
                continue

            status = fm.get("personal_status", "")
            if status in ("actionable", "risk"):
                actionable_enzyme = symbol
                actionable_status = status
                break

    for e in enzymes:
        drug_gene_count += len(e.get("drug_cards", []))

    if actionable_enzyme:
        status_label = "poor metabolizer" if actionable_status == "risk" else "altered"
        prompts.append(_make_prompt(
            "Which drugs should I discuss with my doctor?",
            f"Based on your {actionable_enzyme} {status_label} status",
            1,
        ))
    else:
        prompts.append(_make_prompt(
            "Which drugs should I discuss with my doctor?",
            "Reviews your pharmacogenomic profile",
            1,
        ))

    prompts.append(_make_prompt(
        "Am I at risk for adverse reactions to any common medications?",
        f"{drug_gene_count} drug-gene interactions in your profile" if drug_gene_count > 0
        else "Checks known drug-gene interactions",
        2,
    ))

    prompts.append(_make_prompt(
        "Explain my metabolizer phenotypes in simple terms",
        f"Covers {len(enzymes)} enzymes" if enzymes else "Explains how your body processes drugs",
        3,
    ))

    return prompts[:3]
```

- [ ] **Step 6: Add addiction and risk prompt generators**

```python
async def _addiction_prompts(vault_path: str | None) -> list[dict]:
    """Generate prompts for Addiction view."""
    prompts = []

    # Check for ALDH2/ADH1B genotype from vault
    alcohol_gene = ""
    alcohol_genotype = ""
    if vault_path:
        for symbol in ("ALDH2", "ADH1B"):
            gene_file = Path(vault_path) / "Genes" / f"{symbol}.md"
            if not gene_file.exists():
                continue
            try:
                text = gene_file.read_text()
                if not text.startswith("---"):
                    continue
                end = text.index("---", 3)
                fm = yaml.safe_load(text[3:end]) or {}
                variants = fm.get("personal_variants", [])
                if variants and isinstance(variants, list):
                    alcohol_gene = symbol
                    alcohol_genotype = variants[0].get("genotype", "")
                    break
            except Exception:
                continue

    prompts.append(_make_prompt(
        "What does my genetic profile say about substance sensitivity?",
        "Non-judgmental analysis of your addiction-related variants",
        1,
    ))

    if alcohol_gene and alcohol_genotype:
        prompts.append(_make_prompt(
            f"How does my {alcohol_gene} status affect alcohol metabolism?",
            f"Your genotype: {alcohol_genotype} — relevant for harm reduction",
            2,
        ))
    else:
        prompts.append(_make_prompt(
            "How do my genetics affect alcohol metabolism?",
            "Checks ALDH2 and ADH1B variants",
            2,
        ))

    prompts.append(_make_prompt(
        "What harm reduction strategies fit my genetics?",
        "Practical, evidence-based recommendations",
        3,
    ))

    return prompts[:3]


async def _risk_prompts(gwas_config_dir: Path) -> list[dict]:
    """Generate prompts for Risk view."""
    # Count traits with elevated risk
    elevated_count = 0
    if gwas_config_dir.exists():
        elevated_count = len(list(gwas_config_dir.glob("*-hits.json")))

    prompts = [
        _make_prompt(
            "What are my top modifiable risk factors?",
            "Focuses on risks you can actually reduce",
            1,
        ),
        _make_prompt(
            "How do my genetic risks compare to population averages?",
            "Contextualizes your polygenic risk scores",
            2,
        ),
        _make_prompt(
            "What screenings should I prioritize?",
            f"Based on data across {elevated_count} trait categories" if elevated_count > 0
            else "Based on your genetic risk profile",
            3,
        ),
    ]
    return prompts
```

- [ ] **Step 7: Add the main endpoint**

```python
@router.get("/starter-prompts")
async def get_starter_prompts(view: str = Query("snps")):
    """Return personalized starter prompts for the Ask.ai empty state."""
    from backend.app.main import genome_db
    from backend.app.agent.tools import _vault_path

    config_dir = Path(os.environ.get("GENOME_CONFIG_DIR", "./config"))
    gwas_config_dir = config_dir / "gwas"

    # Build capabilities with real counts
    total = 0
    try:
        insights = await genome_db.get_insights()
        total = insights.get("total_variants", 0)
    except Exception:
        insights = {}

    capabilities = [
        "Read your vault notes",
        f"Search {total:,} variants" if total > 0 else "Search variants",
        "Check drug interactions",
        "Add to checklist",
    ]

    # Generate view-specific prompts
    try:
        if view == "mental-health":
            prompts = await _mental_health_prompts(genome_db, gwas_config_dir)
        elif view == "pgx":
            prompts = await _pgx_prompts(_vault_path, config_dir)
        elif view == "addiction":
            prompts = await _addiction_prompts(_vault_path)
        elif view == "risk":
            prompts = await _risk_prompts(gwas_config_dir)
        else:  # snps or unknown
            prompts = await _snps_prompts(genome_db)
    except Exception:
        # Fallback: no personalized prompts, just explore
        prompts = []

    return {
        "capabilities": capabilities,
        "prompts": prompts,
        "explore": EXPLORE_PROMPTS,
    }
```

- [ ] **Step 8: Register the router in main.py**

In `backend/app/main.py`, add after the existing router imports (around line 88):

```python
from backend.app.routes.starter_prompts import router as starter_prompts_router
```

And add after the existing `app.include_router()` calls (around line 99):

```python
app.include_router(starter_prompts_router)
```

- [ ] **Step 9: Test the endpoint manually**

Run: `curl http://localhost:8000/api/starter-prompts?view=pgx | python -m json.tool`

Expected: JSON with `capabilities`, `prompts` (3 items with text/subtitle/priority), and `explore` (2 items).

- [ ] **Step 10: Commit**

```bash
git add backend/app/routes/starter_prompts.py backend/app/main.py
git commit -m "feat: add /api/starter-prompts endpoint for Ask.ai empty state"
```

---

### Task 2: Frontend hook — useStarterPrompts.ts

**Files:**
- Create: `frontend/src/hooks/useStarterPrompts.ts`
- Create: `frontend/src/__tests__/useStarterPrompts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/__tests__/useStarterPrompts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mockResponse = {
  capabilities: ['Read your vault notes', 'Search 3,400,000 variants'],
  prompts: [
    { text: 'Which drugs should I discuss?', subtitle: 'Based on CYP2D6', priority: 1 },
    { text: 'Am I at risk?', subtitle: '12 interactions', priority: 2 },
    { text: 'Explain my phenotypes', subtitle: 'Covers 4 enzymes', priority: 3 },
  ],
  explore: ["What's interesting in my genome?", 'What should I bring to my next doctor visit?'],
}

// Mock fetch
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Mock sessionStorage
const store: Record<string, string> = {}
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val },
  removeItem: (key: string) => { delete store[key] },
})

beforeEach(() => {
  fetchMock.mockReset()
  Object.keys(store).forEach(k => delete store[k])
})

import { useStarterPrompts } from '../hooks/useStarterPrompts'

describe('useStarterPrompts', () => {
  it('fetches prompts for the given view', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const { result } = renderHook(() => useStarterPrompts('pgx'))

    await waitFor(() => {
      expect(result.current.prompts).toHaveLength(3)
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/starter-prompts?view=pgx')
    expect(result.current.capabilities).toEqual(mockResponse.capabilities)
    expect(result.current.explore).toEqual(mockResponse.explore)
    expect(result.current.prompts[0].text).toBe('Which drugs should I discuss?')
  })

  it('uses sessionStorage cache on second call', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    // First render — fetches
    const { result, rerender } = renderHook(
      ({ view }) => useStarterPrompts(view),
      { initialProps: { view: 'pgx' } },
    )

    await waitFor(() => {
      expect(result.current.prompts).toHaveLength(3)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Second render with same view — uses cache
    rerender({ view: 'pgx' })
    expect(fetchMock).toHaveBeenCalledTimes(1) // no new fetch
    expect(result.current.prompts).toHaveLength(3)
  })

  it('fetches again when view changes', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const { result, rerender } = renderHook(
      ({ view }) => useStarterPrompts(view),
      { initialProps: { view: 'pgx' } },
    )

    await waitFor(() => {
      expect(result.current.prompts).toHaveLength(3)
    })

    rerender({ view: 'mental-health' })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    expect(fetchMock).toHaveBeenLastCalledWith('/api/starter-prompts?view=mental-health')
  })

  it('returns fallback on fetch error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))

    const { result } = renderHook(() => useStarterPrompts('pgx'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.prompts).toEqual([])
    expect(result.current.capabilities).toEqual([
      'Read your vault notes',
      'Search variants',
      'Check drug interactions',
      'Add to checklist',
    ])
    expect(result.current.explore).toEqual([
      "What's interesting in my genome?",
      'What should I bring to my next doctor visit?',
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/useStarterPrompts.test.ts`
Expected: FAIL — module `../hooks/useStarterPrompts` not found.

- [ ] **Step 3: Implement the hook**

```typescript
// frontend/src/hooks/useStarterPrompts.ts
import { useState, useEffect } from 'react'

export interface StarterPrompt {
  text: string
  subtitle: string
  priority: number
}

export interface StarterPromptsData {
  capabilities: string[]
  prompts: StarterPrompt[]
  explore: string[]
  loading: boolean
}

const FALLBACK_CAPABILITIES = [
  'Read your vault notes',
  'Search variants',
  'Check drug interactions',
  'Add to checklist',
]

const FALLBACK_EXPLORE = [
  "What's interesting in my genome?",
  'What should I bring to my next doctor visit?',
]

const FALLBACK: StarterPromptsData = {
  capabilities: FALLBACK_CAPABILITIES,
  prompts: [],
  explore: FALLBACK_EXPLORE,
  loading: false,
}

function cacheKey(view: string): string {
  return `starter-prompts-${view}`
}

export function useStarterPrompts(view: string): StarterPromptsData {
  const [data, setData] = useState<StarterPromptsData>(() => {
    const cached = sessionStorage.getItem(cacheKey(view))
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        return { ...parsed, loading: false }
      } catch { /* ignore */ }
    }
    return { ...FALLBACK, loading: true }
  })

  useEffect(() => {
    const key = cacheKey(view)
    const cached = sessionStorage.getItem(key)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setData({ ...parsed, loading: false })
        return
      } catch { /* ignore */ }
    }

    setData(prev => ({ ...prev, loading: true }))

    let cancelled = false

    fetch(`/api/starter-prompts?view=${view}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then(json => {
        if (cancelled) return
        const result: StarterPromptsData = {
          capabilities: json.capabilities || FALLBACK_CAPABILITIES,
          prompts: json.prompts || [],
          explore: json.explore || FALLBACK_EXPLORE,
          loading: false,
        }
        sessionStorage.setItem(key, JSON.stringify(result))
        setData(result)
      })
      .catch(() => {
        if (cancelled) return
        setData({ ...FALLBACK })
      })

    return () => { cancelled = true }
  }, [view])

  return data
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/useStarterPrompts.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useStarterPrompts.ts frontend/src/__tests__/useStarterPrompts.test.ts
git commit -m "feat: add useStarterPrompts hook with sessionStorage cache"
```

---

### Task 3: CommandPalette EmptyState rendering

**Files:**
- Modify: `frontend/src/components/CommandPalette.tsx:164-180,328-342`
- Create: `frontend/src/__tests__/CommandPalette.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/__tests__/CommandPalette.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommandPalette } from '../components/CommandPalette'

const baseProps = {
  open: true,
  onClose: vi.fn(),
  messages: [],
  streaming: false,
  streamingText: '',
  status: '',
  suggestions: [],
  actions: [],
  onSend: vi.fn(),
  onAction: vi.fn(),
  starterPrompts: [
    { text: 'Which drugs should I discuss?', subtitle: 'Based on CYP2D6', priority: 1 },
    { text: 'Am I at risk?', subtitle: '12 interactions', priority: 2 },
  ],
  starterCapabilities: ['Read vault notes', 'Search 3.4M variants'],
  starterExplore: ["What's interesting in my genome?"],
}

describe('CommandPalette EmptyState', () => {
  it('renders capabilities when no messages', () => {
    render(<CommandPalette {...baseProps} />)
    expect(screen.getByText('Read vault notes')).toBeTruthy()
    expect(screen.getByText('Search 3.4M variants')).toBeTruthy()
  })

  it('renders personalized prompts when no messages', () => {
    render(<CommandPalette {...baseProps} />)
    expect(screen.getByText('Which drugs should I discuss?')).toBeTruthy()
    expect(screen.getByText('Based on CYP2D6')).toBeTruthy()
    expect(screen.getByText('Am I at risk?')).toBeTruthy()
  })

  it('renders explore prompts when no messages', () => {
    render(<CommandPalette {...baseProps} />)
    expect(screen.getByText("What's interesting in my genome?")).toBeTruthy()
  })

  it('calls onSend when a prompt is clicked', () => {
    const onSend = vi.fn()
    render(<CommandPalette {...baseProps} onSend={onSend} />)
    fireEvent.click(screen.getByText('Which drugs should I discuss?'))
    expect(onSend).toHaveBeenCalledWith('Which drugs should I discuss?')
  })

  it('calls onSend when an explore prompt is clicked', () => {
    const onSend = vi.fn()
    render(<CommandPalette {...baseProps} onSend={onSend} />)
    fireEvent.click(screen.getByText("What's interesting in my genome?"))
    expect(onSend).toHaveBeenCalledWith("What's interesting in my genome?")
  })

  it('does not render empty state when messages exist', () => {
    render(
      <CommandPalette
        {...baseProps}
        messages={[{ role: 'user', content: 'hello' }]}
      />,
    )
    expect(screen.queryByText('WHAT I CAN DO')).toBeNull()
    expect(screen.queryByText('Which drugs should I discuss?')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/CommandPalette.test.tsx`
Expected: FAIL — `starterPrompts` is not a valid prop (yet).

- [ ] **Step 3: Update CommandPalette Props interface**

In `frontend/src/components/CommandPalette.tsx`, update the Props interface (around line 164):

```typescript
// Add import at top
import type { StarterPrompt } from '../hooks/useStarterPrompts'

// Update Props interface
interface Props {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  streaming: boolean
  streamingText: string
  status: string
  suggestions: string[]
  actions: AgentAction[]
  onSend: (text: string) => void
  onAction: (action: AgentAction) => void
  initialQuery?: string
  voiceSupported?: boolean
  voiceListening?: boolean
  onStartListening?: () => void
  onStopListening?: () => void
  starterPrompts?: StarterPrompt[]
  starterCapabilities?: string[]
  starterExplore?: string[]
}
```

- [ ] **Step 4: Replace the empty state div with EmptyState rendering**

In `CommandPalette.tsx`, replace the empty state block (lines 328-342):

```tsx
// OLD:
{messages.length === 0 && !streaming && (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-tertiary)',
    fontSize: 'var(--font-size-lg)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: 'var(--tracking-wide)',
    textTransform: 'uppercase',
  }}>
    ASK_ANYTHING_ABOUT_YOUR_GENOME
  </div>
)}
```

```tsx
// NEW:
{messages.length === 0 && !streaming && (
  <div style={{ padding: 'var(--space-xl)', height: '100%', overflowY: 'auto' }}>
    {/* Capabilities */}
    {starterCapabilities && starterCapabilities.length > 0 && (
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="label" style={{
          color: 'var(--primary)',
          marginBottom: 'var(--space-sm)',
        }}>
          WHAT I CAN DO
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          {starterCapabilities.map((cap, i) => (
            <span key={i} style={{
              fontSize: 'var(--font-size-xs)',
              padding: '4px 10px',
              border: '1px solid var(--border)',
              borderRadius: 3,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {cap}
            </span>
          ))}
        </div>
      </div>
    )}

    {/* Personalized prompts */}
    {starterPrompts && starterPrompts.length > 0 && (
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="label" style={{
          color: 'var(--accent)',
          marginBottom: 'var(--space-sm)',
        }}>
          SUGGESTED FOR YOU
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {starterPrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => onSend(p.text)}
              style={{
                padding: '10px 14px',
                border: `1px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 4,
                background: i === 0 ? 'rgba(91, 126, 161, 0.04)' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--font-mono)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
              onMouseLeave={e => { if (i !== 0) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{
                fontWeight: 600,
                fontSize: 'var(--font-size-md)',
                color: 'var(--text)',
                marginBottom: 2,
              }}>
                {p.text}
              </div>
              <div style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-tertiary)',
              }}>
                {p.subtitle}
              </div>
            </button>
          ))}
        </div>
      </div>
    )}

    {/* Explore */}
    {starterExplore && starterExplore.length > 0 && (
      <div>
        <div className="label" style={{
          color: 'var(--text-tertiary)',
          marginBottom: 'var(--space-sm)',
        }}>
          EXPLORE
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          {starterExplore.map((text, i) => (
            <button
              key={i}
              onClick={() => onSend(text)}
              style={{
                fontSize: 'var(--font-size-sm)',
                padding: '6px 12px',
                border: '1px dashed var(--border)',
                borderRadius: 3,
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-dim)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    )}

    {/* Fallback if no data loaded yet */}
    {(!starterPrompts || starterPrompts.length === 0) &&
     (!starterCapabilities || starterCapabilities.length === 0) && (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-tertiary)',
        fontSize: 'var(--font-size-lg)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: 'var(--tracking-wide)',
      }}>
        Ask about your genome...
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Update the function signature to destructure new props**

In `CommandPalette.tsx`, update the function parameter destructuring (line 207):

```typescript
export function CommandPalette({ open, onClose, messages, streaming, streamingText, status, suggestions, actions, onSend, onAction, initialQuery, voiceSupported, voiceListening, onStartListening, onStopListening, starterPrompts, starterCapabilities, starterExplore }: Props) {
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/CommandPalette.test.tsx`
Expected: All 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CommandPalette.tsx frontend/src/__tests__/CommandPalette.test.tsx
git commit -m "feat: add EmptyState with capabilities, prompts, explore to CommandPalette"
```

---

### Task 4: Wire it together in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx:4,26,488-508`

- [ ] **Step 1: Add the import**

In `frontend/src/App.tsx`, add after the existing hook imports (around line 4):

```typescript
import { useStarterPrompts } from './hooks/useStarterPrompts'
```

- [ ] **Step 2: Add the hook call**

In `frontend/src/App.tsx`, add after the existing hook calls (around line 38, after `const checklist = useChecklist()`):

```typescript
const starterPrompts = useStarterPrompts(view)
```

- [ ] **Step 3: Pass props to CommandPalette**

In `frontend/src/App.tsx`, update the CommandPalette JSX (around line 488-508), add the three new props before the closing `/>`:

```tsx
<CommandPalette
  open={cmdkOpen}
  onClose={() => { setCmdkOpen(false); setCmdkInitialQuery(undefined) }}
  initialQuery={cmdkInitialQuery}
  messages={messages}
  streaming={streaming}
  streamingText={streamingText}
  status={status}
  suggestions={suggestions}
  actions={actions}
  onSend={send}
  onAction={handleAgentAction}
  voiceSupported={voice.supported}
  voiceListening={voice.listening}
  onStartListening={() => {
    voice.startListening((text) => {
      send(text)
    })
  }}
  onStopListening={voice.stopListening}
  starterPrompts={starterPrompts.prompts}
  starterCapabilities={starterPrompts.capabilities}
  starterExplore={starterPrompts.explore}
/>
```

- [ ] **Step 4: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass, no regressions.

- [ ] **Step 5: Manual smoke test**

Run both backend and frontend, then:
1. Open the app in browser
2. Press Cmd+K — verify capabilities bar, personalized prompts, and explore prompts appear
3. Click a personalized prompt — verify it sends as a message
4. Switch to PGx tab, reopen chat (new session or clear) — verify PGx-specific prompts
5. After first message, verify empty state disappears and normal chat works

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire useStarterPrompts to CommandPalette in App"
```
