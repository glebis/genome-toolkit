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
              ? `${result.total.toLocaleString()} VARIANTS`
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

      {/* Unified filter panel */}
      <InsightPanel
        data={insights}
        filters={filters}
        genes={genes}
        activeFilterCount={activeFilterCount}
        searchText={searchText}
        geneText={geneText}
        conditionText={conditionText}
        onSearchChange={(v) => { setSearchText(v); debouncedUpdateFilters({ search: v }) }}
        onGeneChange={(v) => { setGeneText(v); debouncedUpdateFilters({ gene: v }) }}
        onConditionChange={(v) => { setConditionText(v); debouncedUpdateFilters({ condition: v }) }}
        onFilterChange={updateFilters}
        onClearAll={() => {
          setSearchText('')
          setGeneText('')
          setConditionText('')
          updateFilters({
            search: '', chromosome: '', source: '', clinical: false,
            significance: '', gene: '', condition: '', zygosity: '',
          })
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
