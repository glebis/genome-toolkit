import { useState } from 'react'
import type { ActionData } from '../../types/genomics'
import { ACTION_TYPE_COLORS, ACTION_TYPE_LABELS } from '../../types/genomics'

interface ActionCardProps {
  action: ActionData
  onToggleDone: (id: string) => void
}

export function ActionCard({ action, onToggleDone }: ActionCardProps) {
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
              fontSize: 12,
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

        {/* Checkbox */}
        <div
          onClick={() => onToggleDone(action.id)}
          title={action.done ? 'Completed' : 'Mark as done'}
          style={{
            width: 20,
            height: 20,
            border: `1.5px solid ${action.done ? 'var(--sig-benefit)' : 'var(--border)'}`,
            borderRadius: 4,
            cursor: 'pointer',
            flexShrink: 0,
            marginLeft: 12,
            marginTop: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: action.done ? 'var(--sig-benefit)' : 'transparent',
            color: 'var(--bg-raised)',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {action.done ? '\u2713' : ''}
        </div>
      </div>
    </div>
  )
}
