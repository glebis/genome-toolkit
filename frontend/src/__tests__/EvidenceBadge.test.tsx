import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvidenceBadge } from '../components/mental-health/EvidenceBadge'

describe('EvidenceBadge', () => {
  it('renders tier and label', () => {
    render(<EvidenceBadge tier="E2" />)
    expect(screen.getByText('E2 STRONG')).toBeInTheDocument()
  })

  it('renders with study count', () => {
    render(<EvidenceBadge tier="E2" studyCount={12} />)
    expect(screen.getByText('E2 STRONG')).toBeInTheDocument()
    expect(screen.getByText('12 studies')).toBeInTheDocument()
  })

  it('renders all tier labels correctly', () => {
    const { rerender } = render(<EvidenceBadge tier="E1" />)
    expect(screen.getByText('E1 GOLD STANDARD')).toBeInTheDocument()

    rerender(<EvidenceBadge tier="E3" />)
    expect(screen.getByText('E3 MODERATE')).toBeInTheDocument()
  })

  it('renders E4 PRELIMINARY tier', () => {
    render(<EvidenceBadge tier="E4" />)
    expect(screen.getByText('E4 PRELIMINARY')).toBeInTheDocument()
  })

  it('renders E5 THEORETICAL tier', () => {
    render(<EvidenceBadge tier="E5" />)
    expect(screen.getByText('E5 THEORETICAL')).toBeInTheDocument()
  })

  it('renders singular study count as "1 studies"', () => {
    render(<EvidenceBadge tier="E1" studyCount={1} />)
    expect(screen.getByText('1 studies')).toBeInTheDocument()
  })

  it('renders plural study count as "5 studies"', () => {
    render(<EvidenceBadge tier="E2" studyCount={5} />)
    expect(screen.getByText('5 studies')).toBeInTheDocument()
  })

  it('does not render study count when undefined', () => {
    render(<EvidenceBadge tier="E3" />)
    expect(screen.queryByText(/studies/)).not.toBeInTheDocument()
  })

  it('renders study count of 0', () => {
    render(<EvidenceBadge tier="E1" studyCount={0} />)
    expect(screen.getByText('0 studies')).toBeInTheDocument()
  })
})
