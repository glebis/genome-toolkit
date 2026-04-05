export type MetabolizerStatus = 'poor' | 'intermediate' | 'normal' | 'ultrarapid'

export const METABOLIZER_COLORS: Record<MetabolizerStatus, string> = {
  poor: 'var(--sig-risk)',
  intermediate: 'var(--sig-reduced)',
  normal: 'var(--sig-benefit)',
  ultrarapid: '#b84a4a',
}

export const METABOLIZER_LABELS: Record<MetabolizerStatus, string> = {
  poor: 'Poor Metabolizer',
  intermediate: 'Intermediate Metabolizer',
  normal: 'Normal Metabolizer',
  ultrarapid: 'Ultrarapid Metabolizer',
}

export type DrugImpact = 'ok' | 'adjust' | 'warn' | 'danger'

export interface EnzymeData {
  symbol: string
  alleles: string         // e.g. "*1/*4"
  status: MetabolizerStatus
  position: number        // 0-100, position on speed bar
  description: string
  guideline?: string      // "CPIC" or "DPWG"
}

export interface DrugCardData {
  drugClass: string       // e.g. "SSRIs"
  impact: DrugImpact
  statusText: string      // e.g. "May need dose adjustment"
  description: string
  drugList: string        // e.g. "fluoxetine, paroxetine"
  dangerNote?: string     // safety-critical note
  category: 'prescription' | 'substance'
}

export interface PGxEnzymeSection {
  enzyme: EnzymeData
  drugs: DrugCardData[]
}
