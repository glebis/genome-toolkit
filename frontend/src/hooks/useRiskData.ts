import { useState, useEffect } from 'react'
import { useVaultGenes } from './useVaultGenes'
import type { VaultGene } from './useVaultGenes'
import type { RiskStatus, MortalityCause, TimelineFrequency, TimelineItem, TimelineGroup, ConfidenceScore } from '../components/risk/RiskLandscape'

function mapEvidenceTier(tier: string): string {
  const labels: Record<string, string> = {
    E1: 'E1 GOLD',
    E2: 'E2 STRONG',
    E3: 'E3 MODERATE',
    E4: 'E4 PRELIMINARY',
    E5: 'E5 THEORETICAL',
  }
  return labels[tier] ?? tier
}

function mapGeneStatus(status: string): 'actionable' | 'monitor' | 'optimal' {
  if (status === 'risk' || status === 'actionable') return 'actionable'
  if (status === 'intermediate' || status === 'monitor') return 'monitor'
  return 'optimal'
}

function determineRiskStatus(matchedGenes: VaultGene[]): RiskStatus {
  if (matchedGenes.length === 0) return 'nodata'
  if (matchedGenes.some((g) => g.personal_status === 'risk' || g.personal_status === 'actionable'))
    return 'actionable'
  if (matchedGenes.some((g) => g.personal_status === 'intermediate' || g.personal_status === 'monitor'))
    return 'monitor'
  return 'optimal'
}

function buildNarrative(cause: string, matchedGenes: VaultGene[], actionCount: number): string | undefined {
  if (matchedGenes.length === 0) return undefined

  const actionable = matchedGenes.filter(
    (g) => g.personal_status === 'risk' || g.personal_status === 'actionable',
  )
  const monitors = matchedGenes.filter(
    (g) => g.personal_status === 'intermediate' || g.personal_status === 'monitor',
  )
  const optimal = matchedGenes.filter(
    (g) => g.personal_status !== 'risk' && g.personal_status !== 'actionable' &&
           g.personal_status !== 'intermediate' && g.personal_status !== 'monitor',
  )

  const parts: string[] = []

  // Opening: gene count + cause context
  parts.push(
    `${matchedGenes.length} gene${matchedGenes.length !== 1 ? 's' : ''} analyzed for ${cause.toLowerCase()} risk.`,
  )

  // Actionable genes — call out by name with brief why
  if (actionable.length > 0) {
    const summaries = actionable.map((g) => {
      const variant = g.personal_variants?.[0]?.genotype
      const variantStr = variant ? ` (${variant})` : ''
      return `${g.symbol}${variantStr}`
    })
    parts.push(
      `${summaries.join(', ')} ${actionable.length === 1 ? 'requires' : 'require'} attention.`,
    )
  }

  // Monitor genes
  if (monitors.length > 0) {
    const names = monitors.map((g) => g.symbol).join(', ')
    parts.push(`${names} — worth monitoring.`)
  }

  // Optimal genes — brief reassurance
  if (optimal.length > 0 && optimal.length < matchedGenes.length) {
    const names = optimal.map((g) => g.symbol).join(', ')
    parts.push(
      optimal.length === 1
        ? `${names} shows no elevated risk.`
        : `${names} show no elevated risk.`,
    )
  } else if (optimal.length === matchedGenes.length) {
    parts.push('No elevated risk variants detected across all analyzed genes.')
  }

  // Actions available
  if (actionCount > 0) {
    parts.push(`${actionCount} action${actionCount !== 1 ? 's' : ''} available.`)
  }

  return parts.join(' ')
}

function computePersonalBarPct(matchedGenes: VaultGene[], populationBarPct: number): number {
  if (matchedGenes.length === 0) return Math.round(populationBarPct * 0.3)
  const actionableCount = matchedGenes.filter(
    (g) => g.personal_status === 'risk' || g.personal_status === 'actionable',
  ).length
  const monitorCount = matchedGenes.filter(
    (g) => g.personal_status === 'intermediate' || g.personal_status === 'monitor',
  ).length
  const factor = 1 + actionableCount * 0.3 + monitorCount * 0.1
  return Math.min(Math.round(populationBarPct * factor), 100)
}

