import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GeneCard } from '../components/mental-health/GeneCard'
import type { GeneData } from '../types/genomics'

const mockGene: GeneData = {
  symbol: 'MTHFR',
  variant: 'C677T',
  rsid: 'rs1801133',
  genotype: 'T/T',
  status: 'actionable',
  evidenceTier: 'E2',
  studyCount: 12,
  description: 'Reduced folate conversion. T/T homozygous — ~30% enzyme activity.',
  actionCount: 2,
  categories: ['mood'],
  pathway: 'Methylation Pathway',
}

describe('GeneCard', () => {
  it('renders gene name and variant', () => {
    render(<GeneCard gene={mockGene} />)
    expect(screen.getByText('MTHFR')).toBeInTheDocument()
    expect(screen.getByText(/C677T/)).toBeInTheDocument()
    expect(screen.getByText(/rs1801133/)).toBeInTheDocument()
  })

  it('renders description', () => {
    render(<GeneCard gene={mockGene} />)
    expect(screen.getByText(/Reduced folate conversion/)).toBeInTheDocument()
  })

  it('renders action count for actionable genes', () => {
    render(<GeneCard gene={mockGene} />)
    expect(screen.getByText('2 actions available')).toBeInTheDocument()
  })

  it('does not render action count for optimal genes with zero actions', () => {
    const optimal = { ...mockGene, status: 'optimal' as const, actionCount: 0 }
    render(<GeneCard gene={optimal} />)
    expect(screen.queryByText(/actions available/)).not.toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<GeneCard gene={mockGene} onClick={onClick} />)
    fireEvent.click(screen.getByText('MTHFR'))
    expect(onClick).toHaveBeenCalledWith(mockGene)
  })

  it('renders evidence badge', () => {
    render(<GeneCard gene={mockGene} />)
    expect(screen.getByText('E2 STRONG')).toBeInTheDocument()
  })
})
