import { useState, useEffect, useCallback } from 'react'

export interface SessionSummary {
  id: string
  title: string
  view_context: string
  created_at: string
  last_active: string
  message_count: number
  first_message: string | null
}

export function useSessionHistory() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const deleteSession = useCallback(async (id: string) => {
    // Optimistic delete
    setSessions(prev => prev.filter(s => s.id !== id))
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    } catch {
      // rollback on error
      refresh()
    }
  }, [refresh])

  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/sessions', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        await refresh()
        return data.id
      }
    } catch {
      // ignore
    }
    return null
  }, [refresh])

  // Group sessions by time period
  const grouped = groupByTime(sessions)

  return { sessions, grouped, loading, refresh, deleteSession, createSession }
}

function groupByTime(sessions: SessionSummary[]): Record<string, SessionSummary[]> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, SessionSummary[]> = {}

  for (const s of sessions) {
    const date = new Date(s.last_active)
    let key: string
    if (date >= today) key = 'TODAY'
    else if (date >= yesterday) key = 'YESTERDAY'
    else if (date >= weekAgo) key = 'THIS WEEK'
    else key = 'OLDER'

    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  }

  return groups
}
