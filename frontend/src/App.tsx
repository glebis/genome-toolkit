import { useState, useEffect, useCallback } from 'react'
import './styles/theme.css'
import { useSNPs, type SNP } from './hooks/useSNPs'
import { useChat, type UIAction } from './hooks/useChat'
import { useVoice } from './hooks/useVoice'
import { SNPTable } from './components/SNPTable'
import { CommandPalette } from './components/CommandPalette'
import { VariantDrawer } from './components/VariantDrawer'
import { InsightPanel, type InsightData } from './components/InsightPanel'
import { VoiceButton } from './components/VoiceButton'
import { MentalHealthDashboard } from './components/mental-health/MentalHealthDashboard'
import { useMentalHealthData } from './hooks/useMentalHealthData'
import { useChecklist } from './hooks/useChecklist'
import { ChecklistSidebar } from './components/mental-health/ChecklistSidebar'
import { PGxPanel } from './components/pgx/PGxPanel'

function App() {
  const { result, filters, loading, updateFilters, debouncedUpdateFilters, setPage, resetFilters, activeFilterCount } = useSNPs()
  const voice = useVoice()
  const [view, setView] = useState<'snps' | 'mental-health' | 'pgx'>(() => {
    const hash = window.location.hash
    if (hash === '#/mental-health') return 'mental-health'
    if (hash === '#/pgx') return 'pgx'
    return 'snps'
  })
  const mentalHealth = useMentalHealthData()
  const checklist = useChecklist()
  const [checklistOpen, setChecklistOpen] = useState(false)

  const navigate = useCallback((v: 'snps' | 'mental-health' | 'pgx') => {
    setView(v)
    if (v === 'mental-health') window.location.hash = '#/mental-health'
    else if (v === 'pgx') window.location.hash = '#/pgx'
    else window.location.hash = '#/'
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash
      if (hash === '#/mental-health') setView('mental-health')
      else if (hash === '#/pgx') setView('pgx')
      else setView('snps')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [selectedSNP, setSelectedSNP] = useState<SNP | null>(null)
  const [genes, setGenes] = useState<{ gene: string; count: number }[]>([])
  const [insights, setInsights] = useState<InsightData | null>(null)
  const [searchText, setSearchText] = useState(filters.search)
  const [geneText, setGeneText] = useState('')
  const [conditionText, setConditionText] = useState(filters.condition)

  useEffect(() => {
    fetch('/api/genes').then(r => r.json()).then(setGenes).catch(() => {})
    fetch('/api/insights').then(r => r.json()).then(setInsights).catch(() => {})

    const params = new URLSearchParams(window.location.search)
    const variantId = params.get('variant')
    if (variantId) {
      fetch(`/api/snps/${variantId}`)
        .then(r => r.ok ? r.json() : null)
        .then(snp => { if (snp) setSelectedSNP(snp as SNP) })
        .catch(() => {})
    }
  }, [])

  const handleUIAction = useCallback((action: UIAction) => {
    if (action.action === 'filter_table') {
      const p = action.params
      const update: Record<string, string | boolean> = {}

      // Apply all filter fields the agent sends
      if ('search' in p) { update.search = p.search || ''; setSearchText(p.search || '') }
      if ('chromosome' in p) update.chromosome = p.chromosome || ''
      if ('source' in p) update.source = p.source || ''
      if ('gene' in p) { update.gene = p.gene || ''; setGeneText('') }
      if ('condition' in p) { update.condition = p.condition || ''; setConditionText(p.condition || '') }
      if ('significance' in p) update.significance = p.significance || ''
      if ('zygosity' in p) update.zygosity = p.zygosity || ''

      // When agent explicitly clears restrictive filters to show results
      if (String(p.clear_restrictive_filters) === 'true') {
        update.clinical = false
        update.significance = ''
      }

      updateFilters(update)
    } else if (action.action === 'speak') {
      const p = action.params as unknown as { text: string; emotion?: string }
      voice.speak(p.text, p.emotion)
    }
  }, [updateFilters, voice])

  const { messages, streaming, streamingText, status, suggestions, send: rawSend } = useChat(handleUIAction)

  // Wrap send to prefix [VOICE] when voice mode active
  // The prefix tells the agent to call voice_summary but is stripped from display
  const send = useCallback((text: string) => {
    if (voice.voiceEnabled) {
      rawSend('[VOICE] ' + text)
    } else {
      rawSend(text)
    }
  }, [rawSend, voice.voiceEnabled])

  const handleDiscuss = useCallback((context: string) => {
    setCmdkOpen(true)
    setTimeout(() => send(context), 150)
  }, [send])

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

  const selectVariant = useCallback((snp: SNP | null) => {
    setSelectedSNP(snp)
    const params = new URLSearchParams(window.location.search)
    if (snp) {
      params.set('variant', snp.rsid)
    } else {
      params.delete('variant')
    }
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [])

  const handleAskAI = useCallback((query: string) => {
    selectVariant(null)
    setCmdkOpen(true)
    setTimeout(() => send(query), 100)
  }, [send, selectVariant])

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Top bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-md) var(--space-lg)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <span
            style={{
              fontSize: 'var(--font-size-xl)',
              fontWeight: 600,
              color: 'var(--accent)',
              letterSpacing: 'var(--tracking-wide)',
              cursor: 'pointer',
            }}
            onClick={() => navigate('snps')}
          >
            GENOME_TOOLKIT
          </span>
          <span className="label" style={{ color: 'var(--text-tertiary)' }}>
            {result.total > 0
              ? `${result.total.toLocaleString()} VARIANTS`
              : 'AWAITING_DATA'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <button
            className="btn"
            style={{
              fontSize: 'var(--font-size-xs)',
              background: view === 'snps' ? 'var(--bg-inset)' : 'transparent',
              borderColor: view === 'snps' ? 'var(--primary)' : 'var(--border)',
              color: view === 'snps' ? 'var(--primary)' : 'var(--text-secondary)',
            }}
            onClick={() => navigate('snps')}
          >
            SNP_BROWSER
          </button>
          <button
            className="btn"
            style={{
              fontSize: 'var(--font-size-xs)',
              background: view === 'mental-health' ? 'var(--bg-inset)' : 'transparent',
              borderColor: view === 'mental-health' ? 'var(--primary)' : 'var(--border)',
              color: view === 'mental-health' ? 'var(--primary)' : 'var(--text-secondary)',
            }}
            onClick={() => navigate('mental-health')}
          >
            MENTAL_HEALTH
          </button>
          <button
            className="btn"
            style={{
              fontSize: 'var(--font-size-xs)',
              background: view === 'pgx' ? 'var(--bg-inset)' : 'transparent',
              borderColor: view === 'pgx' ? 'var(--primary)' : 'var(--border)',
              color: view === 'pgx' ? 'var(--primary)' : 'var(--text-secondary)',
            }}
            onClick={() => navigate('pgx')}
          >
            PGX_/_DRUGS
          </button>
          <button
            className="btn"
            style={{
              fontSize: 'var(--font-size-xs)',
              position: 'relative',
              borderColor: checklistOpen ? 'var(--primary)' : 'var(--border)',
              color: checklistOpen ? 'var(--primary)' : undefined,
            }}
            onClick={() => setChecklistOpen(prev => !prev)}
          >
            CHECKLIST
            {checklist.pendingCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: 'var(--accent)', color: 'var(--bg-raised)',
                fontSize: 8, fontWeight: 600, padding: '1px 5px',
                borderRadius: 10, minWidth: 16, textAlign: 'center',
              }}>
                {checklist.pendingCount}
              </span>
            )}
          </button>
          {voice.supported && (
            <VoiceButton
              voiceEnabled={voice.voiceEnabled}
              state={voice.state}
              recordingTime={voice.recordingTime}
              onToggleVoice={voice.toggleVoice}
              onStartListening={() => {
                setCmdkOpen(true)
                voice.startListening((text) => {
                  send(text)
                })
              }}
              onStopListening={voice.stopListening}
              onStopSpeaking={voice.stopSpeaking}
            />
          )}
          <button
            className="btn btn--accent"
            style={{ fontSize: 'var(--font-size-xs)' }}
            onClick={() => setCmdkOpen(true)}
          >
            ASK_AI // CMD+K
          </button>
        </div>
      </header>

      {/* Main content: SNP Browser or Mental Health Dashboard */}
      {view === 'snps' ? (
        <>
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
            onGeneChange={setGeneText}
            onConditionChange={(v) => { setConditionText(v); debouncedUpdateFilters({ condition: v }) }}
            onFilterChange={updateFilters}
            onClearAll={() => {
              setSearchText('')
              setGeneText('')
              setConditionText('')
              resetFilters()
            }}
          />
          {/* Table */}
          <main style={{ flex: 1 }}>
            <SNPTable
              data={result}
              loading={loading}
              totalVariants={insights?.total_variants}
              onPageChange={setPage}
              onRowClick={selectVariant}
              onResetFilters={() => {
                setSearchText('')
                setGeneText('')
                setConditionText('')
                resetFilters()
              }}
            />
          </main>
        </>
      ) : view === 'pgx' ? (
        <main>
          <PGxPanel />
        </main>
      ) : (
        <main>
          <MentalHealthDashboard
            data={mentalHealth.sections}
            totalGenes={mentalHealth.totalGenes}
            totalActions={mentalHealth.totalActions}
            onExport={(format) => console.log('export', format)}
            onGeneClick={(gene) => console.log('gene click', gene.symbol)}
            actions={mentalHealth.actions}
            onToggleAction={checklist.toggleDone}
            onDiscuss={handleDiscuss}
          />
        </main>
      )}

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
        onClose={() => selectVariant(null)}
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

      {/* Checklist Sidebar */}
      {checklistOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.1)', zIndex: 99 }}
            onClick={() => setChecklistOpen(false)}
          />
          <ChecklistSidebar
            grouped={checklist.grouped}
            groupBy={checklist.groupBy}
            filterStatus={checklist.filterStatus}
            pendingCount={checklist.pendingCount}
            doneCount={checklist.doneCount}
            totalCount={checklist.items.length}
            uniqueGenes={checklist.uniqueGenes}
            onSetGroupBy={checklist.setGroupBy}
            onSetFilterStatus={checklist.setFilterStatus}
            onToggleDone={checklist.toggleDone}
            onDelete={checklist.deleteItem}
            onAdd={(title) => checklist.addItem(title)}
            onClose={() => setChecklistOpen(false)}
            onExport={(format) => console.log('export', format)}
            onResearchPrompt={() => console.log('research prompt')}
          />
        </>
      )}
    </div>
  )
}

export default App
