import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { SessionSummary } from '../hooks/useSessionHistory'

const mockSessions: SessionSummary[] = [
  { id: 's1', title: 'CYP2D6 metabolism', view_context: 'pgx', created_at: '2026-04-11T10:00:00Z', last_active: '2026-04-11T14:00:00Z', message_count: 4, first_message: 'Tell me about CYP2D6' },
  { id: 's2', title: 'MTHFR variants', view_context: 'mental-health', created_at: '2026-04-10T09:00:00Z', last_active: '2026-04-10T09:15:00Z', message_count: 2, first_message: 'What about MTHFR?' },
  { id: 's3', title: 'Risk overview', view_context: 'risk', created_at: '2026-04-05T08:00:00Z', last_active: '2026-04-05T08:30:00Z', message_count: 6, first_message: 'Show my risks' },
]

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockSessions),
  }) as any
})

afterEach(() => {
  vi.useRealTimers()
})

async function getHook() {
  const mod = await import('../hooks/useSessionHistory')
  return renderHook(() => mod.useSessionHistory())
}

describe('useSessionHistory', () => {
  it('fetches sessions on mount', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toHaveLength(3)
    expect(result.current.sessions[0].id).toBe('s1')
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions')
  })

  it('groups sessions by time period', async () => {
    // Set "now" to 2026-04-11T18:00:00Z so:
    //   s1 (last_active 2026-04-11T14:00:00Z) -> TODAY
    //   s2 (last_active 2026-04-10T09:15:00Z) -> YESTERDAY
    //   s3 (last_active 2026-04-05T08:30:00Z) -> THIS WEEK
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-04-11T18:00:00Z'))

    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))

    const { grouped } = result.current
    expect(grouped['TODAY']).toHaveLength(1)
    expect(grouped['TODAY'][0].id).toBe('s1')
    expect(grouped['YESTERDAY']).toHaveLength(1)
    expect(grouped['YESTERDAY'][0].id).toBe('s2')
    expect(grouped['THIS WEEK']).toHaveLength(1)
    expect(grouped['THIS WEEK'][0].id).toBe('s3')
    expect(grouped['OLDER']).toBeUndefined()
  })

  it('puts old sessions in OLDER group', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Set now far in the future so all sessions are older than a week
    vi.setSystemTime(new Date('2026-05-01T00:00:00Z'))

    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))

    const { grouped } = result.current
    expect(grouped['OLDER']).toHaveLength(3)
    expect(grouped['TODAY']).toBeUndefined()
  })

  it('deleteSession removes from list optimistically', async () => {
    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toHaveLength(3)

    await act(async () => {
      await result.current.deleteSession('s2')
    })

    expect(result.current.sessions).toHaveLength(2)
    expect(result.current.sessions.find(s => s.id === 's2')).toBeUndefined()
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions/s2', { method: 'DELETE' })
  })

  it('createSession calls POST and returns id', async () => {
    ;(global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSessions) }) // initial load
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 's4' }) }) // POST
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([...mockSessions, { id: 's4', title: '', view_context: '', created_at: '', last_active: '', message_count: 0, first_message: null }]) }) // refresh

    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))

    let newId: string | null = null
    await act(async () => {
      newId = await result.current.createSession()
    })

    expect(newId).toBe('s4')
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions', { method: 'POST' })
  })

  it('handles fetch error gracefully', async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toEqual([])
  })

  it('handles empty sessions list', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    const { result } = await getHook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toEqual([])
    expect(result.current.grouped).toEqual({})
  })
})
