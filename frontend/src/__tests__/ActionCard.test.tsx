import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionCard } from '../components/mental-health/ActionCard'
import type { ActionData } from '../types/genomics'

const mockAction: ActionData = {
  id: 'mthfr-methylfolate',
  type: 'consider',
  title: 'Methylfolate supplementation',
  description: 'L-methylfolate bypasses the MTHFR conversion step. Start low and increase gradually.',
  detail: 'Form: L-methylfolate (Metafolin). Starting dose: 400-800 mcg/day. Note: If you experience irritability, switch to folinic acid.',
  evidenceTier: 'E2',
  studyCount: 12,
  tags: ['supplement', 'COMT interaction'],
  geneSymbol: 'MTHFR',
  done: false,
}

describe('ActionCard', () => {
  it('renders action type badge and title', () => {
    render(<ActionCard action={mockAction} onToggleDone={vi.fn()} />)
    expect(screen.getByText('Consider')).toBeInTheDocument()
    expect(screen.getByText('Methylfolate supplementation')).toBeInTheDocument()
  })

  it('renders description', () => {
    render(<ActionCard action={mockAction} onToggleDone={vi.fn()} />)
    expect(screen.getByText(/L-methylfolate bypasses/)).toBeInTheDocument()
  })

  it('hides detail by default', () => {
    render(<ActionCard action={mockAction} onToggleDone={vi.fn()} />)
    expect(screen.queryByText(/Starting dose/)).not.toBeInTheDocument()
  })

  it('shows detail when expanded', () => {
    render(<ActionCard action={mockAction} onToggleDone={vi.fn()} />)
    fireEvent.click(screen.getByText('Methylfolate supplementation'))
    expect(screen.getByText(/Starting dose/)).toBeInTheDocument()
  })

  it('renders evidence tags', () => {
    render(<ActionCard action={mockAction} onToggleDone={vi.fn()} />)
    expect(screen.getByText(/E2/)).toBeInTheDocument()
    expect(screen.getByText(/12 studies/)).toBeInTheDocument()
    expect(screen.getByText('supplement')).toBeInTheDocument()
  })

  it('calls onToggleDone when checkbox clicked', () => {
    const onToggle = vi.fn()
    render(<ActionCard action={mockAction} onToggleDone={onToggle} />)
    fireEvent.click(screen.getByTitle('Mark as done'))
    expect(onToggle).toHaveBeenCalledWith('mthfr-methylfolate')
  })

  it('shows done state visually', () => {
    const doneAction = { ...mockAction, done: true }
    render(<ActionCard action={doneAction} onToggleDone={vi.fn()} />)
    // The checkbox should show a checkmark or filled state
    expect(screen.getByTitle('Completed')).toBeInTheDocument()
  })
})
