import { useState, useEffect } from 'react'
import { useVaultGenes } from './useVaultGenes'
import type { VaultGene } from './useVaultGenes'

export interface SubstanceCard {
  name: string
  status: string
  statusColor: string
  borderColor: string
  description: string
  genes: string
  relevantEnzymes: string[]
  harmTitle: string
  harmText: string
}

interface ConfigSubstance {
  name: string
  relevant_genes: string[]
  relevant_enzymes?: string[]
  status_text?: string
  description?: string
  harm_title?: string
  harm_text?: string
}

interface UseSubstancesDataReturn {
  substances: SubstanceCard[]
  loading: boolean
}

export function useSubstancesData(): UseSubstancesDataReturn {
  const { genes, loading: genesLoading } = useVaultGenes()
  const [configSubstances, setConfigSubstances] = useState<ConfigSubstance[] | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [substances, setSubstances] = useState<SubstanceCard[]>([])

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/config/substances', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Substances config API: ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setConfigSubstances(data.substances ?? data)
        setConfigLoading(false)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        console.error('[useSubstancesData] Config fetch failed:', err)
        setConfigLoading(false)
      })

    return () => { controller.abort() }
  }, [])

  useEffect(() => {
    if (genesLoading || configLoading || !configSubstances) return

    const geneMap = new Map<string, VaultGene>()
    for (const g of genes) geneMap.set(g.symbol.toUpperCase(), g)

    const built: SubstanceCard[] = configSubstances.map((cs) => {
      const matched = (cs.relevant_genes ?? [])
        .map((sym: string) => geneMap.get(sym.toUpperCase()))
        .filter(Boolean) as VaultGene[]

      const hasActionable = matched.some(
        (g) => g.personal_status === 'risk' || g.personal_status === 'actionable',
      )
      const hasMonitor = matched.some(
        (g) => g.personal_status === 'intermediate' || g.personal_status === 'monitor',
      )

      const statusColor = hasActionable
        ? 'var(--sig-risk)'
        : hasMonitor
          ? 'var(--sig-reduced)'
          : 'var(--sig-benefit)'

      const borderColor = hasActionable ? 'var(--sig-risk)' : hasMonitor ? 'var(--sig-reduced)' : 'var(--border)'

      const genesStr =
        matched.length > 0
          ? matched.map((g) => g.symbol).join(', ')
          : (cs.relevant_genes ?? []).join(', ')

      return {
        name: cs.name,
        status: cs.status_text ?? (hasActionable ? 'Caution' : hasMonitor ? 'Be aware' : 'Standard'),
        statusColor,
        borderColor,
        description: cs.description ?? '',
        genes: genesStr,
        relevantEnzymes: cs.relevant_enzymes ?? [],
        harmTitle: cs.harm_title ?? 'Harm reduction',
        harmText: cs.harm_text ?? '',
      }
    })
    setSubstances(built)
  }, [genes, genesLoading, configSubstances, configLoading])

  return {
    substances,
    loading: genesLoading || configLoading,
  }
}
