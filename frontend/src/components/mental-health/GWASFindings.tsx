import { useState } from 'react'
import { useGWASData } from '../../hooks/useGWASData'
import type { GWASMatch, GWASTraitData } from '../../hooks/useGWASData'

interface GWASFindingsProps {
  trait: string
  onDiscuss?: (context: string) => void
}

/** Build a plain-language interpretation of the user's risk allele tally. */
function interpretTally(data: GWASTraitData): { headline: string; meaning: string; band: 'lower' | 'middle' | 'higher' } {
  const pct = data.risk_allele_max > 0
    ? (data.risk_allele_total / data.risk_allele_max) * 100
    : 50

  let band: 'lower' | 'middle' | 'higher'
  let headline: string
  if (pct < 40) {
    band = 'lower'
    headline = 'You carry fewer risk-associated variants than average'
  } else if (pct > 60) {
    band = 'higher'
    headline = 'You carry more risk-associated variants than average'
  } else {
    band = 'middle'
    headline = 'You carry an average number of risk-associated variants'
  }

  const meaning = (
    `Of the ${data.matched_hits} ${data.display_name?.toLowerCase() ?? 'anxiety'}-associated SNPs found in your genome, ` +
    `you carry ${data.risk_allele_total} risk-direction allele copies out of ${data.risk_allele_max} possible. ` +
    `That places you in the ${band} portion of the distribution. ` +
    `Genetics is ONE factor among many — environment, sleep, exercise, stress, social support, and history matter ` +
    `at least as much for most people. This number does not predict whether you will or won't develop ${data.display_name?.toLowerCase() ?? 'anxiety'}.`
  )

  return { headline, meaning, band }
}

/** Build a chat prompt that gives the agent enough context to discuss the findings. */
function buildDiscussionPrompt(data: GWASTraitData): string {
  const top = data.matches.slice(0, 8).map(m => {
    const dir = m.direction === 'risk' ? '+' : m.direction === 'protective' ? '−' : '·'
    return `${m.rsid} ${m.user_genotype} (effect=${m.effect_allele}, count=${m.effect_allele_count}, ${dir}log_OR=${m.effect.toFixed(3)}, p=${m.p_value.toExponential(1)})`
  }).join('\n  ')

  return (
    `I'd like to understand my polygenic findings for ${data.display_name ?? data.trait}.\n\n` +
    `Source: ${data.source} (${data.config}), ${data.publication}.\n` +
    `Of ${data.total_hits} genome-wide significant SNPs (p < ${data.threshold.toExponential(0)}), ` +
    `${data.matched_hits} were found in my genome. I carry ${data.risk_allele_total} risk-direction allele copies ` +
    `out of ${data.risk_allele_max} possible (${Math.round((data.risk_allele_total / Math.max(data.risk_allele_max, 1)) * 100)}%).\n\n` +
    `Top hits in my genome:\n  ${top}\n\n` +
    `Please explain in plain language: (1) what this number actually means and doesn't mean, ` +
    `(2) the biggest caveats to keep in mind (LD clumping, this isn't a calibrated PRS, etc), ` +
    `(3) what — if anything — is actionable, and (4) any specific genes or biological systems ` +
    `the top hits point to.`
  )
}

/**
 * Displays PGC GWAS summary statistics matched against the user's genome.
 * Shows: top significant SNPs, effect allele counts, direction, p-values,
 * and a simple tally of risk alleles carried.
 */
