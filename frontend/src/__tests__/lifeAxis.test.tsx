import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LifeExpectancyAxis, computeAxisDomain } from '../components/lifemap/LifeExpectancyAxis'
import type { CountryAnchor, BlendMarker } from '../lib/lifeBlend'

const ANCHORS: CountryAnchor[] = [
  { country: 'RU', name: 'Russia', exAtAge: 14.2, targetAge: 74.2 },
  { country: 'DE', name: 'Germany', exAtAge: 41.5, targetAge: 79.5 },
]
const BLEND: BlendMarker = { targetAge: 75.5, spread: { min: 74.2, max: 79.5 }, heuristic: true }

describe('computeAxisDomain', () => {
  it('pads to surrounding multiples of 5', () => {
    expect(computeAxisDomain(ANCHORS, BLEND)).toEqual({ min: 70, max: 85 })
  })
  it('falls back to a default span when there is no data', () => {
    expect(computeAxisDomain([], null)).toEqual({ min: 50, max: 95 })
  })
})

describe('LifeExpectancyAxis', () => {
  it('renders an svg with a tick label per country anchor', () => {
    render(<LifeExpectancyAxis anchors={ANCHORS} blend={BLEND} currentCountry="DE" />)
    expect(screen.getByText('Russia')).toBeInTheDocument()
    expect(screen.getByText('Germany')).toBeInTheDocument()
  })
  it('renders a labelled heuristic blend band', () => {
    render(<LifeExpectancyAxis anchors={ANCHORS} blend={BLEND} currentCountry="DE" />)
    expect(screen.getByLabelText(/blend spread 74\.2–79\.5/i)).toBeInTheDocument()
  })
  it('exposes the country values + heuristic blend in the svg accessible name', () => {
    render(<LifeExpectancyAxis anchors={ANCHORS} blend={BLEND} currentCountry="DE" />)
    const svg = screen.getByRole('img')
    const label = svg.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/Russia/)
    expect(label).toMatch(/74\.2/)
    expect(label).toMatch(/Germany/)
    expect(label).toMatch(/79\.5/)
    expect(label).toMatch(/heuristic/i)
  })
  it('renders nothing when there are no anchors', () => {
    const { container } = render(<LifeExpectancyAxis anchors={[]} blend={null} currentCountry="" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
