import type { EvidenceTier, GeneStatus } from '../../types/genomics'
import { EVIDENCE_LABELS, STATUS_COLORS } from '../../types/genomics'

interface EvidenceBadgeProps {
  tier: EvidenceTier
  status?: GeneStatus
  studyCount?: number
}

export function EvidenceBadge({ tier, status = 'neutral', studyCount }: EvidenceBadgeProps) {
  const bgColor = STATUS_COLORS[status]

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
          background: bgColor,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {tier} {EVIDENCE_LABELS[tier]}
      </span>
      {studyCount !== undefined && (
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--primary)',
            border: '1px solid var(--primary)',
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
