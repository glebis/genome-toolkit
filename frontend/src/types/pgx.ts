export type MetabolizerStatus = 'unknown' | 'poor' | 'intermediate' | 'normal' | 'ultrarapid'
export type GeneType = 'enzyme' | 'transporter'

export const METABOLIZER_COLORS: Record<MetabolizerStatus, string> = {
  unknown: 'var(--text-tertiary)',
  poor: 'var(--sig-risk)',
  intermediate: 'var(--sig-reduced)',
  normal: 'var(--sig-benefit)',
  ultrarapid: 'var(--sig-danger)',
}

export const METABOLIZER_LABELS: Record<MetabolizerStatus, string> = {
  unknown: 'Unknown phenotype',
  poor: 'Poor Metabolizer',
  intermediate: 'Intermediate Metabolizer',
  normal: 'Normal Metabolizer',
  ultrarapid: 'Ultrarapid Metabolizer',
}

export const TRANSPORTER_LABELS: Record<MetabolizerStatus, string> = {
  unknown: 'Unknown function',
  poor: 'Poor Function',
  intermediate: 'Decreased Function',
  normal: 'Normal Function',
  ultrarapid: 'Increased Function',
}

export function statusLabel(status: MetabolizerStatus, geneType: GeneType): string {
  return geneType === 'transporter' ? TRANSPORTER_LABELS[status] : METABOLIZER_LABELS[status]
}

export type DrugImpact = 'ok' | 'adjust' | 'warn' | 'danger'

/** How strongly a drug/substance card's claim is backed by evidence.
 *  - guideline:       named clinical PGx guideline (e.g. CPIC). Prescriber-facing.
 *  - label:           FDA/EMA drug-label biomarker note. Prescriber-facing.
 *  - pk_only:         pharmacokinetic/metabolism note only; no dose amounts.
 *  - harm_reduction:  safety/combos/redosing context; NOT genotype-backed dosing.
 *  - exploratory:     research-only; low prominence, no prescriber framing. */
export type EvidenceScope = 'guideline' | 'label' | 'pk_only' | 'harm_reduction' | 'exploratory'

/** Short badge label shown per card. */
export const EVIDENCE_SCOPE_LABELS: Record<EvidenceScope, string> = {
  guideline: 'Guideline-backed PGx',
  label: 'Drug-label biomarker',
  pk_only: 'Pharmacokinetic note',
  harm_reduction: 'Harm-reduction note, not genotype-backed dosing',
  exploratory: 'Research-only',
}

/** Only these scopes may appear under prescriber-recommendation framing. */
export const PRESCRIBER_SCOPES: ReadonlySet<EvidenceScope> = new Set<EvidenceScope>(['guideline', 'label'])

export function isPrescriberScope(scope: EvidenceScope): boolean {
  return PRESCRIBER_SCOPES.has(scope)
}

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
  evidenceScope: EvidenceScope  // how strongly the claim is backed (see EvidenceScope)
}

export interface PGxEnzymeSection {
  enzyme: EnzymeData
  drugs: DrugCardData[]
}
