import { useState, type CSSProperties } from 'react'

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
  genes: { gene: string; count: number }[]
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
  const [conditionFocused, setConditionFocused] = useState(false)
  const [geneFocused, setGeneFocused] = useState(false)
  const selectedGenes = filters.gene ? filters.gene.split(',').map(g => g.trim()).filter(Boolean) : []
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

        <div
          style={{ ...inputCard, flex: '2 1 200px', position: 'relative' }}
          onFocus={() => setGeneFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setTimeout(() => setGeneFocused(false), 150)
            }
          }}
        >
          <span style={{ ...labelStyle, fontSize: '8px', marginBottom: -2 }}>GENE</span>
          {/* Selected gene chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
            {selectedGenes.map(g => (
              <span
                key={g}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  letterSpacing: '0.08em',
                  padding: '1px 6px',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
                onClick={() => {
                  const next = selectedGenes.filter(x => x !== g).join(',')
                  onGeneChange(next)
                  onFilterChange({ gene: next })
                }}
                title={`Remove ${g}`}
              >
                {g} x
              </span>
            ))}
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 60 }}
              placeholder={selectedGenes.length ? '' : 'CYP2D6, MTHFR...'}
              value={geneText}
              onChange={e => onGeneChange(e.target.value)}
            />
          </div>
          {/* Gene suggest dropdown */}
          {geneFocused && genes.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: -1,
              right: -1,
              background: 'var(--bg-raised)',
              border: '1px solid var(--primary)',
              borderTop: 'none',
              zIndex: 100,
              maxHeight: 280,
              overflowY: 'auto',
            }}>
              {(genes as { gene: string; count: number }[])
                .filter(g => {
                  if (selectedGenes.includes(g.gene)) return false
                  if (!geneText) return true
                  return g.gene.toLowerCase().includes(geneText.toLowerCase())
                })
                .slice(0, 15)
                .map(g => (
                  <div
                    key={g.gene}
                    tabIndex={-1}
                    onClick={() => {
                      const next = [...selectedGenes, g.gene].join(',')
                      onGeneChange('')
                      onFilterChange({ gene: next })
                      setGeneFocused(false)
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '5px 8px',
                      fontSize: 'var(--font-size-sm)',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-inset)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontWeight: 500 }}>{g.gene}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}>{g.count}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div
          style={{ ...inputCard, flex: '1 1 160px', position: 'relative' }}
          onFocus={() => setConditionFocused(true)}
          onBlur={(e) => {
            // Delay to allow click on suggestion
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setTimeout(() => setConditionFocused(false), 150)
            }
          }}
        >
          <span style={{ ...labelStyle, fontSize: '8px', marginBottom: -2 }}>CONDITION</span>
          <input
            style={inputStyle}
            placeholder="cancer, diabetes..."
            value={conditionText}
            onChange={e => onConditionChange(e.target.value)}
          />
          {/* Suggest dropdown */}
          {conditionFocused && data?.top_conditions && data.top_conditions.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: -1,
              right: -1,
              background: 'var(--bg-raised)',
              border: '1px solid var(--primary)',
              borderTop: 'none',
              zIndex: 100,
              maxHeight: 280,
              overflowY: 'auto',
            }}>
              {data.top_conditions
                .filter(c => !conditionText || c.condition.toLowerCase().includes(conditionText.toLowerCase()))
                .slice(0, 10)
                .map(c => {
                  const isActive = filters.condition === c.condition
                  return (
                    <div
                      key={c.condition}
                      tabIndex={-1}
                      onClick={() => {
                        onConditionChange(c.condition)
                        onFilterChange({ condition: c.condition })
                        setConditionFocused(false)
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '5px 8px',
                        fontSize: 'var(--font-size-sm)',
                        cursor: 'pointer',
                        background: isActive ? 'var(--bg-inset)' : 'transparent',
                        color: isActive ? 'var(--sig-risk)' : 'var(--text)',
                        fontWeight: isActive ? 600 : 400,
                        borderBottom: '1px solid var(--border)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-inset)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--bg-inset)' : 'transparent' }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                        {c.condition}
                      </span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)', flexShrink: 0 }}>
                        {c.count}
                      </span>
                    </div>
                  )
                })}
            </div>
          )}
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
