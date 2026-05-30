import { useState, useRef, useEffect } from 'react'
import type { PathwaySection, GeneData, ActionData, GeneStatus } from '../../types/genomics'
import { STATUS_COLORS } from '../../types/genomics'
import { useMentalHealthFilters } from '../../hooks/useMentalHealthFilters'
import { FilterBar } from './FilterBar'
import { ActionRoadmap } from './ActionRoadmap'
import { NarrativeBlock } from './NarrativeBlock'
import { GeneCard } from './GeneCard'
import { GeneDetail } from './GeneDetail'
import { HeroHeader, StatBox, EmptyState } from '../common'
import { GWASFindings } from './GWASFindings'
import { useGWASTraits } from '../../hooks/useGWASTraits'

import type { GeneMeta } from '../../hooks/useMentalHealthData'

// Fallback gene meta — used when vault notes lack population_info/explanation sections.
// Server returns gene_meta from vault; this covers gaps for well-known genes.
const FALLBACK_GENE_META: Record<string, GeneMeta> = {
  'MTHFR': {
    populationInfo: '~10% of Europeans carry T/T. ~25% carry at least one T allele. More common in Mediterranean ancestry.',
    explanation: 'MTHFR converts dietary folate into methylfolate, the active form your body uses. With T/T, this conversion runs at about 30% efficiency. This doesn\'t mean you\'re deficient — it means you may need more folate or a more bioavailable form.',
    interactions: [
      { genes: 'MTHFR + COMT', description: 'Both affect methylation. Slow COMT may mean methyl donors build up — folinic acid may be better tolerated than methylfolate.' },
      { genes: 'MTHFR + MTR/MTRR', description: 'B12 recycling feeds into the same pathway. B12 supplementation becomes more important.' },
    ],
  },
  'COMT': {
    populationInfo: '~25% of Europeans carry A/A (slow). Sometimes called the "Worrier" genotype.',
    explanation: 'COMT clears dopamine from the prefrontal cortex. Slow COMT means dopamine lingers longer — better focus in calm environments, but stress neurotransmitters also take longer to clear.',
    interactions: [
      { genes: 'COMT + MAO-A', description: 'Both slow — slower neurotransmitter clearance overall.' },
    ],
  },
  'GAD1': {
    populationInfo: '~40% of population carries at least one risk allele.',
    explanation: 'GAD1 encodes the enzyme that produces GABA, the brain\'s primary calming neurotransmitter. Your variant is associated with slightly lower GABA production.',
    interactions: [],
  },
}

interface MentalHealthDashboardProps {
  data: PathwaySection[]
  totalGenes: number
  totalActions: number
  lastUpdated?: string
  geneMeta?: Record<string, GeneMeta>
  onExport: (format: 'pdf' | 'md' | 'doctor') => void
  onGeneClick: (gene: GeneData) => void
  actions: Record<string, ActionData[]>
  onToggleAction: (id: string) => void
  onDiscuss?: (context: string) => void
  checklistIds?: Set<string>
  onAddToChecklist?: (action: ActionData) => void
}

const LEGEND_ITEMS: { status: GeneStatus; label: string }[] = [
  { status: 'actionable', label: 'Actionable' },
  { status: 'monitor', label: 'Monitor' },
  { status: 'optimal', label: 'Optimal' },
  { status: 'neutral', label: 'Neutral' },
]

