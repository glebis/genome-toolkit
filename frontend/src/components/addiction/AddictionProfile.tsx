import { useState, useRef, useEffect } from 'react'
import { NarrativeBlock } from '../mental-health/NarrativeBlock'
import { GeneCard } from '../mental-health/GeneCard'
import { GeneDetail } from '../mental-health/GeneDetail'
import type { GeneData, EvidenceTier, ActionData } from '../../types/genomics'
import { EVIDENCE_LABELS, EVIDENCE_COLORS } from '../../types/genomics'
import { useAddictionData } from '../../hooks/useAddictionData'
import type { SubstanceCard } from '../../hooks/useAddictionData'
import { HeroHeader, StatBox, FilterChip, ExportBar, InfoCallout, SectionLabel, LoadingLabel, EmptyState, DashedDivider, ReportFooter } from '../common'
import { printPage, downloadFile, addictionToMarkdown } from '../../lib/export'

// ─── Sub-components ──────────────────────────────────────────────────────────

function SubstanceCardItem({ substance, added, onAdd }: { substance: SubstanceCard; added?: boolean; onAdd?: () => void }) {
  return (
    <div className="substance-card" style={{
      background: 'var(--bg-raised)',
      borderLeft: `4px solid ${substance.borderColor}`,
      border: `1.5px solid ${substance.borderColor}`,
      borderRadius: 6,
      padding: '14px 16px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          {substance.name}
        </span>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: substance.statusColor, fontFamily: 'var(--font-mono)' }}>
          {substance.status}
        </span>
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.6, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
        {substance.description}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
        {substance.genes}
      </div>
      <div style={{
        marginTop: 10,
        padding: '10px 14px',
        background: 'var(--bg-inset)',
        borderRadius: 4,
      }}>
        <div style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{substance.harmTitle}</span>
          {onAdd && (
            <button
              className="btn btn-add-action"
              style={{
                fontSize: 'var(--font-size-xs)',
                padding: '1px 6px',
                flexShrink: 0,
                opacity: added ? 0.4 : 0.6,
                color: added ? 'var(--sig-benefit)' : 'var(--primary)',
                borderColor: added ? 'var(--sig-benefit)' : 'var(--border)',
                cursor: added ? 'default' : 'pointer',
              }}
              disabled={added}
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              onMouseEnter={e => { if (!added) e.currentTarget.style.opacity = '1' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = added ? '0.4' : '0.6' }}
            >
              {added ? 'ADDED' : '+'}
            </button>
          )}
        </div>
        <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
          {substance.harmText}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AddictionProfileProps {
  onExport?: (format: string) => void
  onAddToChecklist?: (title: string, gene: string) => void
  onToggleAction?: (id: string) => void
  checklistIds?: Set<string>
  onAddActionToChecklist?: (action: ActionData) => void
}

export function AddictionProfile({ onExport: _onExport, onAddToChecklist, onToggleAction, checklistIds = new Set(), onAddActionToChecklist }: AddictionProfileProps) {
  const { pathways: PATHWAYS, substances: SUBSTANCES, loading, totalGenes: TOTAL_GENES, actionableCount: ACTIONABLE_COUNT, actions } = useAddictionData()
  const [addedSubstances, setAddedSubstances] = useState<Set<string>>(new Set())
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceTier | null>(null)
  const [expandedGene, setExpandedGene] = useState<GeneData | null>(null)
  const geneDetailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expandedGene && geneDetailRef.current) {
      geneDetailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expandedGene])

  const handleGeneClick = (gene: GeneData) => {
    setExpandedGene(prev => prev?.rsid === gene.rsid ? null : gene)
  }

  if (loading) return <LoadingLabel />

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Hero header */}
      <HeroHeader
        title="Addiction &amp; Reward Profile"
        description="How your genetics relate to reward sensitivity, substance metabolism, and dependence patterns. This is context for self-understanding and harm reduction, not diagnosis."
        genotypes={PATHWAYS.flatMap(s => s.genes.map(g => g.genotype))}
        glyphLabel="reward profile"
      >
        <div className="stats-row" style={{ display: 'flex', gap: 24, marginTop: 20 }}>
          <StatBox value={TOTAL_GENES} label="Genes analyzed" color="var(--sig-risk)" />
          <StatBox value={ACTIONABLE_COUNT} label="Actionable findings" color="var(--sig-reduced)" />
          <StatBox value={SUBSTANCES.length} label="Substances profiled" color="var(--primary)" />
          <StatBox value={PATHWAYS.length} label="Pathways mapped" color="var(--sig-benefit)" />
        </div>
      </HeroHeader>

      {/* Main content */}
      <div className="section-content" style={{ padding: '24px 24px 0' }}>

        {/* Context block */}
        <InfoCallout>
          This profile shows how your genetics relate to reward sensitivity, substance metabolism, and dependence patterns.
          Having variants associated with higher sensitivity does <strong>not</strong> mean you will develop
          dependence — genetics is one factor among many, including environment, mental health, social context, and personal
          history. This information is provided for <strong>self-understanding and harm reduction</strong>, not diagnosis.
        </InfoCallout>

        {/* Evidence filter */}
        <div className="filter-chips" style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
          <FilterChip label="All" isActive={evidenceFilter === null} onClick={() => setEvidenceFilter(null)} />
          {(['E1', 'E2', 'E3', 'E4', 'E5'] as EvidenceTier[]).map(tier => (
            <FilterChip
              key={tier}
              label={`${tier} ${EVIDENCE_LABELS[tier]}`}
              isActive={evidenceFilter === tier}
              onClick={() => setEvidenceFilter(evidenceFilter === tier ? null : tier)}
              activeColor={EVIDENCE_COLORS[tier]}
            />
          ))}
        </div>

        {/* Pathway sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24 }}>
          {PATHWAYS.map(section => {
            const visibleGenes = evidenceFilter
              ? section.genes.filter(g => g.evidenceTier === evidenceFilter)
              : section.genes
            if (visibleGenes.length === 0) return null
            return (
              <div key={section.narrative.pathway} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="pathway-row" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <NarrativeBlock narrative={section.narrative} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {visibleGenes.map(gene => (
                      <GeneCard key={`${gene.symbol}-${gene.rsid}`} gene={gene} onClick={handleGeneClick} />
                    ))}
                  </div>
                </div>
                {expandedGene && visibleGenes.some(g => g.rsid === expandedGene.rsid) && (
                  <div ref={geneDetailRef}>
                    <GeneDetail
                      gene={expandedGene}
                      actions={actions[expandedGene.symbol] || []}
                      onClose={() => setExpandedGene(null)}
                      onToggleAction={onToggleAction || (() => {})}
                      checklistIds={checklistIds}
                      onAddToChecklist={onAddActionToChecklist}
                    />
                  </div>
                )}
              </div>
            )
          }).filter(Boolean)}
          {evidenceFilter && PATHWAYS.every(s => s.genes.every(g => g.evidenceTier !== evidenceFilter)) && (
            <EmptyState message={`NO_RESULTS — no genes at ${evidenceFilter} (${EVIDENCE_LABELS[evidenceFilter]}) level`} />
          )}
        </div>

        {/* Divider */}
        <DashedDivider />

        {/* Substance harm reduction section */}
        <SectionLabel>Your substance-specific harm reduction notes</SectionLabel>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
          Based on your genetic profile across all pathways. These are summaries — see PGx panel for full metabolism details.
        </p>

        <div className="substance-cards" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {SUBSTANCES.map(substance => {
            const firstGene = substance.genes.match(/(\w+)/)?.[1] || 'custom'
            return (
              <SubstanceCardItem
                key={substance.name}
                substance={substance}
                added={addedSubstances.has(substance.name)}
                onAdd={onAddToChecklist ? () => {
                  setAddedSubstances(prev => new Set(prev).add(substance.name))
                  onAddToChecklist(`${substance.name}: ${substance.harmTitle}`, firstGene)
                } : undefined}
              />
            )
          })}
        </div>

        {/* Export buttons */}
        <ExportBar onExport={(format) => {
          if (format === 'md') {
            const md = addictionToMarkdown(PATHWAYS, SUBSTANCES)
            downloadFile(md, `addiction-profile-${new Date().toISOString().slice(0, 10)}.md`)
          } else if (format === 'doctor') {
            printPage('doctor')
          } else {
            printPage('pdf')
          }
        }} />

      </div>

      {/* Footer */}
      <ReportFooter
        left={<>{TOTAL_GENES} GENES &middot; {SUBSTANCES.length} SUBSTANCES &middot; HARM REDUCTION MODE</>}
        right="GENOME_TOOLKIT // ADDICTION & REWARD PROFILE"
      />

    </div>
  )
}
