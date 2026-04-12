# Risk Landscape: Honest Risk Communication + Action Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add honest risk communication (disclaimer + confidence dots) and action timeline (config screenings + vault actions grouped by frequency) to the Risk Landscape view.

**Architecture:** Config-driven screenings in `risk-landscape.yaml` merged with vault gene actions in `useRiskData` hook. New `ConfidenceDots` and `TimelineSection` components in `RiskLandscape.tsx`. Confidence computed from gene count + average evidence tier.

**Tech Stack:** React 19, TypeScript, Vitest, FastAPI (no backend changes needed — existing `/api/config/risk-landscape` serves YAML)

---

### Task 1: Add screenings to risk-landscape.yaml config

**Files:**
- Modify: `config/risk-landscape.yaml`

- [ ] **Step 1: Add screenings arrays to each cause**

```yaml
demographic:
  sex: male
  age_range: "30-44"
  ancestry: european

causes:
  - cause: Cardiovascular Disease
    pct: 31
    relevant_genes: [MTHFR, APOE, LPA]
    relevant_systems: [Methylation Pathway, Lipid Metabolism, Cardiovascular]
    screenings:
      - name: Blood pressure check
        frequency: quarterly
        type: monitor
      - name: Lipid panel (total, LDL, HDL, triglycerides)
        frequency: annually
        type: monitor
      - name: Coronary calcium score (CAC)
        frequency: once
        type: discuss
  - cause: Cancer
    pct: 24
    relevant_genes: [BRCA1, BRCA2, CHEK2, APC, TP53]
    relevant_systems: [DNA Repair, Tumor Suppression]
    screenings:
      - name: Skin cancer screening (dermatologist)
        frequency: annually
        type: monitor
      - name: Colonoscopy baseline
        frequency: once
        type: discuss
  - cause: Accidents & Substance-Related
    pct: 12
    relevant_genes: [DRD2, GABRA2, CYP2D6, COMT]
    relevant_systems: [Dopamine System, GABA System, Drug Metabolism]
    screenings:
      - name: Review substance use patterns with clinician
        frequency: annually
        type: discuss
  - cause: Cerebrovascular Disease (Stroke)
    pct: 6
    relevant_genes: [MTHFR, APOE, F5, F2]
    relevant_systems: [Methylation Pathway, Coagulation]
    screenings:
      - name: Blood pressure check
        frequency: quarterly
        type: monitor
      - name: Homocysteine level
        frequency: biannual
        type: monitor
        gene: MTHFR
      - name: Coagulation panel if family history
        frequency: once
        type: discuss
  - cause: Suicide
    pct: 5
    relevant_genes: [SLC6A4, COMT, BDNF, TPH2, HTR2A]
    relevant_systems: [Serotonin System, Neuroplasticity]
    screenings:
      - name: Mental health check-in (PHQ-9 / GAD-7)
        frequency: quarterly
        type: monitor
      - name: Discuss genetic predisposition context with therapist
        frequency: once
        type: discuss
  - cause: Diabetes (Type 2)
    pct: 4
    relevant_genes: [TCF7L2, FTO, PPARG]
    relevant_systems: [Glucose Metabolism, Metabolic]
    screenings:
      - name: Fasting glucose / HbA1c
        frequency: annually
        type: monitor
      - name: Insulin sensitivity assessment
        frequency: biannual
        type: monitor
  - cause: Liver Disease
    pct: 3
    relevant_genes: [ALDH2, PNPLA3, HFE]
    relevant_systems: [Alcohol Metabolism, Liver Function]
    screenings:
      - name: Liver function panel (ALT, AST, GGT)
        frequency: annually
        type: monitor
      - name: Ferritin / iron studies
        frequency: annually
        type: monitor
        gene: HFE
  - cause: "Alzheimer's / Dementia"
    pct: 3
    relevant_genes: [APOE, CLU, PICALM]
    relevant_systems: [Lipid Metabolism, Neurodegeneration]
    screenings:
      - name: Cognitive baseline assessment
        frequency: once
        type: discuss
  - cause: Chronic Respiratory Disease
    pct: 2
    relevant_genes: [SERPINA1]
    relevant_systems: [Immune System]
    screenings:
      - name: Pulmonary function test (spirometry)
        frequency: once
        type: discuss
  - cause: Kidney Disease
    pct: 2
    relevant_genes: [APOL1, UMOD]
    relevant_systems: [Renal Function]
    screenings:
      - name: eGFR / creatinine / urine albumin
        frequency: annually
        type: monitor
```

