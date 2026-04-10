import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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

const mockConfig = {
  causes: [
    { rank: 1, cause: 'Heart Disease', pct: 23.0, populationBarPct: 100, relevant_genes: ['APOE', 'MTHFR'] },
    { rank: 2, cause: 'Cancer', pct: 21.0, populationBarPct: 91, relevant_genes: ['SOD2'] },
    { rank: 3, cause: 'Accidents', pct: 8.0, populationBarPct: 35, relevant_genes: ['NONEXISTENT'] },
  ],
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  // Mock useVaultGenes
  vi.doMock('../hooks/useVaultGenes', () => ({
    useVaultGenes: () => ({ genes: mockGenes, loading: false, error: null }),
  }))

  // Mock fetch for config and actions
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/config/risk-landscape')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockConfig) })
    }
    if (url.includes('/actions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          actions: [{ type: 'consider', title: 'Check LDL levels' }],
        }),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
  }) as any
})

async function getHook() {
  const mod = await import('../hooks/useRiskData')
  return renderHook(() => mod.useRiskData())
}

describe('useRiskData', () => {
  it('builds causes from config + vault genes', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    expect(result.current.causes).toHaveLength(3)
  })

  it('sets actionable status when risk gene matched', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const heart = result.current.causes.find(c => c.cause === 'Heart Disease')
    expect(heart?.status).toBe('actionable')
  })

  it('sets optimal status when all matched genes are optimal', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const cancer = result.current.causes.find(c => c.cause === 'Cancer')
    expect(cancer?.status).toBe('optimal')
  })

  it('sets nodata status when no genes match', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const accidents = result.current.causes.find(c => c.cause === 'Accidents')
    expect(accidents?.status).toBe('nodata')
  })

  it('builds genesText from matched gene symbols', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const heart = result.current.causes.find(c => c.cause === 'Heart Disease')
    expect(heart?.genesText).toContain('APOE')
    expect(heart?.genesText).toContain('MTHFR')
  })

  it('sets nodata genesText when no genes match', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const accidents = result.current.causes.find(c => c.cause === 'Accidents')
    expect(accidents?.genesText).toBe('No relevant variants detected')
  })

  it('builds narrative for causes with matched genes', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const heart = result.current.causes.find(c => c.cause === 'Heart Disease')
    expect(heart?.narrative).toContain('2 genes analyzed')
    expect(heart?.narrative).toContain('APOE')
  })

  it('computes personalBarPct higher for actionable genes', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const heart = result.current.causes.find(c => c.cause === 'Heart Disease')
    // populationBarPct is 100, with 1 actionable + 1 monitor: factor = 1 + 0.3 + 0.1 = 1.4
    // personalBarPct = min(100 * 1.4, 100) = 100
    expect(heart?.personalBarPct).toBeGreaterThanOrEqual(100)
  })

  it('computes low personalBarPct for nodata causes', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const accidents = result.current.causes.find(c => c.cause === 'Accidents')
    // No matched genes: populationBarPct * 0.3 = 35 * 0.3 = 10.5 ≈ 11
    expect(accidents?.personalBarPct).toBeLessThan(35)
  })

  it('fetches actions for actionable genes', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const heart = result.current.causes.find(c => c.cause === 'Heart Disease')
    expect(heart?.actions).toBeDefined()
    expect(heart?.actions?.[0]?.text).toBe('Check LDL levels')
  })

  it('builds statusText with gene and action counts', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const heart = result.current.causes.find(c => c.cause === 'Heart Disease')
    expect(heart?.statusText).toContain('Actionable')
    expect(heart?.statusText).toContain('1 gene')
  })
})
