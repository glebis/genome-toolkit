import type { EvidenceTier, GeneStatus } from '../../types/genomics'
import { EVIDENCE_LABELS, EVIDENCE_COLORS } from '../../types/genomics'

interface EvidenceBadgeProps {
  tier: EvidenceTier
  status?: GeneStatus
  studyCount?: number
}

export function EvidenceBadge({ tier, studyCount }: EvidenceBadgeProps) {
  const color = EVIDENCE_COLORS[tier]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 500,
          padding: '2px 6px',
          borderRadius: 3,
          letterSpacing: '0.1em',
          color: 'var(--bg-raised)',
          background: color,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {tier} {EVIDENCE_LABELS[tier]}
      </span>
      {studyCount !== undefined && (
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color,
            border: `1px solid ${color}`,
            padding: '1px 5px',
            borderRadius: 2,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {studyCount} studies
        </span>
      )}
    </span>
  )
}
