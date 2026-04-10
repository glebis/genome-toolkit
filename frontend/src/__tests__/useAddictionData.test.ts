import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mockGenes = [
  {
    symbol: 'DRD2', full_name: 'Dopamine Receptor D2', chromosome: '11',
    systems: ['Dopamine System'], evidence_tier: 'E2', personal_status: 'risk',
    relevance: 'high', description: 'Reduced D2 receptor density.',
    personal_variants: [{ rsid: 'rs1800497', genotype: 'C/T', significance: '' }],
    tags: [], study_count: 15, has_vault_note: true,
  },
  {
    symbol: 'OPRM1', full_name: 'Opioid Receptor Mu 1', chromosome: '6',
    systems: ['Opioid and Reward'], evidence_tier: 'E2', personal_status: 'intermediate',
    relevance: 'high', description: 'Altered opioid receptor binding.',
    personal_variants: [{ rsid: 'rs1799971', genotype: 'A/G', significance: '' }],
    tags: [], study_count: 20, has_vault_note: true,
  },
  {
    symbol: 'ADH1B', full_name: 'Alcohol Dehydrogenase 1B', chromosome: '4',
    systems: ['Liver and Metabolism'], evidence_tier: 'E1', personal_status: 'optimal',
    relevance: 'high', description: 'Rapid alcohol metabolism (protective).',
    personal_variants: [{ rsid: 'rs1229984', genotype: 'C/T', significance: '' }],
    tags: [], study_count: 40, has_vault_note: true,
  },
]

const mockSubstancesConfig = {
  substances: [
    {
      name: 'Alcohol', relevant_genes: ['ADH1B', 'ALDH2'],
      status_text: 'Be aware', description: 'Altered metabolism detected.',
      harm_title: 'Harm reduction', harm_text: 'Limit intake.',
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
    if (url.includes('/api/config/substances')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSubstancesConfig) })
    }
    if (url.includes('/actions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          actions: [{ type: 'consider', title: 'Monitor response', description: 'Track effects.' }],
        }),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
  }) as any
})

describe('useAddictionData', () => {
  it('builds pathways from gene systems', async () => {
    const mod = await import('../hooks/useAddictionData')
    const { result } = renderHook(() => mod.useAddictionData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    expect(result.current.pathways.length).toBeGreaterThan(0)
    // DRD2 maps to 'Dopamine & Reward Sensitivity'
    const dopamine = result.current.pathways.find(p => p.narrative.pathway.includes('Dopamine'))
    expect(dopamine).toBeDefined()
    expect(dopamine!.genes[0].symbol).toBe('DRD2')
  })

  it('maps gene status correctly', async () => {
    const mod = await import('../hooks/useAddictionData')
    const { result } = renderHook(() => mod.useAddictionData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const dopamine = result.current.pathways.find(p => p.narrative.pathway.includes('Dopamine'))
    const drd2Gene = dopamine?.genes.find(g => g.symbol === 'DRD2')
    expect(drd2Gene?.status).toBe('actionable') // 'risk' → 'actionable'
  })

  it('computes worst status for pathway', async () => {
    const mod = await import('../hooks/useAddictionData')
    const { result } = renderHook(() => mod.useAddictionData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const dopamine = result.current.pathways.find(p => p.narrative.pathway.includes('Dopamine'))
    expect(dopamine?.narrative.status).toBe('actionable')
  })

  it('builds narrative body with actionable counts', async () => {
    const mod = await import('../hooks/useAddictionData')
    const { result } = renderHook(() => mod.useAddictionData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    const dopamine = result.current.pathways.find(p => p.narrative.pathway.includes('Dopamine'))
    expect(dopamine?.narrative.body).toContain('actionable')
    expect(dopamine?.narrative.body).toContain('DRD2')
  })

  it('fetches actions for genes', async () => {
    const mod = await import('../hooks/useAddictionData')
    const { result } = renderHook(() => mod.useAddictionData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    await waitFor(() => expect(Object.keys(result.current.actions).length).toBeGreaterThan(0), { timeout: 3000 })
    expect(result.current.getActionsForGene('DRD2')).toBeDefined()
  })

  it('computes totalGenes and actionableCount', async () => {
    const mod = await import('../hooks/useAddictionData')
    const { result } = renderHook(() => mod.useAddictionData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    expect(result.current.totalGenes).toBeGreaterThan(0)
    expect(result.current.actionableCount).toBeGreaterThanOrEqual(1)
  })
})

describe('useSubstancesData', () => {
  it('builds substance cards from config + vault genes', async () => {
    const mod = await import('../hooks/useSubstancesData')
    const { result } = renderHook(() => mod.useSubstancesData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    expect(result.current.substances).toHaveLength(1)
    expect(result.current.substances[0].name).toBe('Alcohol')
  })

  it('uses config status_text when provided', async () => {
    const mod = await import('../hooks/useSubstancesData')
    const { result } = renderHook(() => mod.useSubstancesData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    expect(result.current.substances[0].status).toBe('Be aware')
  })

  it('lists matched gene symbols', async () => {
    const mod = await import('../hooks/useSubstancesData')
    const { result } = renderHook(() => mod.useSubstancesData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    // ADH1B is in vault, ALDH2 is not — should show ADH1B
    expect(result.current.substances[0].genes).toContain('ADH1B')
  })

  it('sets harm reduction text from config', async () => {
    const mod = await import('../hooks/useSubstancesData')
    const { result } = renderHook(() => mod.useSubstancesData())
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 })
    expect(result.current.substances[0].harmTitle).toBe('Harm reduction')
    expect(result.current.substances[0].harmText).toBe('Limit intake.')
  })
})
