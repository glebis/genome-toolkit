import type { PathwaySection } from '../types/genomics'
import type { SNP, SNPFilters, SNPResult } from '../hooks/useSNPs'

export interface PageContextData {
  mentalHealth: {
    sections: PathwaySection[]
    totalGenes: number
    totalActions: number
  }
  checklist: {
    pendingCount: number
    doneCount: number
    items: { title: string; gene_symbol: string }[]
  }
  snps: {
    result: SNPResult
    filters: SNPFilters
    selectedSNP: SNP | null
  }
}

const VIEW_NAMES: Record<string, string> = {
  'risk': 'RISK LANDSCAPE',
  'mental-health': 'MENTAL HEALTH',
  'pgx': 'PGX / DRUG METABOLISM',
  'addiction': 'ADDICTION & REWARD',
  'snps': 'SNP BROWSER',
}

export function buildPageContext(view: string, data: PageContextData): string {
  const lines: string[] = []
  const name = VIEW_NAMES[view] || view.toUpperCase()
  lines.push(`You are on the ${name} page.`)

  if (view === 'mental-health') {
    lines.push(buildMentalHealthContext(data))
  } else if (view === 'snps') {
    lines.push(buildSNPsContext(data))
  } else if (view === 'risk') {
    lines.push('This page shows the top causes of mortality ranked by population prevalence, overlaid with the user\'s personal genetic risk factors.')
    lines.push('Use your genome tools to look up specific risk genes if the user asks about a cause.')
  } else if (view === 'pgx') {
    lines.push('This page shows pharmacogenomic enzyme activity (CYP2D6, CYP2C19, etc.), drug metabolism predictions, and substance-specific harm reduction notes.')
    lines.push('Use your genome tools to look up specific enzyme genes if the user asks about a drug.')
  } else if (view === 'addiction') {
    lines.push('This page shows addiction & reward pathways (dopamine, opioid, GABA, endocannabinoid), substance-specific harm reduction cards, and pathway gene analysis.')
    lines.push('Use your genome tools to look up specific addiction-related genes if the user asks.')
  }

  if (data.checklist.pendingCount > 0 || data.checklist.doneCount > 0) {
    lines.push(`Checklist: ${data.checklist.pendingCount} pending, ${data.checklist.doneCount} done.`)
  }

  return lines.filter(Boolean).join('\n')
}

function buildMentalHealthContext(data: PageContextData): string {
  const { sections, totalGenes, totalActions } = data.mentalHealth
  const lines: string[] = []
  lines.push(`${totalGenes} genes analyzed, ${totalActions} actions available.`)

  for (const section of sections) {
    const n = section.narrative
    const geneList = section.genes.map(g => {
      const status = g.status === 'actionable' ? '!' : g.status === 'monitor' ? '~' : ''
      return `${status}${g.symbol} ${g.variant} ${g.genotype}`
    }).join(', ')
    lines.push(`${n.pathway} [${n.status}]: ${n.geneCount} genes, ${n.actionCount} actions. Genes: ${geneList}`)
  }

  return lines.join('\n')
}

function buildSNPsContext(data: PageContextData): string {
  const { result, filters, selectedSNP } = data.snps
  const lines: string[] = []
  lines.push(`Showing ${result.total.toLocaleString()} variants.`)

  const activeFilters: string[] = []
  if (filters.search) activeFilters.push(`search="${filters.search}"`)
  if (filters.chromosome) activeFilters.push(`chr=${filters.chromosome}`)
  if (filters.gene) activeFilters.push(`gene=${filters.gene}`)
  if (filters.significance) activeFilters.push(`significance=${filters.significance}`)
  if (filters.condition) activeFilters.push(`condition="${filters.condition}"`)
  if (filters.clinical) activeFilters.push('clinical=on')
  if (filters.source) activeFilters.push(`source=${filters.source}`)
  if (filters.zygosity) activeFilters.push(`zygosity=${filters.zygosity}`)
  if (activeFilters.length > 0) {
    lines.push(`Active filters: ${activeFilters.join(', ')}`)
  }

  if (selectedSNP) {
    lines.push(`Selected variant: ${selectedSNP.rsid} (${selectedSNP.gene_symbol || 'no gene'}, ${selectedSNP.genotype}, ${selectedSNP.significance || 'no significance'})`)
  }

  return lines.join('\n')
}