export function GWASFindings({ trait, onDiscuss }: GWASFindingsProps) {
  const { data, loading, error } = useGWASData(trait)
  const [expanded, setExpanded] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  if (loading) {
    return (
      <div className="label" style={{ padding: '16px 0' }}>
        LOADING_GWAS_DATA...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        padding: '14px 16px',
        border: '1px dashed var(--border-dashed)',
        borderRadius: 4,
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>
          GWAS data not yet available
        </div>
        {error}
      </div>
    )
  }

  if (!data || data.matches.length === 0) {
    return (
      <div style={{
        padding: '14px 16px',
        border: '1px dashed var(--border-dashed)',
        borderRadius: 4,
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
      }}>
        No matching SNPs found in your genome for {trait} GWAS hits
        {data ? ` (${data.total_hits} hits checked)` : ''}.
      </div>
    )
  }

  const visibleMatches = expanded ? data.matches : data.matches.slice(0, 6)
  const riskPct = data.risk_allele_max > 0
    ? Math.round((data.risk_allele_total / data.risk_allele_max) * 100)
    : 0

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 6,
      background: 'var(--bg-raised)',
      marginTop: 16,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <div>
          <div style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 4,
          }}>
            Polygenic findings — {data.display_name ?? data.trait}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {data.matched_hits} of {data.total_hits} genome-wide significant SNPs found in your genome ·
            p &lt; {data.threshold.toExponential(0)}
          </div>
        </div>
        <div style={{
          fontSize: 'var(--font-size-xs)',
          background: 'var(--primary)',
          color: 'var(--bg-raised)',
          padding: '3px 8px',
          borderRadius: 3,
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
        }}>
          PGC / GWAS
        </div>
      </div>

      {/* Methodology / caveats block */}
      {showAbout && (
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-inset)',
          fontSize: 'var(--font-size-xs)',
          lineHeight: 1.7,
          color: 'var(--text)',
        }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
            What you're looking at
          </div>
          <div style={{ marginBottom: 10 }}>
            The <strong>Psychiatric Genomics Consortium (PGC)</strong> meta-analysed the genomes of hundreds of thousands of people
            with and without {data.display_name?.toLowerCase() ?? data.trait}, and identified specific SNPs (single-letter genetic variants)
            that occur statistically more often in one group than the other. The threshold p &lt; 5×10⁻⁸ is the standard cutoff for
            "genome-wide significant" — strong enough that we'd expect fewer than 1 false positive across the entire genome by chance.
          </div>
          <div style={{ marginBottom: 10 }}>
            For each significant SNP, we look at your genotype and count how many copies of the "risk-direction" allele you carry
            (0, 1, or 2). For protective alleles, we invert the count. Add it all up, divide by the maximum possible — that's
            your tally. The midpoint marker on the bar above represents what an average person would carry by chance.
          </div>

          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
            Important caveats
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, marginBottom: 10 }}>
            <li style={{ marginBottom: 4 }}><strong>This is NOT a polygenic risk score (PRS).</strong> A real PRS is calibrated against a reference population to give a percentile. This is just a weighted count.</li>
            <li style={{ marginBottom: 4 }}><strong>Many of these SNPs are correlated</strong> (linkage disequilibrium). Hits in the same genomic region get counted multiple times, inflating the tally. Proper LD clumping would shrink the count substantially.</li>
            <li style={{ marginBottom: 4 }}><strong>Effect sizes are tiny.</strong> Each SNP individually shifts risk by 1-5% — the appeal is in their combination, not any single variant.</li>
            <li style={{ marginBottom: 4 }}><strong>Genetic risk ≠ destiny.</strong> Twin studies show {data.display_name?.toLowerCase() ?? data.trait} heritability around 30-50%. Half or more of the variance is environment, life events, sleep, stress, and the things you actually have control over.</li>
            <li><strong>This GWAS was mostly European ancestry.</strong> Effect estimates may not transfer perfectly to other populations.</li>
          </ul>

          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', borderTop: '1px dashed var(--border-dashed)', paddingTop: 8, marginTop: 8 }}>
            <div><strong>Source:</strong> {data.publication}</div>
            <div><strong>Dataset:</strong> <code style={{ fontSize: 'var(--font-size-xs)',}}>{data.source}</code> / {data.config}</div>
            <div><strong>License:</strong> {data.license}</div>
            <div><strong>Citation:</strong> {data.citation}</div>
          </div>
        </div>
      )}

      {/* Plain-language interpretation */}
      {(() => {
        const interp = interpretTally(data)
        const bandColor =
          interp.band === 'lower' ? 'var(--sig-benefit)' :
          interp.band === 'higher' ? 'var(--sig-risk)' :
          'var(--sig-reduced)'
        return (
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{
              fontSize: 'var(--font-size-md)',
              fontWeight: 600,
              color: bandColor,
              marginBottom: 8,
              lineHeight: 1.4,
            }}>
              {interp.headline}
            </div>

            {/* Tally bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 10,
            }}>
              <div style={{
                flex: 1,
                height: 8,
                background: 'var(--bg-inset)',
                borderRadius: 4,
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: `${riskPct}%`,
                  background: 'linear-gradient(90deg, var(--sig-benefit), var(--sig-reduced), var(--sig-risk))',
                  borderRadius: 4,
                }} />
                {/* Average marker at 50% */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: -2,
                  height: 12,
                  width: 1,
                  background: 'var(--text-tertiary)',
                }} />
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, fontFamily: 'var(--font-mono)', minWidth: 56, textAlign: 'right' }}>
                {data.risk_allele_total}/{data.risk_allele_max}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              <span>fewer risk alleles</span>
              <span>average</span>
              <span>more risk alleles</span>
            </div>

            <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.7, color: 'var(--text)' }}>
              {interp.meaning}
            </div>

            {/* Action row: Ask AI button */}
            {onDiscuss && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onDiscuss(buildDiscussionPrompt(data))}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    padding: '6px 14px',
                    border: '1px solid var(--primary)',
                    background: 'var(--primary)',
                    color: 'var(--bg-raised)',
                    cursor: 'pointer',
                    borderRadius: 3,
                  }}
                >
                  → Ask AI about my findings
                </button>
                <button
                  onClick={() => setShowAbout((v) => !v)}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    padding: '6px 14px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    borderRadius: 3,
                  }}
                >
                  {showAbout ? 'Hide details' : 'Methodology & caveats'}
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* SNP list */}
      <div style={{ padding: '8px 0' }}>
        {visibleMatches.map((m) => (
          <GWASRow key={m.rsid} match={m} />
        ))}
      </div>

      {data.matches.length > 6 && (
        <div style={{
          padding: '8px 18px 14px',
          borderTop: '1px dashed var(--border-dashed)',
          textAlign: 'center',
        }}>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              padding: '4px 12px',
              fontSize: 'var(--font-size-xs)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              borderRadius: 3,
            }}
          >
            {expanded ? `Show top 6` : `Show all ${data.matches.length}`}
          </button>
        </div>
      )}
    </div>
  )
}

function GWASRow({ match }: { match: GWASMatch }) {
  const directionColor =
    match.direction === 'risk' ? 'var(--sig-risk)' :
    match.direction === 'protective' ? 'var(--sig-benefit)' :
    'var(--text-secondary)'

  const countLabel =
    match.effect_allele_count === 0 ? 'none' :
    match.effect_allele_count === 1 ? '1 copy' : '2 copies'

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 18px',
      borderBottom: '1px dashed var(--border-dashed)',
      fontSize: 'var(--font-size-xs)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          {match.rsid}
        </span>
        {match.gene_symbol && (
          <span style={{
            fontSize: 'var(--font-size-xs)',
            border: '1px solid var(--border)',
            padding: '1px 5px',
            borderRadius: 2,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {match.gene_symbol}
          </span>
        )}
        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)',}}>
          chr{match.chr}:{match.pos}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 'var(--font-size-xs)',}}>
        <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {match.user_genotype}
        </span>
        <span style={{
          color: directionColor,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          minWidth: 58,
          textAlign: 'right',
        }}>
          {match.effect_allele}: {countLabel}
        </span>
        <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: 58, textAlign: 'right' }}>
          p={match.p_value.toExponential(1)}
        </span>
      </div>
    </div>
  )
}
