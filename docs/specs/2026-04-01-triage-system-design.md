# Triage System Design Spec

**Date:** 2026-04-01
**Status:** Revised (post Codex + NotebookLM audit)
**Location:** `genome_toolkit/triage/`

---

## 1. Problem

The personal genomics vault accumulates 50+ action items across 20+ files with three metadata fields (priority, context, due). No system exists to:
- Score items by composite urgency (not just priority)
- Surface items boosted by external signals (lab results, stale research, evidence tiers)
- Review and triage items interactively with batch operations
- Track triage decisions over time
- Generate new action items from unincorporated findings
- Produce visual SVG reports for review and sharing

## 2. Solution Overview

Three-layer pipeline with shared domain core:

1. **CLI** — `python -m genome_toolkit.triage` — quick filtered list or saved report
2. **TUI** — `python -m genome_toolkit.triage --interactive` — Textual dashboard with 4 tabs, rich card rendering, batch apply
3. **Skill** — `/triage` Claude Code skill — conversational AI-assisted triage with dependency reasoning

All three consume the same domain model and application use cases.

## 3. DDD Architecture

### 3.1 Package Structure

```
genome_toolkit/
  triage/
    __init__.py
    domain/
      __init__.py
      item.py              # TriageItem aggregate root, SourceLocation VO, ItemId VO
      session.py           # TriageSession aggregate, TriageDecision VO
      score.py             # Score VO, ScoreBreakdown, TriageBucket enum
      suggestion.py        # Suggestion VO
      weights.py           # ScoringWeights VO (configurable percentages)
      signals.py           # LabSignal, Finding, StaleTopic VOs
      commands.py          # DeferCommand, ApproveCommand, DropCommand, etc.
      services/
        __init__.py
        scoring.py         # ScoringService: TriageItem -> Score
        suggestion.py      # SuggestionGenerator: findings + labs -> [Suggestion]
        bucket.py          # BucketClassifier: Score -> TriageBucket
      ports/
        __init__.py
        repositories.py    # ABC: TaskRepo, FindingsRepo, LabSignalRepo, SessionRepo
    application/
      __init__.py
      triage_use_case.py   # RunTriageSession: orchestrates scoring + suggestions
      apply_decisions.py   # ApplyDecisions: validates + writes decisions via repos
      report.py            # TriageReport DTO (List[ScoredItem], List[Suggestion], stats)
      file_lock.py         # Advisory file locking for single-writer safety
    infrastructure/
      __init__.py
      vault/
        __init__.py
        task_parser.py     # TaskRepository impl: markdown -> TriageItem
        task_writer.py     # writes priority/due/completed changes back to .md
        findings_parser.py # FindingsRepository impl: reads Meta/Findings Index.md
        wikilink_formatter.py  # Wikilink pre-processing for rendering
      scripts/
        __init__.py
        lab_adapter.py     # LabSignalRepository impl: calls biomarker_analyzer
        research_adapter.py # reads research_update_checker output
      persistence/
        __init__.py
        session_store.py   # SessionRepository impl: append-only history log
      config.py            # vault path, weight overrides, thresholds from env/TOML
    presentation/
      __init__.py
      cli.py               # Click CLI: console table, --save, --json, --svg
      svg/
        __init__.py
        renderer.py        # SVG report generator with layout helpers
        text_layout.py     # Text wrapping, tspan generation, font metrics
        templates/         # Jinja2 SVG templates
      tui/
        __init__.py
        app.py             # Textual App entry point
        screens/
          __init__.py
          urgency.py       # Tab 1: by composite score
          context.py       # Tab 2: grouped by context
          suggestions.py   # Tab 3: proposed new items
          history.py       # Tab 4: past triage decisions
        widgets/
          __init__.py
          item_card.py     # Rich card with Textual CSS borders, virtual scrolling
          item_list.py     # ListView-based virtualized item list
          batch_bar.py     # Batch apply action bar
          score_badge.py   # Color-coded score indicator
      skill/
        __init__.py
        handler.py         # /triage Claude Code skill entry point
        formatter.py       # Domain objects -> conversational markdown
```

