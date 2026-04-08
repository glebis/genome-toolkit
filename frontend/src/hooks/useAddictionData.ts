import { useState, useEffect } from 'react'
import { useVaultGenes } from './useVaultGenes'
import type { VaultGene } from './useVaultGenes'
import type { PathwaySection, GeneData, GeneStatus, EvidenceTier } from '../types/genomics'
import { useSubstancesData } from './useSubstancesData'
import type { SubstanceCard } from './useSubstancesData'

export type { SubstanceCard }

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
  const { substances, loading: substancesLoading } = useSubstancesData()
  const [pathways, setPathways] = useState<PathwaySection[]>([])

  useEffect(() => {
    if (genesLoading) return

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
  }, [genes, genesLoading])

  const totalGenes = pathways.reduce((sum, p) => sum + p.genes.length, 0)
  const actionableCount = pathways.reduce(
    (sum, p) => sum + p.genes.filter((g) => g.status === 'actionable').length,
    0,
  )

  return {
    pathways,
    substances,
    loading: genesLoading || substancesLoading,
    totalGenes,
    actionableCount,
  }
}
