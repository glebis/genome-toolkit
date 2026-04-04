import { type CSSProperties } from 'react'

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
  top_conditions: { condition: string; count: number }[]
}

interface FilterState {
  search: string
  gene: string
  condition: string
  chromosome: string
  significance: string
  zygosity: string
  source: string
  clinical: boolean
}

interface Props {
  data: InsightData | null
  filters: FilterState
  genes: string[]
  activeFilterCount: number
  searchText: string
  geneText: string
  conditionText: string
  onSearchChange: (v: string) => void
  onGeneChange: (v: string) => void
  onConditionChange: (v: string) => void
  onFilterChange: (partial: Partial<FilterState>) => void
  onClearAll: () => void
}

const cardBase: CSSProperties = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--border)',
  borderRadius: 2,
  padding: 'var(--space-sm) var(--space-md)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
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

const subStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-tertiary)',
  letterSpacing: '0.06em',
}

const inputCard: CSSProperties = {
  ...cardBase,
  cursor: 'default',
  padding: 'var(--space-xs) var(--space-sm)',
  justifyContent: 'center',
}

const inputStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-sm)',
  letterSpacing: 'var(--tracking-normal)',
  padding: '4px 0',
  border: 'none',
  background: 'transparent',
  color: 'var(--text)',
  outline: 'none',
  width: '100%',
}

const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
}

