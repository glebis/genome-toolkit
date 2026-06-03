import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mockGenes = [
  {
    symbol: 'CYP2D6', full_name: 'Cytochrome P450 2D6', chromosome: '22',
    systems: ['Drug Metabolism'], evidence_tier: 'E1', personal_status: 'intermediate',
    pgx_phenotype: 'intermediate', pgx_diplotype: '*1/*4',
    relevance: 'high', description: 'Reduced CYP2D6 activity.',
    personal_variants: [{ rsid: 'rs3892097', genotype: 'AG', significance: 'Drug Response' }],
    tags: [], study_count: 100, has_vault_note: true,
  },
  {
    symbol: 'CYP2C19', full_name: 'Cytochrome P450 2C19', chromosome: '10',
    systems: ['Drug Metabolism'], evidence_tier: 'E1', personal_status: 'risk',
    pharmacogenomics: { phenotype: 'poor', diplotype: '*2/*2' },
    relevance: 'high', description: 'Poor metabolizer.',
    personal_variants: [{ rsid: 'rs4244285', genotype: 'GG', significance: 'Drug Response' }],
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
          evidence_scope: 'label',
          description: 'Antidepressants metabolized by CYP2D6.',
          drugs: 'fluoxetine, paroxetine',
          impact_by_status: {
            poor: { impact: 'danger', text: 'Avoid', description: 'Severely reduced metabolism.', danger_note: 'Risk of toxicity.' },
            intermediate: { impact: 'adjust', text: 'Dose adjustment needed', description: 'Reduced metabolism.' },
            normal: { impact: 'ok', text: 'Standard dosing', description: 'Normal metabolism.' },
            ultrarapid: { impact: 'warn', text: 'May need higher dose', description: 'Rapid metabolism.' },
          },
        },
        {
          // No evidence_scope; parent CYP2D6 HAS a guideline → default 'guideline'.
          class: 'Codeine',
          category: 'prescription',
          description: 'Opioid prodrug.',
          drugs: 'codeine',
          impact_by_status: {
            intermediate: { impact: 'warn', text: 'Reduced efficacy', description: 'Reduced conversion.' },
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
    {
      // No guideline on this enzyme.
      symbol: 'CYP3A4',
      default_alleles: '*1/*1',
      default_status: 'normal',
      description: 'Broad metabolism note.',
      gene_type: 'enzyme',
      drug_cards: [
        {
          // No evidence_scope; parent has NO guideline → default 'exploratory'.
          class: 'Recreational Substances',
          category: 'substance',
          description: 'Broad substance note.',
          drugs: 'cocaine, ketamine',
          impact_by_status: {
            normal: { impact: 'ok', text: 'Standard metabolism', description: 'Normal clearance.' },
          },
        },
        {
          // Explicit harm_reduction scope — must be KEPT, not filtered, and flagged non-prescriber.
          class: 'Ketamine (recreational)',
          category: 'substance',
          evidence_scope: 'harm_reduction',
          description: 'Harm-reduction note.',
          drugs: 'ketamine',
          impact_by_status: {
            normal: { impact: 'warn', text: 'Avoid risky combinations', description: 'Do not combine with depressants.', danger_note: 'Never combine with alcohol, GHB, benzodiazepines, or opioids.' },
          },
        },
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
    expect(result.current.sections).toHaveLength(3)
  })

  it('maps vault gene status to metabolizer status', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    expect(cyp2d6?.enzyme.status).toBe('intermediate')

    const cyp2c19 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2C19')
    expect(cyp2c19?.enzyme.status).toBe('poor') // 'risk' maps to 'poor'
  })

  it('uses PGx-specific diplotype as alleles', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    expect(cyp2d6?.enzyme.alleles).toBe('*1/*4')

    const cyp2c19 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2C19')
    expect(cyp2c19?.enzyme.alleles).toBe('*2/*2')
  })

  it('never presents a raw rsID genotype as a star-allele diplotype', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    // mockGenes carry personal_variants[0].genotype of 'AG' / 'GG' — these
    // must NOT leak into the alleles field as if they were a diplotype.
    for (const s of result.current.sections) {
      expect(s.enzyme.alleles).not.toBe('AG')
      expect(s.enzyme.alleles).not.toBe('GG')
    }
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

  it('defaults to unknown (not normal) when no PGx-specific field is present', async () => {
    vi.resetModules()
    vi.doMock('../hooks/useVaultGenes', () => ({
      useVaultGenes: () => ({
        genes: [
          {
            symbol: 'CYP2D6', full_name: 'Cytochrome P450 2D6', chromosome: '22',
            systems: ['Drug Metabolism'], evidence_tier: 'E1',
            // generic health-dashboard status only — NOT a PGx phenotype
            personal_status: 'risk',
            relevance: 'high', description: 'Generic status only.',
            personal_variants: [{ rsid: 'rs3892097', genotype: 'AG', significance: 'Drug Response' }],
            tags: [], study_count: 100, has_vault_note: true,
          },
        ],
        loading: false, error: null,
      }),
    }))
    const configNoDefault = {
      enzymes: [
        { symbol: 'CYP2D6', guideline: 'CPIC', description: 'd', gene_type: 'enzyme', drug_cards: [] },
      ],
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(configNoDefault),
    }) as any

    const mod = await import('../hooks/usePGxData')
    const { result } = renderHook(() => mod.usePGxData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    expect(cyp2d6?.enzyme.status).toBe('unknown')
    // rsID genotype must not surface as a diplotype
    expect(cyp2d6?.enzyme.alleles).not.toBe('AG')
    expect(cyp2d6?.enzyme.alleles).toBe('unknown')
  })

  // 'defaults to unknown when no vault gene matches' moved to
  // usePGxData.unknownGene.test.ts — it needs an empty gene list and was flaky
  // sharing this file's populated-genes beforeEach (mock-override race in CI).

  it('flows an explicit evidence_scope to evidenceScope on the mapped drug', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    const ssris = cyp2d6?.drugs.find(d => d.drugClass === 'SSRIs')
    expect(ssris?.evidenceScope).toBe('label')
  })

  it('defaults evidence_scope to "guideline" when omitted but the enzyme has a guideline', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find(s => s.enzyme.symbol === 'CYP2D6')
    const codeine = cyp2d6?.drugs.find(d => d.drugClass === 'Codeine')
    expect(codeine?.evidenceScope).toBe('guideline')
  })

  it('defaults evidence_scope to "exploratory" when omitted and the enzyme has no guideline', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp3a4 = result.current.sections.find(s => s.enzyme.symbol === 'CYP3A4')
    const rec = cyp3a4?.drugs.find(d => d.drugClass === 'Recreational Substances')
    expect(rec?.evidenceScope).toBe('exploratory')
  })

  it('keeps a harm_reduction-scoped card in output (NOT filtered out)', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp3a4 = result.current.sections.find(s => s.enzyme.symbol === 'CYP3A4')
    const ket = cyp3a4?.drugs.find(d => d.drugClass === 'Ketamine (recreational)')
    expect(ket).toBeDefined()
    expect(ket?.evidenceScope).toBe('harm_reduction')
    // Harm-reduction safety content is preserved.
    expect(ket?.dangerNote).toMatch(/Never combine/)
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
