import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GeneDetail } from '../components/mental-health/GeneDetail'
import type { GeneData, ActionData } from '../types/genomics'

const mockGene: GeneData = {
  symbol: 'MTHFR', variant: 'C677T', rsid: 'rs1801133',
  chromosome: '1', position: 11856378, genotype: 'T/T',
  status: 'actionable', evidenceTier: 'E2', studyCount: 12,
  description: 'Reduced folate conversion.',
  actionCount: 2, categories: ['mood'], pathway: 'Methylation',
}

const mockActions: ActionData[] = [
  {
    id: 'a1', type: 'consider', title: 'Methylfolate supplementation',
    description: 'L-methylfolate bypasses the MTHFR conversion step.',
    detail: 'Form: L-methylfolate. Starting dose: 400-800 mcg/day.',
    evidenceTier: 'E2', studyCount: 12, tags: ['supplement'],
    geneSymbol: 'MTHFR', done: false,
  },
  {
    id: 'a2', type: 'monitor', title: 'Test homocysteine levels',
    description: 'Homocysteine is the best biomarker for methylation function.',
    evidenceTier: 'E1', studyCount: 20, tags: ['bloodwork'],
    geneSymbol: 'MTHFR', done: false,
  },
]

describe('GeneDetail', () => {
  it('renders gene header', () => {
    render(<GeneDetail gene={mockGene} actions={mockActions} onClose={vi.fn()} onToggleAction={vi.fn()} />)
    expect(screen.getByText('MTHFR')).toBeInTheDocument()
    expect(screen.getByText(/C677T/)).toBeInTheDocument()
    expect(screen.getByText(/rs1801133/)).toBeInTheDocument()
  })

  it('renders genotype display', () => {
    render(<GeneDetail gene={mockGene} actions={mockActions} onClose={vi.fn()} onToggleAction={vi.fn()} />)
    expect(screen.getByText('T/T')).toBeInTheDocument()
  })

  it('renders population info when provided', () => {
    render(<GeneDetail gene={mockGene} actions={mockActions} populationInfo="~10% of Europeans carry T/T" onClose={vi.fn()} onToggleAction={vi.fn()} />)
    expect(screen.getByText(/10% of Europeans/)).toBeInTheDocument()
  })

  it('renders explanation when provided', () => {
    render(<GeneDetail gene={mockGene} actions={mockActions} explanation="MTHFR converts dietary folate." onClose={vi.fn()} onToggleAction={vi.fn()} />)
    expect(screen.getByText(/converts dietary folate/)).toBeInTheDocument()
  })

  it('renders action cards', () => {
    render(<GeneDetail gene={mockGene} actions={mockActions} onClose={vi.fn()} onToggleAction={vi.fn()} />)
    expect(screen.getByText('Methylfolate supplementation')).toBeInTheDocument()
    expect(screen.getByText('Test homocysteine levels')).toBeInTheDocument()
  })

  it('renders interactions when provided', () => {
    const interactions = [{ genes: 'MTHFR + COMT', description: 'Methylation bottleneck' }]
    render(<GeneDetail gene={mockGene} actions={mockActions} interactions={interactions} onClose={vi.fn()} onToggleAction={vi.fn()} />)
    expect(screen.getByText('MTHFR + COMT')).toBeInTheDocument()
    expect(screen.getByText('Methylation bottleneck')).toBeInTheDocument()
  })

  it('calls onClose when close clicked', () => {
    const onClose = vi.fn()
    render(<GeneDetail gene={mockGene} actions={mockActions} onClose={onClose} onToggleAction={vi.fn()} />)
    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders add-to-checklist buttons for actions', () => {
    render(<GeneDetail gene={mockGene} actions={mockActions} onClose={vi.fn()} onToggleAction={vi.fn()} />)
    const addButtons = screen.getAllByTitle('Add to checklist')
    expect(addButtons.length).toBeGreaterThanOrEqual(2)
  })
})
