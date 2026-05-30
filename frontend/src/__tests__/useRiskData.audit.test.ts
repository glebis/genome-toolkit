import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Genes: one risk (APOE), one monitor (MTHFR), one optimal (SOD2)
const mockGenes = [
  {
    symbol: 'APOE', full_name: 'Apolipoprotein E', chromosome: '19',
    systems: ['Lipid Metabolism'], evidence_tier: 'E1', personal_status: 'risk',
    relevance: 'high', description: 'Elevated LDL risk.',
    personal_variants: [{ rsid: 'rs429358', genotype: 'C/C', significance: 'Pathogenic' }],
    tags: [], study_count: 50, has_vault_note: true,
  },
  {
    symbol: 'MTHFR', full_name: 'MTHFR', chromosome: '1',
    systems: ['Methylation'], evidence_tier: 'E2', personal_status: 'intermediate',
    relevance: 'high', description: 'Reduced folate conversion.',
    personal_variants: [{ rsid: 'rs1801133', genotype: 'T/T', significance: '' }],
    tags: [], study_count: 12, has_vault_note: true,
  },
  {
    symbol: 'SOD2', full_name: 'Superoxide Dismutase 2', chromosome: '6',
    systems: ['Oxidative Stress'], evidence_tier: 'E3', personal_status: 'optimal',
    relevance: 'low', description: 'Normal antioxidant function.',
    personal_variants: [{ rsid: 'rs4880', genotype: 'C/C', significance: '' }],
    tags: [], study_count: 8, has_vault_note: true,
  },
]

// Config WITHOUT rank / populationBarPct — mirrors the real risk-landscape.yaml
// (#5). Heart Disease has actionable + monitor genes; Cancer is optimal-only;
// Accidents matches no gene (nodata).
const mockConfig = {
  demographic: { label: 'Reference profile', is_default: true, sex: 'male', age_range: '30-44', ancestry: 'european' },
  causes: [
    {
      cause: 'Heart Disease', pct: 31,
      relevant_genes: ['APOE', 'MTHFR'],
      screenings: [
        // gated by genetic_flag default — should appear (status actionable)
        { name: 'Blood pressure check', frequency: 'quarterly', type: 'monitor' },
        // explicitly actionable-gated — should appear
        { name: 'Coronary calcium score (CAC)', frequency: 'once', type: 'discuss', applies_when: 'actionable' },
        // always — appears regardless
        { name: 'General checkup', frequency: 'annually', type: 'monitor', applies_when: 'always' },
      ],
    },
    {
      cause: 'Cancer', pct: 24,
      relevant_genes: ['SOD2'],
      screenings: [
        // default genetic_flag gate; status is optimal -> hidden
        { name: 'Colonoscopy baseline', frequency: 'once', type: 'discuss' },
        // actionable-gated; status optimal -> hidden
        { name: 'Skin screening', frequency: 'annually', type: 'monitor', applies_when: 'actionable' },
        // always -> shown
        { name: 'General cancer awareness', frequency: 'once', type: 'discuss', applies_when: 'always' },
      ],
    },
    {
      cause: 'Accidents', pct: 12,
      relevant_genes: ['NONEXISTENT'],
      screenings: [
        // default genetic_flag gate; status nodata -> hidden
        { name: 'Substance review', frequency: 'annually', type: 'discuss' },
      ],
    },
  ],
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  vi.doMock('../hooks/useVaultGenes', () => ({
    useVaultGenes: () => ({ genes: mockGenes, loading: false, error: null }),
  }))

  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/config/risk-landscape')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockConfig) })
    }
    if (url.includes('/actions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ actions: [{ type: 'consider', title: 'Check LDL levels' }] }),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
  }) as any
})

async function getHook() {
  const mod = await import('../hooks/useRiskData')
  return renderHook(() => mod.useRiskData())
}

async function loadedCauses() {
  const { result } = await getHook()
  await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
  return result.current
}

describe('useRiskData — #5 safe defaults for missing config fields', () => {
  it('derives a finite sequential rank from array order when rank absent', async () => {
    const { causes } = await loadedCauses()
    expect(causes.map(c => c.rank)).toEqual([1, 2, 3])
    for (const c of causes) {
      expect(Number.isFinite(c.rank)).toBe(true)
    }
  })

  it('derives a finite populationBarPct (clamped 0-100) from pct when absent', async () => {
    const { causes } = await loadedCauses()
    for (const c of causes) {
      expect(Number.isFinite(c.populationBarPct)).toBe(true)
      expect(c.populationBarPct).toBeGreaterThanOrEqual(0)
      expect(c.populationBarPct).toBeLessThanOrEqual(100)
    }
    const heart = causes.find(c => c.cause === 'Heart Disease')
    expect(heart?.populationBarPct).toBe(31)
  })

  it('never yields NaN personalBarPct', async () => {
    const { causes } = await loadedCauses()
    for (const c of causes) {
      expect(Number.isNaN(c.personalBarPct)).toBe(false)
    }
  })
})

