import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GeneCrossRefBadges } from '../components/common/GeneCrossRefBadges'

// Mock the data hook so the component test needs no network.
const sectionsBySymbol: Record<string, string[]> = {
  COMT: ['addiction', 'mental-health', 'risk'],
  CYP2D6: ['pgx', 'risk'],
  LONELY: ['mental-health'],
}

vi.mock('../hooks/useGeneSections', () => ({
  useGeneSections: () => ({
    loading: false,
    getSectionsForGene: (symbol: string) => sectionsBySymbol[symbol.toUpperCase()] ?? [],
  }),
}))

describe('GeneCrossRefBadges', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('renders a badge for each other section, excluding the current one', () => {
    render(<GeneCrossRefBadges symbol="COMT" currentSection="mental-health" />)
    // current section (MH) excluded; addiction + risk shown
    expect(screen.getByText('Addiction')).toBeInTheDocument()
    expect(screen.getByText('Risk')).toBeInTheDocument()
    expect(screen.queryByText('MH')).not.toBeInTheDocument()
  })

  it('uses short labels (MH, PGx)', () => {
    render(<GeneCrossRefBadges symbol="CYP2D6" currentSection="risk" />)
    expect(screen.getByText('PGx')).toBeInTheDocument()
    expect(screen.queryByText('Risk')).not.toBeInTheDocument()
  })

  it('renders nothing when the gene has no other sections', () => {
    const { container } = render(
      <GeneCrossRefBadges symbol="LONELY" currentSection="mental-health" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an unknown gene', () => {
    const { container } = render(
      <GeneCrossRefBadges symbol="ZZZ9" currentSection="pgx" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('navigates by setting the location hash on click', () => {
    render(<GeneCrossRefBadges symbol="COMT" currentSection="mental-health" />)
    fireEvent.click(screen.getByText('Risk'))
    expect(window.location.hash).toBe('#/risk')
  })

  it('navigates to addiction with the correct hash', () => {
    render(<GeneCrossRefBadges symbol="COMT" currentSection="mental-health" />)
    fireEvent.click(screen.getByText('Addiction'))
    expect(window.location.hash).toBe('#/addiction')
  })
})
