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
})
