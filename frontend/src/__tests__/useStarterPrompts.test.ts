import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockData = {
  capabilities: ['Analyze variants', 'Check drug interactions'],
  prompts: [
    { text: 'What are my top risk variants?', subtitle: 'Risk overview', priority: 1 },
    { text: 'Show my methylation status', subtitle: 'Methylation', priority: 2 },
  ],
  explore: ['Explore my genome', 'What should I ask my doctor?'],
}

const FALLBACK_CAPABILITIES = ['Read your vault notes', 'Search variants', 'Check drug interactions', 'Add to checklist']
const FALLBACK_EXPLORE = ["What's interesting in my genome?", 'What should I bring to my next doctor visit?']

// Simple sessionStorage mock
const sessionStoreMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  sessionStoreMock.clear()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStoreMock,
    writable: true,
    configurable: true,
  })
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockData),
  }) as any
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function getHook(view: string) {
  const mod = await import('../hooks/useStarterPrompts')
  return renderHook((v: string) => mod.useStarterPrompts(v), { initialProps: view })
}

describe('useStarterPrompts', () => {
  it('fetches prompts for the given view and returns correct shape', async () => {
    const { result } = await getHook('mental-health')
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/starter-prompts?view=mental-health'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    expect(result.current.prompts).toHaveLength(2)
    expect(result.current.prompts[0]).toMatchObject({ text: expect.any(String), subtitle: expect.any(String), priority: expect.any(Number) })
    expect(result.current.capabilities).toEqual(mockData.capabilities)
    expect(result.current.explore).toEqual(mockData.explore)
  })

  it('uses sessionStorage cache on second render with same view — only 1 fetch call', async () => {
    // First render — populates cache
    const { result: r1, unmount: u1 } = await getHook('pgx')
    await waitFor(() => expect(r1.current.loading).toBe(false))
    u1()

    // Second render with same view — should use cache
    vi.resetModules()
    const mod2 = await import('../hooks/useStarterPrompts')
    const { result: r2 } = renderHook(() => mod2.useStarterPrompts('pgx'))
    await waitFor(() => expect(r2.current.loading).toBe(false))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(r2.current.prompts).toHaveLength(2)
  })

  it('fetches again when view changes', async () => {
    const { result, rerender } = await getHook('mental-health')
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect((global.fetch as any).mock.calls[0][0]).toContain('view=mental-health')

    // Change view
    act(() => { rerender('risk') })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect((global.fetch as any).mock.calls[1][0]).toContain('view=risk')
  })

  it('returns fallback on fetch error — empty prompts, static capabilities/explore', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

    const { result } = await getHook('mental-health')
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prompts).toHaveLength(0)
    expect(result.current.capabilities).toEqual(FALLBACK_CAPABILITIES)
    expect(result.current.explore).toEqual(FALLBACK_EXPLORE)
  })
})
