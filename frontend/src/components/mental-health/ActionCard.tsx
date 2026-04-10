import { useState, useCallback } from 'react'
import type { ActionData } from '../../types/genomics'
import { ACTION_TYPE_COLORS, ACTION_TYPE_LABELS } from '../../types/genomics'

interface ActionCardProps {
  action: ActionData
  onToggleDone: (id: string) => void
  /** Whether this action is already in the checklist */
  inChecklist?: boolean
  /** Add this action to the checklist */
  onAddToChecklist?: (action: ActionData) => void
}

export function ActionCard({ action, onToggleDone, inChecklist, onAddToChecklist }: ActionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const borderColor = ACTION_TYPE_COLORS[action.type]

  return (
    <div style={{
      background: 'var(--bg-raised)',
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: '0 6px 6px 0',
      padding: '14px 18px',
      opacity: action.done ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {/* Type badge */}
          <div style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 4,
            color: borderColor,
          }}>
            {ACTION_TYPE_LABELS[action.type]}
          </div>

          {/* Title — clickable to expand */}
          <div
            onClick={() => setExpanded(prev => !prev)}
            style={{
              fontSize: 'var(--font-size-md)',
              fontWeight: 600,
              marginBottom: 4,
              cursor: action.detail ? 'pointer' : 'default',
              textDecoration: action.done ? 'line-through' : 'none',
            }}
          >
            {action.title}
          </div>

          {/* Description */}
          <div style={{
            fontSize: 'var(--font-size-sm)',
            lineHeight: 1.6,
            color: 'var(--text)',
          }}>
            {action.description}
          </div>

          {/* Expandable detail */}
          {expanded && action.detail && (
            <div style={{
              borderTop: '1px dashed var(--border-dashed)',
              paddingTop: 8,
              marginTop: 8,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}>
              {action.detail}
            </div>
          )}

          {/* Evidence tags */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--primary)',
              border: '1px solid var(--primary)',
              padding: '1px 5px',
              borderRadius: 2,
            }}>
              {action.evidenceTier} / {action.studyCount} studies
            </span>
            {action.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                padding: '1px 5px',
                borderRadius: 2,
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Add to checklist button */}
        <button
          onClick={() => {
            if (inChecklist) {
              onToggleDone(action.id)
            } else if (onAddToChecklist) {
              onAddToChecklist(action)
            }
          }}
          title={inChecklist ? (action.done ? 'In checklist (done)' : 'In checklist (click to toggle done)') : 'Add to checklist'}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: inChecklist ? '4px 8px' : '4px 10px',
            border: `1px solid ${inChecklist ? (action.done ? 'var(--sig-benefit)' : 'var(--primary)') : 'var(--border)'}`,
            borderRadius: 3,
            background: inChecklist
              ? (action.done ? 'var(--sig-benefit)' : 'transparent')
              : 'transparent',
            color: inChecklist
              ? (action.done ? 'var(--bg-raised)' : 'var(--primary)')
              : 'var(--text-tertiary)',
            cursor: 'pointer',
            flexShrink: 0,
            marginLeft: 12,
            marginTop: 2,
            whiteSpace: 'nowrap',
            transition: 'all 0.15s',
          }}
        >
          {inChecklist ? (action.done ? '\u2713 Done' : 'In list') : '+ Add'}
        </button>
      </div>
    </div>
  )
}
