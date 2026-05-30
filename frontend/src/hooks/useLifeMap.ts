import { useState, useEffect, useMemo } from 'react'
import {
  countryAnchors,
  blendMarker,
  type LifeTable,
  type CountryAnchor,
  type BlendMarker,
  type Residence,
  type Sex,
} from '../lib/lifeBlend'

export interface LifeModifier {
  id: string
  category: 'stress' | 'mental-health' | 'family-history'
  label: string
  qualitative: string
  actions: string[]
  evidence: 'strong' | 'moderate' | 'weak'
  range?: { lowYears: number; highYears: number }
}

export interface LifeMapInput {
  residences: Residence[]
  currentCountry: string
  sex: Sex
  age: number
}

interface UseLifeMapReturn {
  anchors: CountryAnchor[]
  blend: BlendMarker | null
  modifiers: LifeModifier[]
  table: LifeTable | null
  loading: boolean
  error: string | null
}

export function useLifeMap(input: LifeMapInput): UseLifeMapReturn {
  const [table, setTable] = useState<LifeTable | null>(null)
  const [modifiers, setModifiers] = useState<LifeModifier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch static data once — selection changes must not refetch.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/life-map/life-tables').then((r) => {
        if (!r.ok) throw new Error(`life-tables ${r.status}`)
        return r.json()
      }),
      fetch('/api/config/life-modifiers').then((r) => (r.ok ? r.json() : { modifiers: [] })),
    ])
      .then(([t, m]) => {
        if (cancelled) return
        setTable(t)
        setModifiers(Array.isArray(m.modifiers) ? m.modifiers : [])
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const anchors = useMemo(
    () => (table ? countryAnchors(table, input.residences, input.sex, input.age) : []),
    [table, input.residences, input.sex, input.age],
  )

  const blend = useMemo(
    () => (anchors.length > 0 ? blendMarker(anchors, input.residences, input.currentCountry) : null),
    [anchors, input.residences, input.currentCountry],
  )

  return { anchors, blend, modifiers, table, loading, error }
}
