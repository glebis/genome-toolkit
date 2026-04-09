import { useState, useEffect } from 'react'

export interface StarterPrompt {
  text: string
  subtitle: string
  priority: number
}

export interface StarterPromptsData {
  capabilities: string[]
  prompts: StarterPrompt[]
  explore: string[]
  loading: boolean
}

const FALLBACK_CAPABILITIES = ['Read your vault notes', 'Search variants', 'Check drug interactions', 'Add to checklist']
const FALLBACK_EXPLORE = ["What's interesting in my genome?", 'What should I bring to my next doctor visit?']

const FALLBACK: StarterPromptsData = {
  capabilities: FALLBACK_CAPABILITIES,
  prompts: [],
  explore: FALLBACK_EXPLORE,
  loading: false,
}

function getCacheKey(view: string): string {
  return `starter-prompts-${view}`
}

function readCache(view: string): StarterPromptsData | null {
  try {
    const raw = sessionStorage.getItem(getCacheKey(view))
    if (!raw) return null
    return JSON.parse(raw) as StarterPromptsData
  } catch {
    return null
  }
}

function writeCache(view: string, data: StarterPromptsData): void {
  try {
    sessionStorage.setItem(getCacheKey(view), JSON.stringify(data))
  } catch {
    // sessionStorage unavailable — silently ignore
  }
}

export function useStarterPrompts(view: string): StarterPromptsData {
  const cached = readCache(view)
  const [data, setData] = useState<StarterPromptsData>(
    cached ?? { capabilities: FALLBACK_CAPABILITIES, prompts: [], explore: FALLBACK_EXPLORE, loading: true }
  )

  useEffect(() => {
    const cached = readCache(view)
    if (cached) {
      setData(cached)
      return
    }

    const controller = new AbortController()

    setData((prev) => ({ ...prev, loading: true }))

    fetch(`/api/starter-prompts?view=${encodeURIComponent(view)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`starter-prompts API responded with ${res.status}`)
        return res.json()
      })
      .then((json: Omit<StarterPromptsData, 'loading'>) => {
        const result: StarterPromptsData = {
          capabilities: json.capabilities ?? FALLBACK_CAPABILITIES,
          prompts: json.prompts ?? [],
          explore: json.explore ?? FALLBACK_EXPLORE,
          loading: false,
        }
        writeCache(view, result)
        setData(result)
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setData({ ...FALLBACK, loading: false })
      })

    return () => {
      controller.abort()
    }
  }, [view])

  return data
}
