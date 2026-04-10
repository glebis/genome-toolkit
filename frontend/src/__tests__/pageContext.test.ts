import { describe, it, expect } from 'vitest'
import { buildPageContext } from '../lib/pageContext'
import type { PageContextData } from '../lib/pageContext'

describe('buildPageContext', () => {
  it('returns risk page context with causes and genes', () => {
    const data: PageContextData = {
      mentalHealth: { sections: [], totalGenes: 0, totalActions: 0 },
      checklist: { pendingCount: 0, doneCount: 0, items: [] },
      snps: { result: { items: [], total: 0, page: 1, limit: 100 }, filters: { search: '', chromosome: '', source: '', clinical: true, significance: '', gene: '', condition: '', zygosity: '', page: 1, limit: 100 }, selectedSNP: null },
    }
    const ctx = buildPageContext('risk', data)
    expect(ctx).toContain('RISK LANDSCAPE')
    expect(ctx.length).toBeGreaterThan(20)
  })

  it('returns mental-health context with pathway and gene info', () => {
    const data: PageContextData = {
      mentalHealth: {
        sections: [{
          narrative: { pathway: 'Methylation', status: 'actionable', body: '', priority: '', hint: '', geneCount: 2, actionCount: 3 },
          genes: [
            { symbol: 'MTHFR', variant: 'C677T', rsid: 'rs1801133', genotype: 'T/T', status: 'actionable', evidenceTier: 'E2', studyCount: 12, description: 'Reduced folate.', actionCount: 1, categories: ['mood'], pathway: 'Methylation' },
            { symbol: 'COMT', variant: 'Val158Met', rsid: 'rs4680', genotype: 'A/G', status: 'monitor', evidenceTier: 'E2', studyCount: 30, description: 'Intermediate.', actionCount: 2, categories: ['mood'], pathway: 'Methylation' },
          ],
        }],
        totalGenes: 2,
        totalActions: 3,
      },
      checklist: { pendingCount: 1, doneCount: 0, items: [] },
      snps: { result: { items: [], total: 0, page: 1, limit: 100 }, filters: { search: '', chromosome: '', source: '', clinical: true, significance: '', gene: '', condition: '', zygosity: '', page: 1, limit: 100 }, selectedSNP: null },
    }
    const ctx = buildPageContext('mental-health', data)
    expect(ctx).toContain('MENTAL HEALTH')
    expect(ctx).toContain('Methylation')
    expect(ctx).toContain('MTHFR')
    expect(ctx).toContain('2 genes')
    expect(ctx).toContain('3 actions')
  })

  it('returns pgx context', () => {
    const data: PageContextData = {
      mentalHealth: { sections: [], totalGenes: 0, totalActions: 0 },
      checklist: { pendingCount: 0, doneCount: 0, items: [] },
      snps: { result: { items: [], total: 0, page: 1, limit: 100 }, filters: { search: '', chromosome: '', source: '', clinical: true, significance: '', gene: '', condition: '', zygosity: '', page: 1, limit: 100 }, selectedSNP: null },
    }
    const ctx = buildPageContext('pgx', data)
    expect(ctx).toContain('PGX / DRUG METABOLISM')
  })

  it('returns addiction context', () => {
    const data: PageContextData = {
      mentalHealth: { sections: [], totalGenes: 0, totalActions: 0 },
      checklist: { pendingCount: 0, doneCount: 0, items: [] },
      snps: { result: { items: [], total: 0, page: 1, limit: 100 }, filters: { search: '', chromosome: '', source: '', clinical: true, significance: '', gene: '', condition: '', zygosity: '', page: 1, limit: 100 }, selectedSNP: null },
    }
    const ctx = buildPageContext('addiction', data)
    expect(ctx).toContain('ADDICTION & REWARD')
  })

  it('returns snps context with filter info', () => {
    const data: PageContextData = {
      mentalHealth: { sections: [], totalGenes: 0, totalActions: 0 },
      checklist: { pendingCount: 0, doneCount: 0, items: [] },
      snps: {
        result: { items: [], total: 3400000, page: 1, limit: 100 },
        filters: { search: 'MTHFR', chromosome: '1', source: '', clinical: true, significance: '', gene: 'MTHFR', condition: '', zygosity: '', page: 1, limit: 100 },
        selectedSNP: { rsid: 'rs1801133', chromosome: '1', position: 11856378, genotype: 'T/T', is_rsid: true, source: 'genotyped', r2_quality: null, significance: 'Pathogenic', disease: 'MTHFR deficiency', gene_symbol: 'MTHFR' },
      },
    }
    const ctx = buildPageContext('snps', data)
    expect(ctx).toContain('SNP BROWSER')
    expect(ctx).toContain('3,400,000')
    expect(ctx).toContain('MTHFR')
    expect(ctx).toContain('rs1801133')
    expect(ctx).toContain('Pathogenic')
  })

  it('includes checklist summary when items exist', () => {
    const data: PageContextData = {
      mentalHealth: { sections: [], totalGenes: 0, totalActions: 0 },
      checklist: { pendingCount: 3, doneCount: 1, items: [] },
      snps: { result: { items: [], total: 0, page: 1, limit: 100 }, filters: { search: '', chromosome: '', source: '', clinical: true, significance: '', gene: '', condition: '', zygosity: '', page: 1, limit: 100 }, selectedSNP: null },
    }
    const ctx = buildPageContext('risk', data)
    expect(ctx).toContain('3 pending')
    expect(ctx).toContain('1 done')
  })

  it('handles empty mental-health data gracefully', () => {
    const data: PageContextData = {
      mentalHealth: { sections: [], totalGenes: 0, totalActions: 0 },
      checklist: { pendingCount: 0, doneCount: 0, items: [] },
      snps: { result: { items: [], total: 0, page: 1, limit: 100 }, filters: { search: '', chromosome: '', source: '', clinical: true, significance: '', gene: '', condition: '', zygosity: '', page: 1, limit: 100 }, selectedSNP: null },
    }
    const ctx = buildPageContext('mental-health', data)
    expect(ctx).toContain('MENTAL HEALTH')
    expect(ctx).toContain('0 genes')
  })
})
