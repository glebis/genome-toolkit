import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenomeGlyph } from '../components/GenomeGlyph'

describe('GenomeGlyph', () => {
  it('renders empty circle when no genotypes', () => {
    const { container } = render(<GenomeGlyph genotypes={[]} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    // Should have a dashed circle for empty state
    const circles = svg!.querySelectorAll('circle')
    expect(circles.length).toBe(1)
    expect(circles[0].getAttribute('stroke-dasharray')).toBe('4,3')
  })

  it('renders SVG with correct size', () => {
    const { container } = render(<GenomeGlyph genotypes={['T/T', 'A/G']} size={120} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('120')
    expect(svg?.getAttribute('height')).toBe('120')
  })

  it('renders petals and inner circles for each genotype', () => {
    const { container } = render(<GenomeGlyph genotypes={['T/T', 'A/G', 'C/C']} />)
    const svg = container.querySelector('svg')
    // 3 inner circles (inner-0, inner-1, inner-2)
    const circles = svg!.querySelectorAll('circle')
    // background circle + center dot + 3 inner = 5
    expect(circles.length).toBe(5)
    // 3 petals
    const paths = svg!.querySelectorAll('path')
    expect(paths.length).toBe(3)
  })

  it('renders label when provided', () => {
    render(<GenomeGlyph genotypes={['T/T']} label="Mental Health" />)
    expect(screen.getByText('Mental Health')).toBeInTheDocument()
  })

  it('does not render label when omitted', () => {
    const { container } = render(<GenomeGlyph genotypes={['T/T']} />)
    const spans = container.querySelectorAll('span')
    expect(spans.length).toBe(0)
  })

  it('uses default size of 80', () => {
    const { container } = render(<GenomeGlyph genotypes={['A/A']} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('80')
  })

  it('renders connecting lines between nodes', () => {
    const { container } = render(<GenomeGlyph genotypes={['T/T', 'A/G', 'C/C']} />)
    const svg = container.querySelector('svg')
    // 2 inter-node lines + 1 closing line = 3
    const lines = svg!.querySelectorAll('line')
    expect(lines.length).toBe(3)
  })

  it('does not render closing line for 2 or fewer genotypes', () => {
    const { container } = render(<GenomeGlyph genotypes={['T/T', 'A/G']} />)
    const svg = container.querySelector('svg')
    // Only 1 line between the 2 nodes, no closing line
    const lines = svg!.querySelectorAll('line')
    expect(lines.length).toBe(1)
  })
})
