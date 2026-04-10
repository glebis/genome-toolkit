import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChecklistSidebar } from '../components/mental-health/ChecklistSidebar'
import type { ChecklistItem } from '../hooks/useChecklist'

const mockItems: ChecklistItem[] = [
  { id: '1', gene_symbol: 'MTHFR', action_type: 'consider', title: 'Take methylfolate', done: false, done_at: null, notes: null, practical_category: 'supplement', health_domain: 'mood', created_at: '' },
  { id: '2', gene_symbol: 'COMT', action_type: 'monitor', title: 'Track stress levels', done: true, done_at: '2026-01-10', notes: null, practical_category: 'lifestyle', health_domain: 'stress', created_at: '' },
]

const defaultProps = {
  grouped: { consider: [mockItems[0]], monitor: [mockItems[1]] },
  groupBy: 'evidence' as const,
  filterStatus: 'all' as const,
  pendingCount: 1,
  doneCount: 1,
  totalCount: 2,
  uniqueGenes: ['MTHFR', 'COMT'],
  onSetGroupBy: vi.fn(),
  onSetFilterStatus: vi.fn(),
  onToggleDone: vi.fn(),
  onDelete: vi.fn(),
  onAdd: vi.fn(),
  onClose: vi.fn(),
  onExport: vi.fn(),
  onResearchPrompt: vi.fn(),
}

describe('ChecklistSidebar', () => {
  it('renders header with counts', () => {
    render(<ChecklistSidebar {...defaultProps} />)
    expect(screen.getByText('Action Checklist')).toBeInTheDocument()
    expect(screen.getByText('2 items / 1 done')).toBeInTheDocument()
  })

  it('renders group-by buttons', () => {
    render(<ChecklistSidebar {...defaultProps} />)
    expect(screen.getByText('Evidence')).toBeInTheDocument()
    expect(screen.getByText('Gene')).toBeInTheDocument()
    expect(screen.getByText('Domain')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('calls onSetGroupBy when group button clicked', () => {
    const onSetGroupBy = vi.fn()
    render(<ChecklistSidebar {...defaultProps} onSetGroupBy={onSetGroupBy} />)
    fireEvent.click(screen.getByText('Gene'))
    expect(onSetGroupBy).toHaveBeenCalledWith('gene')
  })

  it('renders filter buttons', () => {
    render(<ChecklistSidebar {...defaultProps} />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('calls onSetFilterStatus when filter clicked', () => {
    const onSetFilter = vi.fn()
    render(<ChecklistSidebar {...defaultProps} onSetFilterStatus={onSetFilter} />)
    fireEvent.click(screen.getByText('Pending'))
    expect(onSetFilter).toHaveBeenCalledWith('pending')
  })

  it('renders checklist items with titles', () => {
    render(<ChecklistSidebar {...defaultProps} />)
    expect(screen.getByText('Take methylfolate')).toBeInTheDocument()
    expect(screen.getByText('Track stress levels')).toBeInTheDocument()
  })

  it('renders gene symbols for non-custom items', () => {
    render(<ChecklistSidebar {...defaultProps} />)
    expect(screen.getByText('MTHFR')).toBeInTheDocument()
    expect(screen.getByText('COMT')).toBeInTheDocument()
  })

  it('calls onClose when ESC button clicked', () => {
    const onClose = vi.fn()
    render(<ChecklistSidebar {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('ESC'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders add input', () => {
    render(<ChecklistSidebar {...defaultProps} />)
    expect(screen.getByPlaceholderText('+ Add action item...')).toBeInTheDocument()
  })

  it('calls onAdd when Enter pressed in input', () => {
    const onAdd = vi.fn()
    render(<ChecklistSidebar {...defaultProps} onAdd={onAdd} />)
    const input = screen.getByPlaceholderText('+ Add action item...')
    fireEvent.change(input, { target: { value: 'New item' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith('New item')
  })

  it('does not call onAdd for empty input', () => {
    const onAdd = vi.fn()
    render(<ChecklistSidebar {...defaultProps} onAdd={onAdd} />)
    const input = screen.getByPlaceholderText('+ Add action item...')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('shows empty state when no items', () => {
    render(<ChecklistSidebar {...defaultProps} grouped={{}} />)
    expect(screen.getByText(/No items yet/)).toBeInTheDocument()
  })

  it('renders collapsible actions section', () => {
    render(<ChecklistSidebar {...defaultProps} />)
    // Actions section collapsed by default
    expect(screen.getByText('Actions')).toBeInTheDocument()
    // Click to expand
    fireEvent.click(screen.getByText('Actions'))
    expect(screen.getByText('Print for doctor')).toBeInTheDocument()
    expect(screen.getByText('Print for prescriber')).toBeInTheDocument()
  })
})
