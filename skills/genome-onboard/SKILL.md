---
name: genome-onboard
description: |
  Goal-driven onboarding for new genome vault users. Triggers on: /genome-onboard,
  "set up my vault", "I just imported my data", "help me get started with my genome".
  Two modes: --quick (4 questions, fast vault bootstrap) or --full (22-question
  interview with validated psychological instruments, generates Profile Card + Action Plan).
---

# Genome Onboard

Set up a personalized genome vault based on health goals, self-assessment, and imported genotype data.

## Prerequisites
- Genome data already imported via `genome-import` (SQLite database populated)
- Obsidian vault initialized from `vault-template/`

## Vault Configuration
- Config: `$GENOME_VAULT_ROOT` or config/default.yaml
- Database: `data/genome.db`
- Goal map: `config/goal_map.yaml`
- Interview questions: `skills/genome-onboard/references/interview_questions.yaml`
- Templates: `Templates/`

## Modes

### Quick Mode (default, ~2 min)
`/genome-onboard` or `/genome-onboard --quick`

4 questions → vault bootstrap (8-12 gene notes, Wallet Card). Use when the user wants to get started fast.

### Full Mode (~12 min)
`/genome-onboard --full`

22 questions across 4 phases → Profile Card + personalized Action Plan + vault bootstrap. Includes validated instruments (GAD-7, PHQ-2, PSS-4). Use when the user wants a comprehensive profile.

---

## Quick Mode Workflow

### Step 1: Health Goal Questionnaire
Ask the user 4 questions using AskUserQuestion:

1. **What matters most?** (multi-select from goal_map.yaml):
   - Medication safety
   - Mental health (anxiety/mood)
   - Addiction recovery
   - Liver health
   - Gut health / autoimmune
   - Sleep optimization
   - Cardiovascular / metabolic
   - Comprehensive (everything)

2. **Current medications/substances** (free text):
   - Prescription drugs (SSRIs, statins, etc.)
   - OTC drugs (NSAIDs, PPIs)
   - Supplements
   - Cannabis, alcohol, caffeine

3. **Active diagnoses or symptoms** (free text):
   - GAD, IBS, insomnia, joint pain, etc.

4. **Do you have recent lab results?** (yes/no):
   - If yes, suggest running `/biomarker` after onboarding

### Step 2: Map Goals to Targets
Load `config/goal_map.yaml` and resolve:
- `target_systems` — biological systems to document
- `seed_genes` — genes to create notes for
- `first_reports` — reports to generate
- `first_tests` — decision-changing tests to recommend
- `first_protocols` — protocols to create

### Step 3: Score and Prioritize Genes
Query SQLite for available genotype data on seed genes:
```bash
sqlite3 data/genome.db "SELECT rsid, genotype, source, r2_quality FROM snps WHERE rsid IN (SELECT rsid FROM genes WHERE gene_symbol='CYP2D6')"
```

Score each gene using weights from `config/goal_map.yaml`:
```
score = 8*medication_match + 6*goal_match + 5*severe_finding + 4*protocol_exists + 3*biomarker_link + 2*evidence_weight
```

Cap at 8-12 genes for initial generation. Always include safety-critical PGx genes if medication_safety is selected.

### Step 4: Generate First Outputs

**Always generate:**
1. **Wallet Card** (`Reports/Wallet Card.md`) — emergency drug safety reference
2. **Top Tests** section in Action Items — decision-changing labs based on goals

**Goal-dependent:**
3. **8-12 Gene notes** — use `/new-gene` workflow for each, prioritized by score
4. **2-4 System notes** — use Templates/_System.md
5. **2-3 Protocol notes** — use Templates/ or create from goal_map

### Step 5: Populate Dashboard
Update `Dashboard.md` with:
- User's selected goals
- Profile name and import stats
- Goal-specific quick access links
- Progress tracking (X/Y genes created)

### Step 6: Wire Navigation
- Update `MoC - All Genes.md` (Dataview auto-populates)
- Update `MoC - All Systems.md` (Dataview auto-populates)
- Create relevant entries in `Action Items.md`
- Link first reports from Dashboard

### Step 7: Suggest Next Steps
Based on genotype findings, suggest:
- Specific lab tests (with reasoning)
- Follow-up gene notes to create
- Whether imputation would unlock more data
- Prescriber conversation topics

## Quick Mode Output
- Populated vault with 8-12 gene notes, 2-4 system notes, Wallet Card
- Dashboard.md personalized to user goals
- Action Items with prioritized tests and prescriber topics
- Getting Started guide with user's specific next steps

