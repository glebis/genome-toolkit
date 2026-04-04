import { useState, useEffect, useCallback } from 'react'
import './styles/theme.css'
import { useSNPs, type SNP } from './hooks/useSNPs'
import { useChat, type UIAction } from './hooks/useChat'
import { SNPTable } from './components/SNPTable'
import { CommandPalette } from './components/CommandPalette'
import { VariantDrawer } from './components/VariantDrawer'

function App() {
  const { result, filters, loading, updateFilters, setPage } = useSNPs()
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [selectedSNP, setSelectedSNP] = useState<SNP | null>(null)

  const handleUIAction = useCallback((action: UIAction) => {
    if (action.action === 'filter_table') {
      updateFilters({
        search: action.params.search || '',
        chromosome: action.params.chromosome || '',
        source: action.params.source || '',
      })
    }
  }, [updateFilters])

  const { messages, streaming, streamingText, status, send } = useChat(handleUIAction)

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

      {/* Filter bar */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        padding: 'var(--space-sm) var(--space-lg)',
        borderBottom: '1px dashed var(--border-dashed)',
        alignItems: 'center',
      }}>
        <input
          className="input"
          placeholder="SEARCH // RSID, GENE, POSITION..."
          style={{ maxWidth: 400 }}
          value={filters.search}
          onChange={e => updateFilters({ search: e.target.value })}
        />
        <select
          className="input"
          style={{ maxWidth: 140 }}
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
          CLINICAL_ONLY
        </button>
        {(filters.search || filters.chromosome || filters.source || filters.clinical) && (
          <button
            className="btn"
            style={{ fontSize: 'var(--font-size-xs)' }}
            onClick={() => updateFilters({ search: '', chromosome: '', source: '', clinical: false })}
          >
            CLEAR
          </button>
        )}
      </div>

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
        onSend={send}
      />
    </div>
  )
}

export default App