export function MentalHealthDashboard({
  data,
  totalGenes,
  totalActions,
  lastUpdated,
  geneMeta: serverGeneMeta = {},
  onExport,
  onGeneClick,
  actions,
  onToggleAction,
  onDiscuss,
  checklistIds = new Set(),
  onAddToChecklist,
}: MentalHealthDashboardProps) {
  // Merge server gene_meta with fallback — server data takes priority
  const GENE_META = { ...FALLBACK_GENE_META, ...serverGeneMeta }
  const [expandedGene, setExpandedGene] = useState<GeneData | null>(null)
  const { traits: gwasTraits } = useGWASTraits()
  const { activeCategory, activeActionType, setCategory, setActionType, clearAll, matchesGene, matchesAction } =
    useMentalHealthFilters()

  const geneDetailRef = useRef<HTMLDivElement>(null)

  // All gene symbols on the dashboard — used by WikilinkText to decide click behavior
  const allDashboardGenes = new Set(data.flatMap(s => s.genes.map(g => g.symbol)))

  const handleGeneClick = (gene: GeneData) => {
    setExpandedGene(prev => (prev?.rsid === gene.rsid ? null : gene))
    onGeneClick(gene)
  }

  /** Navigate to a gene by symbol — find it across all sections, expand & scroll */
  const handleNavigateToGene = (symbol: string) => {
    for (const section of data) {
      const gene = section.genes.find(g => g.symbol === symbol)
      if (gene) {
        setExpandedGene(gene)
        onGeneClick(gene)
        return
      }
    }
    // Gene not on dashboard — fall back to chat
    onDiscuss?.(`Read the vault note for ${symbol}`)
  }

  // Scroll GeneDetail into view when expanded
  useEffect(() => {
    if (expandedGene && geneDetailRef.current) {
      geneDetailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [expandedGene])

  const filteredSections = data.filter(section => {
    if (activeCategory === null && activeActionType === null) return true
    // Category filter: keep section if any gene matches
    if (activeCategory && !section.genes.some(gene => matchesGene(gene))) return false
    // Action type filter: keep section if any gene has matching actions
    if (activeActionType) {
      const sectionGeneSymbols = section.genes.map(g => g.symbol)
      const hasMatchingAction = sectionGeneSymbols.some(symbol =>
        (actions[symbol] || []).some(a => matchesAction(a))
      )
      if (!hasMatchingAction) return false
    }
    return true
  })

  // Count genes by status
  const actionableCount = data.reduce((sum, s) => sum + s.genes.filter(g => g.status === 'actionable').length, 0)
  const monitorCount = data.reduce((sum, s) => sum + s.genes.filter(g => g.status === 'monitor').length, 0)
  const optimalCount = data.reduce((sum, s) => sum + s.genes.filter(g => g.status === 'optimal').length, 0)

  // Generate integral evaluation from actual data
  const generateEvaluation = (): string => {
    const actionableGenes = data.flatMap(s => s.genes.filter(g => g.status === 'actionable'))
    const optimalGenes = data.flatMap(s => s.genes.filter(g => g.status === 'optimal'))
    const monitorGenes = data.flatMap(s => s.genes.filter(g => g.status === 'monitor'))
    const actionablePathways = data.filter(s => s.narrative.status === 'actionable').map(s => s.narrative.pathway)
    const optimalPathways = data.filter(s => s.narrative.status === 'optimal').map(s => s.narrative.pathway)

    const parts: string[] = []

    if (actionableGenes.length > 0) {
      const geneNames = actionableGenes.map(g => g.symbol).join(', ')
      parts.push(`Your primary focus area is ${actionablePathways[0] || 'methylation'} — ${geneNames} ${actionableGenes.length === 1 ? 'shows' : 'show'} variants that benefit from targeted intervention.`)
    }

    if (optimalGenes.length > 0) {
      const pathwayNames = optimalPathways.join(' and ')
      parts.push(`${pathwayNames || 'Key pathways'} ${optimalPathways.length === 1 ? 'is' : 'are'} in the optimal range, providing protective factors.`)
    }

    if (monitorGenes.length > 0) {
      parts.push(`${monitorGenes.length} ${monitorGenes.length === 1 ? 'gene requires' : 'genes require'} monitoring but no immediate action.`)
    }

    if (totalActions > 0) {
      parts.push(`${totalActions} evidence-based actions are available across your profile.`)
    }

    return parts.join(' ')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Hero header */}
      <HeroHeader
        title="Mental Health"
        description={generateEvaluation()}
        genotypes={data.flatMap(s => s.genes.map(g => g.genotype))}
        glyphLabel="your profile"
      >
        <div className="stats-row" style={{ display: 'flex', gap: 24, marginTop: 20 }}>
          <StatBox value={actionableCount} label="Actionable" color="var(--sig-risk)" />
          <StatBox value={monitorCount} label="Monitor" color="var(--sig-reduced)" />
          <StatBox value={optimalCount} label="Optimal" color="var(--sig-benefit)" />
          <StatBox value={totalActions} label="Actions available" color="var(--primary)" />
          <StatBox value={data.length} label="Pathways mapped" color="var(--text-secondary)" />
        </div>
      </HeroHeader>

      <FilterBar
        activeCategory={activeCategory}
        activeActionType={activeActionType}
        onCategoryChange={setCategory}
        onActionTypeChange={setActionType}
        onClearAll={clearAll}
        onExport={onExport}
      />

      <ActionRoadmap
        sections={data}
        actions={actions}
        onAddToChecklist={onAddToChecklist ? (action) => onAddToChecklist(action) : () => {}}
        checklistIds={checklistIds}
        activeCategory={activeCategory}
        activeActionType={activeActionType}
      />

      {/* Color legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '10px 24px',
        borderBottom: '1px dashed var(--border-dashed)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginRight: 4,
        }}>
          Legend:
        </span>
        {LEGEND_ITEMS.map(({ status, label }) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: STATUS_COLORS[status],
              display: 'inline-block',
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Pathway rows */}
      <div className="section-content" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {filteredSections.length === 0 ? (
          <EmptyState message="NO_RESULTS" hint="try clearing the active filter" />
        ) : (
          filteredSections.map(section => {
            const visibleGenes = activeCategory
              ? section.genes.filter(gene => matchesGene(gene))
              : section.genes

            return (
              <div
                key={section.narrative.pathway}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div className="pathway-row" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <NarrativeBlock narrative={section.narrative} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {visibleGenes.map(gene => (
                      <GeneCard key={gene.symbol} gene={gene} onClick={handleGeneClick} />
                    ))}
                  </div>
                </div>
                {expandedGene && visibleGenes.some(g => g.rsid === expandedGene.rsid) && (
                  <div ref={geneDetailRef}>
                    <GeneDetail
                      gene={expandedGene}
                      actions={(actions[expandedGene.symbol] || []).filter(a => matchesAction(a))}
                      populationInfo={GENE_META[expandedGene.symbol]?.populationInfo}
                      explanation={GENE_META[expandedGene.symbol]?.explanation}
                      interactions={GENE_META[expandedGene.symbol]?.interactions}
                      onClose={() => setExpandedGene(null)}
                      onToggleAction={onToggleAction}
                      onDiscuss={onDiscuss}
                      dashboardGenes={allDashboardGenes}
                      onNavigateToGene={handleNavigateToGene}
                      checklistIds={checklistIds}
                      onAddToChecklist={onAddToChecklist}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* PGC GWAS findings — one panel per available trait */}
        {gwasTraits.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 var(--space-lg) var(--space-lg)' }}>
            {gwasTraits.map(t => (
              <GWASFindings key={t.trait} trait={t.trait} onDiscuss={onDiscuss} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        padding: 'var(--space-xs) var(--space-lg)',
        borderTop: '1px dashed var(--border-dashed)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span className="label">
          {totalGenes} GENES / {totalActions} ACTIONS
        </span>
        {lastUpdated && (
          <span className="label" style={{ color: 'var(--text-tertiary)' }}>
            UPDATED: {lastUpdated}
          </span>
        )}
        <span className="label">MENTAL_HEALTH // PATHWAY_VIEW</span>
      </footer>
    </div>
  )
}
