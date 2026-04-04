import { useState, useEffect } from 'react'
import type { SNP } from '../hooks/useSNPs'

interface VariantDetail extends SNP {
  review_status?: string | null
  ref_allele?: string | null
  alt_allele?: string | null
  gene_name?: string | null
  mv_significance?: string | null
}

interface Props {
  snp: SNP | null
  onClose: () => void
  onAskAI?: (query: string) => void
}

export function VariantDrawer({ snp, onClose, onAskAI }: Props) {
  const [detail, setDetail] = useState<VariantDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!snp) { setDetail(null); return }
    setLoading(true)
    fetch(`/api/snps/${snp.rsid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [snp])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!snp) return null

  const d = detail || snp

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: 'var(--bg-raised)',
        borderLeft: '1px solid var(--border-strong)',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: 'var(--space-md)',
        borderBottom: '1px dashed var(--border-dashed)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <span className="label label--accent">VARIANT_DETAIL //</span>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, color: 'var(--primary)', marginTop: 4 }}>
            {d.rsid}
          </div>
        </div>
        <button className="btn" onClick={onClose} style={{ fontSize: 'var(--font-size-xs)' }}>
          CLOSE
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-md)' }}>
        {loading ? (
          <span className="label">LOADING_VARIANT_DATA...</span>
        ) : (
          <>
            {/* Core data table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 'var(--space-lg)' }}>
              <tbody>
                {[
                  ['CHROMOSOME', d.chromosome],
                  ['POSITION', d.position.toLocaleString()],
                  ['GENOTYPE', d.genotype],
                  ['SOURCE', d.source],
                  ...(d.r2_quality ? [['R2_QUALITY', String(d.r2_quality)]] : []),
                ].map(([label, value]) => (
                  <tr key={label as string} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="label" style={{ padding: '6px 0', width: 140 }}>{label}</td>
                    <td style={{ padding: '6px 0', fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Clinical data */}
            {(d.significance || (detail as VariantDetail)?.gene_name) && (
              <>
                <span className="label label--accent" style={{ display: 'block', marginBottom: 'var(--space-sm)' }}>
                  CLINICAL_ANNOTATION //
                </span>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 'var(--space-lg)' }}>
                  <tbody>
                    {d.significance && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="label" style={{ padding: '6px 0', width: 140 }}>SIGNIFICANCE</td>
                        <td style={{ padding: '6px 0', fontSize: 'var(--font-size-sm)' }}>{d.significance}</td>
                      </tr>
                    )}
                    {d.disease && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="label" style={{ padding: '6px 0', width: 140 }}>CONDITIONS</td>
                        <td style={{ padding: '6px 0', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
                          {d.disease.split(';').map((c, i) => (
                            <div key={i}>{c.trim()}</div>
                          ))}
                        </td>
                      </tr>
                    )}
                    {(detail as VariantDetail)?.review_status && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="label" style={{ padding: '6px 0', width: 140 }}>REVIEW</td>
                        <td style={{ padding: '6px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                          {(detail as VariantDetail).review_status}
                        </td>
                      </tr>
                    )}
                    {(detail as VariantDetail)?.gene_name && (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="label" style={{ padding: '6px 0', width: 140 }}>GENE</td>
                        <td style={{ padding: '6px 0', fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--accent)' }}>
                          {(detail as VariantDetail).gene_name}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )}

            {/* Ask AI button */}
            <button
              className="btn btn--accent"
              style={{ width: '100%', marginTop: 'var(--space-sm)' }}
              onClick={() => onAskAI?.(`What can you tell me about ${d.rsid}?`)}
            >
              ASK_AI // ABOUT_THIS_VARIANT
            </button>
          </>
        )}
      </div>
    </div>
  )
}
