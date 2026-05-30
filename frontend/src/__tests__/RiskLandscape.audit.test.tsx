import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockCauses = [
  {
    rank: 1, cause: 'Heart Disease', pct: 31,
    populationBarPct: 31, personalBarPct: 10,
    status: 'actionable', genesText: 'APOE, MTHFR',
    statusText: 'Actionable — 1 gene, 1 action',
    confidence: { filled: 2, total: 3, tooltip: '2 genes analyzed, avg evidence E2' },
  },
  {
    rank: 2, cause: 'Cancer', pct: 24,
    populationBarPct: 24, personalBarPct: 10,
    status: 'optimal', genesText: 'SOD2',
    statusText: 'No configured risk flag',
    confidence: { filled: 1, total: 3, tooltip: '1 gene analyzed, avg evidence E3' },
  },
  {
    rank: 3, cause: 'Accidents', pct: 12,
    populationBarPct: 12, personalBarPct: 0,
    status: 'nodata', genesText: 'No configured gene match / not assessed',
    statusText: 'No configured genetic assessment',
    confidence: { filled: 0, total: 3, tooltip: 'No genes analyzed' },
  },
]

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doMock('../hooks/useRiskData', () => ({
    useRiskData: () => ({
      causes: mockCauses,
      demographic: { label: 'Reference profile', is_default: true, sex: 'male', age_range: '30-44', ancestry: 'european' },
      loading: false,
    }),
  }))
})

async function renderComponent(props = {}) {
  const mod = await import('../components/risk/RiskLandscape')
  return render(<mod.RiskLandscape {...props} />)
}

describe('RiskLandscape — audit #6/#7/#8 framing', () => {
  it('#7 StatBox no longer says "Optimal / no risk"', async () => {
    await renderComponent()
    expect(screen.queryByText('Optimal / no risk')).not.toBeInTheDocument()
    expect(screen.getByText(/No configured flags/i)).toBeInTheDocument()
  })

  it('#7 nodata genesText uses "not assessed" wording', async () => {
    await renderComponent()
    // appears in both the legend ("Not assessed") and the nodata row genesText
    expect(screen.getAllByText(/not assessed/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/No configured gene match \/ not assessed/i)).toBeInTheDocument()
  })

  it('#6 legend describes a configured genetic flag, not actionable genetic factors', async () => {
    await renderComponent()
    expect(screen.queryByText('Actionable genetic factors')).not.toBeInTheDocument()
    expect(screen.getByText(/Configured genetic flag/i)).toBeInTheDocument()
    expect(screen.getByText(/Population share of deaths/i)).toBeInTheDocument()
  })

  it('#6 caption states it is not a calibrated risk/PRS', async () => {
    await renderComponent()
    expect(screen.getByText(/not a calibrated/i)).toBeInTheDocument()
    expect(screen.getByText(/PRS/)).toBeInTheDocument()
  })

  it('#8 copy refers to a reference profile, not "your demographic"', async () => {
    const { container } = await renderComponent()
    expect(container.textContent).not.toMatch(/your demographic/i)
    expect(container.textContent).toMatch(/reference profile/i)
  })

  it('#8 population-bar caption says configured reference share of deaths', async () => {
    await renderComponent()
    expect(screen.getByText(/configured reference share of deaths/i)).toBeInTheDocument()
  })
})
