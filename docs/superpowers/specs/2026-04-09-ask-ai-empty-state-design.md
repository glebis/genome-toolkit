# Ask.ai Empty State Redesign

**Date:** 2026-04-09
**Focus:** First impression — empty state, starter prompts, onboarding
**Approach:** Backend-driven personalized prompts with frontend caching

## Problem

When the chat opens with no history, the user sees "ASK_ANYTHING_ABOUT_YOUR_GENOME" — a cold, uppercase label with zero guidance on what to ask. No starter prompts, no explanation of capabilities, no personalization. The user must invent their own question from scratch.

## Solution

Replace the empty state with three zones:

1. **Capabilities bar** — compact tags showing what the AI can do
2. **Personalized prompts** — 3 context-aware prompts based on current view + user data
3. **Explore prompts** — 2 universal prompts with dashed border styling

## Architecture

### Backend: `GET /api/starter-prompts?view={view}`

Returns personalized prompts generated from user data (SQLite + vault notes). No LLM involved — deterministic Python logic per view.

**Response shape:**

```json
{
  "capabilities": ["Read your vault notes", "Search 3.4M variants", "Check drug interactions", "Add to checklist"],
  "prompts": [
    {
      "text": "Which drugs should I discuss with my doctor?",
      "subtitle": "Based on your CYP2D6 poor metabolizer status",
      "priority": 1
    }
  ],
  "explore": [
    "What's interesting in my genome?",
    "What should I bring to my next doctor visit?"
  ]
}
```

**Prompt generation rules per view:**

- **SNP Browser**: Queries clinical significance counts, top-viewed genes, pharmacogenomic cross-references
- **Mental Health**: Reads GWAS hit counts per trait, top evidence-tier genes, gene-gene interactions from vault
- **PGx / Drugs**: Reads metabolizer phenotypes (CYP2D6, CYP2C19, etc.), drug-gene interaction counts
- **Addiction**: Reads ALDH2/ADH1B genotypes, substance-related gene variants; tone is non-judgmental, harm-reduction oriented
- **Risk**: Reads polygenic risk scores, modifiable vs non-modifiable risk factors, elevated risk category counts

Each view generates exactly 3 prompts, sorted by priority (most actionable first).

### Frontend caching: `useStarterPrompts(view)`

New hook in `frontend/src/hooks/useStarterPrompts.ts`.

**Behavior:**
- On mount in App.tsx: fetches prompts for current view
- Stores result in `sessionStorage` with key `starter-prompts-{view}`
- On view change: checks sessionStorage first, fetches only if miss
- Returns `{ prompts, capabilities, explore, loading }`
- No TTL — cache valid for entire browser session (data doesn't change mid-session)

**Preloading:** The hook fires on App mount, not on chat open. By the time the user presses Cmd+K, prompts are already cached.

### CommandPalette changes

**New props:**
- `starterPrompts: StarterPrompt[]` — personalized prompts with text + subtitle
- `starterCapabilities: string[]` — capability tags
- `starterExplore: string[]` — universal prompts

**EmptyState rendering** (inline in CommandPalette.tsx, not a separate file):

Replaces the current centered "ASK_ANYTHING_ABOUT_YOUR_GENOME" div when `messages.length === 0 && !streaming`.

Layout:
```
┌──────────────────────────────────────┐
│ WHAT I CAN DO                        │
│ [tag] [tag] [tag] [tag]              │
│                                      │
│ SUGGESTED FOR YOU // {VIEW} VIEW     │
│ ┌──────────────────────────────────┐ │
│ │ Prompt text (bold)               │ │
│ │ Subtitle explaining why (gray)   │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Prompt text                      │ │
│ │ Subtitle                         │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Prompt text                      │ │
│ │ Subtitle                         │ │
│ └──────────────────────────────────┘ │
│                                      │
│ EXPLORE                              │
│ [- - dashed prompt - -] [- - - -]    │
└──────────────────────────────────────┘
```

**Visual treatment:**
- First prompt: `border: 1px solid var(--primary)`, light primary background tint
- Other prompts: `border: 1px solid var(--border)`
- Explore prompts: `border: 1px dashed var(--border)`, inline flex wrap
- All prompts clickable — `cursor: pointer`, hover darkens border
- Click calls `onSend(prompt.text)`
- Capability tags: small, non-clickable, `border: 1px solid var(--border)`

### App.tsx wiring

```
const starterPrompts = useStarterPrompts(view)
// ...
<CommandPalette
  // existing props...
  starterPrompts={starterPrompts.prompts}
  starterCapabilities={starterPrompts.capabilities}
  starterExplore={starterPrompts.explore}
/>
```

## Error handling / fallback

If `/api/starter-prompts` fails or is slow (>2s), the empty state shows:
- Capabilities bar with hardcoded defaults
- Explore prompts only (universal, no personalization)
- No loading spinner — if data arrives late, it replaces the fallback silently

This ensures the chat is never blocked by the prompts endpoint.

## What does NOT change

- `useChat.ts` — no modifications
- Backend chat endpoint (`/api/chat`) — no modifications
- Existing "Ask AI" contextual buttons throughout the app — they still work by passing `initialQuery`
- Theme CSS — uses existing variables only
- Behavior after first message — prompts disappear, normal chat flow

## Prompt content per view

### SNP Browser
1. "What are my most clinically significant variants?" / "You have {n} variants flagged as pathogenic or likely pathogenic"
2. "Which of my variants have drug interactions?" / "Cross-references your SNPs with pharmacogenomic databases"
3. "Explain my {gene} variants" / "Your most annotated gene with {n} vault notes"

### Mental Health
1. "What do my GWAS hits mean for {top_trait} risk?" / "{n} significant hits found in PGC {trait} GWAS"
2. "Which supplements might help based on my genetics?" / "Reviews vault notes for evidence-backed recommendations"
3. "How do my {gene1} and {gene2} variants interact?" / "Your top two genes by evidence tier in mental health"

### PGx / Drugs
1. "Which drugs should I discuss with my doctor?" / "Based on your {enzyme} {phenotype} status"
2. "Am I at risk for adverse reactions to any common medications?" / "{n} drug-gene interactions detected in your profile"
3. "Explain my metabolizer phenotypes in simple terms" / "Covers {genes} across {n} enzymes"

### Addiction
1. "What does my genetic profile say about substance sensitivity?" / "Non-judgmental analysis of your addiction-related variants"
2. "How does my {gene} status affect {substance} metabolism?" / "Your genotype: {genotype} — relevant for harm reduction"
3. "What harm reduction strategies fit my genetics?" / "Practical, evidence-based recommendations"

### Risk
1. "What are my top modifiable risk factors?" / "Focuses on risks you can actually reduce"
2. "How do my genetic risks compare to population averages?" / "Contextualizes your polygenic risk scores"
3. "What screenings should I prioritize?" / "Based on elevated risk in {n} categories"

### Universal Explore (all views)
- "What's interesting in my genome?"
- "What should I bring to my next doctor visit?"

## Files to create/modify

| File | Action |
|------|--------|
| `backend/app/routes/starter_prompts.py` | Create — new endpoint |
| `frontend/src/hooks/useStarterPrompts.ts` | Create — fetch + cache hook |
| `frontend/src/components/CommandPalette.tsx` | Modify — add EmptyState, new props |
| `frontend/src/App.tsx` | Modify — wire useStarterPrompts to CommandPalette |
