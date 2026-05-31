import { useState, useCallback } from 'react'
import type { Residence, Sex } from '../lib/lifeBlend'

export const RESIDENCE_STORAGE_KEY = 'genome_residence_history'

export interface ResidenceState {
  residences: Residence[]
  currentCountry: string
  sex: Sex
  age: number
  /** IDs of life-context factors the user marked as applying to them. */
  modifierIds: string[]
}

const DEFAULT_STATE: ResidenceState = {
  residences: [],
  currentCountry: '',
  sex: 'male',
  age: 30,
  modifierIds: [],
}

function loadState(): ResidenceState {
  try {
    const raw = localStorage.getItem(RESIDENCE_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(raw)
    return {
      residences: Array.isArray(parsed.residences) ? parsed.residences : [],
      currentCountry: typeof parsed.currentCountry === 'string' ? parsed.currentCountry : '',
      sex: parsed.sex === 'female' ? 'female' : 'male',
      age: typeof parsed.age === 'number' ? parsed.age : DEFAULT_STATE.age,
      modifierIds: Array.isArray(parsed.modifierIds) ? parsed.modifierIds : [],
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function save(state: ResidenceState): void {
  localStorage.setItem(RESIDENCE_STORAGE_KEY, JSON.stringify(state))
}

export function useResidenceHistory() {
  const [state, setState] = useState<ResidenceState>(loadState)

  const mutate = useCallback((fn: (prev: ResidenceState) => ResidenceState) => {
    setState((prev) => {
      const next = fn(prev)
      save(next)
      return next
    })
  }, [])

  const addResidence = useCallback((r: Residence) => {
    mutate((prev) =>
      prev.residences.some((x) => x.country === r.country)
        ? prev
        : { ...prev, residences: [...prev.residences, r] },
    )
  }, [mutate])

  const updateResidence = useCallback((country: string, patch: Partial<Residence>) => {
    mutate((prev) => ({
      ...prev,
      residences: prev.residences.map((x) => (x.country === country ? { ...x, ...patch } : x)),
    }))
  }, [mutate])

  const removeResidence = useCallback((country: string) => {
    mutate((prev) => ({ ...prev, residences: prev.residences.filter((x) => x.country !== country) }))
  }, [mutate])

  const setCurrentCountry = useCallback((currentCountry: string) => {
    mutate((prev) => ({ ...prev, currentCountry }))
  }, [mutate])

  const setSex = useCallback((sex: Sex) => mutate((prev) => ({ ...prev, sex })), [mutate])
  const setAge = useCallback((age: number) => mutate((prev) => ({ ...prev, age })), [mutate])

  const toggleModifier = useCallback((id: string) => {
    mutate((prev) => ({
      ...prev,
      modifierIds: prev.modifierIds.includes(id)
        ? prev.modifierIds.filter((x) => x !== id)
        : [...prev.modifierIds, id],
    }))
  }, [mutate])

  return { state, addResidence, updateResidence, removeResidence, setCurrentCountry, setSex, setAge, toggleModifier }
}