- [ ] **Step 2: Verify config loads**

Run: `curl -s http://localhost:8000/api/config/risk-landscape | python3 -m json.tool | head -30`

Expected: JSON with `screenings` arrays present under each cause.

- [ ] **Step 3: Commit**

```bash
git add config/risk-landscape.yaml
git commit -m "feat(#27): add screenings to risk-landscape config"
```

---

### Task 2: Add confidence + timeline types and logic to useRiskData

**Files:**
- Modify: `frontend/src/hooks/useRiskData.ts`
- Modify: `frontend/src/components/risk/RiskLandscape.tsx` (type exports only)
- Test: `frontend/src/__tests__/useRiskData.test.ts`

- [ ] **Step 1: Write failing tests for confidence scoring**

Add to `frontend/src/__tests__/useRiskData.test.ts`, inside the existing `describe('useRiskData', ...)` block, after the last test:

```typescript
  it('computes confidence for causes with genes', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const heart = result.current.causes.find(c => c.cause === 'Heart Disease')
    expect(heart?.confidence).toBeDefined()
    expect(heart?.confidence.total).toBe(3)
    // 2 genes, avg tier (E1+E2)/2 = 1.5 => filled = 3 (n>=2 && avgTier<=2)
    // Actually: n=2, avgTier=1.5 => n>=3? no. n>=2 || avgTier<=3? yes => 2 dots
    // Wait — spec says: 3 dots if n>=3 && avgTier<=2; 2 dots if n>=2 || avgTier<=3
    // Heart has 2 genes (APOE E1, MTHFR E2), avg=1.5. n>=3 is false. n>=2 is true => 2 dots
    expect(heart?.confidence.filled).toBe(2)
    expect(heart?.confidence.tooltip).toContain('2 genes')
  })

  it('computes zero confidence for nodata causes', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const accidents = result.current.causes.find(c => c.cause === 'Accidents')
    expect(accidents?.confidence).toBeDefined()
    expect(accidents?.confidence.filled).toBe(0)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/useRiskData.test.ts`

Expected: FAIL — `confidence` is undefined on causes.

- [ ] **Step 3: Write failing tests for timeline groups**

Update `mockConfig` at the top of the test file to include screenings:

```typescript
const mockConfig = {
  demographic: { sex: 'male', age_range: '30-44', ancestry: 'european' },
  causes: [
    {
      rank: 1, cause: 'Heart Disease', pct: 23.0, populationBarPct: 100,
      relevant_genes: ['APOE', 'MTHFR'],
      screenings: [
        { name: 'Blood pressure check', frequency: 'quarterly', type: 'monitor' },
        { name: 'Lipid panel', frequency: 'annually', type: 'monitor' },
      ],
    },
    { rank: 2, cause: 'Cancer', pct: 21.0, populationBarPct: 91, relevant_genes: ['SOD2'] },
    { rank: 3, cause: 'Accidents', pct: 8.0, populationBarPct: 35, relevant_genes: ['NONEXISTENT'] },
  ],
}
```

Add tests after the confidence tests:

```typescript
  it('builds timeline groups from config screenings', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const heart = result.current.causes.find(c => c.cause === 'Heart Disease')
    expect(heart?.timeline).toBeDefined()
    expect(heart?.timeline?.length).toBeGreaterThan(0)
    const quarterly = heart?.timeline?.find(g => g.frequency === 'quarterly')
    expect(quarterly).toBeDefined()
    expect(quarterly?.items.some(i => i.name === 'Blood pressure check')).toBe(true)
  })

  it('merges vault actions into once group', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const heart = result.current.causes.find(c => c.cause === 'Heart Disease')
    const once = heart?.timeline?.find(g => g.frequency === 'once')
    expect(once).toBeDefined()
    // vault action "Check LDL levels" should land in once (no frequency keyword)
    expect(once?.items.some(i => i.name === 'Check LDL levels')).toBe(true)
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/useRiskData.test.ts`

