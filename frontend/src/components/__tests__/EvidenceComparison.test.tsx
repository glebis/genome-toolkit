import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EvidenceComparison } from '../EvidenceComparison'

const BASE_PROPS = {
  significance: null,
  mvSignificance: null,
  alleleFreq: null,
  alleleFreqSource: null,
  disease: null,
  reviewStatus: null,
  geneSymbol: null,
}

describe('EvidenceComparison', () => {
  it('returns null when neither source has significance', () => {
    const { container } = render(<EvidenceComparison {...BASE_PROPS} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders collapsed by default with COMPARE SOURCES link', () => {
    render(<EvidenceComparison {...BASE_PROPS} significance="Pathogenic" />)
    expect(screen.getByText('COMPARE SOURCES [+]')).toBeTruthy()
    expect(screen.queryByText('CLINVAR')).toBeNull()
  })

  it('expands on click and shows columns', () => {
    render(<EvidenceComparison {...BASE_PROPS} significance="Pathogenic" mvSignificance="Pathogenic" />)
    fireEvent.click(screen.getByText('COMPARE SOURCES [+]'))
    expect(screen.getByText('CLINVAR')).toBeTruthy()
    expect(screen.getByText('MYVARIANT')).toBeTruthy()
  })

  it('collapses on second click', () => {
    render(<EvidenceComparison {...BASE_PROPS} significance="Pathogenic" />)
    fireEvent.click(screen.getByText('COMPARE SOURCES [+]'))
    expect(screen.getByText('CLINVAR')).toBeTruthy()
    fireEvent.click(screen.getByText('COMPARE SOURCES [-]'))
    expect(screen.queryByText('CLINVAR')).toBeNull()
  })

  it('shows SOURCES AGREE when significances match', () => {
    render(<EvidenceComparison {...BASE_PROPS} significance="Pathogenic" mvSignificance="pathogenic" />)
    fireEvent.click(screen.getByText('COMPARE SOURCES [+]'))
    expect(screen.getByText('SOURCES AGREE')).toBeTruthy()
  })

  it('shows SOURCES DISAGREE when significances differ', () => {
    render(<EvidenceComparison {...BASE_PROPS} significance="Pathogenic" mvSignificance="Benign" />)
    fireEvent.click(screen.getByText('COMPARE SOURCES [+]'))
    expect(screen.getByText('SOURCES DISAGREE')).toBeTruthy()
  })

  it('shows PARTIAL DATA when only one source has significance', () => {
    render(<EvidenceComparison {...BASE_PROPS} significance="Pathogenic" />)
    fireEvent.click(screen.getByText('COMPARE SOURCES [+]'))
    expect(screen.getByText('PARTIAL DATA')).toBeTruthy()
  })

  it('displays -- for missing fields', () => {
    render(<EvidenceComparison {...BASE_PROPS} significance="Pathogenic" />)
    fireEvent.click(screen.getByText('COMPARE SOURCES [+]'))
    const dashes = screen.getAllByText('--')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('displays disease and review status under ClinVar column', () => {
    render(<EvidenceComparison {...BASE_PROPS} significance="Pathogenic" disease="Alzheimer disease" reviewStatus="criteria provided" />)
    fireEvent.click(screen.getByText('COMPARE SOURCES [+]'))
    expect(screen.getByText('Alzheimer disease')).toBeTruthy()
    expect(screen.getByText('criteria provided')).toBeTruthy()
  })

  it('displays gene symbol under MyVariant column', () => {
    render(<EvidenceComparison {...BASE_PROPS} significance="Pathogenic" geneSymbol="BRCA1" />)
    fireEvent.click(screen.getByText('COMPARE SOURCES [+]'))
    expect(screen.getByText('BRCA1')).toBeTruthy()
  })
})
