import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLifeMap } from '../hooks/useLifeMap'

const TABLE = {
  retrieved: '2026-05-30',
  countries: {
    DE: { name: 'Germany', source: 'Eurostat', ex_by_age: { male: { '38': 41.9 }, female: {} } },
    RU: { name: 'Russia', source: 'WHO', ex_by_age: { male: { '0': 65.6, '60': 14.0 }, female: {} } },
  },
}
const MODS = { modifiers: [{ id: 'chronic-stress', category: 'stress', label: 'Stress', qualitative: 'x', actions: [], evidence: 'moderate' }] }

function mockFetch() {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('life-tables') ? TABLE : MODS),
    }),
  ) as unknown as typeof fetch
}

describe('useLifeMap', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch())
  })

  it('computes anchors + blend marker from fetched table', async () => {
    const { result } = renderHook(() =>
      useLifeMap({ residences: [{ country: 'DE', years: 5 }, { country: 'RU', years: 33 }], currentCountry: 'DE', sex: 'male', age: 38 }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.anchors).toEqual([
      { country: 'DE', name: 'Germany', exAtAge: 41.9, targetAge: 79.9 },
      { country: 'RU', name: 'Russia', exAtAge: 14.0, targetAge: 74.0 },
    ])
    expect(result.current.blend?.heuristic).toBe(true)
    expect(result.current.modifiers).toHaveLength(1)
  })

  it('returns null blend when no residences resolve', async () => {
    const { result } = renderHook(() =>
      useLifeMap({ residences: [], currentCountry: '', sex: 'male', age: 38 }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.anchors).toEqual([])
    expect(result.current.blend).toBeNull()
  })

  it('does not refetch when only the input selection changes', async () => {
    const spy = mockFetch()
    vi.stubGlobal('fetch', spy)
    const { result, rerender } = renderHook((props) => useLifeMap(props), {
      initialProps: { residences: [{ country: 'DE', years: 5 }], currentCountry: 'DE', sex: 'male' as const, age: 38 },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsAfterLoad = (spy as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    rerender({ residences: [{ country: 'DE', years: 5 }], currentCountry: 'DE', sex: 'female', age: 40 })
    expect((spy as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterLoad)
  })
})