Expected: FAIL — `timeline` is undefined.

- [ ] **Step 5: Add types to RiskLandscape.tsx**

Add new types after the existing `ActionMini` interface in `frontend/src/components/risk/RiskLandscape.tsx`:

```typescript
type TimelineFrequency = 'quarterly' | 'biannual' | 'annually' | 'once'

interface TimelineItem {
  name: string
  type: 'consider' | 'monitor' | 'discuss'
  frequency: TimelineFrequency
  gene?: string
  source: 'screening' | 'vault'
}

interface TimelineGroup {
  frequency: TimelineFrequency
  label: string
  color: string
  items: TimelineItem[]
}

interface ConfidenceScore {
  filled: number
  total: 3
  tooltip: string
}
```

Update the `MortalityCause` interface to include the new fields:

```typescript
interface MortalityCause {
  rank: number
  cause: string
  pct: number
  populationBarPct: number
  personalBarPct: number
  status: RiskStatus
  genesText: string
  statusText: string
  narrative?: string
  genes?: GeneMini[]
  actions?: ActionMini[]
  timeline?: TimelineGroup[]
  confidence: ConfidenceScore
}
```

Add to the exports at the bottom of the file:

```typescript
export type { RiskStatus, MortalityCause, TimelineFrequency, TimelineItem, TimelineGroup, ConfidenceScore }
```

- [ ] **Step 6: Implement confidence scoring and timeline in useRiskData.ts**

Add the following helper functions before `useRiskData()` in `frontend/src/hooks/useRiskData.ts`:

```typescript
import type { RiskStatus, MortalityCause, TimelineFrequency, TimelineItem, TimelineGroup, ConfidenceScore } from '../components/risk/RiskLandscape'
```

Add helper functions after `computePersonalBarPct`:

```typescript
function computeConfidence(matchedGenes: VaultGene[]): ConfidenceScore {
  const n = matchedGenes.length
  if (n === 0) return { filled: 0, total: 3, tooltip: 'No genes analyzed' }

  const tierValues: Record<string, number> = { E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 }
  const avgTier = matchedGenes.reduce((sum, g) => sum + (tierValues[g.evidence_tier] ?? 3), 0) / n
  const avgLabel = `E${Math.round(avgTier)}`

  let filled = 0
  if (n >= 3 && avgTier <= 2) filled = 3
  else if (n >= 2 || avgTier <= 3) filled = 2
  else if (n >= 1) filled = 1

  return {
    filled,
    total: 3,
    tooltip: `${n} gene${n !== 1 ? 's' : ''} analyzed, avg evidence ${avgLabel}`,
  }
}

const FREQUENCY_KEYWORDS: [TimelineFrequency, RegExp][] = [
  ['quarterly', /quarterly|every 3 months|3-monthly/i],
  ['biannual', /biannual|every 6 months|twice a year|semi-annual/i],
  ['annually', /annual|yearly|every year|once a year/i],
]

function classifyFrequency(text: string): TimelineFrequency {
  for (const [freq, re] of FREQUENCY_KEYWORDS) {
    if (re.test(text)) return freq
  }
  return 'once'
}

const TIMELINE_CONFIG: Record<TimelineFrequency, { label: string; color: string; order: number }> = {
  quarterly: { label: 'QUARTERLY', color: 'var(--sig-risk)', order: 0 },
  biannual: { label: 'BIANNUAL', color: 'var(--sig-monitor)', order: 1 },
  annually: { label: 'ANNUALLY', color: 'var(--sig-benefit)', order: 2 },
  once: { label: 'ONCE / AS NEEDED', color: 'var(--primary)', order: 3 },
}

function buildTimeline(
  configScreenings: ConfigScreening[],
  vaultActions: { type: string; text: string }[],
): TimelineGroup[] {
  const items: TimelineItem[] = []

  for (const s of configScreenings) {
    items.push({
      name: s.name,
      type: s.type === 'consider' || s.type === 'monitor' || s.type === 'discuss' ? s.type : 'consider',
      frequency: s.frequency as TimelineFrequency,
      gene: s.gene,
      source: 'screening',
    })
  }

  for (const a of vaultActions) {
    items.push({
      name: a.text,
      type: a.type === 'consider' || a.type === 'monitor' || a.type === 'discuss' ? a.type : 'consider',
      frequency: classifyFrequency(a.text),
      source: 'vault',
    })
  }

  const groups: TimelineGroup[] = []
  for (const [freq, cfg] of Object.entries(TIMELINE_CONFIG) as [TimelineFrequency, typeof TIMELINE_CONFIG[TimelineFrequency]][]) {
    const freqItems = items.filter(i => i.frequency === freq)
    if (freqItems.length > 0) {
      groups.push({ frequency: freq, label: cfg.label, color: cfg.color, items: freqItems })
    }
  }

  groups.sort((a, b) => TIMELINE_CONFIG[a.frequency].order - TIMELINE_CONFIG[b.frequency].order)
  return groups
}
```

