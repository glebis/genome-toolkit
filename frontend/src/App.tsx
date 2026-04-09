import { useState, useEffect, useCallback } from 'react'
import './styles/theme.css'
import { useSNPs, type SNP } from './hooks/useSNPs'
import { useChat, type UIAction, type AgentAction } from './hooks/useChat'
import { useVoice } from './hooks/useVoice'
import { useStarterPrompts } from './hooks/useStarterPrompts'
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
import { AddictionProfile } from './components/addiction'
import { RiskLandscape } from './components/risk'
import {
  printPage,
  downloadFile,
  mentalHealthToMarkdown,
  checklistToMarkdown,
} from './lib/export'

function App() {
  const { result, filters, loading, updateFilters, debouncedUpdateFilters, setPage, resetFilters, activeFilterCount } = useSNPs()
  const voice = useVoice()
  const [view, setView] = useState<'snps' | 'mental-health' | 'pgx' | 'addiction' | 'risk'>(() => {
    const hash = window.location.hash
    if (hash === '#/mental-health') return 'mental-health'
    if (hash === '#/pgx') return 'pgx'
    if (hash === '#/addiction') return 'addiction'
    if (hash === '#/risk') return 'risk'
    return 'snps'
  })
  const mentalHealth = useMentalHealthData()
  const checklist = useChecklist()
  const starterPrompts = useStarterPrompts(view)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [checklistHighlight, setChecklistHighlight] = useState(false)

  const navigate = useCallback((v: 'snps' | 'mental-health' | 'pgx' | 'addiction' | 'risk') => {
    setView(v)
    if (v === 'mental-health') window.location.hash = '#/mental-health'
    else if (v === 'pgx') window.location.hash = '#/pgx'
    else if (v === 'addiction') window.location.hash = '#/addiction'
    else if (v === 'risk') window.location.hash = '#/risk'
    else window.location.hash = '#/'
  }, [])

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash
      if (hash === '#/mental-health') setView('mental-health')
      else if (hash === '#/pgx') setView('pgx')
      else if (hash === '#/addiction') setView('addiction')
      else if (hash === '#/risk') setView('risk')
      else setView('snps')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [cmdkInitialQuery, setCmdkInitialQuery] = useState<string | undefined>(undefined)
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
    } else if (action.action === 'checklist_added') {
      checklist.refresh()
      setChecklistHighlight(true)
      setTimeout(() => setChecklistHighlight(false), 2000)
    }
  }, [updateFilters, voice, checklist])

  const { messages, streaming, streamingText, status, suggestions, actions, send: rawSend } = useChat(handleUIAction)

  // Wrap send to prefix [VOICE] when voice mode active
  // The prefix tells the agent to call voice_summary but is stripped from display
  const send = useCallback((text: string) => {
    if (voice.voiceEnabled) {
      rawSend('[VOICE] ' + text)
    } else {
      rawSend(text)
    }
  }, [rawSend, voice.voiceEnabled])

  const handleExport = useCallback((format: 'pdf' | 'md' | 'doctor' | 'prescriber' | string) => {
    if (format === 'doctor' || format === 'prescriber' || format === 'pdf') {
      printPage(format as 'doctor' | 'prescriber' | 'pdf')
    } else if (format === 'md') {
      // Generate markdown based on current view
      if (view === 'mental-health') {
        const md = mentalHealthToMarkdown(mentalHealth.sections, mentalHealth.actions)
        downloadFile(md, `mental-health-${new Date().toISOString().slice(0, 10)}.md`)
      } else if (view === 'checklist') {
        const md = checklistToMarkdown(checklist.items)
        downloadFile(md, `checklist-${new Date().toISOString().slice(0, 10)}.md`)
      } else {
        // For views that handle their own markdown (pgx, risk, addiction),
        // the export is handled in the component via onExport prop
        // but if called from checklist sidebar, export checklist
        const md = checklistToMarkdown(checklist.items)
        downloadFile(md, `checklist-${new Date().toISOString().slice(0, 10)}.md`)
      }
    }
  }, [view, mentalHealth, checklist.items])

  const handleDiscuss = useCallback((context: string) => {
    setCmdkOpen(true)
    setTimeout(() => send(context), 150)
  }, [send])

  const handleAgentAction = useCallback((action: AgentAction) => {
    switch (action.type) {
      case 'add_to_checklist':
        checklist.addItem(
          action.params.title || action.label,
          action.params.gene_symbol || 'custom',
          action.params.action_type || 'consider',
          action.params.practical_category || '',
          action.params.health_domain || '',
        )
        break
      case 'show_gene':
        setCmdkOpen(false)
        send(`Tell me about ${action.params.gene_symbol}`)
        setCmdkOpen(true)
        break
      case 'show_variant':
        setCmdkOpen(false)
        updateFilters({ search: action.params.rsid })
        break
      case 'open_link':
        window.open(action.params.url, '_blank', 'noopener')
        break
    }
  }, [checklist, send, updateFilters])

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
        <div className="nav-buttons" style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
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
              background: view === 'addiction' ? 'var(--bg-inset)' : 'transparent',
              borderColor: view === 'addiction' ? 'var(--primary)' : 'var(--border)',
              color: view === 'addiction' ? 'var(--primary)' : 'var(--text-secondary)',
            }}
            onClick={() => navigate('addiction')}
          >
            ADDICTION
          </button>
          <button
            className="btn"
            style={{
              fontSize: 'var(--font-size-xs)',
              background: view === 'risk' ? 'var(--bg-inset)' : 'transparent',
              borderColor: view === 'risk' ? 'var(--primary)' : 'var(--border)',
              color: view === 'risk' ? 'var(--primary)' : 'var(--text-secondary)',
            }}
            onClick={() => navigate('risk')}
          >
            RISK
          </button>
          <button
            className="btn"
            style={{
              fontSize: 'var(--font-size-xs)',
              position: 'relative',
              borderColor: checklistHighlight ? 'var(--accent)' : checklistOpen ? 'var(--primary)' : 'var(--border)',
              color: checklistHighlight ? 'var(--accent)' : checklistOpen ? 'var(--primary)' : undefined,
              boxShadow: checklistHighlight ? '0 0 8px var(--accent), 0 0 16px rgba(var(--accent-rgb, 255,165,0), 0.3)' : 'none',
              transition: 'box-shadow 0.3s ease, border-color 0.3s ease, color 0.3s ease',
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
              onAskAboutSelected={(snps) => {
                const genes = [...new Set(snps.map(s => s.gene_symbol).filter(Boolean))].join(', ')
                const rsids = snps.map(s => s.rsid).join(', ')
                const query = `Tell me about these variants together and how they interact: ${rsids}${genes ? ` (genes: ${genes})` : ''}. What does this combination mean for my health?`
                setCmdkInitialQuery(query)
                setCmdkOpen(true)
              }}
            />
          </main>
        </>
      ) : view === 'pgx' ? (
        <main>
          <PGxPanel
            onExport={handleExport}
            onAddToChecklist={(title, gene) => {
              checklist.addItem(title, gene || 'custom', 'consider')
              setChecklistHighlight(true)
              setTimeout(() => setChecklistHighlight(false), 1500)
            }}
          />
        </main>
      ) : view === 'addiction' ? (
        <main>
          <AddictionProfile
            onExport={handleExport}
            onAddToChecklist={(title, gene) => {
              checklist.addItem(title, gene || 'custom', 'consider')
              setChecklistHighlight(true)
              setTimeout(() => setChecklistHighlight(false), 1500)
            }}
            onToggleAction={checklist.toggleDone}
            checklistIds={new Set(checklist.items.map(i => i.id))}
            onAddActionToChecklist={(action) => {
              checklist.addItem(
                action.title,
                action.geneSymbol,
                action.type,
                action.id,
              )
              setChecklistHighlight(true)
              setTimeout(() => setChecklistHighlight(false), 1500)
            }}
          />
        </main>
      ) : view === 'risk' ? (
        <main>
          <RiskLandscape onExport={handleExport} onAddToChecklist={(title, cause) => {
            checklist.addItem(title, 'custom', 'consider', '', cause)
            setChecklistHighlight(true)
            setTimeout(() => setChecklistHighlight(false), 1500)
          }} />
        </main>
      ) : (
        <main>
          <MentalHealthDashboard
            data={mentalHealth.sections}
            totalGenes={mentalHealth.totalGenes}
            totalActions={mentalHealth.totalActions}
            onExport={handleExport}
            onGeneClick={(gene) => console.log('gene click', gene.symbol)}
            actions={mentalHealth.actions}
            onToggleAction={checklist.toggleDone}
            onDiscuss={handleDiscuss}
            checklistIds={new Set(checklist.items.map(i => i.id))}
            onAddToChecklist={(action) => {
              checklist.addItem(
                action.title,
                action.geneSymbol,
                action.type,
                action.tags[0] || '',
                'mental_health'
              )
              setChecklistHighlight(true)
              setTimeout(() => setChecklistHighlight(false), 1500)
            }}
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
        onAddToChecklist={(title, gene) => checklist.addItem(title, gene, 'consider')}
      />

      {/* Command Palette */}
      <CommandPalette
        open={cmdkOpen}
        onClose={() => { setCmdkOpen(false); setCmdkInitialQuery(undefined) }}
        initialQuery={cmdkInitialQuery}
        messages={messages}
        streaming={streaming}
        streamingText={streamingText}
        status={status}
        suggestions={suggestions}
        actions={actions}
        onSend={send}
        onAction={handleAgentAction}
        voiceSupported={voice.supported}
        voiceListening={voice.listening}
        onStartListening={() => {
          voice.startListening((text) => {
            send(text)
          })
        }}
        onStopListening={voice.stopListening}
        starterPrompts={starterPrompts.prompts}
        starterCapabilities={starterPrompts.capabilities}
        starterExplore={starterPrompts.explore}
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
            onExport={handleExport}
            onResearchPrompt={() => console.log('research prompt')}
          />
        </>
      )}
    </div>
  )
}

export default App
