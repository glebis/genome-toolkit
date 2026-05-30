import type { CountryAnchor, BlendMarker } from '../../lib/lifeBlend'

interface LifeExpectancyAxisProps {
  anchors: CountryAnchor[]
  blend: BlendMarker | null
  currentCountry: string
}

const DEFAULT_DOMAIN = { min: 50, max: 95 }

/** Padded axis domain rounded to surrounding multiples of 5. */
export function computeAxisDomain(
  anchors: CountryAnchor[],
  blend: BlendMarker | null,
): { min: number; max: number } {
  const values: number[] = anchors.map((a) => a.targetAge)
  if (blend) values.push(blend.spread.min, blend.spread.max, blend.targetAge)
  if (values.length === 0) return { ...DEFAULT_DOMAIN }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return { min: Math.floor((lo - 2) / 5) * 5, max: Math.ceil((hi + 2) / 5) * 5 }
}

const W = 640
const PAD = 24
const TRACK_Y = 54
const TRACK_H = 8

export function LifeExpectancyAxis({ anchors, blend, currentCountry }: LifeExpectancyAxisProps) {
  if (anchors.length === 0) return null

  const { min, max } = computeAxisDomain(anchors, blend)
  const span = max - min || 1
  const x = (v: number) => PAD + ((v - min) / span) * (W - 2 * PAD)

  const gridYears: number[] = []
  for (let y = min; y <= max; y += 5) gridYears.push(y)

  return (
    <svg
      viewBox={`0 0 ${W} 96`}
      width="100%"
      role="img"
      aria-label="Life expectancy by country, with migration blend band"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {/* gridlines + scale labels */}
      {gridYears.map((y) => (
        <g key={y}>
          <line x1={x(y)} y1={TRACK_Y - 6} x2={x(y)} y2={TRACK_Y + TRACK_H + 6} stroke="var(--border)" strokeWidth={1} />
          <text x={x(y)} y={TRACK_Y + TRACK_H + 20} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">
            {y}
          </text>
        </g>
      ))}

      {/* base track */}
      <rect x={PAD} y={TRACK_Y} width={W - 2 * PAD} height={TRACK_H} rx={4} fill="var(--bg-inset)" stroke="var(--border)" />

      {/* heuristic blend band */}
      {blend && (
        <rect
          x={x(blend.spread.min)}
          y={TRACK_Y}
          width={Math.max(2, x(blend.spread.max) - x(blend.spread.min))}
          height={TRACK_H}
          rx={4}
          fill="var(--primary)"
          opacity={0.18}
          aria-label={`blend spread ${blend.spread.min.toFixed(1)}–${blend.spread.max.toFixed(1)}`}
        >
          <title>{`Blend spread ${blend.spread.min.toFixed(1)}–${blend.spread.max.toFixed(1)} (heuristic)`}</title>
        </rect>
      )}

      {/* blend marker line */}
      {blend && (
        <line x1={x(blend.targetAge)} y1={TRACK_Y - 10} x2={x(blend.targetAge)} y2={TRACK_Y + TRACK_H + 2} stroke="var(--primary)" strokeWidth={2} strokeDasharray="3 2" />
      )}

      {/* country ticks + labels */}
      {anchors.map((a, i) => {
        const cx = x(a.targetAge)
        const isCurrent = a.country === currentCountry
        const labelY = i % 2 === 0 ? 22 : 40
        return (
          <g key={a.country}>
            <line x1={cx} y1={labelY + 4} x2={cx} y2={TRACK_Y} stroke="var(--border-strong, var(--border))" strokeWidth={1} />
            <circle cx={cx} cy={TRACK_Y + TRACK_H / 2} r={5} fill={isCurrent ? 'var(--primary)' : 'var(--sig-benefit)'} stroke="var(--bg)" strokeWidth={1.5} />
            <text x={cx} y={labelY} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-primary)">
              {a.name}
            </text>
            <text x={cx} y={labelY + 12} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">
              {a.targetAge.toFixed(1)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
