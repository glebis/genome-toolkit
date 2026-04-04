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
  clinical: true,  // actionable ON by default
  significance: '',
  gene: '',
  condition: '',
  zygosity: '',
  page: 1,
  limit: 100,
}

const STORAGE_KEY = 'genome_filters'

/** Read filters from URL search params, then localStorage, then defaults */
function initFilters(): SNPFilters {
  const url = new URLSearchParams(window.location.search)
  const stored = localStorage.getItem(STORAGE_KEY)
  const base = stored ? { ...DEFAULT_FILTERS, ...JSON.parse(stored) } : { ...DEFAULT_FILTERS }

  // URL params override stored/default values
  if (url.has('search')) base.search = url.get('search')!
  if (url.has('chr')) base.chromosome = url.get('chr')!
  if (url.has('source')) base.source = url.get('source')!
  if (url.has('clinical')) base.clinical = url.get('clinical') === 'true'
  if (url.has('significance')) base.significance = url.get('significance')!
  if (url.has('gene')) base.gene = url.get('gene')!
  if (url.has('condition')) base.condition = url.get('condition')!
  if (url.has('zygosity')) base.zygosity = url.get('zygosity')!
  if (url.has('page')) base.page = parseInt(url.get('page')!, 10) || 1

  return base
}

/** Sync filters to URL and localStorage */
function persistFilters(f: SNPFilters) {
  // Save to localStorage
  const { page, limit, ...rest } = f
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))

  // Update URL without reload
  const params = new URLSearchParams()
  if (f.search) params.set('search', f.search)
  if (f.chromosome) params.set('chr', f.chromosome)
  if (f.source) params.set('source', f.source)
  if (!f.clinical) params.set('clinical', 'false') // only set when OFF (default is ON)
  if (f.significance) params.set('significance', f.significance)
  if (f.gene) params.set('gene', f.gene)
  if (f.condition) params.set('condition', f.condition)
  if (f.zygosity) params.set('zygosity', f.zygosity)
  if (f.page > 1) params.set('page', String(f.page))

  const qs = params.toString()
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', newUrl)
}

export function useSNPs() {
  const [filters, setFilters] = useState<SNPFilters>(initFilters)
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

  useEffect(() => {
    persistFilters(filters)
    fetchSNPs(filters)
  }, [filters, fetchSNPs])

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

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS })
  }, [])

  // Count filters that differ from defaults (not just truthy)
  const activeFilterCount =
    (filters.search !== DEFAULT_FILTERS.search ? 1 : 0) +
    (filters.chromosome !== DEFAULT_FILTERS.chromosome ? 1 : 0) +
    (filters.source !== DEFAULT_FILTERS.source ? 1 : 0) +
    (filters.clinical !== DEFAULT_FILTERS.clinical ? 1 : 0) +
    (filters.significance !== DEFAULT_FILTERS.significance ? 1 : 0) +
    (filters.gene !== DEFAULT_FILTERS.gene ? 1 : 0) +
    (filters.condition !== DEFAULT_FILTERS.condition ? 1 : 0) +
    (filters.zygosity !== DEFAULT_FILTERS.zygosity ? 1 : 0)

  return { result, filters, loading, updateFilters, debouncedUpdateFilters, setPage, resetFilters, activeFilterCount }
}
