import { describe, it, expect } from 'vitest'
import { extractAllDrugNames } from '../hooks/usePGxData'

describe('extractAllDrugNames', () => {
  it('extracts generic names, brand names, and full strings', () => {
    const config = [{
      symbol: 'CYP2D6',
      drug_cards: [{
        category: 'drug',
        drugs: 'Fluoxetine (Prozac), Paroxetine (Paxil), Fluvoxamine',
      }],
    }] as any

    const names = extractAllDrugNames(config)
    expect(names).toContain('Fluoxetine')
    expect(names).toContain('Prozac')
    expect(names).toContain('Paroxetine')
    expect(names).toContain('Paxil')
    expect(names).toContain('Fluvoxamine')
    expect(names).toContain('Fluoxetine (Prozac)')
    expect(names).toContain('Paroxetine (Paxil)')
  })

  it('deduplicates across enzymes', () => {
    const config = [
      { symbol: 'CYP2D6', drug_cards: [{ category: 'drug', drugs: 'Codeine, Tramadol' }] },
      { symbol: 'CYP3A4', drug_cards: [{ category: 'drug', drugs: 'Codeine' }] },
    ] as any

    const names = extractAllDrugNames(config)
    expect(names.filter(n => n === 'Codeine')).toHaveLength(1)
  })

  it('returns sorted list', () => {
    const config = [{
      symbol: 'TEST',
      drug_cards: [{ category: 'drug', drugs: 'Zolpidem, Aspirin, Metformin' }],
    }] as any

    const names = extractAllDrugNames(config)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('handles empty config', () => {
    expect(extractAllDrugNames([])).toEqual([])
  })

  it('handles missing drug_cards', () => {
    const config = [{ symbol: 'CYP2D6' }] as any
    expect(extractAllDrugNames(config)).toEqual([])
  })
})