Update `ConfigCause` interface to include screenings:

```typescript
interface ConfigScreening {
  name: string
  frequency: string
  type: string
  gene?: string
}

interface ConfigCause {
  rank: number
  cause: string
  pct: number
  populationBarPct: number
  relevant_genes: string[]
  description?: string
  screenings?: ConfigScreening[]
}
```

In the `buildCauses` async function, after constructing `actionMinis` and before `built.push(...)`, add:

```typescript
        const confidence = computeConfidence(matchedGenes)
        const timeline = buildTimeline(c.screenings ?? [], actionMinis)
```

Update the `built.push(...)` call to include the new fields:

```typescript
        built.push({
          rank: c.rank,
          cause: c.cause,
          pct: c.pct,
          populationBarPct: c.populationBarPct,
          personalBarPct,
          status,
          genesText,
          statusText,
          narrative: narrative || undefined,
          genes: geneMinis.length > 0 ? geneMinis : undefined,
          actions: actionMinis.length > 0 ? actionMinis : undefined,
          timeline: timeline.length > 0 ? timeline : undefined,
          confidence,
        })
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/useRiskData.test.ts`

Expected: All tests PASS (existing + 4 new).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/useRiskData.ts frontend/src/components/risk/RiskLandscape.tsx frontend/src/__tests__/useRiskData.test.ts
git commit -m "feat(#27): add confidence scoring and timeline grouping to useRiskData"
```

---

### Task 3: Add ConfidenceDots and TimelineSection components to RiskLandscape

**Files:**
- Modify: `frontend/src/components/risk/RiskLandscape.tsx`
- Test: `frontend/src/__tests__/RiskLandscape.test.tsx`

- [ ] **Step 1: Write failing tests for confidence dots**

Update `mockCauses` in `frontend/src/__tests__/RiskLandscape.test.tsx` to include `confidence` and `timeline`:

```typescript
const mockCauses = [
  {
    rank: 1, cause: 'Heart Disease', pct: 23.0,
    populationBarPct: 100, personalBarPct: 80,
    status: 'actionable', genesText: 'APOE, MTHFR',
    statusText: 'Actionable — 1 gene, 1 action',
    narrative: '2 genes analyzed for heart disease risk.',
    genes: [{ symbol: 'APOE', variant: 'E3/E4', evidenceTier: 'E1', status: 'actionable', description: 'Elevated LDL.' }],
    actions: [{ type: 'consider', text: 'Check LDL levels' }],
    confidence: { filled: 2, total: 3, tooltip: '2 genes analyzed, avg evidence E2' },
    timeline: [
      {
        frequency: 'quarterly', label: 'QUARTERLY', color: 'var(--sig-risk)',
        items: [{ name: 'Blood pressure check', type: 'monitor', frequency: 'quarterly', source: 'screening' }],
      },
      {
        frequency: 'once', label: 'ONCE / AS NEEDED', color: 'var(--primary)',
        items: [{ name: 'Check LDL levels', type: 'consider', frequency: 'once', source: 'vault' }],
      },
    ],
  },
  {
    rank: 2, cause: 'Cancer', pct: 21.0,
    populationBarPct: 91, personalBarPct: 27,
    status: 'optimal', genesText: 'SOD2',
    statusText: 'Optimal — no elevated risk variants',
    genes: [{ symbol: 'SOD2', variant: 'C/C', evidenceTier: 'E3', status: 'optimal', description: 'Normal.' }],
    confidence: { filled: 1, total: 3, tooltip: '1 gene analyzed, avg evidence E3' },
  },
  {
    rank: 3, cause: 'Accidents', pct: 8.0,
    populationBarPct: 35, personalBarPct: 11,
    status: 'nodata', genesText: 'No relevant variants detected',
    statusText: 'No genetic data available',
    confidence: { filled: 0, total: 3, tooltip: 'No genes analyzed' },
  },
]
```

Update the mock to include `demographic`:

```typescript
  vi.doMock('../hooks/useRiskData', () => ({
    useRiskData: () => ({
      causes: mockCauses,
      demographic: { sex: 'male', age_range: '30-44', ancestry: 'european' },
      loading: false,
    }),
  }))