### 3.2 Dependency Rules

```
domain         <- nothing (pure Python, no I/O, no framework imports)
application    <- domain only (imports domain types + port ABCs)
infrastructure <- domain ports (implements ABCs), may use application DTOs
presentation   <- application only (calls use cases, receives DTOs)
                  NEVER imports domain services or infrastructure directly
```

### 3.3 Domain Model

#### Entities (identity-based)

**TriageItem** (aggregate root):
- `item_id: ItemId` — stable identity (content hash of text + source file, NOT line number)
- `source: SourceLocation` — file path + line number (navigation metadata, NOT identity)
- `text: str` — task description
- `priority: Priority` — critical/high/medium/low (enum)
- `context: Context` — prescriber/testing/monitoring/research/vault-maintenance (enum)
- `due: date | None`
- `completed: bool`
- `evidence_tier: EvidenceTier | None` — from linked gene/system frontmatter
- `severity: Severity | None` — clinical severity (life_threatening/significant/moderate/lifestyle), distinct from priority
- `linked_genes: list[str]` — gene symbols referenced in task or parent note
- `linked_systems: list[str]` — system names from parent note
- `blocked_by: list[ItemId]` — explicit dependencies (e.g., CRP test blocks SSRI decision)
- `clinically_validated: bool` — whether a clinician has confirmed this action (default False)

Methods:
- `defer(days: int) -> DeferCommand` — validates allowed intervals, returns command
- `approve() -> ApproveCommand`
- `drop(note: str) -> DropCommand`
- `change_priority(new: Priority) -> ChangePriorityCommand`

**TriageSession** (aggregate root):
- `session_id: str` — timestamp-based
- `timestamp: datetime`
- `decisions: list[TriageDecision]`
- Invariant: cannot approve AND drop same item in one session
- Invariant: cannot have conflicting actions on same item_id

#### Value Objects (immutable)

**ItemId**: `value: str` — SHA-256 hash of `(file_stem + task_text)`. Stable across line reflows. Obsidian `^block-id` used when present, falls back to hash.

**SourceLocation**: `file_path: Path`, `line_number: int` — navigation aid, NOT identity.

**Score**: `value: float` (0-100), `breakdown: ScoreBreakdown`, `bucket: TriageBucket`

**ScoreBreakdown**: `priority_score: float`, `overdue_score: float`, `evidence_score: float`, `lab_signal_score: float`, `context_score: float`, `severity_score: float`, `stuck_score: float`

**TriageBucket** (enum): `DO_NOW` (>=70), `THIS_WEEK` (50-69), `BACKLOG` (30-49), `CONSIDER_DROPPING` (<30)

**TriageDecision**: `item_id: ItemId`, `action: Action`, `previous: TriageStateSnapshot`, `new: TriageStateSnapshot`, `note: str | None`

**TriageStateSnapshot**: `priority: Priority | None`, `due: date | None`, `context: Context | None`, `completed: bool` — typed, not dict.

**Action** (enum): `APPROVE`, `DEFER`, `DROP`, `CHANGE_PRIORITY`, `CREATE`

**Suggestion**: `text: str`, `source_type: SuggestionSource`, `source_reference: str`, `recommended_priority: Priority`, `recommended_context: Context`, `rationale: str`

**SuggestionSource** (enum): `UNINCORPORATED_FINDING`, `STALE_RESEARCH`, `LAB_THRESHOLD`, `STUCK_ITEM`

**ScoringWeights**: `priority: float = 0.25`, `overdue: float = 0.20`, `evidence: float = 0.15`, `lab_signal: float = 0.15`, `context: float = 0.10`, `severity: float = 0.10`, `stuck: float = 0.05`

**Severity** (enum): `LIFE_THREATENING` = 100, `SIGNIFICANT` = 75, `MODERATE` = 50, `LIFESTYLE` = 25, `UNKNOWN` = 60 (default high — assume important until triaged)

#### Signal Value Objects (domain/signals.py)

