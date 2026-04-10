import { describe, it, expect } from 'vitest'
import {
  statusLabel,
  METABOLIZER_LABELS,
  TRANSPORTER_LABELS,
  METABOLIZER_COLORS,
} from '../types/pgx'
import type { MetabolizerStatus, GeneType } from '../types/pgx'

describe('statusLabel', () => {
  it('returns metabolizer label for enzyme type', () => {
    expect(statusLabel('poor', 'enzyme')).toBe('Poor Metabolizer')
    expect(statusLabel('intermediate', 'enzyme')).toBe('Intermediate Metabolizer')
    expect(statusLabel('normal', 'enzyme')).toBe('Normal Metabolizer')
    expect(statusLabel('ultrarapid', 'enzyme')).toBe('Ultrarapid Metabolizer')
  })

  it('returns transporter label for transporter type', () => {
    expect(statusLabel('poor', 'transporter')).toBe('Poor Function')
    expect(statusLabel('intermediate', 'transporter')).toBe('Decreased Function')
    expect(statusLabel('normal', 'transporter')).toBe('Normal Function')
    expect(statusLabel('ultrarapid', 'transporter')).toBe('Increased Function')
  })
})

describe('METABOLIZER_COLORS', () => {
  it('maps all statuses to CSS variables', () => {
    const statuses: MetabolizerStatus[] = ['poor', 'intermediate', 'normal', 'ultrarapid']
    for (const s of statuses) {
      expect(METABOLIZER_COLORS[s]).toMatch(/^var\(--/)
    }
  })

  it('poor and ultrarapid are distinct danger colors', () => {
    expect(METABOLIZER_COLORS.poor).not.toBe(METABOLIZER_COLORS.ultrarapid)
  })
})
