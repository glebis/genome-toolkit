import type { CountryAnchor } from '../../lib/lifeBlend'

interface CountryAnchorsProps {
  anchors: CountryAnchor[]
  currentCountry: string
}

/** The primary truth: each lived-in country's life-expectancy-at-current-age,
 *  shown side by side. The spread between them is the point. */
export function CountryAnchors({ anchors, currentCountry }: CountryAnchorsProps) {
  if (anchors.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
        Add a country you've lived in to see its life-expectancy anchor.
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {anchors.map((a) => (
        <div
          key={a.country}
          style={{
            flex: '1 1 160px',
            border: '1px solid var(--border)',
            borderColor: a.country === currentCountry ? 'var(--primary)' : 'var(--border)',
            borderRadius: 8,
            padding: '14px 16px',
            background: 'var(--bg-inset)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600 }}>{a.name}</span>
            {a.country === currentCountry && (
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--primary)', letterSpacing: '0.08em' }}>
                CURRENT
              </span>
            )}
          </div>
          <div style={{ fontSize: 28, fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>{a.targetAge.toFixed(1)}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            expected age &middot; {a.exAtAge.toFixed(1)} yrs remaining
          </div>
        </div>
      ))}
    </div>
  )
}