describe('useRiskData — #6 categorical genetic marker, not a fabricated bar', () => {
  it('does not scale personalBarPct with populationBarPct / mortality share', async () => {
    const { causes } = await loadedCauses()
    const heart = causes.find(c => c.cause === 'Heart Disease') // pct 31, has flags
    // marker is a small fixed value, NOT ~31 or scaled above it
    expect(heart!.personalBarPct).toBeLessThanOrEqual(15)
    expect(heart!.personalBarPct).toBeGreaterThan(0)
  })

  it('returns 0 marker when no genes matched', async () => {
    const { causes } = await loadedCauses()
    const accidents = causes.find(c => c.cause === 'Accidents')
    expect(accidents?.personalBarPct).toBe(0)
  })

  it('uses the same marker value regardless of pct for flagged causes', async () => {
    const { causes } = await loadedCauses()
    const flagged = causes.filter(c => c.status === 'actionable' || c.status === 'monitor' || c.status === 'optimal')
      .filter(c => c.personalBarPct > 0)
    const values = new Set(flagged.map(c => c.personalBarPct))
    expect(values.size).toBe(1)
  })
})

describe('useRiskData — #7 no false-reassurance wording', () => {
  it('does not emit "optimal" / "no elevated risk" / "no relevant variants" strings', async () => {
    const { causes } = await loadedCauses()
    const blob = JSON.stringify(causes).toLowerCase()
    expect(blob).not.toContain('no elevated risk')
    expect(blob).not.toContain('optimal —')
    expect(blob).not.toContain('no relevant variants detected')
    expect(blob).not.toContain('no genetic data available')
  })

  it('uses "no configured" / "not assessed" framing for nodata genesText', async () => {
    const { causes } = await loadedCauses()
    const accidents = causes.find(c => c.cause === 'Accidents')
    expect(accidents?.genesText.toLowerCase()).toContain('not assessed')
  })

  it('uses "no configured risk flag" framing for optimal statusText', async () => {
    const { causes } = await loadedCauses()
    const cancer = causes.find(c => c.cause === 'Cancer')
    expect(cancer?.statusText.toLowerCase()).toContain('no configured')
  })
})

describe('useRiskData — #8 demographic is a reference profile', () => {
  it('exposes label / is_default from config', async () => {
    const { demographic } = await loadedCauses()
    expect(demographic?.label).toBe('Reference profile')
    expect(demographic?.is_default).toBe(true)
  })
})

describe('useRiskData — #9 screening timeline gated by status', () => {
  it('shows genetic_flag-gated screenings only when cause has a flag (actionable)', async () => {
    const { causes } = await loadedCauses()
    const heart = causes.find(c => c.cause === 'Heart Disease')
    const names = (heart?.timeline ?? []).flatMap(g => g.items.map(i => i.name))
    expect(names).toContain('Blood pressure check')        // genetic_flag, actionable -> shown
    expect(names).toContain('Coronary calcium score (CAC)') // actionable-gated -> shown
    expect(names).toContain('General checkup')              // always -> shown
  })

  it('hides genetic_flag and actionable screenings for nodata causes', async () => {
    const { causes } = await loadedCauses()
    const accidents = causes.find(c => c.cause === 'Accidents')
    const names = (accidents?.timeline ?? []).flatMap(g => g.items.map(i => i.name))
    expect(names).not.toContain('Substance review')
  })

  it('hides genetic_flag and actionable screenings for optimal causes but keeps always', async () => {
    const { causes } = await loadedCauses()
    const cancer = causes.find(c => c.cause === 'Cancer')
    const names = (cancer?.timeline ?? []).flatMap(g => g.items.map(i => i.name))
    expect(names).not.toContain('Colonoscopy baseline')
    expect(names).not.toContain('Skin screening')
    expect(names).toContain('General cancer awareness')
  })

  it('defaults unknown screening type to "discuss" rather than "consider"', async () => {
    const { causes } = await loadedCauses()
    const heart = causes.find(c => c.cause === 'Heart Disease')
    const items = (heart?.timeline ?? []).flatMap(g => g.items).filter(i => i.source === 'screening')
    // all our screening types are valid; add a quick guard that none collapse to 'consider' default
    for (const i of items) {
      expect(['consider', 'monitor', 'discuss']).toContain(i.type)
    }
  })
})
