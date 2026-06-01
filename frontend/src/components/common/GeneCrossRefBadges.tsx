import { useGeneSections } from '../../hooks/useGeneSections'
import type { Section } from '../../hooks/useGeneSections'

const SECTION_META: Record<Section, { label: string; hash: string; full: string }> = {
  'mental-health': { label: 'MH', hash: '#/mental-health', full: 'Mental Health' },
  pgx: { label: 'PGx', hash: '#/pgx', full: 'Pharmacogenomics' },
  addiction: { label: 'Addiction', hash: '#/addiction', full: 'Addiction & Reward' },
  risk: { label: 'Risk', hash: '#/risk', full: 'Risk Landscape' },
}

interface GeneCrossRefBadgesProps {
  symbol: string
  currentSection: Section
}

/**
 * Renders a small pill for each *other* app section a gene appears in.
 * Clicking a pill navigates to that section via the location hash (#35).
 */
export function GeneCrossRefBadges({ symbol, currentSection }: GeneCrossRefBadgesProps) {
  const { getSectionsForGene } = useGeneSections()
  const others = getSectionsForGene(symbol).filter((s) => s !== currentSection)

  if (others.length === 0) return null

  return (
    <span className="gene-crossref-badges" style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {others.map((section) => {
        const meta = SECTION_META[section]
        return (
          <button
            key={section}
            type="button"
            className="gene-crossref-badge"
            title={`${symbol} also appears in ${meta.full} — click to view`}
            onClick={() => { window.location.hash = meta.hash }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '1px 6px',
              border: '1px solid var(--border)',
              borderRadius: 2,
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {meta.label}
          </button>
        )
      })}
    </span>
  )
}
