import { useState, useEffect } from 'react'
import { useVaultGenes } from './useVaultGenes'
import type { VaultGene } from './useVaultGenes'
import type { PGxEnzymeSection, MetabolizerStatus, DrugImpact, DrugCardData, EnzymeData, GeneType } from '../types/pgx'

interface ConfigEnzyme {
  symbol: string
  default_alleles?: string
  default_status?: MetabolizerStatus
  default_position?: number
  guideline?: string
  description?: string
  about?: string
  gene_type?: GeneType
  drug_cards?: ConfigDrug[]  // YAML uses drug_cards
  drugs?: ConfigDrug[]       // fallback
}

interface ConfigDrug {
  class?: string             // YAML uses 'class'
  drugClass?: string         // fallback
  category: string
  description?: string
  drugs?: string             // YAML uses 'drugs' for drug list
  drugList?: string          // fallback
  dangerNote?: string
  danger_note?: string
  impact_by_status?: Record<string, {
    impact: DrugImpact
    text?: string            // YAML uses 'text'
    statusText?: string      // fallback
    description?: string
    danger_note?: string     // per-status danger notes
  }>
}

function mapMetabolizerStatus(ps: string): MetabolizerStatus {
  if (ps === 'risk' || ps === 'poor') return 'poor'
  if (ps === 'intermediate' || ps === 'monitor') return 'intermediate'
  if (ps === 'ultrarapid') return 'ultrarapid'
  return 'normal'
}

function statusPosition(s: MetabolizerStatus): number {
  switch (s) {
    case 'poor': return 10
    case 'intermediate': return 30
    case 'normal': return 62
    case 'ultrarapid': return 90
  }
}

interface UsePGxDataReturn {
  sections: PGxEnzymeSection[]
  loading: boolean
}

export function usePGxData(): UsePGxDataReturn {
  const { genes, loading: genesLoading } = useVaultGenes()
  const [config, setConfig] = useState<ConfigEnzyme[] | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [sections, setSections] = useState<PGxEnzymeSection[]>([])

  useEffect(() => {
    fetch('/api/config/pgx-drugs')
      .then((res) => {
        if (!res.ok) throw new Error(`PGx config API: ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setConfig(data.enzymes ?? data)
        setConfigLoading(false)
      })
      .catch((err) => {
        console.error('[usePGxData] Config fetch failed:', err)
        setConfigLoading(false)
      })
  }, [])

  useEffect(() => {
    if (genesLoading || configLoading || !config) return

    const geneMap = new Map<string, VaultGene>()
    for (const g of genes) geneMap.set(g.symbol.toUpperCase(), g)

    const built: PGxEnzymeSection[] = config.map((ce) => {
      const vaultGene = geneMap.get(ce.symbol.toUpperCase())
      const metStatus: MetabolizerStatus = vaultGene
        ? mapMetabolizerStatus(vaultGene.personal_status)
        : ce.default_status ?? 'normal'

      const alleles = vaultGene?.personal_variants?.[0]?.genotype ?? ce.default_alleles ?? '*1/*1'

      const enzyme: EnzymeData = {
        symbol: ce.symbol,
        alleles,
        status: metStatus,
        position: ce.default_position ?? statusPosition(metStatus),
        description:
          vaultGene?.description ?? ce.description ?? `${ce.symbol} — ${metStatus} metabolizer.`,
        guideline: ce.guideline,
        geneType: ce.gene_type ?? 'enzyme',
        about: ce.about,
      }

      const drugCards = ce.drug_cards ?? ce.drugs ?? []
      const drugs: DrugCardData[] = drugCards.map((cd) => {
        const statusKey = metStatus as string
        const byStatus = cd.impact_by_status?.[statusKey]

        return {
          drugClass: cd.class ?? cd.drugClass ?? '',
          impact: byStatus?.impact ?? 'ok',
          statusText: byStatus?.text ?? byStatus?.statusText ?? 'Standard dosing',
          description: byStatus?.description ?? cd.description ?? '',
          drugList: cd.drugs ?? cd.drugList ?? '',
          dangerNote: byStatus?.danger_note ?? cd.danger_note ?? cd.dangerNote,
          category: cd.category as 'drug' | 'substance',
        }
      })

      return { enzyme, drugs }
    })

    setSections(built)
  }, [genes, genesLoading, config, configLoading])

  return {
    sections,
    loading: genesLoading || configLoading,
  }
}
