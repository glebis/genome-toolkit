import { useState } from 'react'
import type { GroupBy, FilterStatus, ChecklistItem } from '../../hooks/useChecklist'

// Evidence type colors
const TYPE_COLORS: Record<string, string> = {
  consider: 'var(--sig-risk)',
  monitor: 'var(--sig-reduced)',
  discuss: 'var(--primary)',
  try: 'var(--sig-benefit)',
}

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'evidence', label: 'Evidence' },
  { key: 'practical', label: 'What To Do' },
  { key: 'gene', label: 'Gene' },
  { key: 'domain', label: 'Domain' },
  { key: 'status', label: 'Status' },
]

const FILTER_OPTIONS: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'done', label: 'Done' },
]

interface ChecklistSidebarProps {
  grouped: Record<string, ChecklistItem[]>
  groupBy: GroupBy
  filterStatus: FilterStatus
  pendingCount: number
  doneCount: number
  totalCount: number
  uniqueGenes: string[]
  onSetGroupBy: (g: GroupBy) => void
  onSetFilterStatus: (f: FilterStatus) => void
  onToggleDone: (id: string) => void
  onDelete: (id: string) => void
  onAdd: (title: string) => void
  onClose: () => void
  onExport: (format: string) => void
  onResearchPrompt: () => void
}

