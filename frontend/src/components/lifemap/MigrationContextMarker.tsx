import type { BlendMarker } from '../../lib/lifeBlend'

interface MigrationContextMarkerProps {
  blend: BlendMarker | null
}

/** A secondary, explicitly-heuristic marker. Never labeled "your life
 *  expectancy" — it is migration context over period life tables. */
export function MigrationContextMarker({ blend }: MigrationContextMarkerProps) {
  if (!blend) return null
  return (
    <div
      style={{
        border: '1px dashed var(--border-strong, var(--border))',
        borderRadius: 8,
        padding: '14px 16px',
        marginTop: 16,
      }}
    >
      <div style={{ fontSize: 'var(--font-size-xs)', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>
        MIGRATION CONTEXT MARKER
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>≈ {blend.targetAge.toFixed(1)}</span>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
          (spread {blend.spread.min.toFixed(1)}–{blend.spread.max.toFixed(1)})
        </span>
      </div>
      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
        This is a <strong>heuristic</strong>, not an epidemiological model — a years-lived blend of the
        country anchors above, weighted toward your current residence. Migration and mortality interact
        in complex ways (healthy-migrant effects, gradual risk convergence). Treat it as a conversation
        starter, not a prediction.
      </p>
    </div>
  )
}