**LabSignal**:
- `biomarker: str` — e.g., "CRP", "ferritin"
- `value: float` — observed value
- `threshold: float` — clinical threshold
- `direction: Direction` — `ABOVE` or `BELOW`
- `z_score: float` — standard deviations from normal (for scaled scoring)
- `linked_genes: list[str]` — genes this biomarker relates to
- `confidence: float` — 0-1, threshold reliability

**Finding**:
- `text: str` — finding description
- `source_note: str` — originating note title
- `evidence_tier: EvidenceTier`
- `actionable: bool`
- `incorporated_into: str | None` — target note, None = unincorporated

**StaleTopic**:
- `topic: str`
- `last_researched: date`
- `recheck_interval_months: int`
- `months_overdue: float`
- `linked_genes: list[str]`

#### Domain Services

**ScoringService**: `score(item: TriageItem, weights: ScoringWeights, lab_signals: list[LabSignal], defer_count: int) -> Score`
- Computes each factor, applies weights, sums to composite
- Stuck factor: `min(defer_count * 33, 100)` — treated as weighted factor (5%), not post-hoc bonus
- Lab signal: `min(max_z_score * 25, 100)` — scaled by z-score, not binary
- Unknown/missing defaults: evidence=60, priority=60, severity=60 (assume moderately important, NOT 50)

**SuggestionGenerator**: `generate(findings: list[Finding], stale_topics: list[StaleTopic], lab_signals: list[LabSignal], existing_items: list[TriageItem]) -> list[Suggestion]`
- Deduplication: conservative string similarity (>=0.85 ratio) + manual confirmation flag on matches
- Never auto-suppresses suggestions — marks as "possible duplicate" for human review

**BucketClassifier**: `classify(score: float) -> TriageBucket`

#### Command Objects (domain/commands.py)

```python
@dataclass(frozen=True)
class DeferCommand:
    item_id: ItemId
    days: int  # must be in {7, 14, 30}
    note: str | None = None

@dataclass(frozen=True)
class ApproveCommand:
    item_id: ItemId
    note: str | None = None

@dataclass(frozen=True)
class DropCommand:
    item_id: ItemId
    note: str  # required — must explain why

@dataclass(frozen=True)
class ChangePriorityCommand:
    item_id: ItemId
    new_priority: Priority
    note: str | None = None

@dataclass(frozen=True)
class CreateCommand:
    file_path: Path
    text: str
    priority: Priority
    context: Context
    due: date | None = None
```

#### Repository Ports (ABCs in domain/ports/)

```python
class TaskRepository(ABC):
    def get_all_open(self) -> list[TriageItem]: ...
    def apply_command(self, command: DeferCommand | ApproveCommand | DropCommand | ChangePriorityCommand) -> None: ...
    def create_item(self, command: CreateCommand) -> None: ...
    def acquire_lock(self) -> ContextManager: ...  # advisory file lock

class FindingsRepository(ABC):
    def get_unincorporated(self) -> list[Finding]: ...

class LabSignalRepository(ABC):
    def get_active_signals(self) -> list[LabSignal]: ...

class SessionRepository(ABC):
    def save_session(self, session: TriageSession) -> None: ...
    def get_recent(self, limit: int = 10) -> list[TriageSession]: ...
    def get_defer_count(self, item_id: ItemId) -> int: ...
```

## 4. Scoring Model

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Priority | 25% | critical=100, high=75, medium=50, low=25, unknown=60 |
| Overdue | 20% | Piecewise: future(>7d)=0, future(1-7d)=20, due today=60, 1-7d overdue=75, 8-14d=85, 15-30d=95, >30d=100. No due=40 |
| Evidence tier | 15% | E1=100, E2=80, E3=60, E4=40, E5=20, unknown=60 |
| Lab signal | 15% | `min(max_linked_z_score * 25, 100)`. No signal=0 |
| Context urgency | 10% | prescriber=100, testing=80, monitoring=60, research=40, vault-maintenance=20 |
| Severity | 10% | life_threatening=100, significant=75, moderate=50, lifestyle=25, unknown=60 |
| Stuck | 5% | `min(defer_count * 33, 100)` |