```

Add tests:

```typescript
  it('renders confidence dots for each cause', async () => {
    await renderComponent()
    // Heart Disease has 2 filled dots — check via aria-label
    const heartDots = screen.getByLabelText('2 genes analyzed, avg evidence E2')
    expect(heartDots).toBeInTheDocument()
  })

  it('renders timeline groups in expanded detail', async () => {
    await renderComponent()
    // Rank 1 expanded by default — should see QUARTERLY header
    expect(screen.getByText('QUARTERLY')).toBeInTheDocument()
    expect(screen.getByText('Blood pressure check')).toBeInTheDocument()
  })

  it('renders honest risk disclaimer', async () => {
    await renderComponent()
    expect(screen.getByText(/qualitative assessment/)).toBeInTheDocument()
    expect(screen.getByText(/not a calibrated risk score/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/RiskLandscape.test.tsx`

Expected: FAIL — no confidence dots, no timeline, old disclaimer text.

- [ ] **Step 3: Implement ConfidenceDots component**

Add after the `PersonalBar` component in `frontend/src/components/risk/RiskLandscape.tsx`:

```typescript
function ConfidenceDots({ confidence }: { confidence: ConfidenceScore }) {
  return (
    <span
      style={{ display: 'inline-flex', gap: 3, marginLeft: 6 }}
      aria-label={confidence.tooltip}
      title={confidence.tooltip}
    >
      {Array.from({ length: confidence.total }, (_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: i < confidence.filled ? 'var(--sig-benefit)' : 'var(--border-strong)',
          }}
        />
      ))}
    </span>
  )
}
```

- [ ] **Step 4: Implement TimelineSection component**

Add after `ConfidenceDots`:

```typescript
function TimelineSection({ groups, addedSet, onAddToChecklist, causeName }: {
  groups: TimelineGroup[]
  addedSet?: Set<string>
  onAddToChecklist?: (title: string, causeName: string) => void
  causeName: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.map((group) => (
        <div key={group.frequency}>
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              color: group.color,
              letterSpacing: '0.1em',
              marginBottom: 6,
            }}
          >
            {group.label}
          </div>
          <div
            style={{
              borderLeft: `3px solid ${group.color}`,
              paddingLeft: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {group.items.map((item, idx) => {
              const key = causeName + item.name
              const added = addedSet?.has(key)
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {item.gene ? `${item.gene} — Gene-specific` : 'General screening'}
                      {item.source === 'vault' && !item.gene && ' — Vault'}
                    </div>
                  </div>
                  {onAddToChecklist && (
                    <button
                      className="btn btn-add-action"
                      aria-label={added ? 'Added to checklist' : 'Add to checklist'}
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        padding: '4px 8px',
                        minWidth: 32,
                        minHeight: 24,
                        flexShrink: 0,
                        opacity: added ? 0.4 : 0.6,
                        color: added ? 'var(--sig-benefit)' : 'var(--primary)',
                        borderColor: added ? 'var(--sig-benefit)' : 'var(--border)',
                        cursor: added ? 'default' : 'pointer',
                      }}
                      disabled={added}
                      onClick={(e) => { e.stopPropagation(); onAddToChecklist(item.name, causeName) }}
                      onMouseEnter={e => { if (!added) e.currentTarget.style.opacity = '1' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = added ? '0.4' : '0.6' }}
                    >
                      {added ? 'ADDED' : '+'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Wire ConfidenceDots into MortalityRow**

In the `MortalityRow` component, find the status text span and add `ConfidenceDots` after it. Replace:

```typescript
              {cause.statusText}
              {hasDetail && (
```

With:

```typescript
              {cause.statusText}
              <ConfidenceDots confidence={cause.confidence} />
              {hasDetail && (
```

- [ ] **Step 6: Wire TimelineSection into ExpandedDetail**

In the `ExpandedDetail` component, replace the current actions block:

```typescript
      {cause.actions && cause.actions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cause.actions.map((action, idx) => {
            const key = cause.cause + action.text
            return (
              <ActionMiniCard
                key={idx}
                action={action}
                added={addedSet?.has(key)}
                onAdd={onAddToChecklist ? () => onAddToChecklist(action.text, cause.cause) : undefined}
              />
            )
          })}
        </div>
      )}
```

With:

```typescript
      {cause.timeline && cause.timeline.length > 0 ? (
        <TimelineSection
          groups={cause.timeline}
          addedSet={addedSet}
          onAddToChecklist={onAddToChecklist}
          causeName={cause.cause}
        />
      ) : cause.actions && cause.actions.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cause.actions.map((action, idx) => {
            const key = cause.cause + action.text
            return (
              <ActionMiniCard
                key={idx}
                action={action}
                added={addedSet?.has(key)}
                onAdd={onAddToChecklist ? () => onAddToChecklist(action.text, cause.cause) : undefined}
              />
            )
          })}
        </div>
      ) : null}
```

- [ ] **Step 7: Update InfoCallout disclaimer**

Replace the existing InfoCallout content in the main `RiskLandscape` component:

```typescript
        <InfoCallout>
          Population bars show how common each cause of death is for{' '}
          <strong>{demographic ? formatDemographic(demographic) : 'your demographic profile'}</strong>.
          Your personal bar reflects the number and severity of relevant genetic variants found
          — <strong>it is a qualitative assessment, not a calibrated risk score or PRS</strong>.
          Having variants does not predict outcomes — it shows where awareness and prevention can
          make a difference.
        </InfoCallout>
```

- [ ] **Step 8: Run all tests**

Run: `cd frontend && npx vitest run`

Expected: All 37 test files pass, including updated `useRiskData.test.ts` and `RiskLandscape.test.tsx`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/risk/RiskLandscape.tsx frontend/src/__tests__/RiskLandscape.test.tsx
git commit -m "feat(#27): add ConfidenceDots, TimelineSection, and honest risk disclaimer"
```

---

### Task 4: Final integration test and cleanup

**Files:**
- Test: `frontend/src/__tests__/useRiskData.test.ts`
- Test: `frontend/src/__tests__/RiskLandscape.test.tsx`

- [ ] **Step 1: Run full test suite**

Run: `cd frontend && npx vitest run && cd .. && python -m pytest -x -q`

Expected: All frontend + backend tests pass with 0 failures.

- [ ] **Step 2: Manual smoke test**

Run: `uvicorn backend.app.main:app --port 8000 & cd frontend && npm run dev`

Check in browser:
1. Risk Landscape loads with updated disclaimer mentioning "qualitative assessment"
2. Each cause row shows confidence dots (0-3 filled)
3. Expanded Heart Disease shows timeline grouped by QUARTERLY / ANNUALLY / ONCE
4. Timeline items have + checklist buttons that work
5. Causes without screenings fall back to old action cards

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test(#27): verify risk landscape timeline and confidence integration"
```
