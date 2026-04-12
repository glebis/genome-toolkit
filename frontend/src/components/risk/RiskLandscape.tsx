import { useState } from 'react'
import { useRiskData } from '../../hooks/useRiskData'
import { HeroHeader, StatBox, ExportBar, InfoCallout, LoadingLabel } from '../common'
import { printPage, downloadFile, riskLandscapeToMarkdown } from '../../lib/export'

// ── Types ──────────────────────────────────────────────────────────────────

type RiskStatus = 'actionable' | 'monitor' | 'optimal' | 'nodata'

interface GeneMini {
  symbol: string
  variant: string
  evidenceTier: string
  status: 'actionable' | 'monitor' | 'optimal'
  description: string
}

interface ActionMini {
  type: 'consider' | 'monitor' | 'discuss'
  text: string
}

type TimelineFrequency = 'quarterly' | 'biannual' | 'annually' | 'once'

interface TimelineItem {
  name: string
  type: 'consider' | 'monitor' | 'discuss'
  frequency: TimelineFrequency
  gene?: string
  source: 'screening' | 'vault'
}

interface TimelineGroup {
  frequency: TimelineFrequency
  label: string
  color: string
  items: TimelineItem[]
}

interface ConfidenceScore {
  filled: number
  total: 3
  tooltip: string
}

interface MortalityCause {
  rank: number
  cause: string
  pct: number
  populationBarPct: number
  personalBarPct: number
  status: RiskStatus
  genesText: string
  statusText: string
  narrative?: string
  genes?: GeneMini[]
  actions?: ActionMini[]
  timeline?: TimelineGroup[]
  confidence: ConfidenceScore
}

// ── Color helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<RiskStatus, string> = {
  actionable: 'var(--sig-risk)',
  monitor: 'var(--sig-monitor)',
  optimal: 'var(--sig-benefit)',
  nodata: 'var(--text-tertiary)',
}

const STATUS_LABELS: Record<RiskStatus, string> = {
  actionable: 'Actionable',
  monitor: 'Monitor',
  optimal: 'Optimal',
  nodata: 'No Data',
}

const ACTION_TYPE_COLORS: Record<'consider' | 'monitor' | 'discuss', string> = {
  consider: 'var(--sig-risk)',
  monitor: 'var(--sig-monitor)',
  discuss: 'var(--primary)',
}

const ACTION_TYPE_LABELS: Record<'consider' | 'monitor' | 'discuss', string> = {
  consider: 'Consider',
  monitor: 'Monitor',
  discuss: 'Discuss',
}

// ── Summary stats ──────────────────────────────────────────────────────────

function getSummaryStats(causes: MortalityCause[]) {
  return {
    actionable: causes.filter((c) => c.status === 'actionable').length,
    monitor: causes.filter((c) => c.status === 'monitor').length,
    optimal: causes.filter((c) => c.status === 'optimal').length,
    nodata: causes.filter((c) => c.status === 'nodata').length,
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function GeneMiniCard({ gene, index = 0 }: { gene: GeneMini; index?: number }) {
  const borderColor = STATUS_COLORS[gene.status]
  return (
    <div
      className="gene-card-enter"
      style={{
        background: 'var(--bg)',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: '0 6px 6px 0',
        padding: '10px 14px',
        flex: '1 1 180px',
        minWidth: 160,
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {gene.symbol}
        </span>
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 500,
            padding: '2px 5px',
            borderRadius: 3,
            letterSpacing: '0.08em',
            color: 'var(--bg-raised)',
            background: borderColor,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {gene.evidenceTier}
        </span>
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          marginBottom: 3,
        }}
      >
        {gene.variant}
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        {gene.description}
      </div>
    </div>
  )
}

function ActionMiniCard({ action, added, onAdd }: { action: ActionMini; added?: boolean; onAdd?: () => void }) {
  const borderColor = ACTION_TYPE_COLORS[action.type]
  return (
    <div
      style={{
        background: 'var(--bg)',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: '0 6px 6px 0',
        padding: '10px 14px',
        position: 'relative',
      }}
    >
      {onAdd && (
        <button
          className="btn btn-add-action"
          aria-label={added ? 'Added to checklist' : 'Add to checklist'}
          style={{
            fontSize: 'var(--font-size-xs)',
            padding: '6px 10px',
            minWidth: 36,
            minHeight: 28,
            flexShrink: 0,
            opacity: added ? 0.4 : 0.6,
            color: added ? 'var(--sig-benefit)' : 'var(--primary)',
            borderColor: added ? 'var(--sig-benefit)' : 'var(--border)',
            cursor: added ? 'default' : 'pointer',
            position: 'absolute',
            top: 6,
            right: 6,
          }}
          disabled={added}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          onMouseEnter={e => { if (!added) e.currentTarget.style.opacity = '1' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = added ? '0.4' : '0.6' }}
        >
          {added ? 'ADDED' : '+'}
        </button>
      )}
      <div
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: borderColor,
          marginBottom: 3,
        }}
      >
        {ACTION_TYPE_LABELS[action.type]}
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-sm)',
          lineHeight: 1.6,
        }}
      >
        {action.text}
      </div>
    </div>
  )
}