function StatCard({ label, value, sub, color, active, onClick }: {
  label: string
  value: string | number
  sub?: string
  color?: string
  active?: boolean
  onClick?: () => void
}) {
  const formatted = typeof value === 'number' ? value.toLocaleString() : value
  const fontSize = formatted.length > 7 ? 'var(--font-size-xl)' : 'var(--font-size-2xl)'

  return (
    <div
      style={{
        ...cardBase,
        borderColor: active ? (color || 'var(--primary)') : 'var(--border)',
        background: active ? 'var(--bg-inset)' : 'var(--bg-raised)',
        overflow: 'hidden',
      }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color || 'var(--primary)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = active ? (color || 'var(--primary)') : 'var(--border)' }}
    >
      <span style={{ ...labelStyle, color: active ? (color || 'var(--primary)') : 'var(--text-secondary)' }}>
        {label}
      </span>
      <span style={{ ...valueStyle, fontSize, color: color || 'var(--text)' }}>
        {formatted}
      </span>
      {sub && <span style={subStyle}>{sub}</span>}
    </div>
  )
}

export function InsightPanel({
  data, filters, genes, activeFilterCount,
  searchText, geneText, conditionText,
  onSearchChange, onGeneChange, onConditionChange,
  onFilterChange, onClearAll,
}: Props) {
  return (
    <div style={{
      padding: 'var(--space-sm) var(--space-lg)',
      borderBottom: '1px dashed var(--border-dashed)',
    }}>
      {/* Row 1: Stats + quick filters */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 'var(--space-sm)',
        marginBottom: 'var(--space-sm)',
      }}>
        {/* Stat cards — clickable filters */}
        {data && (
          <>
            <StatCard
              label="TOTAL"
              value={data.total_variants}
              sub={`${data.genotyped.toLocaleString()} GEN / ${data.imputed.toLocaleString()} IMP`}
              onClick={() => onFilterChange({ clinical: false, significance: '', source: '' })}
              active={!filters.clinical && !filters.significance}
            />
            <StatCard
              label="PATHOGENIC"
              value={data.pathogenic_count}
              sub={`${data.risk_factor_count} RISK_FACTORS`}
              color="var(--sig-risk)"
              active={filters.significance.toLowerCase().includes('pathogenic')}
              onClick={() => onFilterChange({ significance: 'Pathogenic', clinical: false })}
            />
            <StatCard
              label="DRUG_RESPONSE"
              value={data.drug_response_count}
              color="var(--sig-reduced)"
              active={filters.significance.toLowerCase().includes('drug')}
              onClick={() => onFilterChange({ significance: 'drug response', clinical: false })}
            />
            <StatCard
              label="ACTIONABLE"
              value={data.actionable_count}
              sub="EXCLUDES_BENIGN"
              color="var(--primary)"
              active={filters.clinical}
              onClick={() => onFilterChange({ clinical: !filters.clinical, significance: '' })}
            />
          </>
        )}

        {/* Top genes */}
        {data && data.top_genes.slice(0, 5).map(g => (
          <div
            key={g.gene}
            style={{
              ...cardBase,
              borderColor: filters.gene === g.gene ? 'var(--accent)' : 'var(--border)',
              background: filters.gene === g.gene ? 'var(--bg-inset)' : 'var(--bg-raised)',
            }}
            onClick={() => {
              if (filters.gene === g.gene) {
                onGeneChange('')
                onFilterChange({ gene: '' })
              } else {
                onGeneChange(g.gene)
                onFilterChange({ gene: g.gene })
              }
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = filters.gene === g.gene ? 'var(--accent)' : 'var(--border)' }}
          >
            <span style={{ ...labelStyle, color: filters.gene === g.gene ? 'var(--accent)' : 'var(--text-secondary)' }}>
              {g.gene}
            </span>
            <span style={{ ...valueStyle, fontSize: 'var(--font-size-lg)', color: 'var(--accent)' }}>
              {g.count}
            </span>
            <span style={subStyle}>VARIANTS</span>
          </div>
        ))}

        {/* Top conditions — single card with list */}
        {data && data.top_conditions && (
          <div style={{ ...cardBase, minWidth: 220, cursor: 'default', gridColumn: 'span 2' }}>
            <span style={labelStyle}>TOP_CONDITIONS</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data.top_conditions.slice(0, 10).map(c => {
                const isActive = filters.condition === c.condition
                const shortName = c.condition.length > 28 ? c.condition.slice(0, 26) + '..' : c.condition
                return (
                  <span
                    key={c.condition}
                    onClick={() => {
                      if (isActive) {
                        onConditionChange('')
                        onFilterChange({ condition: '' })
                      } else {
                        onConditionChange(c.condition)
                        onFilterChange({ condition: c.condition })
                      }
                    }}
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      cursor: 'pointer',
                      color: isActive ? 'var(--sig-risk)' : 'var(--text)',
                      fontWeight: isActive ? 600 : 400,
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '1px 0',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = 'var(--sig-risk)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = isActive ? 'var(--sig-risk)' : 'var(--text)' }}
                    title={c.condition}
                  >
                    <span>{shortName}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{c.count}</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Text inputs + dropdowns */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        alignItems: 'stretch',
        flexWrap: 'wrap',
      }}>
        <div style={{ ...inputCard, flex: '2 1 200px' }}>
          <span style={{ ...labelStyle, fontSize: '8px', marginBottom: -2 }}>SEARCH</span>
          <input
            style={inputStyle}
            placeholder="rsID, gene, disease..."
            value={searchText}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        <div style={{ ...inputCard, flex: '1 1 140px' }}>
          <span style={{ ...labelStyle, fontSize: '8px', marginBottom: -2 }}>GENE</span>
          <input
            style={inputStyle}
            placeholder="CYP2D6, MTHFR..."
            value={geneText}
            onChange={e => onGeneChange(e.target.value)}
            list="gene-list"
          />
          <datalist id="gene-list">
            {genes.map(g => <option key={g} value={g} />)}
          </datalist>
        </div>

        <div style={{ ...inputCard, flex: '1 1 160px' }}>
          <span style={{ ...labelStyle, fontSize: '8px', marginBottom: -2 }}>CONDITION</span>
          <input
            style={inputStyle}
            placeholder="cancer, diabetes..."
            value={conditionText}
            onChange={e => onConditionChange(e.target.value)}
          />
        </div>

        <div style={{ ...inputCard, flex: '0 1 110px' }}>
          <span style={{ ...labelStyle, fontSize: '8px', marginBottom: -2 }}>CHR</span>
          <select style={selectStyle} value={filters.chromosome} onChange={e => onFilterChange({ chromosome: e.target.value })}>
            <option value="">ALL</option>
            {Array.from({ length: 22 }, (_, i) => i + 1).map(n => (
              <option key={n} value={String(n)}>{n}</option>
            ))}
            <option value="X">X</option>
            <option value="Y">Y</option>
            <option value="MT">MT</option>
          </select>
        </div>

        <div style={{ ...inputCard, flex: '0 1 120px' }}>
          <span style={{ ...labelStyle, fontSize: '8px', marginBottom: -2 }}>ZYGOSITY</span>
          <select style={selectStyle} value={filters.zygosity} onChange={e => onFilterChange({ zygosity: e.target.value })}>
            <option value="">ALL</option>
            <option value="homozygous">HOM</option>
            <option value="heterozygous">HET</option>
          </select>
        </div>

        <div style={{ ...inputCard, flex: '0 1 120px' }}>
          <span style={{ ...labelStyle, fontSize: '8px', marginBottom: -2 }}>SOURCE</span>
          <select style={selectStyle} value={filters.source} onChange={e => onFilterChange({ source: e.target.value })}>
            <option value="">ALL</option>
            <option value="genotyped">GEN</option>
            <option value="imputed">IMP</option>
          </select>
        </div>

        {activeFilterCount > 0 && (
          <div
            style={{
              ...cardBase,
              flex: '0 0 auto',
              justifyContent: 'center',
              alignItems: 'center',
              borderColor: 'var(--border-strong)',
              padding: 'var(--space-xs) var(--space-md)',
            }}
            onClick={onClearAll}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sig-risk)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
          >
            <span style={{ ...labelStyle, color: 'var(--text-secondary)' }}>CLEAR</span>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{activeFilterCount}</span>
          </div>
        )}
      </div>
    </div>
  )
}
