import { useState, useEffect, useCallback } from 'react'
import './styles/theme.css'
import { useSNPs, type SNP } from './hooks/useSNPs'
import { useChat, type UIAction } from './hooks/useChat'
import { SNPTable } from './components/SNPTable'
import { CommandPalette } from './components/CommandPalette'
import { VariantDrawer } from './components/VariantDrawer'
import { InsightPanel, type InsightData } from './components/InsightPanel'

function App() {
  const { result, filters, loading, updateFilters, debouncedUpdateFilters, setPage } = useSNPs()
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [selectedSNP, setSelectedSNP] = useState<SNP | null>(null)
  const [genes, setGenes] = useState<string[]>([])
  const [insights, setInsights] = useState<InsightData | null>(null)
  const [searchText, setSearchText] = useState(filters.search)
  const [geneText, setGeneText] = useState(filters.gene)
  const [conditionText, setConditionText] = useState(filters.condition)

  useEffect(() => {
    fetch('/api/genes').then(r => r.json()).then(setGenes).catch(() => {})
    fetch('/api/insights').then(r => r.json()).then(setInsights).catch(() => {})
  }, [])

  const hasActiveFilters = !!(filters.search || filters.chromosome || filters.source ||
    filters.clinical || filters.significance || filters.gene || filters.condition || filters.zygosity)
  const activeFilterCount = [filters.search, filters.chromosome, filters.source,
    filters.clinical, filters.significance, filters.gene, filters.condition, filters.zygosity]
    .filter(Boolean).length

  const handleUIAction = useCallback((action: UIAction) => {
    if (action.action === 'filter_table') {
      updateFilters({
        search: action.params.search || '',
        chromosome: action.params.chromosome || '',
        source: action.params.source || '',
      })
    }
  }, [updateFilters])

  const { messages, streaming, streamingText, status, suggestions, send } = useChat(handleUIAction)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdkOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleAskAI = useCallback((query: string) => {
    setSelectedSNP(null)
    setCmdkOpen(true)
    setTimeout(() => send(query), 100)
  }, [send])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-md) var(--space-lg)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <span style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 600,
            color: 'var(--accent)',
            letterSpacing: 'var(--tracking-wide)',
          }}>
            GENOME_TOOLKIT
          </span>
          <span className="label" style={{ color: 'var(--text-tertiary)' }}>
            {result.total > 0
              ? `${result.total.toLocaleString()} VARIANTS_LOADED`
              : 'AWAITING_DATA'}
          </span>
        </div>
        <button
          className="btn btn--accent"
          style={{ fontSize: 'var(--font-size-xs)' }}
          onClick={() => setCmdkOpen(true)}
        >
          ASK_AI // CMD+K
        </button>
      </header>

      {/* Filter bar — row 1 */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        padding: 'var(--space-sm) var(--space-lg) 0',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <input
          className="input"
          placeholder="SEARCH // RSID, POSITION..."
          style={{ maxWidth: 280 }}
          value={searchText}
          onChange={e => {
            setSearchText(e.target.value)
            debouncedUpdateFilters({ search: e.target.value })
          }}
        />
        <input
          className="input"
          placeholder="GENE // CYP2D6, MTHFR..."
          style={{ maxWidth: 180 }}
          value={geneText}
          onChange={e => {
            setGeneText(e.target.value)
            debouncedUpdateFilters({ gene: e.target.value })
          }}
          list="gene-list"
        />
        <datalist id="gene-list">
          {genes.map(g => <option key={g} value={g} />)}
        </datalist>
        <input
          className="input"
          placeholder="CONDITION // CANCER, DIABETES..."
          style={{ maxWidth: 220 }}
          value={conditionText}
          onChange={e => {
            setConditionText(e.target.value)
            debouncedUpdateFilters({ condition: e.target.value })
          }}
        />
        <select
          className="input"
          style={{ maxWidth: 130 }}
          value={filters.chromosome}
          onChange={e => updateFilters({ chromosome: e.target.value })}
        >
          <option value="">ALL_CHR</option>
          {Array.from({ length: 22 }, (_, i) => i + 1).map(n => (
            <option key={n} value={String(n)}>CHR_{n}</option>
          ))}
          <option value="X">CHR_X</option>
          <option value="Y">CHR_Y</option>
          <option value="MT">CHR_MT</option>
        </select>
        <select
          className="input"
          style={{ maxWidth: 180 }}
          value={filters.significance}
          onChange={e => updateFilters({ significance: e.target.value })}
        >
          <option value="">ALL_SIGNIFICANCE</option>
          <option value="Pathogenic">PATHOGENIC</option>
          <option value="Likely pathogenic">LIKELY_PATHOGENIC</option>
          <option value="drug response">DRUG_RESPONSE</option>
          <option value="risk factor">RISK_FACTOR</option>
          <option value="protective">PROTECTIVE</option>
          <option value="Uncertain significance">UNCERTAIN</option>
          <option value="Conflicting">CONFLICTING</option>
        </select>
        <select
          className="input"
          style={{ maxWidth: 160 }}
          value={filters.zygosity}
          onChange={e => updateFilters({ zygosity: e.target.value })}
        >
          <option value="">ALL_ZYGOSITY</option>
          <option value="homozygous">HOMOZYGOUS</option>
          <option value="heterozygous">HETEROZYGOUS</option>
        </select>
      </div>
      {/* Filter bar — row 2: toggles */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        padding: '0 var(--space-lg) var(--space-sm)',
        borderBottom: '1px dashed var(--border-dashed)',
        alignItems: 'center',
        marginTop: 'var(--space-xs)',
      }}>
        <select
          className="input"
          style={{ maxWidth: 140 }}
          value={filters.source}
          onChange={e => updateFilters({ source: e.target.value })}
        >
          <option value="">ALL_SOURCES</option>
          <option value="genotyped">GENOTYPED</option>
          <option value="imputed">IMPUTED</option>
        </select>
        <button
          className={`btn ${filters.clinical ? 'btn--active' : ''}`}
          style={{ fontSize: 'var(--font-size-xs)', whiteSpace: 'nowrap' }}
          onClick={() => updateFilters({ clinical: !filters.clinical })}
        >
          ACTIONABLE
        </button>
        {hasActiveFilters && (
          <button
            className="btn"
            style={{ fontSize: 'var(--font-size-xs)' }}
            onClick={() => {
              setSearchText('')
              setGeneText('')
              setConditionText('')
              updateFilters({
                search: '', chromosome: '', source: '', clinical: false,
                significance: '', gene: '', condition: '', zygosity: '',
              })
            }}
          >
            CLEAR_ALL
          </button>
        )}
        <span className="label" style={{ marginLeft: 'auto' }}>
          {activeFilterCount > 0 ? `${activeFilterCount} FILTERS_ACTIVE` : ''}
        </span>
      </div>

      {/* Insight Panel */}
      <InsightPanel
        data={insights}
        onFilterClinical={() => updateFilters({ clinical: true })}
        onFilterGene={(gene) => {
          setGeneText(gene)
          updateFilters({ gene })
        }}
      />

      {/* Table */}
      <main style={{ flex: 1 }}>
        <SNPTable
          data={result}
          loading={loading}
          onPageChange={setPage}
          onRowClick={setSelectedSNP}
        />
      </main>

      {/* Status bar */}
      <footer style={{
        padding: 'var(--space-xs) var(--space-lg)',
        borderTop: '1px dashed var(--border-dashed)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span className="label">
          SIGNAL_PHASE: {loading ? 'SCANNING' : streaming ? (status || 'AI_PROCESSING') : 'IDLE'}
        </span>
        <span className="label">GENOME_TOOLKIT // V0.1.0</span>
      </footer>

      {/* Variant Drawer */}
      <VariantDrawer
        snp={selectedSNP}
        onClose={() => setSelectedSNP(null)}
        onAskAI={handleAskAI}
      />

      {/* Command Palette */}
      <CommandPalette
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        messages={messages}
        streaming={streaming}
        streamingText={streamingText}
        status={status}
        suggestions={suggestions}
        onSend={send}
      />
    </div>
  )
}

export default App
