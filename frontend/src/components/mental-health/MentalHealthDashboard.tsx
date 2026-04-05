import { useState } from 'react'
import type { PathwaySection, GeneData, ActionData, GeneStatus } from '../../types/genomics'
import { STATUS_COLORS } from '../../types/genomics'
import { useMentalHealthFilters } from '../../hooks/useMentalHealthFilters'
import { FilterBar } from './FilterBar'
import { NarrativeBlock } from './NarrativeBlock'
import { GeneCard } from './GeneCard'
import { GeneDetail } from './GeneDetail'

const GENE_META: Record<string, { populationInfo: string; explanation: string; interactions?: { genes: string; description: string }[] }> = {
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
  },
}

interface MentalHealthDashboardProps {
  data: PathwaySection[]
  totalGenes: number
  totalActions: number
  lastUpdated?: string
  onExport: (format: 'pdf' | 'md' | 'doctor') => void
  onGeneClick: (gene: GeneData) => void
  actions: Record<string, ActionData[]>
  onToggleAction: (id: string) => void
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
  onExport,
  onGeneClick,
  actions,
  onToggleAction,
}: MentalHealthDashboardProps) {
  const [expandedGene, setExpandedGene] = useState<GeneData | null>(null)
  const { activeCategory, activeActionType, setCategory, setActionType, clearAll, matchesGene, matchesAction } =
    useMentalHealthFilters()

  const handleGeneClick = (gene: GeneData) => {
    setExpandedGene(prev => (prev?.rsid === gene.rsid ? null : gene))
    onGeneClick(gene)
  }

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <FilterBar
        activeCategory={activeCategory}
        activeActionType={activeActionType}
        onCategoryChange={setCategory}
        onActionTypeChange={setActionType}
        onClearAll={clearAll}
        onExport={onExport}
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
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {filteredSections.length === 0 ? (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-tertiary)',
            padding: '40px 0',
            textAlign: 'center',
            letterSpacing: '0.1em',
          }}>
            NO_RESULTS — try clearing the active filter
          </div>
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
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <NarrativeBlock narrative={section.narrative} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {visibleGenes.map(gene => (
                      <GeneCard key={gene.rsid} gene={gene} onClick={handleGeneClick} />
                    ))}
                  </div>
                </div>
                {expandedGene && visibleGenes.some(g => g.rsid === expandedGene.rsid) && (
                  <GeneDetail
                    gene={expandedGene}
                    actions={(actions[expandedGene.symbol] || []).filter(a => matchesAction(a))}
                    populationInfo={GENE_META[expandedGene.symbol]?.populationInfo}
                    explanation={GENE_META[expandedGene.symbol]?.explanation}
                    interactions={GENE_META[expandedGene.symbol]?.interactions}
                    onClose={() => setExpandedGene(null)}
                    onToggleAction={onToggleAction}
                  />
                )}
              </div>
            )
          })
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
