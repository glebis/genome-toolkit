import { useState } from 'react'
import { useGWASData } from '../../hooks/useGWASData'
import type { GWASMatch } from '../../hooks/useGWASData'

interface GWASFindingsProps {
  trait: string
}

/**
 * Displays PGC GWAS summary statistics matched against the user's genome.
 * Shows: top significant SNPs, effect allele counts, direction, p-values,
 * and a simple tally of risk alleles carried.
 */
export function GWASFindings({ trait }: GWASFindingsProps) {
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
        fontSize: 10,
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
        fontSize: 10,
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
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 4,
          }}>
            Polygenic findings — {data.display_name ?? data.trait}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {data.matched_hits} of {data.total_hits} genome-wide significant SNPs found in your genome ·
            p &lt; {data.threshold.toExponential(0)} ·{' '}
            <button
              onClick={() => setShowAbout((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--primary)',
                cursor: 'pointer',
                fontSize: 9,
                fontFamily: 'inherit',
                textDecoration: 'underline',
              }}
            >
              {showAbout ? 'hide details' : 'about this data'}
            </button>
          </div>
        </div>
        <div style={{
          fontSize: 8,
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

      {/* About block */}
      {showAbout && (
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-inset)',
          fontSize: 10,
          lineHeight: 1.7,
          color: 'var(--text)',
        }}>
          <div style={{ marginBottom: 8 }}>
            <strong>{data.publication}</strong> · Source:{' '}
            <code style={{ fontSize: 9 }}>{data.source}</code> ({data.config})
          </div>
          <div style={{ marginBottom: 8 }}>
            These are SNPs that reached genome-wide statistical significance in a large meta-analysis by the
            Psychiatric Genomics Consortium. "Risk alleles" here means copies of the effect allele at each
            SNP, weighted by the direction of the published effect. This is NOT a polygenic risk score (PRS) —
            it's a simple tally. Genetics are one of many factors; environment, experience, and life context
            matter more for most people.
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
            Citation: {data.citation}
            <br />
            License: {data.license}
          </div>
        </div>
      )}

      {/* Tally bar */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-secondary)',
          marginBottom: 6,
        }}>
          Risk allele tally
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            flex: 1,
            height: 6,
            background: 'var(--bg-inset)',
            borderRadius: 3,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${riskPct}%`,
              background: 'linear-gradient(90deg, var(--sig-benefit), var(--sig-reduced), var(--sig-risk))',
              borderRadius: 3,
            }} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {data.risk_allele_total} / {data.risk_allele_max}
          </div>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
          Simple weighted count — NOT a polygenic risk score. See "about" above for caveats.
        </div>
      </div>

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
              fontSize: 9,
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
      fontSize: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          {match.rsid}
        </span>
        {match.gene_symbol && (
          <span style={{
            fontSize: 8,
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
        <span style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>
          chr{match.chr}:{match.pos}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 9 }}>
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
