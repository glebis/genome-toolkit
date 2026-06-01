import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LifeModifiers } from '../components/lifemap/LifeModifiers'
import type { LifeModifier } from '../hooks/useLifeMap'

const AVAILABLE: LifeModifier[] = [
  { id: 'physical-inactivity', category: 'stress', label: 'Low activity', qualitative: 'Movement helps', actions: ['Move more'], evidence: 'strong', range: { lowYears: 2, highYears: 5 } },
  { id: 'anxiety', category: 'mental-health', label: 'Anxiety disorder', qualitative: 'Supportive note here', actions: ['Keep your tools'], evidence: 'weak' },
]

describe('LifeModifiers (user-selectable)', () => {
  it('renders a selectable toggle for every available factor', () => {
    render(<LifeModifiers available={AVAILABLE} selectedIds={[]} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Low activity/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Anxiety disorder/i })).toBeInTheDocument()
  })

  it('shows a prompt and NO detail cards when nothing is selected', () => {
    render(<LifeModifiers available={AVAILABLE} selectedIds={[]} onToggle={vi.fn()} />)
    expect(screen.getByText(/select any factors that apply to you/i)).toBeInTheDocument()
    expect(screen.queryByText('Movement helps')).not.toBeInTheDocument()
  })

  it('calls onToggle with the factor id when a toggle is clicked', () => {
    const onToggle = vi.fn()
    render(<LifeModifiers available={AVAILABLE} selectedIds={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /Low activity/i }))
    expect(onToggle).toHaveBeenCalledWith('physical-inactivity')
  })

  it('shows the detail card only for selected factors', () => {
    render(<LifeModifiers available={AVAILABLE} selectedIds={['physical-inactivity']} onToggle={vi.fn()} />)
    expect(screen.getByText('Movement helps')).toBeInTheDocument()
    expect(screen.queryByText('Supportive note here')).not.toBeInTheDocument()
  })

  it('offers an opt-in range only for selected strong-evidence factors', () => {
    render(<LifeModifiers available={AVAILABLE} selectedIds={['physical-inactivity']} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /show range/i }))
    expect(screen.getByText(/2–5 years/)).toBeInTheDocument()
    expect(screen.getByText(/not you/i)).toBeInTheDocument()
  })

  it('never offers a range for a selected mental-health factor', () => {
    render(<LifeModifiers available={AVAILABLE} selectedIds={['anxiety']} onToggle={vi.fn()} />)
    expect(screen.getByText('Supportive note here')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show range/i })).not.toBeInTheDocument()
  })
})
