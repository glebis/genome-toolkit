import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mockGenes = [
  {
    symbol: 'CYP2D6', full_name: 'Cytochrome P450 2D6', chromosome: '22',
    systems: ['Drug Metabolism'], evidence_tier: 'E1', personal_status: 'intermediate',
    relevance: 'high', description: 'Reduced CYP2D6 activity.',
    personal_variants: [{ rsid: 'rs3892097', genotype: '*1/*4', significance: 'Drug Response' }],
    tags: [], study_count: 100, has_vault_note: true,
  },
  {
    symbol: 'CYP2C19', full_name: 'Cytochrome P450 2C19', chromosome: '10',
    systems: ['Drug Metabolism'], evidence_tier: 'E1', personal_status: 'risk',
    relevance: 'high', description: 'Poor metabolizer.',
    personal_variants: [{ rsid: 'rs4244285', genotype: '*2/*2', significance: 'Drug Response' }],
    tags: [], study_count: 80, has_vault_note: true,
  },
]

const mockConfig = {
  enzymes: [
    {
      symbol: 'CYP2D6',
      default_alleles: '*1/*1',
      default_status: 'normal',
      guideline: 'CPIC',
      description: 'Default CYP2D6 description.',
      gene_type: 'enzyme',
      drug_cards: [
        {
          class: 'SSRIs',
          category: 'prescription',
          description: 'Antidepressants metabolized by CYP2D6.',
          drugs: 'fluoxetine, paroxetine',
          impact_by_status: {
            poor: { impact: 'danger', text: 'Avoid', description: 'Severely reduced metabolism.', danger_note: 'Risk of toxicity.' },
            intermediate: { impact: 'adjust', text: 'Dose adjustment needed', description: 'Reduced metabolism.' },
            normal: { impact: 'ok', text: 'Standard dosing', description: 'Normal metabolism.' },
            ultrarapid: { impact: 'warn', text: 'May need higher dose', description: 'Rapid metabolism.' },
          },
        },
      ],
    },
    {
      symbol: 'CYP2C19',
      default_alleles: '*1/*1',
      default_status: 'normal',
      guideline: 'CPIC',
      description: 'Default CYP2C19.',
      gene_type: 'enzyme',
      drug_cards: [],
    },
  ],
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  vi.doMock('../hooks/useVaultGenes', () => ({
    useVaultGenes: () => ({ genes: mockGenes, loading: false, error: null }),
  }))

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockConfig),
  }) as any
})

async function getHook() {
  const mod = await import('../hooks/usePGxData')
  return renderHook(() => mod.usePGxData())
}

describe('usePGxData', () => {
  it('builds sections from config + vault genes', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sections).toHaveLength(2)
  })

  it('maps vault gene status to metabolizer status', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    expect(cyp2d6?.enzyme.status).toBe('intermediate')

    const cyp2c19 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2C19')
    expect(cyp2c19?.enzyme.status).toBe('poor') // 'risk' maps to 'poor'
  })

  it('uses vault genotype as alleles', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    expect(cyp2d6?.enzyme.alleles).toBe('*1/*4')
  })

  it('uses vault description over config default', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    expect(cyp2d6?.enzyme.description).toBe('Reduced CYP2D6 activity.')
  })

  it('maps drug impact by metabolizer status', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    const ssris = cyp2d6?.drugs[0]
    // intermediate status → adjust impact
    expect(ssris?.impact).toBe('adjust')
    expect(ssris?.statusText).toBe('Dose adjustment needed')
  })

  it('sets guideline from config', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    expect(cyp2d6?.enzyme.guideline).toBe('CPIC')
  })

  it('computes position from metabolizer status', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    // intermediate → position 30 (from statusPosition function)
    expect(cyp2d6?.enzyme.position).toBe(30)

    const cyp2c19 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2C19')
    // poor → position 10
    expect(cyp2c19?.enzyme.position).toBe(10)
  })
})
