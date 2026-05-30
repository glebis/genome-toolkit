import { useState, useEffect } from 'react'
import { useVaultGenes } from './useVaultGenes'
import type { VaultGene } from './useVaultGenes'
import type { PGxEnzymeSection, MetabolizerStatus, DrugImpact, DrugCardData, EnzymeData, GeneType, EvidenceScope } from '../types/pgx'

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
  evidence_scope?: EvidenceScope
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

// PGx-specific fields a vault gene may carry. A generic `personal_status`
// (health-dashboard field) is intentionally NOT consulted for phenotype — it
// is not a PGx phenotype and must never be inferred as one.
type PGxVaultGene = VaultGene & {
  pgx_phenotype?: string
  metabolizer_status?: string
  pgx_diplotype?: string
  pharmacogenomics?: { phenotype?: string; diplotype?: string }
}

/** Parse a PGx-specific phenotype string. Missing/unrecognized → 'unknown'. */
function parseMetabolizerStatus(value?: string): MetabolizerStatus {
  if (!value) return 'unknown'
  const s = value.toLowerCase().replace(/[_\s-]/g, '')
  if (s === 'poor' || s === 'poormetabolizer' || s === 'poorfunction') return 'poor'
  if (s === 'intermediate' || s === 'intermediatemetabolizer' || s === 'decreasedfunction') return 'intermediate'
  if (s === 'ultrarapid' || s === 'ultrarapidmetabolizer' || s === 'highactivity' || s === 'increasedfunction') return 'ultrarapid'
  if (s === 'normal' || s === 'reference' || s === 'normalmetabolizer' || s === 'extensivemetabolizer' || s === 'normalfunction') return 'normal'
  return 'unknown'
}

/** Resolve phenotype ONLY from PGx-specific fields; never from generic status. */
function getPGxStatus(g?: VaultGene, fallback?: MetabolizerStatus): MetabolizerStatus {
  const pgx = g as PGxVaultGene | undefined
  return parseMetabolizerStatus(
    pgx?.pgx_phenotype ??
    pgx?.metabolizer_status ??
    pgx?.pharmacogenomics?.phenotype ??
    fallback
  )
}

/** Resolve a star-allele diplotype ONLY from PGx-specific fields. A raw rsID
 *  genotype (e.g. 'AG') is NOT a diplotype and must never be shown as one. */
function getPGxDiplotype(g?: VaultGene, fallback?: string): string {
  const pgx = g as PGxVaultGene | undefined
  return pgx?.pgx_diplotype ?? pgx?.pharmacogenomics?.diplotype ?? fallback ?? 'unknown'
}

function statusPosition(s: MetabolizerStatus): number {
  switch (s) {
    case 'unknown': return 50
    case 'poor': return 10
    case 'intermediate': return 30
    case 'normal': return 62
    case 'ultrarapid': return 90
  }
}

export function extractAllDrugNames(config: ConfigEnzyme[]): string[] {
  const names = new Set<string>()
  for (const enzyme of config) {
    const cards = enzyme.drug_cards ?? enzyme.drugs ?? []
    for (const card of cards) {
      const drugStr = card.drugs ?? card.drugList ?? ''
      for (const part of drugStr.split(',')) {
        const trimmed = part.trim()
        if (!trimmed) continue
        names.add(trimmed)
        const withoutBrand = trimmed.replace(/\s*\(.*?\)\s*/g, '').trim()
        if (withoutBrand && withoutBrand !== trimmed) names.add(withoutBrand)
        const brandMatch = trimmed.match(/\(([^)]+)\)/)
        if (brandMatch) names.add(brandMatch[1].trim())
      }
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b))
}

interface UsePGxDataReturn {
  sections: PGxEnzymeSection[]
  allDrugNames: string[]
  loading: boolean
}

export function usePGxData(): UsePGxDataReturn {
  const { genes, loading: genesLoading } = useVaultGenes()
  const [config, setConfig] = useState<ConfigEnzyme[] | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [sections, setSections] = useState<PGxEnzymeSection[]>([])

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/config/pgx-drugs', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`PGx config API: ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setConfig(data.enzymes ?? data)
        setConfigLoading(false)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        console.error('[usePGxData] Config fetch failed:', err)
        setConfigLoading(false)
      })

    return () => { controller.abort() }
  }, [])

  useEffect(() => {
    if (genesLoading || configLoading || !config) return

    const geneMap = new Map<string, VaultGene>()
    for (const g of genes) geneMap.set(g.symbol.toUpperCase(), g)

    const built: PGxEnzymeSection[] = config.map((ce) => {
      const vaultGene = geneMap.get(ce.symbol.toUpperCase())
      const metStatus: MetabolizerStatus = getPGxStatus(vaultGene, ce.default_status)

      const alleles = getPGxDiplotype(vaultGene, ce.default_alleles)

      const enzyme: EnzymeData = {
        symbol: ce.symbol,
        alleles,
        status: metStatus,
        position: ce.default_position ?? statusPosition(metStatus),
        description:
          vaultGene?.description ?? ce.description ?? `${ce.symbol} — PGx phenotype ${metStatus}.`,
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
          category: (cd.category === 'drug' ? 'prescription' : cd.category) as 'prescription' | 'substance',
          // Default sensibly when the config omits it: guideline-backed only when
          // the enzyme actually names a guideline, otherwise exploratory. Never
          // let an untagged substance/drug inherit prescriber-grade framing.
          evidenceScope: cd.evidence_scope ?? (ce.guideline ? 'guideline' : 'exploratory'),
        }
      })

      return { enzyme, drugs }
    })

    setSections(built)
  }, [genes, genesLoading, config, configLoading])

  return {
    sections,
    allDrugNames: config ? extractAllDrugNames(config) : [],
    loading: genesLoading || configLoading,
  }
}
