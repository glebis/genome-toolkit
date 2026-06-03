import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Isolated in its own file: this case needs useVaultGenes to return NO genes.
// Sharing a file with the main usePGxData suite (whose beforeEach mocks a
// populated gene list) made the mock-override race flaky in full-suite ordering
// — CYP2D6 would intermittently resolve to 'intermediate' instead of 'unknown'.
// Vitest isolates module/mock state per file, so a dedicated file is deterministic.

beforeEach(() => {
  vi.resetModules()
  vi.doMock('../hooks/useVaultGenes', () => ({
    useVaultGenes: () => ({ genes: [], loading: false, error: null }),
  }))
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        enzymes: [
          { symbol: 'CYP2D6', guideline: 'CPIC', description: 'd', gene_type: 'enzyme', drug_cards: [] },
        ],
      }),
  }) as unknown as typeof fetch
})

describe('usePGxData — no matching vault gene', () => {
  it('defaults the phenotype to unknown (not normal) and alleles to unknown', async () => {
    const mod = await import('../hooks/usePGxData')
    const { result } = renderHook(() => mod.usePGxData())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const cyp2d6 = result.current.sections.find((s) => s.enzyme.symbol === 'CYP2D6')
    expect(cyp2d6?.enzyme.status).toBe('unknown')
    expect(cyp2d6?.enzyme.alleles).toBe('unknown')
  })
})
