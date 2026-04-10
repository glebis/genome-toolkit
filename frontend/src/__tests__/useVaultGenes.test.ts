import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { VaultGene } from '../hooks/useVaultGenes'

const mockGenes: VaultGene[] = [
  {
    symbol: 'MTHFR', full_name: 'Methylenetetrahydrofolate Reductase',
    chromosome: '1', systems: ['Methylation'],
    personal_variants: [{ rsid: 'rs1801133', genotype: 'T/T', significance: 'Pathogenic' }],
    evidence_tier: 'E2', personal_status: 'risk', relevance: 'high',
    description: 'Reduced folate conversion.', tags: ['methylation'],
    study_count: 12, has_vault_note: true,
  },
  {
    symbol: 'COMT', full_name: 'Catechol-O-Methyltransferase',
    chromosome: '22', systems: ['Dopamine System'],
    personal_variants: [{ rsid: 'rs4680', genotype: 'A/G', significance: 'Drug Response' }],
    evidence_tier: 'E2', personal_status: 'intermediate', relevance: 'high',
    description: 'Intermediate COMT activity.', tags: ['dopamine'],
    study_count: 30, has_vault_note: true,
  },
]

beforeEach(async () => {
  vi.restoreAllMocks()
  // Reset module-level cache by re-importing fresh module
  vi.resetModules()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ genes: mockGenes, total: 2 }),
  }) as any
})

async function getHook() {
  const mod = await import('../hooks/useVaultGenes')
  return renderHook(() => mod.useVaultGenes())
}

describe('useVaultGenes', () => {
  it('fetches genes on mount', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.genes).toHaveLength(2)
    expect(result.current.genes[0].symbol).toBe('MTHFR')
    expect(result.current.error).toBeNull()
  })

  it('calls /api/vault/genes endpoint', async () => {
    await getHook()
    expect(global.fetch).toHaveBeenCalledWith('/api/vault/genes')
  })

  it('handles API error gracefully', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network down'))
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.genes).toHaveLength(0)
    expect(result.current.error).toBe('Network down')
  })

  it('handles non-ok response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('500')
  })

  it('starts in loading state', async () => {
    // Use a never-resolving promise to keep it loading
    (global.fetch as any).mockReturnValue(new Promise(() => {}))
    const { result } = await getHook()
    expect(result.current.loading).toBe(true)
    expect(result.current.genes).toHaveLength(0)
  })
})
