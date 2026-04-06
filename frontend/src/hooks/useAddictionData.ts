import { useState, useEffect } from 'react'
import { useVaultGenes } from './useVaultGenes'
import type { VaultGene } from './useVaultGenes'
import type { PathwaySection, GeneData, GeneStatus, EvidenceTier } from '../types/genomics'

// ── SubstanceCard type (matches AddictionProfile.tsx) ────────────────────────

export interface SubstanceCard {
  name: string
  status: string
  statusColor: string
  borderColor: string
  description: string
  genes: string
  harmTitle: string
  harmText: string
}

// ── Pathway groupings ────────────────────────────────────────────────────────

const PATHWAY_SYSTEMS: Record<string, { name: string; tags: string[] }> = {
  dopamine: {
    name: 'Dopamine & Reward Sensitivity',
    tags: ['Dopamine System', 'Behavioral Architecture'],
  },
  opioid: {
    name: 'Opioid Receptor Sensitivity',
    tags: ['Opioid and Reward'],
  },
  alcohol: {
    name: 'Alcohol Metabolism',
    tags: ['Liver and Metabolism', 'Drug Metabolism'],
  },
  gaba: {
    name: 'GABA & Sedative Sensitivity',
    tags: ['GABA System', 'Sleep Architecture'],
  },
  endocannabinoid: {
    name: 'Endocannabinoid System',
    tags: ['Endocannabinoid System'],
  },
}

function mapStatus(ps: string): GeneStatus {
  if (ps === 'risk' || ps === 'actionable') return 'actionable'
  if (ps === 'intermediate' || ps === 'monitor') return 'monitor'
  if (ps === 'optimal' || ps === 'normal' || ps === 'typical') return 'optimal'
  return 'neutral'
}

function mapTier(tier: string): EvidenceTier {
  if (tier === 'E1' || tier === 'E2' || tier === 'E3' || tier === 'E4' || tier === 'E5')
    return tier
  return 'E3'
}

function worstStatus(statuses: GeneStatus[]): GeneStatus {
  if (statuses.includes('actionable')) return 'actionable'
  if (statuses.includes('monitor')) return 'monitor'
  if (statuses.includes('optimal')) return 'optimal'
  return 'neutral'
}

function vaultGeneToGeneData(g: VaultGene, pathway: string): GeneData {
  const v = g.personal_variants?.[0]
  return {
    symbol: g.symbol,
    variant: v?.rsid ?? '',
    rsid: v?.rsid ?? '',
    genotype: v?.genotype ?? '',
    status: mapStatus(g.personal_status),
    evidenceTier: mapTier(g.evidence_tier),
    studyCount: g.study_count,
    description: g.description,
    actionCount: 0,
    categories: [],
    pathway,
  }
}

function matchesSystem(gene: VaultGene, tags: string[]): boolean {
  const lower = tags.map((t) => t.toLowerCase())
  return gene.systems.some((s) => lower.includes(s.toLowerCase()))
}

interface ConfigSubstance {
  name: string
  relevant_genes: string[]
  status_text?: string
  description?: string
  harm_title?: string
  harm_text?: string
}

// ── Hook return ──────────────────────────────────────────────────────────────

interface UseAddictionDataReturn {
  pathways: PathwaySection[]
  substances: SubstanceCard[]
  loading: boolean
  totalGenes: number
  actionableCount: number
}

export function useAddictionData(): UseAddictionDataReturn {
  const { genes, loading: genesLoading } = useVaultGenes()
  const [configSubstances, setConfigSubstances] = useState<ConfigSubstance[] | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [pathways, setPathways] = useState<PathwaySection[]>([])
  const [substances, setSubstances] = useState<SubstanceCard[]>([])

  useEffect(() => {
    fetch('/api/config/substances')
      .then((res) => {
        if (!res.ok) throw new Error(`Substances config API: ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setConfigSubstances(data.substances ?? data)
        setConfigLoading(false)
      })
      .catch((err) => {
        console.error('[useAddictionData] Config fetch failed:', err)
        setConfigLoading(false)
      })
  }, [])

  useEffect(() => {
    if (genesLoading || configLoading) return

    const geneMap = new Map<string, VaultGene>()
    for (const g of genes) geneMap.set(g.symbol.toUpperCase(), g)

    // Build pathways
    const builtPathways: PathwaySection[] = []
    const usedGenes = new Set<string>()

    for (const [, sys] of Object.entries(PATHWAY_SYSTEMS)) {
      const matched = genes.filter((g) => matchesSystem(g, sys.tags))
      if (matched.length === 0) continue

      const geneDataList = matched.map((g) => {
        usedGenes.add(g.symbol)
        return vaultGeneToGeneData(g, sys.name)
      })
      const statuses = geneDataList.map((g) => g.status)
      const sectionStatus = worstStatus(statuses)
      const actionCount = geneDataList.filter((g) => g.status === 'actionable').length

      builtPathways.push({
        narrative: {
          pathway: sys.name,
          status: sectionStatus,
          body: matched
            .map((g) => g.description)
            .filter(Boolean)
            .join(' '),
          priority: sectionStatus === 'actionable'
            ? `Pattern: ${actionCount} actionable finding${actionCount !== 1 ? 's' : ''}`
            : `Status: ${sectionStatus}`,
          hint: '',
          geneCount: matched.length,
          actionCount,
        },
        genes: geneDataList,
      })
    }

    setPathways(builtPathways)

    // Build substances
    if (configSubstances && configSubstances.length > 0) {
      const builtSubstances: SubstanceCard[] = configSubstances.map((cs) => {
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
            ? `Genes involved: ${matched.map((g) => g.symbol).join(', ')}`
            : `Genes involved: ${(cs.relevant_genes ?? []).join(', ')}`

        return {
          name: cs.name,
          status: cs.status_text ?? (hasActionable ? 'Caution' : hasMonitor ? 'Be aware' : 'Standard'),
          statusColor,
          borderColor,
          description: cs.description ?? '',
          genes: genesStr,
          harmTitle: cs.harm_title ?? 'Harm reduction',
          harmText: cs.harm_text ?? '',
        }
      })
      setSubstances(builtSubstances)
    }
  }, [genes, genesLoading, configSubstances, configLoading])

  const totalGenes = pathways.reduce((sum, p) => sum + p.genes.length, 0)
  const actionableCount = pathways.reduce(
    (sum, p) => sum + p.genes.filter((g) => g.status === 'actionable').length,
    0,
  )

  return {
    pathways,
    substances,
    loading: genesLoading || configLoading,
    totalGenes,
    actionableCount,
  }
}
