export type MetabolizerStatus = 'poor' | 'intermediate' | 'normal' | 'ultrarapid'
export type GeneType = 'enzyme' | 'transporter'

export const METABOLIZER_COLORS: Record<MetabolizerStatus, string> = {
  poor: 'var(--sig-risk)',
  intermediate: 'var(--sig-reduced)',
  normal: 'var(--sig-benefit)',
  ultrarapid: 'var(--sig-danger)',
}

export const METABOLIZER_LABELS: Record<MetabolizerStatus, string> = {
  poor: 'Poor Metabolizer',
  intermediate: 'Intermediate Metabolizer',
  normal: 'Normal Metabolizer',
  ultrarapid: 'Ultrarapid Metabolizer',
}

export const TRANSPORTER_LABELS: Record<MetabolizerStatus, string> = {
  poor: 'Poor Function',
  intermediate: 'Decreased Function',
  normal: 'Normal Function',
  ultrarapid: 'Increased Function',
}

export function statusLabel(status: MetabolizerStatus, geneType: GeneType): string {
  return geneType === 'transporter' ? TRANSPORTER_LABELS[status] : METABOLIZER_LABELS[status]
}

export type DrugImpact = 'ok' | 'adjust' | 'warn' | 'danger'

export interface EnzymeData {
  symbol: string
  alleles: string         // e.g. "*1/*4"
  status: MetabolizerStatus
  position: number        // 0-100, position on speed bar
  description: string
  guideline?: string      // "CPIC" or "DPWG"
  geneType: GeneType      // enzyme vs transporter — affects labels/copy
  about?: string          // longer educational text shown on expand
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
