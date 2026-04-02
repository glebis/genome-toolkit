---
name: genome-log
description: |
  Daily health tracking with genetic context: supplements, medications, symptoms,
  interventions, metrics. Use this skill whenever the user mentions taking supplements,
  logging symptoms, tracking health, reporting how they feel, or asks about their daily
  routine. Also triggers on: /genome-log, /log, "daily check-in", "track today",
  "I took my supplements", "feeling anxious", "my stomach hurts", "forgot my B12",
  "log symptoms", "how am I doing", "what did I take today". Even casual health
  mentions like "my nose is stuffed" or "had a rough night" should trigger this skill
  to offer logging.
---

# Genome Daily Logger

Track daily health data and get genetically-informed feedback. Every data point connects
to the user's genetic profile — this isn't generic tracking, it's personalized monitoring
that builds evidence over time for what works and what doesn't.

## Two Modes

### 1. Conversational (Claude Code skill — default)

When the user mentions health data casually, extract and log it:

**User says**: "I took sertraline and alflorex this morning, feeling pretty anxious though"
**You do**:
1. Read or create today's daily note (`Daily/YYYY-MM-DD.md` from `Templates/_Daily.md`)
2. Update: `sertraline_50mg: true`, `alflorex: true`, `anxiety: 6` (ask for 0-10 if not clear)
3. Provide genetic context: "Anxiety 6 with FKBP5 C;T — cortisol may be running high. A 15-min walk would help both HRV and dopamine (DRD2)."

**User says**: "my stomach is killing me and nose is stuffed"
**You do**:
1. Update symptoms: ask for gi_discomfort (0-10) and nasal_congestion (0-10)
2. Flag pattern: "GI + nasal together = classic histamine pattern (ABP1 3x het). What did you eat in the last 2 hours? Any aged cheese, canned fish, fermented food?"

**User says**: "what did I take today?"
**You do**:
1. Read today's daily note, show current log
2. Flag anything missing from the usual stack

### 2. CLI (standalone script)

```bash
# Full interactive (all categories)
python3 scripts/daily_log.py

# Quick mode (supplements + medications only, ~15 sec)
python3 scripts/daily_log.py --quick

# Show today's log
python3 scripts/daily_log.py --show

# Specific date
python3 scripts/daily_log.py --date 2026-04-01

# Open in editor
python3 scripts/daily_log.py --edit
```

Script resolves vault from `$GENOME_VAULT_ROOT`, `config/default.yaml`, or auto-detects.

## Daily Note Format

YAML frontmatter in `Daily/YYYY-MM-DD.md`:

```yaml
medications:
  sertraline_50mg: true
supplements:
  methylfolate: true
  P5P: true
  alflorex: true
  # ... (full list in template)
symptoms:
  anxiety: null        # 0-10, null = not tracked
  gi_discomfort: null
  nasal_congestion: null
interventions:
  exercise: false      # boolean
  morning_walk: false
metrics:
  bristol_scale: null  # numeric
  sleep_hours: null
  caffeine_mg: null
```

- **Boolean** (medications, supplements, interventions): `true`/`false`
- **Scale** (symptoms): `0-10` where 0 = absent, 10 = worst
- **Numeric** (metrics): raw value, unit defined in Tracking Registry
- **Null** = not tracked today (different from `false` or `0`)

Template pre-fills supplements as `true` (optimistic — untoggle what was missed).

## Genetic Context Responses

When logging symptoms, provide brief genetic context — this is what makes this tracker
different from any generic app. The user's profile is in `.claude/CLAUDE.md` (Key Genotype
Quick Reference section). Key patterns:

| Signal | Genetic Context | Suggestion |
|--------|----------------|------------|
| Anxiety >= 6 | FKBP5 C;T (prolonged cortisol), COMT Val/Met | Walk, breathing exercise, check caffeine timing |
| GI >= 7 | ATG16L1 G;G (barrier), ABP1 3x het (histamine) | Check recent food for histamine triggers |
| GI + Nasal together | ABP1 DAO deficit | Histamine pattern — consider elimination diet trial |
| Nasal >= 5 | ABP1 + IL1B G;G (inflammation) | Saline rinse, check if fermented food was eaten |
| Sleep quality < 5 | CYP1A2 slow, FKBP5 cortisol | Any caffeine after 10:00? Melatonin max 0.3mg |
| Morning stiffness >= 5 | HLA-B27, IL1B G;G | Track duration in minutes. >30 min = inflammatory |
| Fatigue >= 6 | ALPL C;C (low B6), MTRR G;G | Check P5P + B12 adherence this week |
| No exercise + anxiety | BDNF Val/Val, DRD2 A1/A2 | "Exercise is your dopamine prescription" |
| Steps < 2000 | PNPLA3 G;G | Sedentary day = liver risk. Standing desk? |

## Analysis Mode (`/genome-log analyze` or `/log patterns`)

Scans daily notes for patterns, correlations, and actionable insights.

### CLI
```bash
python3 scripts/daily_analyze.py              # Last 14 days
python3 scripts/daily_analyze.py --days 30    # Last 30 days
python3 scripts/daily_analyze.py --json       # Machine-readable
python3 scripts/daily_analyze.py --save       # Save report to vault
```

### What It Finds

**1. Supplement adherence** — % taken over period, flags <80%