---

## Full Mode Workflow

Load interview questions from `references/interview_questions.yaml`.

### Phase 1: Quick Profile (2 min, 4 questions)
Same as Quick Mode Steps 1-4 above. Collect goals, medications, diagnoses, lab status.

### Phase 2: Physiological Assessment (5 min, 10 questions)
Ask using AskUserQuestion, one at a time or grouped:

5. Sleep duration (hours)
6. Sleep quality (1-5)
7. Wake time consistency
8. Exercise: type, frequency, time of day
9. Caffeine: cups/day, last intake
10. Alcohol: drinks/week
11. Cannabis: current use, frequency
12. GI symptoms: Bristol scale, frequency
13. Pain: locations, NSAID response
14. Morning stiffness: duration

Each question has `gene_context` in the YAML — use this to explain WHY the question matters:
> "I'm asking about caffeine because your CYP1A2 genotype affects how fast you metabolize it — this shapes your caffeine protocol."

### Phase 3: Psychological Assessment (3 min, 4 instruments)

15. **GAD-7** — Present all 7 items, score 0-3 each. Total → severity band.
16. **PHQ-2** — 2 items, flag if score >= 3 (recommend full PHQ-9).
17. **PSS-4** — 4 items perceived stress.
18. Medication satisfaction (1-5 Likert).

> Important: Frame these as "baseline for tracking change over time", not diagnosis. Include standard clinical disclaimers.

### Phase 4: Context & History (2 min, 4 questions)

19. Family history (multi-select)
20. Ancestry (free text, for PRS calibration)
21. Prior genetic testing
22. Main concerns / questions

### Step A: Generate Profile Card

Create `Reports/Profile Card.md` from `Templates/_Profile Card.md`:
- Populate all frontmatter fields from interview responses
- Calculate assessment scores (GAD-7 total, PHQ-2 flag, PSS-4 total)
- Map sleep/exercise/substance data to gene context
- Flag any red-zone values (sleep <6h, GAD-7 >= 15, Bristol >= 6)

### Step B: Apply Assessment Modifiers

Load `assessment_modifiers` from interview_questions.yaml. For each modifier:
- Evaluate condition against collected data
- If true: boost specified genes in scoring, add recommended protocols/tests

Example: if `gad7_score >= 10`, boost FKBP5/SLC6A4/CRHR1 by +3 and add GAD Protocol.

### Step C: Generate Action Plan

Create `Reports/Action Plan.md`:

1. **Your Genetic Profile Summary** — 3-5 sentences, plain language, no rsIDs
   - Top 3 strengths (from genotype + assessment context)
   - Top 3 watchpoints (genotype × assessment interaction)

2. **Priority Actions** — Scored by: evidence_tier × assessment_severity × gene_actionability
   - Each: what to do, why (gene basis), when, evidence tier
   - Personalized by assessment (high GAD-7 → different priorities than low)

3. **Tests to Request** — Filtered from Complete Testing Guide by profile
   - Only tests relevant to this person's goals + findings

4. **Medication Review** — Drug-gene interactions for listed medications
   - Metabolizer status for each relevant CYP
   - Optimization suggestions for prescriber conversation

5. **30-Day Protocol** — Concrete daily actions
   - Morning routine (chronotype + exercise timing)
   - Supplement stack (genotype + current status)
   - Monitoring targets tied to genetics

6. **What to Track** — Metrics for reassessment
   - HRV (if Apple Watch) → FKBP5, CRHR1
   - Sleep duration → CYP1A2, melatonin dosing
   - GI symptoms → ATG16L1, FUT2
   - GAD-7 retest at 30 days

### Step D: Run Quick Mode Steps 2-7

Generate gene notes, system notes, Wallet Card, wire navigation — same as Quick Mode but with assessment-boosted gene priorities.

### Step E: Video Export (optional)

If user wants a video summary:
```bash
python3 scripts/export_video_data.py --profile-card "Reports/Profile Card.md" --action-plan "Reports/Action Plan.md" --output data/video_data.json
```

Then render with Remotion (requires Node.js + Remotion setup):
```bash
cd video && npx remotion render GenomeReport --props data/video_data.json
```

Or use `/videopublish` skill for full YouTube pipeline.

## Full Mode Output
- Everything from Quick Mode, PLUS:
- `Reports/Profile Card.md` — structured self-assessment with gene context
- `Reports/Action Plan.md` — personalized, assessment-weighted action plan
- Assessment scores stored in Profile Card frontmatter for longitudinal tracking
- Optional: MP4 video summary via Remotion