**Final score:** `sum(factor * weight)`, clamped to 0-100.

**Weight calibration status: v0 heuristic.** These weights are initial estimates, not empirically calibrated. They will be adjusted based on user behavior data once sufficient triage sessions (N>20) accumulate. Until then, treat as reasonable defaults, not validated parameters.

**Design rationale (Codex/NotebookLM audit findings addressed):**
- Overdue uses monotonic piecewise function (not the original inconsistent formula where due_today=50 but 1_day_overdue=3)
- Lab signal scaled by z-score (not binary 0/100)
- Stuck is a weighted factor (5%), not post-hoc bonus that bypasses bucket thresholds
- Unknown defaults biased toward 60 ("assume moderately important"), not 50 (neutral), per NotebookLM recommendation for health-critical systems
- Severity added as dedicated clinical dimension separate from priority (administrative urgency)

## 5. CLI Interface

```bash
# Quick console view (rich table, colored by bucket)
python -m genome_toolkit.triage --vault ~/Brains/genome

# Save markdown report to vault
python -m genome_toolkit.triage --vault ~/Brains/genome --save

# JSON output for piping
python -m genome_toolkit.triage --vault ~/Brains/genome --json

# SVG overview report
python -m genome_toolkit.triage --vault ~/Brains/genome --svg overview.svg

# SVG score card for specific item
python -m genome_toolkit.triage --vault ~/Brains/genome --svg-card ITEM_ID -o card.svg

# SVG doctor visit report (prescriber items, high evidence only)
python -m genome_toolkit.triage --vault ~/Brains/genome --svg-visit visit.svg

# Interactive TUI dashboard
python -m genome_toolkit.triage --vault ~/Brains/genome --interactive

# Filter by context
python -m genome_toolkit.triage --vault ~/Brains/genome --context prescriber

# Filter by bucket
python -m genome_toolkit.triage --vault ~/Brains/genome --bucket do-now
```

## 6. SVG Generation

SVG renderer produces visual triage reports with proper text layout.

### 6.1 Report Types

- **Overview SVG**: horizontal bar chart of items colored by bucket, grouped by context
- **Score Card SVG**: individual item card with score breakdown bar chart
- **Dashboard SVG**: combined view — bucket distribution + top 10 items + suggestions count
- **Doctor Visit SVG**: prescriber-context items filtered by E1-E2 evidence, formatted for clinical review

### 6.2 Implementation

- Jinja2 SVG templates in `presentation/svg/templates/`
- Pure Python rendering (no browser/JS dependencies)
- **Text layout helper** (`text_layout.py`): `textwrap.fill()` + `<tspan>` generation for multi-line text, preventing overflow
- **Font strategy**: system monospace with `font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Consolas', monospace'` cascade. No font embedding (keeps SVGs portable).
- Color scheme: Do Now=#E53E3E, This Week=#DD6B20, Backlog=#718096, Consider Dropping=#A0AEC0
- Score breakdown rendered as horizontal bar segments (not radar chart — simpler, more readable in SVG)
- Exported via `--svg`, `--svg-card`, `--svg-visit` CLI flags or `SvgRenderer.render(report) -> str`

### 6.3 Layout Safeguards

- Pre-computed text wrapping with conservative char-width estimates (ch=0.6em for monospace)
- Maximum content width: 800px, items truncated with ellipsis beyond limit
- Viewbox auto-scales to content height
- All coordinates computed in Python, templates only handle structure

## 7. TUI Dashboard

### 7.1 Layout

Four-tab Textual app with:

- **Header**: vault path, total items, bucket distribution summary
- **Tab bar**: Urgency | Context | Suggestions | History
- **Main area**: virtualized scrollable list of item cards (`ListView`)
- **Footer**: keybinding help, pending changes count

### 7.2 Item Card Widget

Cards use **Textual CSS borders** (not ASCII box art) for reliable responsive rendering:

```
┌─ DO NOW ────────────────────────────────────── [92] ─┐
│ Request CRP blood test from prescriber               │
│                                                      │
│ Reports/Prescriber Summary.md:150                    │
│ critical · testing · due 2026-04-15                  │
│                                                      │
│ Priority ████████████████████████████░░  30/30       │
│ Overdue  █████████████░░░░░░░░░░░░░░░░  13/25       │
│ Evidence ████████████████████████░░░░░░  20/20       │
│ Lab      █████████████████████████████░  14/15       │
│ Context  ████████░░░░░░░░░░░░░░░░░░░░░   8/10       │
│ Severity ███████████████████████████░░░   9/10       │
│ Stuck    ██░░░░░░░░░░░░░░░░░░░░░░░░░░░   3/5        │
│                                                      │
│ Linked: IL1B, IL6, SSRI Response Profile             │
│ Lab: CRP threshold → prescriber escalation           │
│ Blocked by: none                                     │
└──────────────────────────────────────────────────────┘
```

### 7.3 Typography & Readability

- **Virtualized scrolling** via Textual `ListView` — handles 50+ items without performance issues
- **Wikilink pre-processing**: `[[Gene]]` → styled `Rich.Text` with gene-colored markup before passing to widgets
- Multi-column layout: 2-column on wide terminals (>=120 cols), 1-column on narrow
- Proper typographic hierarchy: bold headers, dimmed metadata, colored scores
- Score bars use Unicode block elements (full/half/empty blocks for granularity)
- Minimum 1-line padding between cards
- Context-colored left border on each card (Textual CSS `border-left`)
- Expand/collapse: collapsed shows score + title + bucket; expanded shows full breakdown

### 7.4 Keybindings

| Key | Action |
|-----|--------|
| `a` | Approve suggestion / confirm item |
| `d` | Defer (prompts for +7/+14/+30 days) |
| `x` | Drop (prompts for required note) |
| `e` | Edit due date |
| `p` | Cycle priority |
| `Enter` | Expand/collapse card detail |
| `Tab` | Next tab |
| `q` | Quit (prompts to apply pending changes) |
| `/` | Filter/search |
| `s` | Save SVG snapshot of current view |

## 8. History Tracking

### 8.1 Storage

`Meta/Triage History.md` — append-only markdown log.

### 8.2 Format

```markdown
## 2026-04-01 14:30

| Action | Item | Score | From | To | Note |
|--------|------|-------|------|----|------|
| defer | Request CRP blood test | 82 | due:2026-04-15 | due:2026-04-22 | waiting for appointment |
| drop | Telomere length PRS | 18 | low/research | completed | not actionable now |
| create | Update FADS1 gene note | — | suggestion | high/vault-maintenance | from Findings Index |

**Session summary:** 3 actions (1 defer, 1 drop, 1 create). 45 items reviewed.
```

### 8.3 Stuck Item Detection

`SessionRepository.get_defer_count(item_id)` counts deferrals by stable `ItemId` (not SourceLocation). ScoringService uses this as weighted factor (5%): `min(defer_count * 33, 100)`.

## 9. Concurrency & File Safety

### 9.1 Single-Writer Design

Advisory file locking via `TaskRepository.acquire_lock()`:
- Uses `fcntl.flock()` on a `.triage.lock` file in vault root
- TUI acquires lock on startup, releases on exit
- Skill acquires lock per write operation
- CLI read-only operations do not require lock
- If lock cannot be acquired within 5s, error with "another triage session is active"

### 9.2 Write Strategy

All vault writes go through `task_writer.py` which:
1. Reads current file content
2. Finds item by `ItemId` (content hash match, not line number)
3. Applies change in-memory
4. Writes atomically (write to temp + rename)

## 10. Claude Code Skill (`/triage`)

### 10.1 Modes

- `/triage` — full review: shows Do Now bucket, interactive per-item triage
- `/triage prescriber` — filter by context
- `/triage suggestions` — only proposed new items
- `/triage overdue` — only past-due items
- `/triage history` — recent triage sessions
- `/triage visit` — generate Doctor Visit Report (prescriber items, E1-E2, SVG output)

