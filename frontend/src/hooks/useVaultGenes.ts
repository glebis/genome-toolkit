import { useState, useEffect } from 'react'

export interface VaultGene {
  symbol: string
  full_name: string
  chromosome: string
  systems: string[]
  personal_variants: { rsid: string; genotype: string; significance: string }[]
  evidence_tier: string
  personal_status: string
  relevance: string
  description: string
  tags: string[]
  study_count: number
  has_vault_note: boolean
}

interface UseVaultGenesReturn {
  genes: VaultGene[]
  loading: boolean
  error: string | null
}

let cachedGenes: VaultGene[] | null = null
let cachePromise: Promise<VaultGene[]> | null = null

export function useVaultGenes(): UseVaultGenesReturn {
  const [genes, setGenes] = useState<VaultGene[]>(cachedGenes ?? [])
  const [loading, setLoading] = useState(cachedGenes === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cachedGenes !== null) {
      setGenes(cachedGenes)
      setLoading(false)
      return
    }

    let cancelled = false

    if (!cachePromise) {
      cachePromise = fetch('/api/vault/genes')
        .then((res) => {
          if (!res.ok) throw new Error(`Vault genes API responded with ${res.status}`)
          return res.json()
        })
        .then((data: { genes: VaultGene[]; total: number }) => {
          cachedGenes = data.genes
          return data.genes
        })
        .catch((err) => {
          cachePromise = null
          throw err
        })
    }

    cachePromise
      .then((g) => {
        if (cancelled) return
        setGenes(g)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load vault genes')
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { genes, loading, error }
}
// HMR reset 1775457161
