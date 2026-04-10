import type { DrugCardData } from '../../types/pgx'

const IMPACT_STYLES: Record<string, { borderColor: string; statusColor: string; bg?: string }> = {
  ok: { borderColor: 'var(--sig-benefit)', statusColor: 'var(--sig-benefit)' },
  adjust: { borderColor: 'var(--sig-reduced)', statusColor: 'var(--sig-reduced)' },
  warn: { borderColor: 'var(--sig-risk)', statusColor: 'var(--sig-risk)' },
  danger: { borderColor: 'var(--sig-danger)', statusColor: 'var(--sig-danger)', bg: 'var(--sig-danger-bg)' },
}

interface DrugCardProps {
  drug: DrugCardData
  onAddToChecklist?: (title: string) => void
  added?: boolean
}

export function DrugCard({ drug, onAddToChecklist, added }: DrugCardProps) {
  const style = IMPACT_STYLES[drug.impact] || IMPACT_STYLES.ok

  return (
    <div style={{
      background: style.bg || 'var(--bg-raised)',
      borderLeft: `4px solid ${style.borderColor}`,
      borderRadius: '0 6px 6px 0',
      padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>{drug.drugClass}</span>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: style.statusColor }}>
          {drug.statusText}
        </span>
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text)', lineHeight: 1.6 }}>
        {drug.description}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 6 }}>
        {drug.category === 'substance' ? 'Affects: ' : 'Drugs affected: '}{drug.drugList}
      </div>
      {drug.dangerNote && (
        <div style={{
          marginTop: 10, padding: '10px 14px',
          background: 'var(--sig-danger-bg)', border: '1px solid var(--sig-danger-border)', borderRadius: 4,
        }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--sig-danger)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{drug.category === 'substance' ? 'Interaction warning' : 'Discuss with prescriber'}</span>
            {onAddToChecklist && (
              <button
                className="btn"
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
                onClick={(e) => {
                  e.stopPropagation()
                  const noteSnippet = drug.dangerNote!.length > 60 ? drug.dangerNote!.slice(0, 60) + '...' : drug.dangerNote!
                  onAddToChecklist(`${drug.drugClass}: ${noteSnippet}`)
                }}
                onMouseEnter={e => { if (!added) e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = added ? '0.4' : '0.6' }}
              >
                {added ? 'ADDED' : '+'}
              </button>
            )}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text)', lineHeight: 1.6 }}>
            {drug.dangerNote}
          </div>
        </div>
      )}
    </div>
  )
}