### 10.2 AI-Added Value

- **Dependency chains**: "CRP test → unlocks SSRI augmentation decision → unlocks nortriptyline discussion"
- **Deduplication**: detects similar tasks across files, presents for human confirmation
- **Visit planning**: "5 prescriber tasks — consolidate into one appointment agenda"
- **Staleness reasoning**: "This research topic was last checked 6 months ago and 3 new PubMed hits appeared"
- **Clinical validation tracking**: flags items not yet confirmed by clinician

### 10.3 Vault Writes

Skill writes changes through the same `ApplyDecisions` use case as TUI. Changes are applied immediately after user approval per item (no batch mode — conversational flow). File lock acquired per write.

## 11. Integration with Existing genome-toolkit

### 11.1 Reuse

- `scripts/lib/vault_parser.py` — extend with per-task extraction: iterate `- [ ]` lines, capture line number, parse inline `[key:: value]` fields scoped to each bullet, emit structured `VaultTask`. The existing `DATAVIEW_INLINE_RE` regex handles field parsing.
- `scripts/lib/config.py` — extend with triage-specific config (weights, vault path)
- `scripts/lib/db.py` — not needed (triage operates on markdown, not SQLite)

### 11.2 New Dependencies

```toml
[project.optional-dependencies]
triage = [
    "textual>=0.80.0",
    "rich>=13.0",
    "click>=8.0",
    "jinja2>=3.1.0",
]
```

### 11.3 Entry Point

```toml
[project.scripts]
genome-triage = "genome_toolkit.triage.presentation.cli:main"
```

## 12. Testing Strategy

### 12.1 TDD Approach

Red-green-refactor for all domain and application layers. Domain tests use in-memory repository stubs.

### 12.2 Test Categories

| Layer | Strategy | Tooling |
|-------|----------|---------|
| Domain | Unit tests, pure functions, no I/O | pytest |
| Application | Unit tests with stub repos | pytest |
| Infrastructure/vault | Integration tests with fixture .md files | pytest + tmp_path |
| Presentation/CLI | Snapshot tests of output | pytest + capsys |
| Presentation/TUI | Screenshot tests via Textual's pilot | pytest + textual snapshot testing |
| Presentation/SVG | Snapshot comparison of rendered SVG | pytest + file comparison |

### 12.3 Fixtures

- `tests/fixtures/vault/` — minimal vault with sample tasks, findings index, biomarker results
- `tests/fixtures/history/` — sample triage history files
- Screenshots stored in `tests/snapshots/` for TUI regression testing

## 13. What Is NOT In Scope (v1)

- Automatic scheduled runs (cron/hooks)
- Push notifications
- Multi-vault support (single vault path per invocation)
- Web UI
- Database backend (markdown-only persistence)

## Appendix A: Review Audit Trail

### Codex Review (gpt-5-codex, high reasoning, 2026-04-01)

**Addressed:**
1. SourceLocation as identity → replaced with stable ItemId (content hash)
2. `update_item(changes: dict)` → typed command objects
3. Overdue scoring inconsistency → monotonic piecewise function
4. Missing LabSignal/Finding/StaleTopic definitions → full VOs in domain/signals.py
5. Vault parser can't emit per-task → spec requires extension
6. TUI card layout → Textual CSS borders + ListView virtualization
7. Binary lab signal → z-score scaled
8. Stuck bonus bypasses buckets → weighted factor (5%)
9. Wikilinks in rich.markdown → pre-processor
10. SVG text overflow → text_layout.py helper

### NotebookLM Review (2026-04-01)

**Addressed:**
1. Concurrent write corruption → advisory file locking, single-writer design
2. Fuzzy dedup suppressing findings → conservative matching + human confirmation
3. No clinical severity metric → Severity enum added as scoring factor
4. Unsafe defaults (50) → biased to 60 for health context
5. No explicit dependencies → blocked_by field on TriageItem
6. No clinician export → Doctor Visit SVG report
7. No verification flags → clinically_validated field
