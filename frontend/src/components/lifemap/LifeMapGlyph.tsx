/**
 * LifeMapGlyph — a section icon for the Life Map.
 *
 * Deliberately NOT GenomeGlyph: this view is demographic / life-context, not a
 * genetic signal. The metaphor is migration — anchor nodes (countries) joined by
 * a journey path — drawn in the same warm palette and stroke weight as GenomeGlyph
 * so it sits naturally beside the other sections' glyphs. Fully deterministic.
 */

interface LifeMapGlyphProps {
  /** Country codes the person has lived in, in order. */
  countries: string[]
  size?: number
  label?: string
}

// Warm palette shared with GenomeGlyph.
const PALETTE = ['#c4724e', '#5b7ea1', '#5a8a5e', '#c49a4e', '#8d7a78']

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function LifeMapGlyph({ countries, size = 100, label }: LifeMapGlyphProps) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 6

  // Place anchor nodes along a gentle left-to-right arc (a journey across places).
  const n = Math.max(countries.length, 1)
  const nodes = countries.map((code, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const px = cx + (t - 0.5) * 2 * (r * 0.78)
    // arc dip seeded by the country code so it feels organic but deterministic
    const wobble = ((hash(code) % 100) / 100 - 0.5) * (r * 0.35)
    const py = cy - Math.sin(t * Math.PI) * (r * 0.45) + wobble
    return { px, py, color: PALETTE[hash(code) % PALETTE.length] }
  })

  // Journey path connecting consecutive anchors.
  const path =
    nodes.length > 1
      ? nodes
          .map((nd, i) => {
            if (i === 0) return `M ${nd.px.toFixed(1)} ${nd.py.toFixed(1)}`
            const prev = nodes[i - 1]
            const mx = (prev.px + nd.px) / 2
            return `Q ${mx.toFixed(1)} ${(Math.min(prev.py, nd.py) - r * 0.2).toFixed(1)} ${nd.px.toFixed(1)} ${nd.py.toFixed(1)}`
          })
          .join(' ')
      : ''

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? 'life map'}>
      {/* base ring */}
      <circle cx={cx} cy={cy} r={r} fill="var(--bg-inset)" stroke="var(--border)" strokeWidth={1.5} />
      {/* journey path */}
      {path && <path d={path} fill="none" stroke="var(--primary)" strokeWidth={1.5} opacity={0.5} strokeLinecap="round" />}
      {/* anchor nodes */}
      {nodes.map((nd, i) => (
        <circle key={i} cx={nd.px} cy={nd.py} r={Math.max(3, size * 0.05)} fill={nd.color} stroke="var(--bg)" strokeWidth={1.5} />
      ))}
      {/* fallback dot when empty so the ring isn't bare */}
      {countries.length === 0 && <circle cx={cx} cy={cy} r={Math.max(3, size * 0.05)} fill="var(--text-tertiary)" />}
    </svg>
  )
}
