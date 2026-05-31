import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LifeMapGlyph } from '../components/lifemap/LifeMapGlyph'

describe('LifeMapGlyph', () => {
  it('renders an svg of the requested size', () => {
    const { container } = render(<LifeMapGlyph countries={['RU', 'DE']} size={100} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('width')).toBe('100')
    expect(svg?.getAttribute('height')).toBe('100')
  })

  it('is deterministic — same countries produce identical markup', () => {
    const a = render(<LifeMapGlyph countries={['RU', 'DE']} size={80} />).container.innerHTML
    const b = render(<LifeMapGlyph countries={['RU', 'DE']} size={80} />).container.innerHTML
    expect(a).toBe(b)
  })

  it('renders an anchor node per country (migration metaphor, not genome)', () => {
    const { container } = render(<LifeMapGlyph countries={['RU', 'DE', 'NL']} size={80} />)
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3)
  })

  it('renders gracefully with no countries', () => {
    const { container } = render(<LifeMapGlyph countries={[]} size={80} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
