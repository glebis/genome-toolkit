import { useState, useEffect } from 'react'
import type { GeneEvidence, Publication, GeneData } from '../../types/genomics'

interface EvidencePanelProps {
  gene: GeneData
  onDiscuss: (context: string) => void
}

function SectionHeader({ title, count, expanded, onClick }: {
  title: string
  count: number
  expanded: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        padding: '10px 0',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: count > 0 ? 'var(--text)' : 'var(--text-tertiary)',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 'var(--font-size-xs)', width: 12 }}>{expanded ? '▾' : '▸'}</span>
      {title}
      <span style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        fontWeight: 400,
      }}>
        ({count})
      </span>
    </button>
  )
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      title={`${label} (opens in new window)`}
      style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--primary)',
        textDecoration: 'underline',
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label} ↗
    </a>
  )
}

function PublicationRow({ pub, gene, onDiscuss }: {
  pub: Publication
  gene: GeneData
  onDiscuss: (context: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const discussContext = [
    `Publication: "${pub.title}"`,
    `Journal: ${pub.journal} (${pub.pub_date})`,
    `Gene: ${gene.symbol} (${gene.variant}), my genotype: ${gene.genotype}`,
    pub.matched_snps.length > 0 ? `Matched SNPs: ${pub.matched_snps.join(', ')}` : '',
    pub.abstract ? `Abstract: ${pub.abstract}` : '',
    '',
    'Explain what this study found and what it means for my specific genotype. Be concise.',
  ].filter(Boolean).join('\n')

  return (
    <div style={{
      borderBottom: '1px dashed var(--border-dashed)',
      padding: '8px 0',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-tertiary)',
            padding: '2px 0',
            flexShrink: 0,
            width: 12,
          }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--text)',
            lineHeight: 1.4,
            cursor: 'pointer',
          }} onClick={() => setExpanded(!expanded)}>
            {pub.title}
          </div>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
            marginTop: 2,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            <span>{pub.journal}</span>
            <span>{pub.pub_date}</span>
            {pub.matched_snps.length > 0 && (
              <span style={{
                color: 'var(--primary)',
                fontWeight: 600,
              }}>
                {pub.matched_snps.join(', ')}
              </span>
            )}
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}/`}
              target="_blank"
              rel="noopener"
              style={{ color: 'var(--primary)', textDecoration: 'underline' }}
            >
              PMID:{pub.pmid}
            </a>
          </div>
        </div>
        <button
          onClick={() => onDiscuss(discussContext)}
          title="Discuss this study with AI"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--primary)',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
            letterSpacing: '0.05em',
          }}
        >
          Discuss
        </button>
      </div>
      {expanded && pub.abstract && (
        <div style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          marginTop: 8,
          marginLeft: 20,
          padding: '8px 12px',
          background: 'var(--bg)',
          borderRadius: 4,
          border: '1px solid var(--border)',
        }}>
          {pub.abstract}
        </div>
      )}
    </div>
  )
}

export function EvidencePanel({ gene, onDiscuss }: EvidencePanelProps) {
  const [evidence, setEvidence] = useState<GeneEvidence | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    publications: true,
  })

  useEffect(() => {
    setLoading(true)
    fetch(`/api/mental-health/genes/${gene.symbol}/evidence`)
      .then(r => r.json())
      .then(data => {
        setEvidence(data)
        // Auto-expand first non-empty section
        const first = ['publications', 'clinical', 'snpedia', 'pathways']
          .find(k => (data[k] as unknown[])?.length > 0)
        if (first) setOpenSections({ [first]: true })
      })
      .catch(() => setEvidence({ publications: [], clinical: [], snpedia: [], pathways: [] }))
      .finally(() => setLoading(false))
  }, [gene.symbol])

  const toggle = (key: string) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

  if (loading) {
    return (
      <div style={{
        padding: '16px 0',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.1em',
      }}>
        LOADING_EVIDENCE...
      </div>
    )
  }

  if (!evidence) return null

  const totalItems = evidence.publications.length + evidence.clinical.length
    + evidence.snpedia.length + evidence.pathways.length

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 'var(--font-size-sm)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--text-secondary)',
        marginBottom: 8,
      }}>
        Evidence & Sources
        {totalItems > 0 && (
          <span style={{ fontWeight: 400, marginLeft: 6 }}>
            ({totalItems} total)
          </span>
        )}
      </div>

      {totalItems === 0 ? (
        <div style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          padding: '12px 0',
        }}>
          No evidence data yet. Run the PubMed monitor to populate.
          <span
            onClick={() => {
              const query = encodeURIComponent(`${gene.symbol} ${gene.variant} genetics`)
              window.open(`https://pubmed.ncbi.nlm.nih.gov/?term=${query}`, '_blank', 'noopener')
            }}
            style={{
              color: 'var(--primary)',
              textDecoration: 'underline',
              cursor: 'pointer',
              marginLeft: 8,
            }}
          >
            Search PubMed
          </span>
        </div>
      ) : (
        <div>
          {/* Publications */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <SectionHeader
                title="PubMed Publications"
                count={evidence.publications.length}
                expanded={!!openSections.publications}
                onClick={() => toggle('publications')}
              />
            </div>
            <ExternalLink
              href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(`${gene.symbol} ${gene.variant} genetics`)}`}
              label="Search all on PubMed"
            />
          </div>
          {openSections.publications && evidence.publications.length > 0 && (
            <div style={{ padding: '4px 0 8px' }}>
              {evidence.publications.map(pub => (
                <PublicationRow
                  key={pub.pmid}
                  pub={pub}
                  gene={gene}
                  onDiscuss={onDiscuss}
                />
              ))}
            </div>
          )}

          {/* Clinical Annotations */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <SectionHeader
                title="Clinical Annotations"
                count={evidence.clinical.length}
                expanded={!!openSections.clinical}
                onClick={() => toggle('clinical')}
              />
            </div>
            <ExternalLink
              href={`https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(gene.rsid)}`}
              label="Search ClinVar"
            />
          </div>
          {openSections.clinical && evidence.clinical.length > 0 && (
            <div style={{ padding: '4px 0 8px' }}>
              {evidence.clinical.map((ann, i) => (
                <div key={`${ann.rsid}-${ann.source}-${i}`} style={{
                  display: 'flex',
                  gap: 12,
                  padding: '6px 0',
                  borderBottom: '1px dashed var(--border-dashed)',
                  fontSize: 'var(--font-size-sm)',
                  alignItems: 'baseline',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--primary)',
                    flexShrink: 0,
                  }}>
                    {ann.rsid}
                  </span>
                  <span style={{
                    color: ann.clinical_significance?.toLowerCase().includes('pathogenic')
                      ? 'var(--sig-risk)'
                      : ann.clinical_significance?.toLowerCase().includes('benign')
                        ? 'var(--sig-benefit)'
                        : 'var(--text)',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {ann.clinical_significance || 'Unknown'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}>
                    {ann.condition}
                  </span>
                  <span style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}>
                    {ann.source}
                    {ann.review_status && ` / ${ann.review_status}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* SNPedia */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <SectionHeader
                title="SNPedia"
                count={evidence.snpedia.length}
                expanded={!!openSections.snpedia}
                onClick={() => toggle('snpedia')}
              />
            </div>
            <ExternalLink
              href={`https://www.snpedia.com/index.php/${gene.rsid}`}
              label="Open on SNPedia"
            />
          </div>
          {openSections.snpedia && evidence.snpedia.length > 0 && (
            <div style={{ padding: '4px 0 8px' }}>
              {evidence.snpedia.map(entry => (
                <div key={entry.rsid} style={{
                  display: 'flex',
                  gap: 12,
                  padding: '6px 0',
                  borderBottom: '1px dashed var(--border-dashed)',
                  fontSize: 'var(--font-size-sm)',
                  alignItems: 'baseline',
                }}>
                  <a
                    href={`https://www.snpedia.com/index.php/${entry.rsid}`}
                    target="_blank"
                    rel="noopener"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--primary)',
                      textDecoration: 'underline',
                      flexShrink: 0,
                    }}
                  >
                    {entry.rsid}
                  </a>
                  {entry.magnitude !== undefined && (
                    <span style={{
                      fontWeight: 600,
                      color: (entry.magnitude ?? 0) >= 3 ? 'var(--sig-risk)' : 'var(--text)',
                      flexShrink: 0,
                    }}>
                      mag:{entry.magnitude}
                    </span>
                  )}
                  {entry.repute && (
                    <span style={{
                      color: entry.repute === 'Good' ? 'var(--sig-benefit)' : 'var(--sig-risk)',
                      fontSize: 'var(--font-size-xs)',
                      flexShrink: 0,
                    }}>
                      {entry.repute}
                    </span>
                  )}
                  {entry.summary && (
                    <span style={{ color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}>
                      {entry.summary}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pathways */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <SectionHeader
                title="Biological Pathways"
                count={evidence.pathways.length}
                expanded={!!openSections.pathways}
                onClick={() => toggle('pathways')}
              />
            </div>
            <ExternalLink
              href={`https://www.genecards.org/cgi-bin/carddisp.pl?gene=${gene.symbol}`}
              label="Open on GeneCards"
            />
          </div>
          {openSections.pathways && evidence.pathways.length > 0 && (
            <div style={{ padding: '4px 0 8px' }}>
              {evidence.pathways.map(pw => (
                <div key={pw.id} style={{
                  display: 'flex',
                  gap: 12,
                  padding: '6px 0',
                  borderBottom: '1px dashed var(--border-dashed)',
                  fontSize: 'var(--font-size-sm)',
                }}>
                  <a
                    href={pw.id.startsWith('hsa')
                      ? `https://www.kegg.jp/pathway/${pw.id}`
                      : pw.id.startsWith('REACT')
                        ? `https://reactome.org/content/detail/${pw.id.replace('REACT_', '')}`
                        : '#'}
                    target="_blank"
                    rel="noopener"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--primary)',
                      textDecoration: 'underline',
                      flexShrink: 0,
                    }}
                  >
                    {pw.id}
                  </a>
                  <span style={{ color: 'var(--text)' }}>{pw.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
