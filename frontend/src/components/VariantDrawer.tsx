import { useState, useEffect, useRef } from 'react'
import type { SNP } from '../hooks/useSNPs'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface VariantDetail extends SNP {
  review_status?: string | null
  ref_allele?: string | null
  alt_allele?: string | null
  gene_name?: string | null
  mv_significance?: string | null
  allele_freq?: number | null
  allele_freq_source?: string | null
}

interface GuidanceData {
  severity: string
  what_it_means: string
  suggested_actions: string[]
  discuss_with_clinician: boolean
  external_links: { label: string; url: string }[]
}

interface Props {
  snp: SNP | null
  onClose: () => void
  onAskAI?: (query: string) => void
  onAddToChecklist?: (title: string, geneSymbol: string) => void
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'var(--sig-risk)',
  moderate: 'var(--sig-reduced)',
  low: 'var(--sig-benefit)',
  unknown: 'var(--border)',
}

function PopulationFrequency({ detail }: { detail: VariantDetail | null }) {
  const freq = detail?.allele_freq
  const source = detail?.allele_freq_source

  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <span className="label label--accent" style={{ display: 'block', marginBottom: 'var(--space-sm)' }}>
        POPULATION_FREQUENCY //
      </span>
      {freq != null ? (
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--space-sm)',
            marginBottom: 'var(--space-xs)',
          }}>
            <span style={{
              fontSize: 'var(--font-size-md)',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              {freq < 0.01
                ? `${(freq * 100).toFixed(3)}%`
                : freq < 0.1
                  ? `${(freq * 100).toFixed(2)}%`
                  : `${(freq * 100).toFixed(1)}%`}
            </span>
            {freq < 0.01 && (
              <span style={{
                fontSize: 'var(--font-size-xs)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase',
                fontWeight: 600,
                color: 'var(--sig-reduced)',
                border: '1px solid var(--sig-reduced)',
                padding: '1px 6px',
              }}>
                RARE
              </span>
            )}
          </div>
          {/* Frequency bar */}
          <div style={{
            width: '100%',
            height: 6,
            background: 'var(--bg-inset)',
            borderRadius: 0,
            overflow: 'hidden',
            marginBottom: 'var(--space-xs)',
          }}>
            <div style={{
              width: `${Math.max(freq * 100, 0.5)}%`,
              height: '100%',
              background: freq < 0.01
                ? 'var(--sig-reduced)'
                : freq < 0.05
                  ? 'var(--accent)'
                  : 'var(--primary)',
              transition: 'width 0.3s ease',
            }} />
          </div>
          {source && (
            <span style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-tertiary)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}>
              SOURCE: {source}
            </span>
          )}
        </div>
      ) : (
        <div style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-tertiary)',
          lineHeight: 1.5,
        }}>
          {/* Population frequency data not yet available for this variant.
              Future: integrate gnomAD v4, 1000 Genomes, or dbSNP allele
              frequency data via the myvariant enrichment pipeline or direct
              gnomAD API queries. */}
          Population frequency data not available.
        </div>
      )}
    </div>
  )
}