export function ChecklistSidebar({
  grouped, groupBy, filterStatus, pendingCount: _pendingCount, doneCount, totalCount,
  uniqueGenes, onSetGroupBy, onSetFilterStatus,
  onToggleDone, onDelete, onAdd, onClose, onExport, onResearchPrompt,
}: ChecklistSidebarProps) {
  const [addText, setAddText] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)

  const handleAdd = () => {
    if (addText.trim()) {
      onAdd(addText.trim())
      setAddText('')
    }
  }

  const chipStyle = (active: boolean) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: active ? 600 : 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    padding: '5px 10px',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--text-secondary)',
    cursor: 'pointer',
  })

  const filterStyle = (active: boolean) => ({
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: active ? 600 : 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    padding: '3px 8px',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    background: 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
  })

  return (
    <div className="sidebar-drawer" style={{
      width: 'min(420px, calc(100vw - 24px))',
      background: 'var(--bg-raised)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.06)',
      height: '100vh',
      position: 'fixed',
      right: 0,
      top: 0,
      zIndex: 100,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, letterSpacing: '0.08em' }}>Action Checklist</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{totalCount} items / {doneCount} done</span>
          <button onClick={onClose} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', cursor: 'pointer', border: '1px solid var(--border)', background: 'none', padding: '4px 10px', borderRadius: 4 }}>
            ESC
          </button>
        </div>
      </div>

      {/* Group-by switcher */}
      <div style={{ display: 'flex', padding: '10px 20px', borderBottom: '1px dashed var(--border-dashed)' }}>
        {GROUP_OPTIONS.map((opt, i) => (
          <button
            key={opt.key}
            onClick={() => onSetGroupBy(opt.key)}
            style={{
              ...chipStyle(groupBy === opt.key),
              borderRadius: i === 0 ? '4px 0 0 4px' : i === GROUP_OPTIONS.length - 1 ? '0 4px 4px 0' : 0,
              borderLeft: i > 0 ? 'none' : undefined,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 20px', borderBottom: '1px dashed var(--border-dashed)' }}>
        {FILTER_OPTIONS.map(opt => (
          <button key={opt.key} onClick={() => onSetFilterStatus(opt.key)} style={filterStyle(filterStatus === opt.key)}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 16px' }}>
        {Object.keys(grouped).length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>
            No items yet. Add actions from gene cards or type below.
          </div>
        ) : (
          Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group}>
              <div style={{
                fontSize: 'var(--font-size-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
                margin: '14px 0 6px', paddingBottom: 4, borderBottom: '1px dashed var(--border-dashed)',
                display: 'flex', justifyContent: 'space-between',
                color: groupBy === 'gene' ? 'var(--primary)' : (TYPE_COLORS[group] || 'var(--text-secondary)'),
              }}>
                <span>{group}</span>
                <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)',}}>{groupItems.length}</span>
              </div>
              {groupItems.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '8px 10px', borderRadius: '0 5px 5px 0', marginBottom: 4,
                    background: 'var(--bg)', cursor: 'pointer', position: 'relative',
                    borderLeft: `3px solid ${TYPE_COLORS[item.action_type] || 'var(--border-strong)'}`,
                    opacity: item.done ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    const del = e.currentTarget.querySelector('[data-delete]') as HTMLElement
                    if (del && deletingId !== item.id) del.style.opacity = '1'
                  }}
                  onMouseLeave={(e) => {
                    const del = e.currentTarget.querySelector('[data-delete]') as HTMLElement
                    if (del) del.style.opacity = '0'
                    if (deletingId === item.id) setDeletingId(null)
                  }}
                >
                  {/* Checkbox */}
                  <div
                    onClick={() => onToggleDone(item.id)}
                    style={{
                      width: 14, height: 14, border: `1.5px solid ${item.done ? 'var(--sig-benefit)' : 'var(--border-strong)'}`,
                      borderRadius: 3, flexShrink: 0, marginTop: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 'var(--font-size-xs)', background: item.done ? 'var(--sig-benefit)' : 'transparent',
                      color: 'var(--bg-raised)',
                    }}
                  >
                    {item.done ? '\u2713' : ''}
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 'var(--font-size-xs)', fontWeight: 500, lineHeight: 1.4,
                      textDecoration: item.done ? 'line-through' : 'none',
                      color: item.done ? 'var(--text-secondary)' : 'var(--text)',
                    }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {item.gene_symbol !== 'custom' && <span style={{ color: 'var(--primary)' }}>{item.gene_symbol}</span>}
                      {item.practical_category && (
                        <span style={{ padding: '1px 4px', borderRadius: 2, fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          {item.practical_category}
                        </span>
                      )}
                      {item.done && item.done_at && <span>done {new Date(item.done_at).toLocaleDateString()}</span>}
                    </div>
                  </div>

                  {/* Delete button / confirmation */}
                  {deletingId === item.id ? (
                    <div style={{
                      position: 'absolute', right: 6, top: 6, fontSize: 'var(--font-size-xs)', color: 'var(--accent)',
                      display: 'flex', gap: 6, alignItems: 'center',
                      background: 'var(--bg-raised)', padding: '2px 6px', borderRadius: 3,
                      border: '1px solid var(--accent)',
                    }}>
                      Delete?
                      <span onClick={() => { onDelete(item.id); setDeletingId(null) }} style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)' }}>yes</span>
                      <span onClick={() => setDeletingId(null)} style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }}>no</span>
                    </div>
                  ) : (
                    <span
                      data-delete=""
                      onClick={() => setDeletingId(item.id)}
                      style={{
                        position: 'absolute', right: 6, top: 6, opacity: 0,
                        fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', cursor: 'pointer',
                        border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px',
                        transition: 'opacity 0.1s',
                      }}
                    >
                      x
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Add custom item */}
      <div style={{ padding: '8px 20px', borderTop: '1px dashed var(--border-dashed)' }}>
        <input
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="+ Add action item..."
          style={{
            width: '100%', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)',
            padding: '7px 10px', border: '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', borderRadius: 4, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Collapsible Actions */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <div
          onClick={() => setActionsOpen(prev => !prev)}
          style={{ padding: '10px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
        >
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', display: 'inline-block', transform: actionsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
            {'\u25B6'}
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Actions</span>
        </div>
        {actionsOpen && (
          <div style={{ padding: '0 20px 14px' }}>
            {[
              { label: 'Print for doctor', hint: 'Discuss items + gene context', color: 'var(--accent)', action: () => onExport('doctor') },
              { label: 'Print for prescriber', hint: 'PGx metabolizer status', color: 'var(--accent)', action: () => onExport('prescriber') },
              { label: 'Generate research prompt', hint: uniqueGenes.join(', ') || 'No genes', color: 'var(--primary)', action: onResearchPrompt },
            ].map((actionItem, i) => (
              <div
                key={i}
                onClick={actionItem.action}
                style={{
                  padding: '8px 0', borderBottom: '1px dashed var(--border-dashed)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 'var(--font-size-xs)', color: actionItem.color }}>{actionItem.label}</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{actionItem.hint}</span>
              </div>
            ))}
            <div style={{ padding: '8px 0', display: 'flex', gap: 16 }}>
              <span onClick={() => onExport('pdf')} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}>Export PDF</span>
              <span onClick={() => onExport('md')} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}>Export Markdown</span>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
