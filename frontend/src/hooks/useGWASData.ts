import { useEffect, useState } from 'react'

export interface GWASMatch {
  rsid: string
  chr: number | null
  pos: number | null
  gene_symbol: string | null
  effect_allele: string
  other_allele: string
  user_genotype: string
  effect_allele_count: number  // 0, 1, or 2
  effect: number
  p_value: number
  direction: 'risk' | 'protective' | 'neutral'
  source_type: 'genotyped' | 'imputed' | string
}

export interface GWASTraitData {
  trait: string
  display_name: string | null
  source: string
  config: string
  publication: string
  citation: string
  license: string
  threshold: number
  total_hits: number
  matched_hits: number
  risk_allele_total: number
  risk_allele_max: number
  matches: GWASMatch[]
}

interface UseGWASDataReturn {
  data: GWASTraitData | null
  loading: boolean
  error: string | null
}

export function useGWASData(trait: string): UseGWASDataReturn {
  const [data, setData] = useState<GWASTraitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/gwas/${trait}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail ?? `GWAS fetch failed: ${res.status}`)
        }
        return res.json()
      })
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [trait])

  return { data, loading, error }
}
