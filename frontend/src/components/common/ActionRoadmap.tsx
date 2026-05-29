import { useState } from 'react'
import type { ActionData, GeneData, PathwaySection, Category, ActionType } from '../../types/genomics'

interface RankedAction {
  action: ActionData
  gene: GeneData
  score: number
}

const STATUS_SCORES: Record<string, number> = {
  actionable: 30, monitor: 20, optimal: 10, neutral: 0,
}

const EVIDENCE_SCORES: Record<string, number> = {
  E1: 25, E2: 20, E3: 15, E4: 10, E5: 5,
}

const TYPE_SCORES: Record<string, number> = {
  discuss: 4, monitor: 3, consider: 2, try: 1,
}

function scoreAction(action: ActionData, gene: GeneData): number {
  return (STATUS_SCORES[gene.status] ?? 0)
    + (EVIDENCE_SCORES[gene.evidenceTier] ?? 10)
    + (TYPE_SCORES[action.type] ?? 1)
}

function rankColor(score: number): string {
  if (score >= 50) return 'var(--sig-risk)'
  if (score >= 30) return 'var(--sig-reduced)'
  return 'var(--sig-benefit)'
}

const DEFAULT_VISIBLE = 5

interface ActionRoadmapProps {
  sections: PathwaySection[]
  actions: Record<string, ActionData[]>
  onAddToChecklist: (action: ActionData) => void
  checklistIds?: Set<string>
  activeCategory?: Category | null
  activeActionType?: ActionType | null
}

export function ActionRoadmap({
  sections,
  actions,
  onAddToChecklist,
  checklistIds = new Set(),
  activeCategory = null,
  activeActionType = null,
}: ActionRoadmapProps) {
  const [expanded, setExpanded] = useState(false)

  const geneMap = new Map<string, GeneData>()
  for (const section of sections) {
    for (const gene of section.genes) {
      geneMap.set(gene.symbol, gene)
    }
  }

  const ranked: RankedAction[] = []
  for (const [symbol, geneActions] of Object.entries(actions)) {
    const gene = geneMap.get(symbol)
    if (!gene) continue
    if (activeCategory && !gene.categories.includes(activeCategory)) continue
    for (const action of geneActions) {
      if (activeActionType && action.type !== activeActionType) continue
      ranked.push({ action, gene, score: scoreAction(action, gene) })
    }
  }

  ranked.sort((a, b) => b.score - a.score || a.gene.symbol.localeCompare(b.gene.symbol))

  if (ranked.length === 0) return null

  const visible = expanded ? ranked : ranked.slice(0, DEFAULT_VISIBLE)
  const hasMore = ranked.length > DEFAULT_VISIBLE

  return (
    <div style={{
      padding: '12px 24px',
      borderBottom: '1px dashed var(--border-dashed)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          color: 'var(--sig-risk)',
          letterSpacing: '0.1em',
        }}>
          ACTION ROADMAP
        </span>
        {hasMore && (
          <button
            onClick={() => setExpanded(prev => !prev)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              letterSpacing: '0.08em',
            }}
          >
            {expanded ? 'SHOW LESS' : `SHOW ALL ${ranked.length}`}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visible.map((item, idx) => {
          const added = checklistIds.has(item.action.id)
          return (
            <div
              key={item.action.id}
              data-testid="roadmap-item"
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '8px 0',
                borderBottom: idx < visible.length - 1 ? '1px solid var(--border)' : undefined,
              }}
            >
              <div style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: rankColor(item.score),
                color: 'var(--bg)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
                  {item.action.title}
                </div>
                <div style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-tertiary)',
                  marginTop: 1,
                }}>
                  {item.gene.symbol} &middot; {item.gene.status.charAt(0).toUpperCase() + item.gene.status.slice(1)} &middot; {item.gene.evidenceTier} &middot; {item.action.type.charAt(0).toUpperCase() + item.action.type.slice(1)}
                </div>
              </div>
              <button
                aria-label={added ? 'Added to checklist' : 'Add to checklist'}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-xs)',
                  padding: '2px 6px',
                  border: `1px solid ${added ? 'var(--sig-benefit)' : 'var(--border)'}`,
                  borderRadius: 2,
                  background: 'none',
                  color: added ? 'var(--sig-benefit)' : 'var(--text-tertiary)',
                  cursor: added ? 'default' : 'pointer',
                  flexShrink: 0,
                  opacity: added ? 0.4 : 0.6,
                }}
                disabled={added}
                onClick={() => onAddToChecklist(item.action)}
                onMouseEnter={e => { if (!added) e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = added ? '0.4' : '0.6' }}
              >
                {added ? 'ADDED' : '+'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
