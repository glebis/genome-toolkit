import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NarrativeBlock } from '../components/mental-health/NarrativeBlock'
import type { NarrativeData } from '../types/genomics'

const mockNarrative: NarrativeData = {
  pathway: 'Methylation Pathway',
  status: 'actionable',
  body: 'Your methylation cycle runs at reduced capacity.',
  priority: 'Priority: methylation support',
  hint: 'Consider methylfolate + monitor homocysteine',
  geneCount: 2,
  actionCount: 3,
}

describe('NarrativeBlock', () => {
  it('renders pathway label', () => {
    render(<NarrativeBlock narrative={mockNarrative} />)
    expect(screen.getByText('Methylation Pathway')).toBeInTheDocument()
  })

  it('renders body text', () => {
    render(<NarrativeBlock narrative={mockNarrative} />)
    expect(screen.getByText(/reduced capacity/)).toBeInTheDocument()
  })

  it('renders priority and hint', () => {
    render(<NarrativeBlock narrative={mockNarrative} />)
    expect(screen.getByText(/methylation support/)).toBeInTheDocument()
    expect(screen.getByText(/methylfolate/)).toBeInTheDocument()
  })

  it('renders gene and action counts', () => {
    render(<NarrativeBlock narrative={mockNarrative} />)
    expect(screen.getByText('2 GENES / 3 ACTIONS')).toBeInTheDocument()
  })
})