**2. Symptom trends** — average, range, trend direction (improving/worsening/stable) by comparing first half vs second half of the period

**3. Supplement → symptom correlations** — "Days after taking P5P, anxiety averages 3.2; days without P5P, anxiety averages 5.8 (diff: 2.6 pts)" Requires ≥2 data points each way. Only surfaces differences ≥1.0 point.

**4. Exercise effect** — same correlation logic: "Next-day GI after exercise: 2.1; without: 4.8"

**5. Pattern detection:**
- GI ≥5 + nasal ≥5 same day → histamine pattern (ABP1)
- Anxiety ≥6 + no exercise → DRD2 dopamine unaddressed
- Morning stiffness ≥5 → HLA-B27 inflammatory flare
- Sleep quality <4 + caffeine >150mg → CYP1A2 overshoot

### Conversational Analysis

When triggered via Claude Code, provide genetic-informed interpretation:

"Over the last 14 days, your GI discomfort averaged 5.2 and correlated with days you skipped P5P (avg 6.8 without vs 3.4 with). P5P is a DAO cofactor — your ABP1 3x het means DAO needs all the cofactor support it can get. Also noticed GI + nasal congestion co-occurred 4 times — classic histamine pattern. The elimination diet trial would give clearer data."

### When to Suggest Analysis

- After 7+ daily notes exist
- When user asks "is X helping?"
- When symptoms are trending worse
- Weekly (Sunday evening via weekly-learn daemon)
- Before prescriber visits (to bring data)

## Definitions & Dashboard

- **Tracking Registry**: `Protocols/Tracking Registry.md` — all item IDs, doses, gene links
- **Adherence Dashboard**: `Meta/Supplement Adherence.md` — auto-calculated via Dataview
- **Template**: `Templates/_Daily.md` — daily note template with all fields

## Adding New Tracked Items

1. Add definition to `Protocols/Tracking Registry.md` (ID, name, scale, gene basis)
2. Add field to `Templates/_Daily.md` in the right category
3. Existing daily notes don't need updating — missing fields default to null

## Setup Mode

First-time setup or when changing what to track.

### Interactive Setup (`/genome-log setup` or CLI `--setup`)

Walks through each category and asks what to track:

```
1. MEDICATIONS
   Current: sertraline 50mg
   Add medication? (name + dose, or Enter to skip): _
   
2. SUPPLEMENTS
   Suggested from genetic profile:
     ✓ Methylfolate 400mcg (MTHFR A1298C + MTRR G;G)
     ✓ P5P 25mg (ALPL C;C — DAO + GABA cofactor)
     ✓ Mg glycinate 400mg (GABA-A, general cofactor)
     ✓ Omega-3 EPA/DHA ≤2g (FADS1/2 het)
     ✓ D3+K2 (VDR variants)
     ✓ B12 methylcobalamin (MTRR G;G)
     ✓ NAC 600mg (IL1B, antioxidant)
     ✓ Vitamin C 500mg (DAO cofactor)
   Currently taking:
     ✓ Alflorex (IBS-D, started 2026-03-30)
     ✓ Sertraline 50mg
   Add more? (name + dose, or Enter to finish): _
   Remove any? (name, or Enter to keep all): _

3. SYMPTOMS
   Suggested for your profile:
     ✓ anxiety (FKBP5, SLC6A4, COMT)
     ✓ gi_discomfort (ATG16L1, ABP1)
     ✓ nasal_congestion (ABP1, IL1B — VMR)
     ✓ sleep_quality (PER3, CYP1A2)
     ✓ fatigue (ALPL, MTRR)
     ✓ morning_stiffness (HLA-B27, IL1B)
   Add custom symptom? (name, or Enter): _

4. INTERVENTIONS
   Suggested:
     ✓ exercise
     ✓ morning_walk
     ✓ breathing (FKBP5 cortisol management)
     ✓ resistant_starch (ATG16L1 butyrate)
     ✓ low_histamine_day (elimination protocol)
     ✓ saline_rinse (VMR)
   Add custom? _

5. METRICS
   Suggested:
     ✓ bristol_scale (IBS-D)
     ✓ sleep_hours (FKBP5 cortisol debt threshold: <6h)
     ✓ caffeine_mg (CYP1A2 ≤150mg)
     ✓ steps (auto from Health MCP when available)
   Add custom? _
```

Setup generates:
- Updated `Templates/_Daily.md` with chosen fields
- Updated `Protocols/Tracking Registry.md` with definitions + gene links
- First daily note for today

### CLI Setup

```bash
python3 scripts/daily_log.py --setup
```

Same interactive flow in the terminal. Can also be run non-interactively:

```bash
# Add a supplement
python3 scripts/daily_log.py --add-supplement "Lasea 80mg" --timing evening

# Add a symptom
python3 scripts/daily_log.py --add-symptom "joint_pain" --scale 0-10

# Remove an item
python3 scripts/daily_log.py --remove "butyzol"

# Show current tracking config
python3 scripts/daily_log.py --config
```

## Partial Updates

The user doesn't need to fill everything at once. Common patterns:

- **Morning**: "took my supplements" → update supplement booleans only
- **Afternoon**: "stomach hurts" → update gi_discomfort score
- **Evening**: "did 30 min calisthenics" → update exercise: true, add note
- **Before bed**: "log symptoms" → full symptom pass

Each update reads the existing daily note and merges — never overwrites previous entries.
