import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockSections = [
  {
    enzyme: {
      symbol: 'CYP2D6', alleles: '*1/*4', status: 'intermediate',
      position: 30, description: 'Reduced CYP2D6 metabolism.',
      guideline: 'CPIC', geneType: 'enzyme',
      about: 'CYP2D6 metabolizes about 25% of all drugs.',
    },
    drugs: [
      {
        drugClass: 'SSRIs', impact: 'adjust', statusText: 'Dose adjustment needed',
        description: 'Reduced metabolism.', drugList: 'fluoxetine, paroxetine',
        category: 'prescription',
      },
      {
        drugClass: 'Codeine', impact: 'danger', statusText: 'Avoid',
        description: 'Cannot convert codeine.', drugList: 'codeine, tramadol',
        dangerNote: 'Codeine will not provide pain relief.',
        category: 'prescription',
      },
      {
        drugClass: 'Cannabis', impact: 'adjust', statusText: 'Slower processing',
        description: 'THC breakdown affected.', drugList: 'THC, CBD',
        category: 'substance',
      },
    ],
  },
]

const mockSubstances = [
  {
    name: 'Alcohol', status: 'Caution', statusColor: 'var(--sig-risk)',
    borderColor: 'var(--sig-risk)', description: 'Altered metabolism.',
    genes: 'ADH1B', relevantEnzymes: ['CYP2E1'],
    harmTitle: 'Harm reduction', harmText: 'Limit intake.',
  },
]

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doMock('../hooks/usePGxData', () => ({
    usePGxData: () => ({ sections: mockSections, loading: false }),
  }))
  vi.doMock('../hooks/useSubstancesData', () => ({
    useSubstancesData: () => ({ substances: mockSubstances, loading: false }),
  }))
  // Mock window.print
  window.print = vi.fn()
})

async function renderComponent(props = {}) {
  const mod = await import('../components/pgx/PGxPanel')
  return render(<mod.PGxPanel {...props} />)
}

describe('PGxPanel', () => {
  it('renders title', async () => {
    await renderComponent()
    expect(screen.getByText('PGx / Drug Metabolism')).toBeInTheDocument()
  })

  it('renders enzyme header with symbol and alleles', async () => {
    await renderComponent()
    expect(screen.getByText('CYP2D6')).toBeInTheDocument()
    expect(screen.getByText('*1/*4')).toBeInTheDocument()
  })

  it('renders guideline badge', async () => {
    await renderComponent()
    expect(screen.getByText('CPIC GUIDELINE')).toBeInTheDocument()
  })

  it('renders metabolizer bar', async () => {
    await renderComponent()
    expect(screen.getByText('Intermediate Metabolizer')).toBeInTheDocument()
  })

  it('renders drug cards', async () => {
    await renderComponent()
    expect(screen.getByText('SSRIs')).toBeInTheDocument()
    expect(screen.getByText('Codeine')).toBeInTheDocument()
  })

  it('renders prescription and substance sections', async () => {
    await renderComponent()
    expect(screen.getByText('Prescription medications')).toBeInTheDocument()
    // "Substances" appears in filter chip and section header
    expect(screen.getAllByText('Substances').length).toBeGreaterThanOrEqual(1)
  })

  it('renders danger note for codeine', async () => {
    await renderComponent()
    expect(screen.getByText(/Codeine will not provide pain relief/)).toBeInTheDocument()
  })

  it('renders filter chips', async () => {
    await renderComponent()
    expect(screen.getByText('All enzymes')).toBeInTheDocument()
    expect(screen.getByText('Safety notes only')).toBeInTheDocument()
  })

  it('renders substances section', async () => {
    await renderComponent()
    expect(screen.getByText('Substances & Harm Reduction')).toBeInTheDocument()
    expect(screen.getByText('Alcohol')).toBeInTheDocument()
    expect(screen.getByText('Caution')).toBeInTheDocument()
  })

  it('expands substance details on click', async () => {
    await renderComponent()
    fireEvent.click(screen.getByText('Alcohol'))
    expect(screen.getByText('Altered metabolism.')).toBeInTheDocument()
    expect(screen.getByText('Harm reduction')).toBeInTheDocument()
    expect(screen.getByText('Limit intake.')).toBeInTheDocument()
  })

  it('shows enzyme about section on click', async () => {
    await renderComponent()
    fireEvent.click(screen.getByText(/what does this do/))
    expect(screen.getByText(/metabolizes about 25% of all drugs/)).toBeInTheDocument()
  })

  it('renders disclaimer', async () => {
    await renderComponent()
    expect(screen.getByText(/not medical advice/)).toBeInTheDocument()
  })

  it('renders footer with enzyme and substance counts', async () => {
    await renderComponent()
    expect(screen.getByText(/1 enzymes.*1 substances/)).toBeInTheDocument()
  })
})
