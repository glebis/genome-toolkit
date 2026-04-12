import { useState } from 'react'

interface EvidenceComparisonProps {
  significance: string | null
  mvSignificance: string | null
  alleleFreq: number | null
  alleleFreqSource: string | null
  disease: string | null
  reviewStatus: string | null
  geneSymbol: string | null
}

type Agreement = 'agree' | 'disagree' | 'partial'

function getAgreement(a: string | null, b: string | null): Agreement {
  if (a && b) {
    return a.toLowerCase() === b.toLowerCase() ? 'agree' : 'disagree'
  }
  return 'partial'
}

const AGREEMENT_DISPLAY: Record<Agreement, { label: string; color: string }> = {
  agree: { label: 'SOURCES AGREE', color: 'var(--sig-benefit)' },
  disagree: { label: 'SOURCES DISAGREE', color: 'var(--sig-risk)' },
  partial: { label: 'PARTIAL DATA', color: 'var(--sig-reduced)' },
}

function Cell({ value }: { value: string | null | undefined }) {
  if (!value) return <span style={{ color: 'var(--text-tertiary)' }}>--</span>
  return <span>{value}</span>
}

export function EvidenceComparison({
  significance,
  mvSignificance,
  alleleFreq,
  alleleFreqSource,
  disease,
  reviewStatus,
  geneSymbol,
}: EvidenceComparisonProps) {
  const [expanded, setExpanded] = useState(false)

  if (!significance && !mvSignificance) return null

  const agreement = getAgreement(significance, mvSignificance)
  const badge = AGREEMENT_DISPLAY[agreement]

  const cellStyle = {
    padding: '4px 0',
    fontSize: 'var(--font-size-xs)' as const,
    verticalAlign: 'top' as const,
  }

  return (
    <div style={{ marginBottom: 'var(--space-sm)' }}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter') setExpanded(v => !v) }}
        style={{
          color: 'var(--primary)',
          cursor: 'pointer',
          fontSize: 'var(--font-size-xs)',
          letterSpacing: '0.05em',
        }}
      >
        COMPARE SOURCES {expanded ? '[-]' : '[+]'}
      </span>

      {expanded && (
        <div style={{
          marginTop: 'var(--space-sm)',
          padding: 'var(--space-sm) 0',
          borderTop: '1px dashed var(--border-dashed)',
          borderBottom: '1px dashed var(--border-dashed)',
        }}>
          <div style={{ marginBottom: 'var(--space-sm)' }}>
            <span style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              color: badge.color,
              letterSpacing: '0.08em',
            }}>
              {badge.label}
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th className="label" style={{ textAlign: 'left', padding: '4px 0', width: '30%' }}></th>
                <th className="label" style={{ textAlign: 'left', padding: '4px 0', width: '35%' }}>CLINVAR</th>
                <th className="label" style={{ textAlign: 'left', padding: '4px 0', width: '35%' }}>MYVARIANT</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="label" style={cellStyle}>SIGNIFICANCE</td>
                <td style={cellStyle}><Cell value={significance} /></td>
                <td style={cellStyle}><Cell value={mvSignificance} /></td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="label" style={cellStyle}>CONDITIONS</td>
                <td style={cellStyle}><Cell value={disease} /></td>
                <td style={cellStyle}><Cell value={null} /></td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="label" style={cellStyle}>REVIEW</td>
                <td style={cellStyle}><Cell value={reviewStatus} /></td>
                <td style={cellStyle}><Cell value={null} /></td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="label" style={cellStyle}>GENE</td>
                <td style={cellStyle}><Cell value={null} /></td>
                <td style={cellStyle}><Cell value={geneSymbol} /></td>
              </tr>
              <tr>
                <td className="label" style={cellStyle}>FREQUENCY</td>
                <td style={cellStyle}>
                  <Cell value={alleleFreq != null && !alleleFreqSource ? `${(alleleFreq * 100).toFixed(2)}%` : null} />
                </td>
                <td style={cellStyle}>
                  <Cell value={alleleFreq != null && alleleFreqSource ? `${(alleleFreq * 100).toFixed(2)}% (${alleleFreqSource})` : null} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
