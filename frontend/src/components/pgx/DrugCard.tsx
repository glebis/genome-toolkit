import type { DrugCardData } from '../../types/pgx'

const IMPACT_STYLES: Record<string, { borderColor: string; statusColor: string; bg?: string }> = {
  ok: { borderColor: 'var(--sig-benefit)', statusColor: 'var(--sig-benefit)' },
  adjust: { borderColor: 'var(--sig-reduced)', statusColor: 'var(--sig-reduced)' },
  warn: { borderColor: 'var(--sig-risk)', statusColor: 'var(--sig-risk)' },
  danger: { borderColor: '#b84a4a', statusColor: '#b84a4a', bg: '#faf5f5' },
}

interface DrugCardProps {
  drug: DrugCardData
}

export function DrugCard({ drug }: DrugCardProps) {
  const style = IMPACT_STYLES[drug.impact] || IMPACT_STYLES.ok

  return (
    <div style={{
      background: style.bg || 'var(--bg-raised)',
      borderLeft: `4px solid ${style.borderColor}`,
      borderRadius: '0 6px 6px 0',
      padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{drug.drugClass}</span>
        <span style={{ fontSize: 9, fontWeight: 500, color: style.statusColor }}>
          {drug.statusText}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.6 }}>
        {drug.description}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 6 }}>
        {drug.category === 'substance' ? 'Affects: ' : 'Drugs affected: '}{drug.drugList}
      </div>
      {drug.dangerNote && (
        <div style={{
          marginTop: 10, padding: '10px 14px',
          background: '#faf5f5', border: '1px solid #d4a0a0', borderRadius: 4,
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#b84a4a', marginBottom: 4 }}>
            {drug.category === 'substance' ? 'Interaction warning' : 'Discuss with prescriber'}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text)', lineHeight: 1.6 }}>
            {drug.dangerNote}
          </div>
        </div>
      )}
    </div>
  )
}