function ExpandedDetail({ cause, addedSet, onAddToChecklist }: { cause: MortalityCause; addedSet?: Set<string>; onAddToChecklist?: (title: string, causeName: string) => void }) {
  return (
    <div
      className="expanded-detail"
      style={{
        background: 'var(--bg-raised)',
        border: '1.5px solid var(--border)',
        borderTop: 'none',
        borderRadius: '0 0 6px 6px',
        padding: '18px 20px',
        marginLeft: 0,
        marginBottom: 4,
      }}
    >
      {cause.narrative && (
        <div
          style={{
            fontSize: 'var(--font-size-sm)',
            lineHeight: 1.7,
            marginBottom: 16,
            borderLeft: `3px solid ${STATUS_COLORS[cause.status]}`,
            paddingLeft: 14,
            color: 'var(--text-secondary)',
          }}
        >
          {cause.narrative}
        </div>
      )}

      {cause.genes && cause.genes.length > 0 && (
        <div
          className="gene-cards-row"
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          {cause.genes.map((gene, i) => (
            <GeneMiniCard key={gene.symbol} gene={gene} index={i} />
          ))}
        </div>
      )}

      {cause.actions && cause.actions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cause.actions.map((action, idx) => {
            const key = cause.cause + action.text
            return (
              <ActionMiniCard
                key={idx}
                action={action}
                added={addedSet?.has(key)}
                onAdd={onAddToChecklist ? () => onAddToChecklist(action.text, cause.cause) : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function PersonalBar({ status, widthPct, delay = 0 }: { status: RiskStatus; widthPct: number; delay?: number }) {
  const isNoData = status === 'nodata'
  return (
    <div
      className="risk-bar"
      style={{
        height: 14,
        width: `${widthPct}%`,
        borderRadius: 3,
        background: isNoData ? 'var(--border)' : STATUS_COLORS[status],
        opacity: isNoData ? 0.3 : 0.75,
        border: isNoData ? '1px dashed var(--border-strong)' : undefined,
        animationDelay: `${delay + 100}ms`,
      }}
    />
  )
}

function MortalityRow({
  cause,
  isExpanded,
  onToggle,
  addedSet,
  onAddToChecklist,
}: {
  cause: MortalityCause
  isExpanded: boolean
  onToggle: () => void
  addedSet?: Set<string>
  onAddToChecklist?: (title: string, causeName: string) => void
}) {
  const hasDetail = !!(cause.narrative || (cause.genes && cause.genes.length > 0))
  const statusColor = STATUS_COLORS[cause.status]

  return (
    <>
      <div
        className={`mortality-row ${isExpanded ? 'mortality-row--expanded' : ''}`}
        onClick={hasDetail ? onToggle : undefined}
        onKeyDown={hasDetail ? (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        } : undefined}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        aria-expanded={hasDetail ? isExpanded : undefined}
        aria-label={`${cause.cause}, ${cause.pct}% of deaths, ${cause.statusText}`}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          cursor: hasDetail ? 'pointer' : 'default',
          background: isExpanded ? 'var(--bg-raised)' : 'transparent',
          borderRadius: isExpanded ? '6px 6px 0 0' : 6,
          border: isExpanded ? '1.5px solid var(--border)' : '1.5px solid transparent',
          borderBottom: isExpanded ? 'none' : undefined,
          marginLeft: 0,
          padding: '8px 0',
        }}
      >
        {/* Rank */}
        <div
          style={{
            width: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            flexShrink: 0,
          }}
        >
          {cause.rank}
        </div>

        {/* Bar area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 12 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              {cause.cause}
            </span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              {cause.pct}% of deaths
            </span>
          </div>

          {/* Population bar */}
          <div
            className="risk-bar"
            style={{
              height: 8,
              width: `${cause.populationBarPct}%`,
              background: 'var(--border)',
              borderRadius: 2,
              animationDelay: `${cause.rank * 60}ms`,
            }}
          />

          {/* Personal bar */}
          <PersonalBar status={cause.status} widthPct={cause.personalBarPct} delay={cause.rank * 60} />

          {/* Detail row */}
          <div
            className="mortality-detail-row"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
              gap: 8,
            }}
          >
            <span>{cause.genesText}</span>
            <span
              style={{
                fontWeight: 500,
                color: statusColor,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {cause.statusText}
              {hasDetail && (
                <span
                  className={`expand-chevron ${isExpanded ? 'expand-chevron--open' : ''}`}
                  style={{ fontSize: 10 }}
                >▸</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {hasDetail && (
        <div className={`expand-wrapper ${isExpanded ? 'expand-wrapper--open' : ''}`} style={{ marginTop: -12 }}>
          <div>
            <ExpandedDetail cause={cause} addedSet={addedSet} onAddToChecklist={onAddToChecklist} />
          </div>
        </div>
      )}
    </>
  )
}

// ── Legend ─────────────────────────────────────────────────────────────────

function BarLegend() {
  const items: Array<{ label: string; height: number; color: string; opacity: number; dashed?: boolean }> = [
    { label: 'Population prevalence', height: 8, color: 'var(--border)', opacity: 1 },
    { label: 'Actionable genetic factors', height: 14, color: 'var(--sig-risk)', opacity: 0.75 },
    { label: 'Monitor', height: 14, color: 'var(--sig-monitor)', opacity: 0.75 },
    { label: 'Optimal / protective', height: 14, color: 'var(--sig-benefit)', opacity: 0.75 },
    { label: 'No genetic data', height: 14, color: 'var(--border)', opacity: 0.3, dashed: true },
  ]

  return (
    <div
      className="bar-legend"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px 20px',
        marginBottom: 24,
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 24,
              height: item.height,
              background: item.color,
              opacity: item.opacity,
              borderRadius: 2,
              border: item.dashed ? '1px dashed var(--border-strong)' : undefined,
              flexShrink: 0,
            }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface RiskLandscapeProps {
  onExport?: (format: 'pdf' | 'md' | 'doctor') => void
  onAddToChecklist?: (title: string, cause: string) => void
}

function formatDemographic(d: { sex: string; age_range: string; ancestry: string }): string {
  return `${d.sex}s, ${d.age_range}, ${d.ancestry.charAt(0).toUpperCase() + d.ancestry.slice(1)} ancestry`
}

export function RiskLandscape({ onExport, onAddToChecklist }: RiskLandscapeProps) {
  const { causes: CAUSES, demographic, loading } = useRiskData()
  const [expandedRank, setExpandedRank] = useState<number | null>(1)
  const [addedActions, setAddedActions] = useState<Set<string>>(new Set())

  const handleAddToChecklist = onAddToChecklist ? (title: string, cause: string) => {
    const key = cause + title
    setAddedActions(prev => new Set(prev).add(key))
    onAddToChecklist(title, cause)
  } : undefined

  if (loading) return <LoadingLabel />

  const stats = getSummaryStats(CAUSES)

  function handleToggle(rank: number) {
    setExpandedRank((prev) => (prev === rank ? null : rank))
  }

  function handleExport(format: 'pdf' | 'md' | 'doctor') {
    if (format === 'md') {
      const md = riskLandscapeToMarkdown(CAUSES)
      downloadFile(md, `risk-landscape-${new Date().toISOString().slice(0, 10)}.md`)
    } else if (format === 'doctor') {
      printPage('doctor')
    } else if (format === 'pdf') {
      printPage('pdf')
    }
    onExport?.(format)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Hero */}
      <HeroHeader
        title="Mortality &amp; Risk Landscape"
        description="The top causes of mortality for your demographic, overlaid with your personal genetic factors. Knowledge is power — knowing where to focus attention lets you take informed action."
        genotypes={CAUSES.flatMap(c => (c.genes || []).map(g => g.variant))}
        glyphLabel="risk profile"
      >
        <div className="stats-row" style={{ display: 'flex', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
          <StatBox value={stats.actionable} label="Actionable areas" color="var(--sig-risk)" />
          <StatBox value={stats.monitor} label="Monitor" color="var(--sig-monitor)" />
          <StatBox value={stats.optimal} label="Optimal / no risk" color="var(--sig-benefit)" />
          <StatBox value={stats.nodata} label="No data" color="var(--text-tertiary)" />
        </div>
      </HeroHeader>

      {/* Main content */}
      <div className="section-content" style={{ padding: '28px 24px', flex: 1 }}>
        {/* Context block */}
        <InfoCallout>
          Population bars show how common each cause of death is for{' '}
          <strong>{demographic ? formatDemographic(demographic) : 'your demographic profile'}</strong>{' '}
          (based on your profile). Your personal bar shows where you have relevant genetic variants.
          Having variants does not predict outcomes — it shows where awareness and prevention can
          make a difference.
        </InfoCallout>

        {/* Bar legend */}
        <BarLegend />

        {/* Mortality rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {CAUSES.map((cause) => (
            <MortalityRow
              key={cause.rank}
              cause={cause}
              isExpanded={expandedRank === cause.rank}
              onToggle={() => handleToggle(cause.rank)}
              addedSet={addedActions}
              onAddToChecklist={handleAddToChecklist}
            />
          ))}
        </div>

        {/* Export buttons */}
        <ExportBar onExport={handleExport} />
      </div>

      {/* Footer */}
      <div
        className="risk-footer"
        style={{
          padding: '8px 24px',
          borderTop: '1px dashed var(--border-dashed)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        <span>
          {CAUSES.length} causes &middot; {demographic ? `${demographic.sex} ${demographic.age_range} ${demographic.ancestry.toUpperCase()}` : 'loading'} &middot; {stats.actionable} actionable
        </span>
        <span>GENOME_TOOLKIT // RISK LANDSCAPE</span>
      </div>
    </div>
  )
}

export type { RiskStatus, MortalityCause, TimelineFrequency, TimelineItem, TimelineGroup, ConfidenceScore }
export { STATUS_COLORS as RISK_STATUS_COLORS, STATUS_LABELS as RISK_STATUS_LABELS }
