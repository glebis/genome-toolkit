# Page-Aware Chat Context

**Date:** 2026-04-10
**Status:** Approved

## Problem

When the user opens Ask AI (CommandPalette) from any page, the AI agent has no knowledge of which page the user is viewing or what data is displayed. The user must manually describe their context ("I'm on the risk page and I see APOE is actionable...") before asking a question.

## Solution

Pass a plain-text page context summary from the frontend to the backend with every chat message. The backend injects this into the agent's system prompt so the AI can answer questions in the context of what the user sees on screen.

## Data Flow

```
App.tsx (has view + hook data)
  → buildPageContext(view, hookData) → string (5-15 lines, ~500 tokens)
  → useChat.send(text, pageContext)
    → streamChat(sessionId, text, signal, pageContext)
      → POST /api/chat { session_id, message, page_context }
        → chat.py passes page_context to agent
          → agent.py appends to system prompt
```

Context refreshes with every message — if the user switches pages between messages, the agent sees the new page.

## Frontend Changes

### New file: `lib/pageContext.ts`

Pure function `buildPageContext(view, data)` that returns a plain-text summary.

Each view produces a tailored summary:

- **risk**: Mortality causes with status (actionable/monitor/optimal/nodata), matched genes with variants, available actions
- **mental-health**: Pathway names with status, gene count, action count, currently expanded gene if any
- **pgx**: Enzymes with metabolizer status and alleles, danger-level drugs, substance count
- **addiction**: Pathway systems with status, substance cards with harm reduction status, gene counts
- **snps**: Active filters, result count, selected variant if any

Format: plain text, no JSON. Starts with "You are on the {PAGE_NAME} page." followed by structured summary lines.

### Modified: `lib/sse.ts`

`streamChat` accepts optional `pageContext` parameter, includes it as `page_context` in the POST body.

### Modified: `hooks/useChat.ts`

`send(text, pageContext?)` accepts optional context string, passes through to `streamChat`.

### Modified: `App.tsx`

Builds page context from current view and hook data before calling `send()`:

```ts
const pageContext = buildPageContext(view, { mentalHealth, checklist, risk, pgx, addiction, snps })
send(text, pageContext)
```

Also wraps the `send` passed to `CommandPalette` callbacks (`handleDiscuss`, `handleAskAI`, suggestion clicks, starter prompts).

## Backend Changes

### Modified: `routes/chat.py`

`ChatRequest` model adds `page_context: str | None = None`. Passes value to agent creation/invocation.

### Modified: `agent/agent.py`

When `page_context` is provided, appends to system prompt:

```
## User's Current Page Context
{page_context}

Use this context to give relevant answers. The user can see this data on their screen right now.
```

## What Does NOT Change

- CommandPalette component (receives `onSend` callback, doesn't know about context)
- Starter prompts (separate mechanism, already view-aware)
- Session management
- SSE event types

## Testing

Unit tests for `buildPageContext`:
- Each view produces non-empty string starting with page name
- Risk view includes cause names, gene symbols, status labels
- Mental health includes pathway names and gene counts
- PGx includes enzyme symbols and metabolizer status
- Addiction includes substance names
- SNPs includes active filter info
- Handles empty/loading data gracefully (returns minimal context)