export function VariantDrawer({ snp, onClose, onAskAI, onAddToChecklist }: Props) {
  const [addedActions, setAddedActions] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<VariantDetail | null>(null)
  const [guidance, setGuidance] = useState<GuidanceData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!snp) { setDetail(null); setGuidance(null); return }
    setAddedActions(new Set())
    setLoading(true)

    const fetchDetail = fetch(`/api/snps/${snp.rsid}`)
      .then(r => r.ok ? r.json() : null)

    const fetchGuidance = fetch(`/api/snps/${snp.rsid}/guidance`)
      .then(r => r.ok ? r.json() : null)

    Promise.all([fetchDetail, fetchGuidance])
      .then(([d, g]) => {
        setDetail(d)
        setGuidance(g)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [snp])

  const drawerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(drawerRef, !!snp, { onEscape: onClose })

  if (!snp) return null

  const d = detail || snp

  return (
    <div
      className="sidebar-drawer"
      ref={drawerRef}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(420px, calc(100vw - 24px))',
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

      {/* Severity bar */}
      {guidance && guidance.severity !== 'unknown' && (
        <div style={{
          height: 3,
          background: SEVERITY_COLORS[guidance.severity] || SEVERITY_COLORS.unknown,
          width: '100%',
        }} />
      )}

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

            {/* Population Frequency */}
            <PopulationFrequency detail={detail} />

            {/* Guidance blocks */}
            {guidance && guidance.what_it_means && (
              <div style={{ borderTop: '1px dashed var(--border-dashed)', paddingTop: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>

                {/* Discuss with clinician callout */}
                {guidance.discuss_with_clinician && (
                  <div style={{
                    border: `1px solid ${SEVERITY_COLORS[guidance.severity] || 'var(--border)'}`,
                    padding: 'var(--space-sm) var(--space-md)',
                    marginBottom: 'var(--space-md)',
                    background: 'var(--bg)',
                  }}>
                    <span style={{
                      fontSize: 'var(--font-size-xs)',
                      letterSpacing: 'var(--tracking-wide)',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      color: SEVERITY_COLORS[guidance.severity] || 'var(--text-primary)',
                    }}>
                      DISCUSS_WITH_CLINICIAN
                    </span>
                    <div style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-secondary)',
                      marginTop: 2,
                    }}>
                      This result may be clinically relevant. Bring it to your next appointment.
                    </div>
                  </div>
                )}

                {/* What this means */}
                <span className="label label--accent" style={{ display: 'block', marginBottom: 'var(--space-sm)' }}>
                  WHAT_THIS_MEANS //
                </span>
                <div style={{
                  fontSize: 'var(--font-size-sm)',
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  marginBottom: 'var(--space-md)',
                }}>
                  {guidance.what_it_means}
                </div>

                {/* Suggested actions */}
                {guidance.suggested_actions.length > 0 && (
                  <>
                    <div style={{ borderTop: '1px dashed var(--border-dashed)', paddingTop: 'var(--space-md)' }}>
                      <span className="label label--accent" style={{ display: 'block', marginBottom: 'var(--space-sm)' }}>
                        SUGGESTED_ACTIONS //
                      </span>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {guidance.suggested_actions.map((action, i) => (
                          <li key={i} style={{
                            fontSize: 'var(--font-size-sm)',
                            padding: '4px 0',
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', flexShrink: 0 }}>&#9675;</span>
                            <span style={{ flex: 1 }}>{action}</span>
                            {onAddToChecklist && (
                              <button
                                className="btn"
                                style={{
                                  fontSize: '9px',
                                  padding: '1px 6px',
                                  flexShrink: 0,
                                  opacity: addedActions.has(i) ? 0.4 : 0.6,
                                  color: addedActions.has(i) ? 'var(--sig-benefit)' : 'var(--primary)',
                                  borderColor: addedActions.has(i) ? 'var(--sig-benefit)' : 'var(--border)',
                                  cursor: addedActions.has(i) ? 'default' : 'pointer',
                                }}
                                disabled={addedActions.has(i)}
                                onClick={() => {
                                  const gene = (detail as VariantDetail)?.gene || d.gene || 'custom'
                                  onAddToChecklist(action, gene)
                                  setAddedActions(prev => new Set(prev).add(i))
                                }}
                                onMouseEnter={e => { if (!addedActions.has(i)) e.currentTarget.style.opacity = '1' }}
                                onMouseLeave={e => { e.currentTarget.style.opacity = addedActions.has(i) ? '0.4' : '0.6' }}
                              >
                                {addedActions.has(i) ? 'ADDED' : '+'}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {/* External links */}
                {guidance.external_links.length > 0 && (
                  <div style={{ borderTop: '1px dashed var(--border-dashed)', paddingTop: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
                    <span className="label label--accent" style={{ display: 'block', marginBottom: 'var(--space-sm)' }}>
                      EXTERNAL_LINKS //
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                      {guidance.external_links.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            letterSpacing: 'var(--tracking-wide)',
                            textTransform: 'uppercase',
                            color: 'var(--accent)',
                            textDecoration: 'none',
                            border: '1px solid var(--border)',
                            padding: '4px 8px',
                          }}
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
