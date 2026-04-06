import { useState, useEffect } from 'react'
import { useVaultGenes } from './useVaultGenes'
import type { VaultGene } from './useVaultGenes'
import type { PathwaySection, ActionData, GeneData, GeneStatus, EvidenceTier, ActionType } from '../types/genomics'

// ── Pathway groupings for mental health ──────────────────────────────────────

const MH_SYSTEMS: Record<string, { name: string; tags: string[] }> = {
  methylation: {
    name: 'Methylation Pathway',
    tags: ['Methylation Pathway', 'Methylation'],
  },
  serotonin: {
    name: 'Serotonin & Neuroplasticity',
    tags: ['Serotonin System', 'Neuroplasticity', 'Neurotransmitter Synthesis'],
  },
  dopamine: {
    name: 'Dopamine & Reward',
    tags: ['Dopamine System', 'Dopamine & Reward', 'Opioid and Reward', 'Behavioral Architecture'],
  },
  gaba: {
    name: 'GABA & Sleep',
    tags: ['GABA System', 'Sleep Architecture'],
  },
  stress: {
    name: 'Stress Response',
    tags: ['Stress Response', 'HPA Axis'],
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

function matchesSystem(gene: VaultGene, tags: string[]): boolean {
  const lower = tags.map((t) => t.toLowerCase())
  return gene.systems.some((s) => lower.includes(s.toLowerCase()))
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

function mapActionType(t: string): ActionType {
  if (t === 'consider' || t === 'monitor' || t === 'discuss' || t === 'try') return t
  return 'consider'
}

async function buildFromVaultGenes(
  genes: VaultGene[],
  setSections: (s: PathwaySection[]) => void,
  setActions: (a: Record<string, ActionData[]>) => void,
): Promise<void> {
  const builtSections: PathwaySection[] = []
  const allActions: Record<string, ActionData[]> = {}

  for (const [, sys] of Object.entries(MH_SYSTEMS)) {
    const matched = genes.filter((g) => matchesSystem(g, sys.tags))
    if (matched.length === 0) continue

    const geneDataList = matched.map((g) => vaultGeneToGeneData(g, sys.name))

    let totalActionCount = 0
    for (const g of matched) {
      try {
        const res = await fetch(`/api/vault/genes/${g.symbol}/actions`)
        if (res.ok) {
          const data = await res.json()
          const geneActions: ActionData[] = (data.actions ?? []).map(
            (
              a: {
                id?: string
                type?: string
                title?: string
                description?: string
                detail?: string
                evidence_tier?: string
                study_count?: number
                tags?: string[]
                done?: boolean
              },
              idx: number,
            ) => ({
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
          allActions[g.symbol] = geneActions
          totalActionCount += geneActions.length

          const gd = geneDataList.find((gd) => gd.symbol === g.symbol)
          if (gd) gd.actionCount = geneActions.length
        }
      } catch {
        // skip failed fetches
      }
    }

    const statuses = geneDataList.map((g) => g.status)
    const sectionStatus = worstStatus(statuses)

    builtSections.push({
      narrative: {
        pathway: sys.name,
        status: sectionStatus,
        body: matched
          .map((g) => g.description)
          .filter(Boolean)
          .join(' '),
        priority:
          sectionStatus === 'actionable'
            ? `Priority: ${sys.name.toLowerCase()} support`
            : `Status: ${sectionStatus}`,
        hint: '',
        geneCount: matched.length,
        actionCount: totalActionCount,
      },
      genes: geneDataList,
    })
  }

  setSections(builtSections)
  setActions(allActions)
}

interface UseMentalHealthDataReturn {
  sections: PathwaySection[]
  loading: boolean
  totalGenes: number
  totalActions: number
  actions: Record<string, ActionData[]>
  getActionsForGene: (symbol: string) => ActionData[]
}

export function useMentalHealthData(): UseMentalHealthDataReturn {
  const { genes, loading: genesLoading } = useVaultGenes()
  const [sections, setSections] = useState<PathwaySection[]>([])
  const [actions, setActions] = useState<Record<string, ActionData[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (genesLoading || genes.length === 0) return

    buildFromVaultGenes(genes, setSections, setActions)
      .finally(() => setLoading(false))
  }, [genes, genesLoading])

  const totalGenes = sections.reduce((sum, s) => sum + s.genes.length, 0)
  const totalActions = sections.reduce((sum, s) => sum + s.narrative.actionCount, 0)

  return {
    sections,
    loading: loading || genesLoading,
    totalGenes,
    totalActions,
    actions,
    getActionsForGene: (symbol: string) => actions[symbol] ?? [],
  }
}
