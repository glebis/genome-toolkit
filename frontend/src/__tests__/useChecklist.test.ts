import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChecklist } from '../hooks/useChecklist'
import type { ChecklistItem } from '../hooks/useChecklist'

const mockItems: ChecklistItem[] = [
  { id: '1', gene_symbol: 'MTHFR', action_type: 'consider', title: 'Take methylfolate', done: false, done_at: null, notes: null, practical_category: 'supplement', health_domain: 'mood', created_at: '2026-01-01' },
  { id: '2', gene_symbol: 'COMT', action_type: 'monitor', title: 'Track stress', done: true, done_at: '2026-01-10', notes: null, practical_category: 'lifestyle', health_domain: 'stress', created_at: '2026-01-02' },
  { id: '3', gene_symbol: 'custom', action_type: 'consider', title: 'Meditate daily', done: false, done_at: null, notes: null, practical_category: 'lifestyle', health_domain: 'mood', created_at: '2026-01-03' },
]

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ actions: mockItems }),
  }) as any
})

describe('useChecklist', () => {
  it('fetches items on mount', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(3)
  })

  it('computes pendingCount and doneCount', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pendingCount).toBe(2)
    expect(result.current.doneCount).toBe(1)
  })

  it('computes uniqueGenes excluding custom', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.uniqueGenes).toEqual(expect.arrayContaining(['MTHFR', 'COMT']))
    expect(result.current.uniqueGenes).not.toContain('custom')
  })

  // ── Filtering ───────────────────────────────────────────────────────────

  it('filters by pending status', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setFilterStatus('pending'))
    expect(result.current.filtered).toHaveLength(2)
    expect(result.current.filtered.every(i => !i.done)).toBe(true)
  })

  it('filters by done status', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setFilterStatus('done'))
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].title).toBe('Track stress')
  })

  it('shows all items with all filter', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setFilterStatus('all'))
    expect(result.current.filtered).toHaveLength(3)
  })

  // ── Grouping ────────────────────────────────────────────────────────────

  it('groups by gene', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setGroupBy('gene'))
    expect(Object.keys(result.current.grouped)).toEqual(
      expect.arrayContaining(['MTHFR', 'COMT', 'custom']),
    )
  })

  it('groups by status', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setGroupBy('status'))
    expect(result.current.grouped['pending']).toHaveLength(2)
    expect(result.current.grouped['done']).toHaveLength(1)
  })

  it('groups by domain', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setGroupBy('domain'))
    expect(result.current.grouped['mood']).toHaveLength(2)
    expect(result.current.grouped['stress']).toHaveLength(1)
  })

  it('groups by practical category', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setGroupBy('practical'))
    expect(result.current.grouped['supplement']).toHaveLength(1)
    expect(result.current.grouped['lifestyle']).toHaveLength(2)
  })

  // ── Optimistic toggle ──────────────────────────────────────────────────

  it('toggles done optimistically', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { result.current.toggleDone('1') })
    const toggled = result.current.items.find(i => i.id === '1')
    expect(toggled?.done).toBe(true)
    expect(toggled?.done_at).toBeTruthy()
  })

  // ── Optimistic delete ─────────────────────────────────────────────────

  it('deletes item optimistically', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { result.current.deleteItem('2') })
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items.find(i => i.id === '2')).toBeUndefined()
  })

  // ── API failure handling ──────────────────────────────────────────────

  it('handles API failure gracefully', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'))
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(0)
  })

  // ── addItem with empty title ────────────────────────────────────────────

  it('addItem with empty string still calls API', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { result.current.addItem('') })

    // POST was called (initial GET + the POST)
    const postCalls = (global.fetch as any).mock.calls.filter(
      (c: any[]) => c[1]?.method === 'POST'
    )
    expect(postCalls).toHaveLength(1)
    expect(JSON.parse(postCalls[0][1].body).title).toBe('')
  })

  // ── Grouping by evidence ───────────────────────────────────────────────

  it('groups by evidence (action_type)', async () => {
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Default groupBy is 'evidence'
    expect(result.current.groupBy).toBe('evidence')
    expect(result.current.grouped['consider']).toHaveLength(2)
    expect(result.current.grouped['monitor']).toHaveLength(1)
  })

  it('groups by evidence with item missing action_type uses "other"', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        actions: [
          { id: '10', gene_symbol: 'X', action_type: '', title: 'No type', done: false, done_at: null, notes: null, practical_category: '', health_domain: '', created_at: '' },
        ],
      }),
    })
    const { result } = renderHook(() => useChecklist())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.grouped['other']).toHaveLength(1)
  })
})
