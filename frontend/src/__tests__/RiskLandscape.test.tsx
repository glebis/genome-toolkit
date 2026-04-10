import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockCauses = [
  {
    rank: 1, cause: 'Heart Disease', pct: 23.0,
    populationBarPct: 100, personalBarPct: 80,
    status: 'actionable', genesText: 'APOE, MTHFR',
    statusText: 'Actionable — 1 gene, 1 action',
    narrative: '2 genes analyzed for heart disease risk.',
    genes: [{ symbol: 'APOE', variant: 'E3/E4', evidenceTier: 'E1', status: 'actionable', description: 'Elevated LDL.' }],
    actions: [{ type: 'consider', text: 'Check LDL levels' }],
  },
  {
    rank: 2, cause: 'Cancer', pct: 21.0,
    populationBarPct: 91, personalBarPct: 27,
    status: 'optimal', genesText: 'SOD2',
    statusText: 'Optimal — no elevated risk variants',
    genes: [{ symbol: 'SOD2', variant: 'C/C', evidenceTier: 'E3', status: 'optimal', description: 'Normal.' }],
  },
  {
    rank: 3, cause: 'Accidents', pct: 8.0,
    populationBarPct: 35, personalBarPct: 11,
    status: 'nodata', genesText: 'No relevant variants detected',
    statusText: 'No genetic data available',
  },
]

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doMock('../hooks/useRiskData', () => ({
    useRiskData: () => ({ causes: mockCauses, loading: false }),
  }))
})

async function renderComponent(props = {}) {
  const mod = await import('../components/risk/RiskLandscape')
  return render(<mod.RiskLandscape {...props} />)
}

describe('RiskLandscape', () => {
  it('renders title', async () => {
    await renderComponent()
    expect(screen.getByText(/Mortality.*Risk Landscape/)).toBeInTheDocument()
  })

  it('renders summary stats', async () => {
    await renderComponent()
    expect(screen.getByText('Actionable areas')).toBeInTheDocument()
    expect(screen.getAllByText('Monitor').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Optimal / no risk')).toBeInTheDocument()
  })

  it('renders all mortality causes', async () => {
    await renderComponent()
    expect(screen.getByText('Heart Disease')).toBeInTheDocument()
    expect(screen.getByText('Cancer')).toBeInTheDocument()
    expect(screen.getByText('Accidents')).toBeInTheDocument()
  })

  it('shows percentage of deaths', async () => {
    await renderComponent()
    expect(screen.getByText('23% of deaths')).toBeInTheDocument()
    expect(screen.getByText('21% of deaths')).toBeInTheDocument()
  })

  it('shows genes text', async () => {
    await renderComponent()
    expect(screen.getByText('APOE, MTHFR')).toBeInTheDocument()
    expect(screen.getByText('No relevant variants detected')).toBeInTheDocument()
  })

  it('shows expanded detail for rank 1 by default', async () => {
    await renderComponent()
    // Rank 1 is expanded by default
    expect(screen.getByText('2 genes analyzed for heart disease risk.')).toBeInTheDocument()
    expect(screen.getByText('APOE')).toBeInTheDocument()
  })

  it('renders action cards in expanded detail', async () => {
    await renderComponent()
    expect(screen.getByText('Check LDL levels')).toBeInTheDocument()
  })

  it('renders export bar', async () => {
    await renderComponent()
    expect(screen.getByText('Export PDF')).toBeInTheDocument()
    expect(screen.getByText('Export MD')).toBeInTheDocument()
  })

  it('renders footer with cause count', async () => {
    await renderComponent()
    expect(screen.getByText(/3 causes/)).toBeInTheDocument()
  })

  it('renders bar legend', async () => {
    await renderComponent()
    expect(screen.getByText('Population prevalence')).toBeInTheDocument()
    expect(screen.getByText('Actionable genetic factors')).toBeInTheDocument()
  })
})
