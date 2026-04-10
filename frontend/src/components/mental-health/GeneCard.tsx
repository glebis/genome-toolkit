import type { GeneData } from '../../types/genomics'
import { STATUS_COLORS } from '../../types/genomics'
import { EvidenceBadge } from './EvidenceBadge'

interface GeneCardProps {
  gene: GeneData
  onClick?: (gene: GeneData) => void
}

export function GeneCard({ gene, onClick }: GeneCardProps) {
  const borderColor = STATUS_COLORS[gene.status]

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(gene)}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onClick) { e.preventDefault(); onClick(gene); } }}
      style={{
        background: 'var(--bg-raised)',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 6,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = 'var(--bg-inset)' }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.background = 'var(--bg-raised)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, letterSpacing: '0.04em' }}>
            {gene.symbol}
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginLeft: 6 }}>
            {gene.variant} &middot; {gene.rsid}
          </span>
        </div>
        <EvidenceBadge tier={gene.evidenceTier} status={gene.status} />
      </div>

      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.5 }}>
        {gene.description}
      </div>

      {gene.actionCount > 0 && (
        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, marginTop: 6, color: borderColor }}>
          {gene.actionCount} actions available
        </div>
      )}
    </div>
  )
}