function computeConfidence(matchedGenes: VaultGene[]): ConfidenceScore {
  const n = matchedGenes.length
  if (n === 0) return { filled: 0, total: 3, tooltip: 'No genes analyzed' }

  const tierValues: Record<string, number> = { E1: 1, E2: 2, E3: 3, E4: 4, E5: 5 }
  const avgTier = matchedGenes.reduce((sum, g) => sum + (tierValues[g.evidence_tier] ?? 3), 0) / n
  const avgLabel = `E${Math.round(avgTier)}`

  let filled = 0
  if (n >= 3 && avgTier <= 2) filled = 3
  else if (n >= 2 || avgTier <= 3) filled = 2
  else if (n >= 1) filled = 1

  return {
    filled,
    total: 3,
    tooltip: `${n} gene${n !== 1 ? 's' : ''} analyzed, avg evidence ${avgLabel}`,
  }
}

const FREQUENCY_KEYWORDS: [TimelineFrequency, RegExp][] = [
  ['quarterly', /quarterly|every 3 months|3-monthly/i],
  ['biannual', /biannual|every 6 months|twice a year|semi-annual/i],
  ['annually', /annual|yearly|every year|once a year/i],
]

function classifyFrequency(text: string): TimelineFrequency {
  for (const [freq, re] of FREQUENCY_KEYWORDS) {
    if (re.test(text)) return freq
  }
  return 'once'
}

const TIMELINE_META: Record<TimelineFrequency, { label: string; color: string; order: number }> = {
  quarterly: { label: 'QUARTERLY', color: 'var(--sig-risk)', order: 0 },
  biannual: { label: 'BIANNUAL', color: 'var(--sig-monitor)', order: 1 },
  annually: { label: 'ANNUALLY', color: 'var(--sig-benefit)', order: 2 },
  once: { label: 'ONCE / AS NEEDED', color: 'var(--primary)', order: 3 },
}

function buildTimeline(
  configScreenings: ConfigScreening[],
  vaultActions: { type: string; text: string }[],
): TimelineGroup[] {
  const items: TimelineItem[] = []

  for (const s of configScreenings) {
    items.push({
      name: s.name,
      type: s.type === 'consider' || s.type === 'monitor' || s.type === 'discuss' ? s.type : 'consider',
      frequency: s.frequency as TimelineFrequency,
      gene: s.gene,
      source: 'screening',
    })
  }

  for (const a of vaultActions) {
    items.push({
      name: a.text,
      type: a.type === 'consider' || a.type === 'monitor' || a.type === 'discuss' ? a.type : 'consider',
      frequency: classifyFrequency(a.text),
      source: 'vault',
    })
  }

  const groups: TimelineGroup[] = []
  for (const freq of ['quarterly', 'biannual', 'annually', 'once'] as TimelineFrequency[]) {
    const freqItems = items.filter(i => i.frequency === freq)
    if (freqItems.length > 0) {
      const meta = TIMELINE_META[freq]
      groups.push({ frequency: freq, label: meta.label, color: meta.color, items: freqItems })
    }
  }

  return groups
}

interface ConfigScreening {
  name: string
  frequency: string
  type: string
  gene?: string
}

interface ConfigCause {
  rank: number
  cause: string
  pct: number
  populationBarPct: number
  relevant_genes: string[]
  description?: string
  screenings?: ConfigScreening[]
}

export interface Demographic {
  sex: string
  age_range: string
  ancestry: string
}

interface UseRiskDataReturn {
  causes: MortalityCause[]
  demographic: Demographic | null
  loading: boolean
}

