import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the data hook so the view test is deterministic and offline.
const lifeMapReturn = {
  anchors: [
    { country: 'DE', name: 'Germany', exAtAge: 41.9, targetAge: 79.9 },
    { country: 'RU', name: 'Russia', exAtAge: 14.0, targetAge: 74.0 },
  ],
  blend: { targetAge: 78.0, spread: { min: 74.0, max: 79.9 }, heuristic: true as const },
  modifiers: [],
  table: { retrieved: 'x', countries: { DE: { name: 'Germany', source: 's', ex_by_age: { male: {}, female: {} } }, RU: { name: 'Russia', source: 's', ex_by_age: { male: {}, female: {} } } } },
  loading: false,
  error: null,
}

vi.mock('../hooks/useLifeMap', () => ({ useLifeMap: () => lifeMapReturn }))
vi.mock('../hooks/useResidenceHistory', () => ({
  RESIDENCE_STORAGE_KEY: 'genome_residence_history',
  useResidenceHistory: () => ({
    state: { residences: [{ country: 'DE', years: 5 }, { country: 'RU', years: 33 }], currentCountry: 'DE', sex: 'male', age: 38 },
    addResidence: vi.fn(), updateResidence: vi.fn(), removeResidence: vi.fn(),
    setCurrentCountry: vi.fn(), setSex: vi.fn(), setAge: vi.fn(),
  }),
}))

import { LifeMap } from '../components/lifemap/LifeMap'

describe('LifeMap', () => {
  beforeEach(() => { lifeMapReturn.loading = false })

  it('shows each country anchor as the primary truth', () => {
    render(<LifeMap />)
    // Country names appear in both the input row and the anchor card — both are intended.
    expect(screen.getAllByText(/Germany/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Russia/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/79\.9/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/74\.0/).length).toBeGreaterThan(0)
  })

  it('labels the blended marker as a heuristic, never "your life expectancy"', () => {
    render(<LifeMap />)
    expect(screen.getAllByText(/heuristic/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/your life expectancy/i)).not.toBeInTheDocument()
  })

  it('shows the honesty disclaimer about period life expectancy', () => {
    render(<LifeMap />)
    expect(screen.getByText(/period life expectancy/i)).toBeInTheDocument()
  })

  it('renders a loading state', () => {
    lifeMapReturn.loading = true
    render(<LifeMap />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
