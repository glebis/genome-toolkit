import { describe, it, expect } from 'vitest'
import { filterItems } from '../filtering'
import type { FilterDimension } from '../filtering'

interface Gene {
  symbol: string
  evidenceTier: string
  actionTypes: string[]
}

const GENES: Gene[] = [
  { symbol: 'COMT', evidenceTier: 'E1', actionTypes: ['discuss', 'monitor'] },
  { symbol: 'MTHFR', evidenceTier: 'E2', actionTypes: ['consider'] },
  { symbol: 'BDNF', evidenceTier: 'E1', actionTypes: ['try'] },
]

const DIMENSIONS: FilterDimension<Gene>[] = [
  { key: 'evidence', getValues: (g) => [g.evidenceTier] },
  { key: 'action', getValues: (g) => g.actionTypes },
]

describe('filterItems', () => {
  it('returns all items when no filters are active', () => {
    expect(filterItems(GENES, DIMENSIONS, {})).toHaveLength(3)
  })

  it('ignores dimensions whose value is null', () => {
    expect(filterItems(GENES, DIMENSIONS, { evidence: null, action: null })).toHaveLength(3)
  })

  it('filters by a single dimension', () => {
    const out = filterItems(GENES, DIMENSIONS, { evidence: 'E1' })
    expect(out.map((g) => g.symbol)).toEqual(['COMT', 'BDNF'])
  })

  it('matches when the item has the value among multiple', () => {
    const out = filterItems(GENES, DIMENSIONS, { action: 'monitor' })
    expect(out.map((g) => g.symbol)).toEqual(['COMT'])
  })

  it('ANDs multiple active dimensions', () => {
    const out = filterItems(GENES, DIMENSIONS, { evidence: 'E1', action: 'try' })
    expect(out.map((g) => g.symbol)).toEqual(['BDNF'])
  })

  it('returns empty when no item matches', () => {
    expect(filterItems(GENES, DIMENSIONS, { evidence: 'E5' })).toHaveLength(0)
  })
})
