/**
 * GenomeGlyph — unique visual fingerprint generated from SNP genotypes.
 *
 * Algorithm: Maps each nucleotide pair to a color and angle, draws a radial
 * pattern. Each person's key SNPs produce a unique, recognizable glyph.
 *
 * Inspired by DNA-to-art approaches (Genoma23, Gates vector walks).
 */

interface GenomeGlyphProps {
  /** Array of genotype strings, e.g. ["T/T", "A/G", "C/C", "A/A"] */
  genotypes: string[]
  /** Size in pixels */
  size?: number
  /** Optional label below the glyph */
  label?: string
}

// Nucleotide color mapping (Shapely-inspired, warm palette)
const NUCLEOTIDE_COLORS: Record<string, string> = {
  A: '#c4724e', // amber/terracotta
  T: '#5b7ea1', // blue
  C: '#5a8a5e', // green
  G: '#c49a4e', // gold
}

const PAIR_COLORS: Record<string, string> = {
  'A/A': '#c4724e',
  'A/G': '#c48a4e',
  'A/T': '#8d7a78',
  'A/C': '#8f7e4e',
  'T/T': '#5b7ea1',
  'T/G': '#6b8c78',
  'T/C': '#5b8480',
  'G/G': '#c49a4e',
  'G/C': '#8f924e',
  'C/C': '#5a8a5e',
}

function getColor(genotype: string): string {
  // Normalize: sort alleles for consistent coloring
  const parts = genotype.split('/')
  if (parts.length !== 2) return '#9a968e'
  const sorted = parts.sort().join('/')
  return PAIR_COLORS[sorted] || '#9a968e'
}

function hashGenotype(genotype: string): number {
  let h = 0
  for (let i = 0; i < genotype.length; i++) {
    h = ((h << 5) - h + genotype.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function GenomeGlyph({ genotypes, size = 80, label }: GenomeGlyphProps) {
  const cx = size / 2
  const cy = size / 2
  const maxRadius = size / 2 - 4

  if (genotypes.length === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={maxRadius} fill="none" stroke="var(--border)" strokeWidth={1} strokeDasharray="4,3" />
      </svg>
    )
  }

  const segments = genotypes.length
  const angleStep = (Math.PI * 2) / segments

  // Generate paths for radial pattern
  const paths: JSX.Element[] = []

  genotypes.forEach((gt, i) => {
    const color = getColor(gt)
    const hash = hashGenotype(gt + i)
    const angle = i * angleStep - Math.PI / 2 // start from top

    // Inner ring: small circles at fixed radius
    const innerR = maxRadius * 0.35
    const ix = cx + Math.cos(angle) * innerR
    const iy = cy + Math.sin(angle) * innerR
    paths.push(
      <circle
        key={`inner-${i}`}
        cx={ix}
        cy={iy}
        r={3}
        fill={color}
        opacity={0.8}
      />
    )

    // Outer petals: varying length based on genotype hash
    const petalLength = maxRadius * (0.5 + (hash % 50) / 100) // 50-100% of remaining space
    const petalWidth = angleStep * 0.3
    const ox = cx + Math.cos(angle) * petalLength
    const oy = cy + Math.sin(angle) * petalLength

    // Control points for curved petal
    const cp1x = cx + Math.cos(angle - petalWidth) * (petalLength * 0.6)
    const cp1y = cy + Math.sin(angle - petalWidth) * (petalLength * 0.6)
    const cp2x = cx + Math.cos(angle + petalWidth) * (petalLength * 0.6)
    const cp2y = cy + Math.sin(angle + petalWidth) * (petalLength * 0.6)

    paths.push(
      <path
        key={`petal-${i}`}
        d={`M ${cx} ${cy} Q ${cp1x} ${cp1y} ${ox} ${oy} Q ${cp2x} ${cp2y} ${cx} ${cy}`}
        fill={color}
        opacity={0.25}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.6}
      />
    )

    // Connecting lines between adjacent nodes
    if (i > 0) {
      const prevAngle = (i - 1) * angleStep - Math.PI / 2
      const prevR = maxRadius * 0.35
      const px = cx + Math.cos(prevAngle) * prevR
      const py = cy + Math.sin(prevAngle) * prevR
      paths.push(
        <line
          key={`line-${i}`}
          x1={px}
          y1={py}
          x2={ix}
          y2={iy}
          stroke="var(--border)"
          strokeWidth={0.5}
          opacity={0.4}
        />
      )
    }
  })

  // Close the polygon
  if (segments > 2) {
    const firstAngle = -Math.PI / 2
    const lastAngle = (segments - 1) * angleStep - Math.PI / 2
    const innerR = maxRadius * 0.35
    paths.push(
      <line
        key="line-close"
        x1={cx + Math.cos(lastAngle) * innerR}
        y1={cy + Math.sin(lastAngle) * innerR}
        x2={cx + Math.cos(firstAngle) * innerR}
        y2={cy + Math.sin(firstAngle) * innerR}
        stroke="var(--border)"
        strokeWidth={0.5}
        opacity={0.4}
      />
    )
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle cx={cx} cy={cy} r={maxRadius} fill="none" stroke="var(--border)" strokeWidth={0.5} opacity={0.3} />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2} fill="var(--text-tertiary)" />
        {paths}
      </svg>
      {label && (
        <span style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
        }}>
          {label}
        </span>
      )}
    </div>
  )
}
