import { useState, useRef, useEffect } from 'react'
import type { PathwaySection, GeneData, ActionData, GeneStatus } from '../../types/genomics'
import { STATUS_COLORS } from '../../types/genomics'
import { useMentalHealthFilters } from '../../hooks/useMentalHealthFilters'
import { FilterBar } from './FilterBar'
import { NarrativeBlock } from './NarrativeBlock'
import { GeneCard } from './GeneCard'
import { GeneDetail } from './GeneDetail'
import { GenomeGlyph } from '../GenomeGlyph'
import { GWASFindings } from './GWASFindings'

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
  onExport,
  onGeneClick,
  actions,
  onToggleAction,
  onDiscuss,
  checklistIds = new Set(),
  onAddToChecklist,
}: MentalHealthDashboardProps) {
  const [expandedGene, setExpandedGene] = useState<GeneData | null>(null)
  const { activeCategory, activeActionType, setCategory, setActionType, clearAll, matchesGene, matchesAction } =
    useMentalHealthFilters()

  const geneDetailRef = useRef<HTMLDivElement>(null)

  const handleGeneClick = (gene: GeneData) => {
    setExpandedGene(prev => (prev?.rsid === gene.rsid ? null : gene))
    onGeneClick(gene)
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
      <div className="hero-header" style={{
        padding: '40px 24px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
      }}>
        {/* Genome Glyph */}
        <GenomeGlyph
          genotypes={data.flatMap(s => s.genes.map(g => g.genotype))}
          size={100}
          label="your profile"
        />
        <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '0.08em',
          fontFamily: 'var(--font-mono)',
          marginBottom: 8,
        }}>
          Mental Health
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--text)',
          lineHeight: 1.8,
          maxWidth: 760,
          fontFamily: 'var(--font-mono)',
          marginBottom: 4,
        }}>
          {generateEvaluation()}
        </div>
        <div className="stats-row" style={{
          display: 'flex',
          gap: 24,
          marginTop: 20,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--sig-risk)', fontFamily: 'var(--font-mono)' }}>
              {actionableCount}
            </span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Actionable
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--sig-reduced)', fontFamily: 'var(--font-mono)' }}>
              {monitorCount}
            </span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Monitor
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--sig-benefit)', fontFamily: 'var(--font-mono)' }}>
              {optimalCount}
            </span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Optimal
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
              {totalActions}
            </span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Actions available
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {data.length}
            </span>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              Pathways mapped
            </span>
          </div>
        </div>
        </div>{/* close flex wrapper */}
      </div>

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
      <div className="section-content" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                <div className="pathway-row" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <NarrativeBlock narrative={section.narrative} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {visibleGenes.map(gene => (
                      <GeneCard key={gene.rsid} gene={gene} onClick={handleGeneClick} />
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
                      checklistIds={checklistIds}
                      onAddToChecklist={onAddToChecklist}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* PGC GWAS findings — only shows if config/gwas/anxiety-hits.json exists */}
        <div style={{ padding: '0 var(--space-lg) var(--space-lg)' }}>
          <GWASFindings trait="anxiety" />
        </div>
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