export function useRiskData(): UseRiskDataReturn {
  const { genes, loading: genesLoading } = useVaultGenes()
  const [config, setConfig] = useState<ConfigCause[] | null>(null)
  const [demographic, setDemographic] = useState<Demographic | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [causes, setCauses] = useState<MortalityCause[]>([])

  // Fetch config
  useEffect(() => {
    fetch('/api/config/risk-landscape')
      .then((res) => {
        if (!res.ok) throw new Error(`Config API responded with ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setConfig(data.causes ?? data)
        if (data.demographic) setDemographic(data.demographic)
        setConfigLoading(false)
      })
      .catch((err) => {
        console.error('[useRiskData] Config fetch failed:', err)
        setConfigLoading(false)
      })
  }, [])

  // Build causes once both are ready
  useEffect(() => {
    if (genesLoading || configLoading || !config) return

    const geneMap = new Map<string, VaultGene>()
    for (const g of genes) {
      geneMap.set(g.symbol.toUpperCase(), g)
    }

    const buildCauses = async () => {
      const built: MortalityCause[] = []

      for (const c of config) {
        const matchedGenes = (c.relevant_genes ?? [])
          .map((sym: string) => geneMap.get(sym.toUpperCase()))
          .filter(Boolean) as VaultGene[]

        const status = determineRiskStatus(matchedGenes)
        const personalBarPct = computePersonalBarPct(matchedGenes, c.populationBarPct)

        const geneMinis = matchedGenes.map((g) => ({
          symbol: g.symbol,
          variant: g.personal_variants?.[0]?.genotype ?? '',
          evidenceTier: mapEvidenceTier(g.evidence_tier),
          status: mapGeneStatus(g.personal_status),
          description: g.description,
        }))

        const actionableGenes = matchedGenes.filter(
          (g) => g.personal_status === 'risk' || g.personal_status === 'actionable',
        )

        // Fetch actions for actionable genes
        const actionMinis: { type: 'consider' | 'monitor' | 'discuss'; text: string }[] = []
        for (const ag of actionableGenes) {
          try {
            const res = await fetch(`/api/vault/genes/${ag.symbol}/actions`)
            if (res.ok) {
              const data = await res.json()
              for (const a of data.actions ?? []) {
                const actionType =
                  a.type === 'consider' || a.type === 'monitor' || a.type === 'discuss'
                    ? a.type
                    : 'consider'
                actionMinis.push({ type: actionType, text: a.title || a.text || a.description })
              }
            }
          } catch {
            // skip failed action fetches
          }
        }

        const genesText =
          matchedGenes.length > 0
            ? matchedGenes.map((g) => g.symbol).join(', ')
            : 'No relevant variants detected'

        const actionableCount = matchedGenes.filter(
          (g) => g.personal_status === 'risk' || g.personal_status === 'actionable',
        ).length
        const statusText =
          status === 'actionable'
            ? `Actionable — ${actionableCount} gene${actionableCount !== 1 ? 's' : ''}, ${actionMinis.length} action${actionMinis.length !== 1 ? 's' : ''}`
            : status === 'monitor'
              ? `Monitor — ${matchedGenes.length} gene${matchedGenes.length !== 1 ? 's' : ''}`
              : status === 'optimal'
                ? 'Optimal — no elevated risk variants'
                : 'No genetic data available'

        const narrative = buildNarrative(c.cause, matchedGenes, actionMinis.length)
        const confidence = computeConfidence(matchedGenes)
        const timeline = buildTimeline(c.screenings ?? [], actionMinis)

        built.push({
          rank: c.rank,
          cause: c.cause,
          pct: c.pct,
          populationBarPct: c.populationBarPct,
          personalBarPct,
          status,
          genesText,
          statusText,
          narrative: narrative || undefined,
          genes: geneMinis.length > 0 ? geneMinis : undefined,
          actions: actionMinis.length > 0 ? actionMinis : undefined,
          timeline: timeline.length > 0 ? timeline : undefined,
          confidence,
        })
      }

      setCauses(built)
    }

    buildCauses()
  }, [genes, genesLoading, config, configLoading])

  return {
    causes,
    demographic,
    loading: genesLoading || configLoading || (config !== null && causes.length === 0),
  }
}
