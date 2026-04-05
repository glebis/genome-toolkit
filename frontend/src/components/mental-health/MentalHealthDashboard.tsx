import type { PathwaySection, GeneData, GeneStatus } from '../../types/genomics'
import { STATUS_COLORS } from '../../types/genomics'
import { useMentalHealthFilters } from '../../hooks/useMentalHealthFilters'
import { FilterBar } from './FilterBar'
import { NarrativeBlock } from './NarrativeBlock'
import { GeneCard } from './GeneCard'

interface MentalHealthDashboardProps {
  data: PathwaySection[]
  totalGenes: number
  totalActions: number
  lastUpdated?: string
  onExport: (format: 'pdf' | 'md' | 'doctor') => void
  onGeneClick: (gene: GeneData) => void
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
}: MentalHealthDashboardProps) {
  const { activeCategory, activeActionType, setCategory, setActionType, clearAll, matchesGene } =
    useMentalHealthFilters()

  const filteredSections = data.filter(section => {
    if (activeCategory === null && activeActionType === null) return true
    // Keep section if any gene in it matches the active category filter
    return section.genes.some(gene => matchesGene(gene))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
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
      <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}
              >
                <NarrativeBlock narrative={section.narrative} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visibleGenes.map(gene => (
                    <GeneCard key={gene.rsid} gene={gene} onClick={onGeneClick} />
                  ))}
                </div>
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
