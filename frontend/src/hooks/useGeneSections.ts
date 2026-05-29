import { useState, useEffect } from 'react'

export type Section = 'mental-health' | 'addiction' | 'risk' | 'pgx'

type GeneSectionIndex = Record<string, Section[]>

interface UseGeneSectionsReturn {
  loading: boolean
  getSectionsForGene: (symbol: string) => Section[]
}

let cached: GeneSectionIndex | null = null
let cachePromise: Promise<GeneSectionIndex> | null = null

export function useGeneSections(): UseGeneSectionsReturn {
  const [index, setIndex] = useState<GeneSectionIndex | null>(cached)
  const [loading, setLoading] = useState(cached === null)

  useEffect(() => {
    if (cached !== null) {
      setIndex(cached)
      setLoading(false)
      return
    }

    let cancelled = false

    if (!cachePromise) {
      cachePromise = fetch('/api/vault/gene-sections')
        .then((res) => {
          if (!res.ok) throw new Error(`Gene-sections API: ${res.status}`)
          return res.json()
        })
        .then((result: { index: GeneSectionIndex }) => {
          cached = result.index ?? {}
          return cached
        })
        .catch((err) => {
          cachePromise = null
          throw err
        })
    }

    cachePromise
      .then((result) => {
        if (cancelled) return
        setIndex(result)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[useGeneSections]', err)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const getSectionsForGene = (symbol: string): Section[] => {
    if (!index) return []
    return index[symbol.toUpperCase()] ?? []
  }

  return { loading, getSectionsForGene }
}
