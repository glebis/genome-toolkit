import { useState, useCallback } from 'react'

const STORAGE_KEY = 'genome_my_medications'

function loadMedications(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveMedications(meds: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meds))
}

export function normalizeDrugName(name: string): string {
  return name.trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim()
}

export function useMyMedications() {
  const [medications, setMedications] = useState<string[]>(loadMedications)

  const addMedication = useCallback((name: string) => {
    const normalized = normalizeDrugName(name)
    if (!normalized) return
    setMedications(prev => {
      if (prev.some(m => normalizeDrugName(m) === normalized)) return prev
      const next = [...prev, name.trim()]
      saveMedications(next)
      return next
    })
  }, [])

  const removeMedication = useCallback((name: string) => {
    setMedications(prev => {
      const next = prev.filter(m => normalizeDrugName(m) !== normalizeDrugName(name))
      saveMedications(next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setMedications([])
    saveMedications([])
  }, [])

  return { medications, addMedication, removeMedication, clearAll }
}
