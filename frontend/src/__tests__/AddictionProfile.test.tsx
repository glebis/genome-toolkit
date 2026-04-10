import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockPathways = [
  {
    narrative: {
      pathway: 'Dopamine & Reward Sensitivity',
      status: 'actionable',
      body: '<strong>1 actionable</strong>: DRD2.',
      priority: '1 actionable findings',
      hint: '',
      geneCount: 1,
      actionCount: 1,
    },
    genes: [{
      symbol: 'DRD2', variant: 'Taq1A', rsid: 'rs1800497',
      genotype: 'C/T', status: 'actionable', evidenceTier: 'E2',
      studyCount: 15, description: 'Reduced D2 receptor density.',
      actionCount: 1, categories: [], pathway: 'Dopamine & Reward Sensitivity',
    }],
  },
]

const mockSubstances = [
  {
    name: 'Alcohol', status: 'Caution', statusColor: 'var(--sig-risk)',
    borderColor: 'var(--sig-risk)', description: 'Altered metabolism detected.',
    genes: 'ADH1B, ALDH2', relevantEnzymes: ['ADH1B'],
    harmTitle: 'Harm reduction', harmText: 'Limit to 1-2 drinks.',
  },
]

const mockActions = {
  DRD2: [{
    id: 'd1', type: 'consider', title: 'Structured reward planning',
    description: 'Build regular dopamine hits.', evidenceTier: 'E2',
    studyCount: 10, tags: ['lifestyle'], geneSymbol: 'DRD2', done: false,
  }],
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doMock('../hooks/useAddictionData', () => ({
    useAddictionData: () => ({
      pathways: mockPathways,
      substances: mockSubstances,
      loading: false,
      totalGenes: 1,
      actionableCount: 1,
      actions: mockActions,
      getActionsForGene: (symbol: string) => mockActions[symbol as keyof typeof mockActions] ?? [],
    }),
  }))
  vi.doMock('../hooks/useSubstancesData', () => ({
    useSubstancesData: () => ({ substances: mockSubstances, loading: false }),
  }))
})

async function renderComponent(props = {}) {
  const mod = await import('../components/addiction/AddictionProfile')
  return render(<mod.AddictionProfile {...props} />)
}

describe('AddictionProfile', () => {
  it('renders title', async () => {
    await renderComponent()
    expect(screen.getByText(/Addiction.*Reward Profile/)).toBeInTheDocument()
  })

  it('renders summary stats', async () => {
    await renderComponent()
    expect(screen.getByText('Genes analyzed')).toBeInTheDocument()
    expect(screen.getByText('Actionable findings')).toBeInTheDocument()
    expect(screen.getByText('Substances profiled')).toBeInTheDocument()
    expect(screen.getByText('Pathways mapped')).toBeInTheDocument()
  })

  it('renders pathway narrative', async () => {
    await renderComponent()
    expect(screen.getByText('Dopamine & Reward Sensitivity')).toBeInTheDocument()
  })

  it('renders gene cards', async () => {
    await renderComponent()
    expect(screen.getByText('DRD2')).toBeInTheDocument()
    expect(screen.getByText('Reduced D2 receptor density.')).toBeInTheDocument()
  })

  it('renders substance cards', async () => {
    await renderComponent()
    expect(screen.getByText('Alcohol')).toBeInTheDocument()
    expect(screen.getByText('Caution')).toBeInTheDocument()
  })

  it('renders harm reduction section', async () => {
    await renderComponent()
    expect(screen.getAllByText('Harm reduction').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Limit to 1-2 drinks.')).toBeInTheDocument()
  })

  it('renders evidence filter chips', async () => {
    await renderComponent()
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/E1 GOLD STANDARD/)).toBeInTheDocument()
  })

  it('renders context callout', async () => {
    const { container } = await renderComponent()
    // InfoCallout contains text about harm reduction split across elements
    expect(container.textContent).toContain('harm reduction')
  })

  it('renders export bar', async () => {
    await renderComponent()
    expect(screen.getByText('Export PDF')).toBeInTheDocument()
  })

  it('renders footer', async () => {
    await renderComponent()
    expect(screen.getByText(/GENOME_TOOLKIT.*ADDICTION/)).toBeInTheDocument()
  })
})
