import type { GeneData, ActionData } from '../../types/genomics'
import { EvidenceBadge } from './EvidenceBadge'
import { ActionCard } from './ActionCard'
import { printPage, downloadFile, geneToMarkdown } from '../../lib/export'

interface GeneDetailProps {
  gene: GeneData
  actions: ActionData[]
  populationInfo?: string
  explanation?: string
  interactions?: { genes: string; description: string }[]
  onClose: () => void
  onToggleAction: (actionId: string) => void
  onDiscuss?: (context: string) => void
  checklistIds?: Set<string>
  onAddToChecklist?: (action: ActionData) => void
}

export function GeneDetail({
  gene,
  actions,
  populationInfo,
  explanation,
  interactions,
  onClose,
  onToggleAction,
  onDiscuss: _onDiscuss,
  checklistIds = new Set(),
  onAddToChecklist,
}: GeneDetailProps) {
  return (
    <div className="gene-detail" style={{
      background: 'var(--bg-raised)',
      borderRadius: 8,
      padding: '24px',
      border: '1px solid var(--border)',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.02em',
            }}>
              {gene.symbol}
            </span>
            <span style={{
              fontSize: 'var(--font-size-lg)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {gene.variant}
            </span>
            <span style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {gene.rsid}
            </span>
          </div>
          {gene.chromosome && gene.position !== undefined && (
            <div style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              marginTop: 4,
            }}>
              chr{gene.chromosome}:{gene.position.toLocaleString()}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <EvidenceBadge tier={gene.evidenceTier} status={gene.status} studyCount={gene.studyCount} />
          <button
            className="btn-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-secondary)',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Genotype + Population panels */}
      <div className="gene-detail-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        marginBottom: 20,
      }}>
        {/* Your genotype panel */}
        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '16px 20px',
        }}>
          <div style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-secondary)',
            marginBottom: 8,
          }}>
            Your genotype
          </div>
          <div style={{
            fontSize: 32,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            color: 'var(--text)',
          }}>
            {gene.genotype}
          </div>
        </div>

        {/* Population panel */}
        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '16px 20px',
        }}>
          <div style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-secondary)',
            marginBottom: 8,
          }}>
            Population
          </div>
          {populationInfo ? (
            <div style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text)',
              lineHeight: 1.5,
            }}>
              {populationInfo}
            </div>
          ) : (
            <div style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}>
              No population data
            </div>
          )}
        </div>
      </div>

      {/* Narrative explanation */}
      {explanation && (
        <div style={{
          borderLeft: '4px solid var(--primary)',
          paddingLeft: 16,
          marginBottom: 20,
          background: 'color-mix(in srgb, var(--primary) 6%, var(--bg))',
          borderRadius: '0 6px 6px 0',
          padding: '14px 16px',
        }}>
          <div
            style={{ fontSize: 'var(--font-size-md)', lineHeight: 1.7, color: 'var(--text)' }}
            dangerouslySetInnerHTML={{ __html: explanation }}
          />
        </div>
      )}

      {/* Recommended Actions */}
      {actions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-secondary)',
            marginBottom: 10,
          }}>
            Recommended Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {actions.map(action => (
              <ActionCard
                key={action.id}
                action={action}
                onToggleDone={onToggleAction}
                inChecklist={checklistIds.has(action.id)}
                onAddToChecklist={onAddToChecklist}
              />
            ))}
          </div>
        </div>
      )}

      {/* Gene Interactions */}
      {interactions && interactions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-secondary)',
            marginBottom: 10,
          }}>
            Gene Interactions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {interactions.map((interaction, i) => (
              <div
                key={i}
                style={{
                  border: '1px dashed var(--primary)',
                  borderRadius: 6,
                  padding: '12px 16px',
                }}
              >
                <div style={{
                  fontSize: 'var(--font-size-md)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--primary)',
                  marginBottom: 4,
                }}>
                  {interaction.genes}
                </div>
                <div style={{
                  fontSize: 'var(--font-size-md)',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}>
                  {interaction.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence footer */}
      <div style={{
        borderTop: '1px solid var(--border)',
        paddingTop: 14,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span>{gene.studyCount} sources</span>
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(`${gene.symbol} ${gene.variant} genetics`)}`}
            target="_blank"
            rel="noopener"
            style={{
              color: 'var(--primary)',
              textDecoration: 'underline',
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
            }}
          >
            View references on PubMed
          </a>
          <a
            href={`https://www.snpedia.com/index.php/${gene.rsid}`}
            target="_blank"
            rel="noopener"
            style={{
              color: 'var(--primary)',
              textDecoration: 'underline',
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
            }}
          >
            SNPedia
          </a>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-action"
            onClick={() => printPage('doctor')}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '5px 12px',
              cursor: 'pointer',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-secondary)',
            }}
          >
            Print for doctor
          </button>
          <button
            className="btn-action"
            onClick={() => {
              const md = geneToMarkdown(gene, actions)
              downloadFile(md, `${gene.symbol}-${new Date().toISOString().slice(0, 10)}.md`)
            }}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '5px 12px',
              cursor: 'pointer',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-secondary)',
            }}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  )
}
