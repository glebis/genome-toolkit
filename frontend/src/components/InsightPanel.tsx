import type { CSSProperties } from 'react'

export interface InsightData {
  total_variants: number
  genotyped: number
  imputed: number
  pathogenic_count: number
  drug_response_count: number
  risk_factor_count: number
  uncertain_count: number
  actionable_count: number
  top_genes: { gene: string; count: number }[]
}

interface Props {
  data: InsightData | null
  onFilterClinical: () => void
  onFilterGene: (gene: string) => void
}

const panelStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-md)',
  padding: 'var(--space-md) var(--space-lg)',
  overflowX: 'auto',
}

const cardStyle: CSSProperties = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--border)',
  borderRadius: 2,
  padding: 'var(--space-md)',
  minWidth: 160,
  flex: '1 1 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-xs)',
}

const labelStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  color: 'var(--text-secondary)',
}

const valueStyle: CSSProperties = {
  fontSize: 'var(--font-size-2xl)',
  fontWeight: 600,
  lineHeight: 1.1,
}

const subtitleStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-tertiary)',
  letterSpacing: '0.08em',
}

const clickableStyle: CSSProperties = {
  cursor: 'pointer',
  transition: 'border-color 0.15s',
}

export function InsightPanel({ data, onFilterClinical, onFilterGene }: Props) {
  if (!data) return null

  return (
    <div style={panelStyle}>
      {/* TOTAL VARIANTS */}
      <div style={cardStyle}>
        <span style={labelStyle}>TOTAL_VARIANTS</span>
        <span style={valueStyle}>{data.total_variants.toLocaleString()}</span>
        <span style={subtitleStyle}>
          {data.genotyped.toLocaleString()} GENOTYPED / {data.imputed.toLocaleString()} IMPUTED
        </span>
      </div>

      {/* PATHOGENIC */}
      <div style={cardStyle}>
        <span style={labelStyle}>PATHOGENIC</span>
        <span style={{ ...valueStyle, color: 'var(--sig-risk)' }}>
          {data.pathogenic_count.toLocaleString()}
        </span>
        <span style={subtitleStyle}>
          {data.risk_factor_count} RISK_FACTORS
        </span>
      </div>

      {/* DRUG RESPONSE */}
      <div style={cardStyle}>
        <span style={labelStyle}>DRUG_RESPONSE</span>
        <span style={{ ...valueStyle, color: 'var(--sig-reduced)' }}>
          {data.drug_response_count.toLocaleString()}
        </span>
        <span style={subtitleStyle}>
          {data.uncertain_count} UNCERTAIN
        </span>
      </div>

      {/* ACTIONABLE */}
      <div
        style={{
          ...cardStyle,
          ...clickableStyle,
          borderColor: 'var(--primary-dim)',
          borderStyle: 'dashed',
        }}
        onClick={onFilterClinical}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary-dim)'
        }}
        title="Click to filter actionable variants"
      >
        <span style={{ ...labelStyle, color: 'var(--primary)' }}>ACTIONABLE</span>
        <span style={{ ...valueStyle, color: 'var(--primary)' }}>
          {data.actionable_count.toLocaleString()}
        </span>
        <span style={subtitleStyle}>CLICK_TO_FILTER</span>
      </div>

      {/* TOP GENES */}
      <div style={{ ...cardStyle, minWidth: 200 }}>
        <span style={labelStyle}>TOP_GENES</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {data.top_genes.slice(0, 5).map(g => (
            <span
              key={g.gene}
              onClick={() => onFilterGene(g.gene)}
              style={{
                fontSize: 'var(--font-size-sm)',
                cursor: 'pointer',
                color: 'var(--text)',
                display: 'flex',
                justifyContent: 'space-between',
                padding: '1px 0',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLSpanElement).style.color = 'var(--accent)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLSpanElement).style.color = 'var(--text)'
              }}
              title={`Filter by ${g.gene}`}
            >
              <span style={{ fontWeight: 500 }}>{g.gene}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{g.count}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
