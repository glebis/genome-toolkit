import { useState, useEffect, useCallback, useRef } from 'react'

export interface SNP {
  rsid: string
  chromosome: string
  position: number
  genotype: string
  is_rsid: boolean
  source: string
  r2_quality: number | null
  significance: string | null
  disease: string | null
  gene_symbol: string | null
}

export interface SNPFilters {
  search: string
  chromosome: string
  source: string
  clinical: boolean
  significance: string
  gene: string
  condition: string
  zygosity: string
  page: number
  limit: number
}

export interface SNPResult {
  items: SNP[]
  total: number
  page: number
  limit: number
}

const DEFAULT_FILTERS: SNPFilters = {
  search: '',
  chromosome: '',
  source: '',
  clinical: false,
  significance: '',
  gene: '',
  condition: '',
  zygosity: '',
  page: 1,
  limit: 100,
}

export function useSNPs() {
  const [filters, setFilters] = useState<SNPFilters>(DEFAULT_FILTERS)
  const [result, setResult] = useState<SNPResult>({ items: [], total: 0, page: 1, limit: 100 })
  const [loading, setLoading] = useState(false)

  const fetchSNPs = useCallback(async (f: SNPFilters) => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(f.page))
    params.set('limit', String(f.limit))
    if (f.search) params.set('search', f.search)
    if (f.chromosome) params.set('chr', f.chromosome)
    if (f.source) params.set('source', f.source)
    if (f.clinical) params.set('clinical', 'true')
    if (f.significance) params.set('significance', f.significance)
    if (f.gene) params.set('gene', f.gene)
    if (f.condition) params.set('condition', f.condition)
    if (f.zygosity) params.set('zygosity', f.zygosity)

    try {
      const resp = await fetch(`/api/snps?${params}`)
      if (resp.ok) setResult(await resp.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSNPs(filters) }, [filters, fetchSNPs])

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const updateFilters = useCallback((partial: Partial<SNPFilters>) => {
    setFilters(prev => ({ ...prev, page: 1, ...partial }))
  }, [])

  const debouncedUpdateFilters = useCallback((partial: Partial<SNPFilters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, page: 1, ...partial }))
    }, 300)
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }))
  }, [])

  return { result, filters, loading, updateFilters, debouncedUpdateFilters, setPage }
}
