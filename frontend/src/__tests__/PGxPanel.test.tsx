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
        category: 'prescription', evidenceScope: 'guideline',
      },
      {
        drugClass: 'Codeine', impact: 'danger', statusText: 'Avoid',
        description: 'Cannot convert codeine.', drugList: 'codeine, tramadol',
        dangerNote: 'Codeine will not provide pain relief.',
        category: 'prescription', evidenceScope: 'label',
      },
      {
        drugClass: 'Cannabis', impact: 'adjust', statusText: 'Slower processing',
        description: 'THC breakdown affected.', drugList: 'THC, CBD',
        category: 'substance', evidenceScope: 'harm_reduction',
        dangerNote: 'Edibles hit harder; start low.',
      },
    ],
  },
  {
    enzyme: {
      symbol: 'CYP3A4', alleles: 'unknown', status: 'unknown',
      position: 50, description: 'Broad metabolism note.',
      geneType: 'enzyme',
      // no guideline configured → must NOT claim CPIC backing
    },
    drugs: [],
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
    expect(screen.getByText(/2 enzymes.*1 substances/)).toBeInTheDocument()
  })

  it('shows guideline-backed wording (with real name, no hardcoded year) when a guideline is configured', async () => {
    await renderComponent()
    // The CYP2D6 section has guideline 'CPIC'.
    expect(screen.getByText(/Guideline-backed: CPIC/)).toBeInTheDocument()
    // No false hardcoded year claim.
    expect(screen.queryByText(/\(2025\)/)).not.toBeInTheDocument()
  })

  it('shows exploratory wording when no guideline is configured', async () => {
    await renderComponent()
    // The CYP3A4 section has no guideline → must be labeled exploratory / not guideline-backed.
    expect(screen.getByText(/Exploratory metabolism note\. Not guideline-backed/)).toBeInTheDocument()
  })

  it('never falsely claims CPIC backing for a section with no configured guideline', async () => {
    await renderComponent()
    // Old behavior rendered "Based on CPIC guidelines (2025)" for every section.
    expect(screen.queryByText(/Based on CPIC guidelines/)).not.toBeInTheDocument()
  })

  it('renders a scope badge per drug card', async () => {
    await renderComponent()
    // guideline-scoped SSRIs card
    expect(screen.getByText('Guideline-backed PGx')).toBeInTheDocument()
    // label-scoped Codeine card
    expect(screen.getByText('Drug-label biomarker')).toBeInTheDocument()
    // harm_reduction-scoped Cannabis card — kept and clearly relabeled
    expect(screen.getByText('Harm-reduction note, not genotype-backed dosing')).toBeInTheDocument()
  })

  it('keeps the harm-reduction card visible by default (not hidden behind a filter)', async () => {
    await renderComponent()
    // filter defaults to 'all'; the harm_reduction substance card must be present.
    expect(screen.getByText('Cannabis')).toBeInTheDocument()
  })

  it('groups non-guideline/label scopes under a "not genotype-backed dosing" label', async () => {
    await renderComponent()
    // Exact group header (distinct from the per-card harm-reduction badge text).
    expect(screen.getByText('Not genotype-backed dosing')).toBeInTheDocument()
  })

  it('only applies prescriber framing to guideline/label scopes', async () => {
    await renderComponent()
    // The harm_reduction Cannabis card has a dangerNote but must NOT use
    // the prescriber-discussion header reserved for guideline/label drugs.
    expect(screen.getByText('Interaction warning')).toBeInTheDocument()
    // prescriber-only header text still present for the guideline/label prescription card (Codeine)
    expect(screen.getByText('Discuss with prescriber')).toBeInTheDocument()
  })
})
