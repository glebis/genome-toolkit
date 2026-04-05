import type { NarrativeData } from '../../types/genomics'
import { STATUS_COLORS } from '../../types/genomics'

interface NarrativeBlockProps {
  narrative: NarrativeData
}

export function NarrativeBlock({ narrative }: NarrativeBlockProps) {
  const borderColor = STATUS_COLORS[narrative.status]

  return (
    <div style={{
      flex: 1,
      background: 'var(--bg-raised)',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 6,
      padding: 18,
      position: 'relative',
      minHeight: 130,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        position: 'absolute',
        top: -1,
        left: 16,
        background: borderColor,
        color: 'var(--bg-raised)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 600,
        letterSpacing: '0.15em',
        padding: '2px 10px',
        borderRadius: '0 0 4px 4px',
        textTransform: 'uppercase',
      }}>
        {narrative.pathway}
      </div>

      <div
        style={{ marginTop: 14, fontSize: 'var(--font-size-md)', lineHeight: 1.7, flex: 1 }}
        dangerouslySetInnerHTML={{ __html: narrative.body }}
      />

      <div style={{
        marginTop: 12,
        borderTop: '1px dashed var(--border-dashed)',
        paddingTop: 10,
        fontSize: 'var(--font-size-sm)',
      }}>
        <div style={{ fontWeight: 500, marginBottom: 3, color: borderColor }}>
          {narrative.priority}
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>
          {narrative.hint}
        </div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 10,
        right: 14,
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-tertiary)',
        letterSpacing: '0.1em',
      }}>
        {narrative.geneCount} GENES / {narrative.actionCount} ACTIONS
      </div>
    </div>
  )
}
