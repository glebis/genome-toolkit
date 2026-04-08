import type { EnzymeData } from '../../types/pgx'
import { METABOLIZER_COLORS, statusLabel } from '../../types/pgx'

interface MetabolizerBarProps {
  enzyme: EnzymeData
}

export function MetabolizerBar({ enzyme }: MetabolizerBarProps) {
  const color = METABOLIZER_COLORS[enzyme.status]
  const isTransporter = enzyme.geneType === 'transporter'
  const scaleLabels = isTransporter
    ? ['Poor', 'Decreased', 'Normal', 'Increased']
    : ['Poor', 'Intermediate', 'Normal', 'Ultrarapid']

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 4,
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {scaleLabels.map(l => <span key={l}>{l}</span>)}
      </div>
      <div style={{
        height: 6, background: 'var(--bg-inset)', borderRadius: 3, position: 'relative',
      }}>
        {/* Gradient fill */}
        <div style={{
          position: 'absolute', left: 0, height: '100%',
          width: `${enzyme.position}%`,
          background: 'linear-gradient(90deg, var(--sig-risk), var(--sig-reduced), var(--sig-benefit))',
          borderRadius: '3px 0 0 3px',
        }} />
        {/* Dot marker */}
        <div style={{
          position: 'absolute', left: `${enzyme.position}%`, top: -3,
          width: 12, height: 12, borderRadius: '50%',
          background: color, border: '2px solid var(--bg-raised)',
        }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, marginTop: 8, color }}>
        {statusLabel(enzyme.status, enzyme.geneType)}
      </div>
    </div>
  )
}
