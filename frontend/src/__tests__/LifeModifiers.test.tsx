import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LifeModifiers } from '../components/lifemap/LifeModifiers'
import type { LifeModifier } from '../hooks/useLifeMap'

const MODS: LifeModifier[] = [
  { id: 'physical-inactivity', category: 'stress', label: 'Low activity', qualitative: 'Movement helps', actions: ['Move more'], evidence: 'strong', range: { lowYears: 2, highYears: 5 } },
  { id: 'anxiety', category: 'mental-health', label: 'Anxiety disorder', qualitative: 'Supportive note here', actions: ['Keep your tools'], evidence: 'weak' },
]

describe('LifeModifiers', () => {
  it('shows qualitative text for all modifiers by default, no numbers', () => {
    render(<LifeModifiers modifiers={MODS} />)
    expect(screen.getByText('Movement helps')).toBeInTheDocument()
    expect(screen.getByText('Supportive note here')).toBeInTheDocument()
    expect(screen.queryByText(/2–5 years/)).not.toBeInTheDocument()
  })

  it('reveals a caveated range only after opting in, for strong-evidence items', () => {
    render(<LifeModifiers modifiers={MODS} />)
    fireEvent.click(screen.getByRole('button', { name: /show range/i }))
    expect(screen.getByText(/2–5 years/)).toBeInTheDocument()
    // caveat is split across <strong> tags — assert both reassurance fragments
    expect(screen.getByText(/population-level/i)).toBeInTheDocument()
    expect(screen.getByText(/not you/i)).toBeInTheDocument()
  })

  it('never offers a range for mental-health / weak-evidence items', () => {
    render(<LifeModifiers modifiers={[MODS[1]]} />)
    expect(screen.queryByRole('button', { name: /show range/i })).not.toBeInTheDocument()
  })

  it('groups modifiers by category', () => {
    render(<LifeModifiers modifiers={MODS} />)
    expect(screen.getByText(/mental.?health/i)).toBeInTheDocument()
  })
})
