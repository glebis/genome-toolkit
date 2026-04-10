import { useState, useEffect } from 'react'
import { useVaultGenes } from './useVaultGenes'
import type { VaultGene } from './useVaultGenes'
import type { PathwaySection, GeneData, GeneStatus, EvidenceTier, ActionData, ActionType } from '../types/genomics'
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

function mapActionType(t: string): ActionType {
  if (t === 'consider' || t === 'monitor' || t === 'discuss' || t === 'try') return t
  return 'consider'
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

function buildNarrativeBody(matched: VaultGene[]): string {
  const actionable = matched.filter(g => mapStatus(g.personal_status) === 'actionable')
  const monitor = matched.filter(g => mapStatus(g.personal_status) === 'monitor')
  const optimal = matched.filter(g => mapStatus(g.personal_status) === 'optimal')

  const parts: string[] = []
  if (actionable.length > 0) {
    parts.push(`<strong>${actionable.length} actionable</strong>: ${actionable.map(g => g.symbol).join(', ')}`)
  }
  if (monitor.length > 0) {
    parts.push(`${monitor.length} to monitor: ${monitor.map(g => g.symbol).join(', ')}`)
  }
  if (optimal.length > 0) {
    parts.push(`${optimal.length} optimal: ${optimal.map(g => g.symbol).join(', ')}`)
  }
  const neutral = matched.length - actionable.length - monitor.length - optimal.length
  if (neutral > 0) {
    parts.push(`${neutral} neutral`)
  }
  return parts.join('. ') + '.'
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
  actions: Record<string, ActionData[]>
  getActionsForGene: (symbol: string) => ActionData[]
}

export function useAddictionData(): UseAddictionDataReturn {
  const { genes, loading: genesLoading } = useVaultGenes()
  const { substances, loading: substancesLoading } = useSubstancesData()
  const [pathways, setPathways] = useState<PathwaySection[]>([])
  const [actions, setActions] = useState<Record<string, ActionData[]>>({})

  useEffect(() => {
    if (genesLoading) return

    const controller = new AbortController()
    const { signal } = controller

    const geneMap = new Map<string, VaultGene>()
    for (const g of genes) geneMap.set(g.symbol.toUpperCase(), g)

    // Build pathways and fetch actions
    async function build() {
      const builtPathways: PathwaySection[] = []
      const allActions: Record<string, ActionData[]> = {}

      for (const [, sys] of Object.entries(PATHWAY_SYSTEMS)) {
        const matched = genes.filter((g) => matchesSystem(g, sys.tags))
        if (matched.length === 0) continue

        const geneDataList = matched.map((g) => vaultGeneToGeneData(g, sys.name))

        // Fetch actions for all genes in parallel
        const results = await Promise.all(
          matched.map((g) =>
            fetch(`/api/vault/genes/${g.symbol}/actions`, { signal })
              .then((res) => (res.ok ? res.json() : null))
              .then((data) => {
                if (!data) return null
                const geneActions: ActionData[] = (data.actions ?? []).map(
                  (a: { id?: string; type?: string; title?: string; description?: string; detail?: string; evidence_tier?: string; study_count?: number; tags?: string[]; done?: boolean }, idx: number) => ({
                    id: a.id ?? `${g.symbol}-${idx}`,
                    type: mapActionType(a.type ?? 'consider'),
                    title: a.title ?? '',
                    description: a.description ?? '',
                    detail: a.detail,
                    evidenceTier: mapTier(a.evidence_tier ?? 'E3'),
                    studyCount: a.study_count ?? 0,
                    tags: a.tags ?? [],
                    geneSymbol: g.symbol,
                    done: a.done ?? false,
                  }),
                )
                return { symbol: g.symbol, actions: geneActions }
              })
              .catch(() => null),
          ),
        )

        if (signal.aborted) return

        let totalActionCount = 0
        for (const result of results) {
          if (!result) continue
          allActions[result.symbol] = result.actions
          totalActionCount += result.actions.length
          const gd = geneDataList.find((gd) => gd.symbol === result.symbol)
          if (gd) gd.actionCount = result.actions.length
        }

        const statuses = geneDataList.map((g) => g.status)
        const sectionStatus = worstStatus(statuses)

        builtPathways.push({
          narrative: {
            pathway: sys.name,
            status: sectionStatus,
            body: buildNarrativeBody(matched),
            priority: sectionStatus === 'actionable'
              ? `${geneDataList.filter(g => g.status === 'actionable').length} actionable findings`
              : `Status: ${sectionStatus}`,
            hint: '',
            geneCount: matched.length,
            actionCount: totalActionCount,
          },
          genes: geneDataList,
        })
      }

      if (!signal.aborted) {
        setPathways(builtPathways)
        setActions(allActions)
      }
    }

    build()

    return () => { controller.abort() }
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
    actions,
    getActionsForGene: (symbol: string) => actions[symbol] ?? [],
  }
}
