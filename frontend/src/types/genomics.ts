export type EvidenceTier = 'E1' | 'E2' | 'E3' | 'E4' | 'E5'

export const EVIDENCE_LABELS: Record<EvidenceTier, string> = {
  E1: 'GOLD STANDARD',
  E2: 'STRONG',
  E3: 'MODERATE',
  E4: 'PRELIMINARY',
  E5: 'THEORETICAL',
}

export const EVIDENCE_COLORS: Record<EvidenceTier, string> = {
  E1: 'var(--evidence-e1)',
  E2: 'var(--evidence-e2)',
  E3: 'var(--evidence-e3)',
  E4: 'var(--evidence-e4)',
  E5: 'var(--evidence-e5)',
}

export type GeneStatus = 'actionable' | 'monitor' | 'optimal' | 'neutral'

export const STATUS_COLORS: Record<GeneStatus, string> = {
  actionable: 'var(--sig-risk)',
  monitor: 'var(--sig-reduced)',
  optimal: 'var(--sig-benefit)',
  neutral: 'var(--sig-neutral)',
}

export type ActionType = 'consider' | 'monitor' | 'discuss' | 'try'

export const ACTION_TYPE_COLORS: Record<ActionType, string> = {
  consider: 'var(--sig-risk)',
  monitor: 'var(--sig-reduced)',
  discuss: 'var(--primary)',
  try: 'var(--sig-benefit)',
}

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  consider: 'Consider',
  monitor: 'Monitor',
  discuss: 'Discuss',
  try: 'Try',
}

export type Category = 'mood' | 'stress' | 'sleep' | 'focus'

export interface GeneData {
  symbol: string
  variant: string
  rsid: string
  chromosome?: string
  position?: number
  genotype: string
  status: GeneStatus
  evidenceTier: EvidenceTier
  studyCount: number
  description: string
  actionCount: number
  categories: Category[]
  pathway: string
}

export interface ActionData {
  id: string
  type: ActionType
  title: string
  description: string
  detail?: string
  evidenceTier: EvidenceTier
  studyCount: number
  tags: string[]
  geneSymbol: string
  done: boolean
}

export interface NarrativeData {
  pathway: string
  status: GeneStatus
  body: string
  priority: string
  hint: string
  geneCount: number
  actionCount: number
}

export interface PathwaySection {
  narrative: NarrativeData
  genes: GeneData[]
}

export interface MentalHealthDashboard {
  sections: PathwaySection[]
  totalGenes: number
  totalActions: number
  lastUpdated: string
}
