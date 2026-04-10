import { useState, useEffect, useRef, useCallback, type ReactNode, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, AgentAction } from '../hooks/useChat'
import type { StarterPrompt } from '../hooks/useStarterPrompts'

/* ── Vault link / gene name helpers ── */

const GENE_NAME_RE = /^[A-Z][A-Z0-9]{1,9}$/
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

/** Convert `[[NoteName]]` or `[[Path/Note]]` wikilinks to markdown links with vault: scheme */
function preprocessWikilinks(content: string): string {
  return content.replace(WIKILINK_RE, (_match, inner: string) => {
    const display = inner.includes('/') ? inner.split('/').pop()! : inner
    return `[${display}](vault:${inner})`
  })
}

const vaultLinkStyle: React.CSSProperties = {
  color: 'var(--primary)',
  cursor: 'pointer',
  textDecoration: 'none',
  borderBottom: '1px dashed var(--primary-dim)',
}

const geneLinkStyle: React.CSSProperties = {
  ...vaultLinkStyle,
  fontFamily: 'var(--font-mono)',
}

function makeMarkdownComponents(onSend: (text: string) => void) {
  const components: Record<string, React.ComponentType<ComponentPropsWithoutRef<any>>> = {
    a({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
      if (typeof href === 'string' && href.startsWith('vault:')) {
        const noteName = href.slice('vault:'.length)
        return (
          <span
            style={vaultLinkStyle}
            role="link"
            tabIndex={0}
            onClick={() => onSend(`Read the vault note for ${noteName}`)}
            onKeyDown={e => { if (e.key === 'Enter') onSend(`Read the vault note for ${noteName}`) }}
            {...rest}
          >
            {children}
          </span>
        )
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
    },
    code({ children, className, ...rest }: ComponentPropsWithoutRef<'code'>) {
      // Only transform inline code (no className means no language-* fenced block)
      const text = typeof children === 'string' ? children : ''
      if (!className && GENE_NAME_RE.test(text)) {
        return (
          <code
            style={geneLinkStyle}
            role="link"
            tabIndex={0}
            onClick={() => onSend(`Tell me about ${text}`)}
            onKeyDown={e => { if (e.key === 'Enter') onSend(`Tell me about ${text}`) }}
            {...rest}
          >
            {children}
          </code>
        )
      }
      return <code className={className} {...rest}>{children}</code>
    },
  }
  return components
}

/**
 * Regex to detect insight blocks in AI messages.
 * Pattern:
 *   ★ Insight ───...
 *   <content>
 *   ───...
 */
const INSIGHT_BLOCK_RE = /★\s*Insight\s*─+\n([\s\S]*?)\n─{5,}/g

interface ContentSegment {
  type: 'markdown' | 'insight'
  text: string
}

function parseInsightBlocks(content: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  let lastIndex = 0

  for (const match of content.matchAll(INSIGHT_BLOCK_RE)) {
    const matchStart = match.index!
    if (matchStart > lastIndex) {
      segments.push({ type: 'markdown', text: content.slice(lastIndex, matchStart) })
    }
    segments.push({ type: 'insight', text: match[1].trim() })
    lastIndex = matchStart + match[0].length
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'markdown', text: content.slice(lastIndex) })
  }

  return segments
}

function InsightBlock({ text, onSend }: { text: string; onSend: (text: string) => void }) {
  const components = makeMarkdownComponents(onSend)
  return (
    <div style={{
      borderLeft: '3px solid var(--primary)',
      background: 'var(--bg-inset)',
      padding: 'var(--space-md) var(--space-lg)',
      margin: 'var(--space-md) 0',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 600,
        letterSpacing: 'var(--tracking-wide)',
        color: 'var(--primary)',
        marginBottom: 'var(--space-sm)',
        textTransform: 'uppercase',
      }}>
        ★ INSIGHT
      </div>
      <div style={{
        fontSize: 'var(--font-size-md)',
        lineHeight: 1.7,
        color: 'var(--text)',
      }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{preprocessWikilinks(text)}</ReactMarkdown>
      </div>
    </div>
  )
}

function renderAssistantContent(content: string, onSend: (text: string) => void): ReactNode {
  const components = makeMarkdownComponents(onSend)
  const processed = preprocessWikilinks(content)
  const segments = parseInsightBlocks(processed)
  if (segments.length === 1 && segments[0].type === 'markdown') {
    return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{processed}</ReactMarkdown>
  }
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'insight'
          ? <InsightBlock key={i} text={seg.text} onSend={onSend} />
          : <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={components}>{seg.text}</ReactMarkdown>
      )}
    </>
  )
}

const ACTION_ICONS: Record<string, string> = {
  add_to_checklist: '+',
  show_gene: 'G',
  show_variant: 'V',
  open_link: '->',
}

interface Props {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  streaming: boolean
  streamingText: string
  status: string
  suggestions: string[]
  actions: AgentAction[]
  onSend: (text: string) => void
  onAction: (action: AgentAction) => void
  initialQuery?: string
  voiceSupported?: boolean
  voiceListening?: boolean
  onStartListening?: () => void
  onStopListening?: () => void
  starterPrompts?: StarterPrompt[]
  starterCapabilities?: string[]
  starterExplore?: string[]
}

function messagesToMarkdown(messages: ChatMessage[]): string {
  return messages.map(m => {
    const prefix = m.role === 'user' ? '**You:**' : '**AI:**'
    return `${prefix}\n\n${m.content}`
  }).join('\n\n---\n\n')
}

function singleMessageMarkdown(msg: ChatMessage): string {
  return msg.content
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

function downloadMarkdown(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function CommandPalette({ open, onClose, messages, streaming, streamingText, status, suggestions, actions, onSend, onAction, initialQuery, voiceSupported, voiceListening, onStartListening, onStopListening, starterPrompts, starterCapabilities, starterExplore }: Props) {
  const [input, setInput] = useState('')
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      if (initialQuery) setInput(initialQuery)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, initialQuery])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, streamingText])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleCopyMessage = useCallback((idx: number) => {
    copyToClipboard(singleMessageMarkdown(messages[idx]))
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1500)
  }, [messages])

  const handleCopyAll = useCallback(() => {
    copyToClipboard(messagesToMarkdown(messages))
    setCopiedIdx(-1)
    setTimeout(() => setCopiedIdx(null), 1500)
  }, [messages])

  const handleDownloadAll = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10)
    downloadMarkdown(messagesToMarkdown(messages), `genome-chat-${date}.md`)
  }, [messages])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || streaming) return
    onSend(input.trim())
    setInput('')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(58, 58, 56, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="command-palette-inner" style={{
        width: '100%',
        maxWidth: 860,
        background: 'var(--bg-raised)',
        border: '1px solid var(--primary)',
        height: '85vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: 'var(--space-sm) var(--space-md)',
          borderBottom: '1px dashed var(--border-dashed)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span className="label label--accent">GENOME_AI // COMMAND_INTERFACE</span>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
            {messages.length > 0 && (
              <>
                <button
                  className="btn"
                  style={{ fontSize: '9px', padding: '2px 6px' }}
                  onClick={handleCopyAll}
                >
                  {copiedIdx === -1 ? 'COPIED' : 'COPY_ALL'}
                </button>
                <button
                  className="btn"
                  style={{ fontSize: '9px', padding: '2px 6px' }}
                  onClick={handleDownloadAll}
                >
                  DOWNLOAD_MD
                </button>
              </>
            )}
            <button
              className="btn"
              style={{ fontSize: '9px', padding: '2px 6px' }}
              onClick={onClose}
            >
              ESC // CLOSE
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: 'var(--space-lg) var(--space-xl)',
          }}
        >
          {messages.length === 0 && !streaming && (
            <div style={{ padding: 'var(--space-xl)', height: '100%', overflowY: 'auto' }}>
              {starterCapabilities && starterCapabilities.length > 0 && (
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <div className="label" style={{ color: 'var(--primary)', marginBottom: 'var(--space-sm)' }}>
                    WHAT I CAN DO
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                    {starterCapabilities.map((cap, i) => (
                      <span key={i} style={{
                        fontSize: 'var(--font-size-xs)',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        padding: '4px 10px',
                      }}>
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {starterPrompts && starterPrompts.length > 0 && (
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <div className="label" style={{ color: 'var(--accent)', marginBottom: 'var(--space-sm)' }}>
                    SUGGESTED FOR YOU
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {starterPrompts.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => onSend(p.text)}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
                        onMouseLeave={e => {
                          if (i !== 0) e.currentTarget.style.borderColor = 'var(--border)'
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'var(--font-mono)',
                          border: i === 0 ? '1px solid var(--primary)' : '1px solid var(--border)',
                          background: i === 0 ? 'rgba(91, 126, 161, 0.04)' : 'transparent',
                        }}
                      >
                        <p style={{
                          fontWeight: 600,
                          fontSize: 'var(--font-size-md)',
                          color: 'var(--text)',
                          margin: 0,
                        }}>
                          {p.text}
                        </p>
                        <p style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--text-tertiary)',
                          margin: '2px 0 0',
                        }}>
                          {p.subtitle}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {starterExplore && starterExplore.length > 0 && (
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <div className="label" style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-sm)' }}>
                    EXPLORE
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                    {starterExplore.map((text, i) => (
                      <button
                        key={i}
                        onClick={() => onSend(text)}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-dim)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                        style={{
                          border: '1px dashed var(--border)',
                          borderRadius: 3,
                          fontSize: 'var(--font-size-sm)',
                          padding: '6px 12px',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          background: 'transparent',
                        }}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(!starterPrompts || starterPrompts.length === 0) && (!starterCapabilities || starterCapabilities.length === 0) && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--font-size-lg)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  Ask about your genome...
                </div>
              )}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 'var(--space-xl)', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                <span className="label" style={{ color: msg.role === 'user' ? 'var(--accent)' : 'var(--primary)' }}>
                  {msg.role === 'user' ? 'INPUT //' : 'OUTPUT //'}
                </span>
                {msg.role === 'assistant' && (
                  <button
                    className="btn"
                    style={{
                      fontSize: '9px',
                      padding: '2px 6px',
                      opacity: 0.4,
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.4' }}
                    onClick={() => handleCopyMessage(i)}
                  >
                    {copiedIdx === i ? 'COPIED' : 'COPY'}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 'var(--font-size-md)', lineHeight: 1.7 }}
                   className={msg.role === 'assistant' ? 'chat-markdown chat-markdown--lg' : undefined}>
                {msg.role === 'assistant'
                  ? renderAssistantContent(msg.content, onSend)
                  : <span style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text)' }}>
                      {msg.content.startsWith('[VOICE] ') ? msg.content.slice(8) : msg.content}
                    </span>}
              </div>
            </div>
          ))}
          {streaming && streamingText && (
            <div style={{ marginBottom: 'var(--space-xl)' }}>
              <span className="label label--primary" style={{ marginBottom: 'var(--space-sm)', display: 'inline-block' }}>OUTPUT //</span>
              <div style={{ fontSize: 'var(--font-size-md)', lineHeight: 1.7 }}
                   className="chat-markdown chat-markdown--lg">
                {renderAssistantContent(streamingText, onSend)}
                <span style={{ animation: 'blink 0.7s step-end infinite', color: 'var(--primary)', fontSize: '1.1em' }}>█</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions + Suggested responses */}
        {(actions.length > 0 || suggestions.length > 0) && !streaming && (
          <div style={{
            padding: 'var(--space-md) var(--space-xl)',
            borderTop: '1px dashed var(--border-dashed)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
          }}>
            {actions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                {actions.map((a, i) => (
                  <button
                    key={i}
                    className="btn"
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      padding: '6px 14px',
                      color: 'var(--bg-raised)',
                      background: 'var(--primary)',
                      borderColor: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    onClick={() => onAction(a)}
                  >
                    <span style={{
                      fontWeight: 700,
                      fontSize: '10px',
                      opacity: 0.7,
                      fontFamily: 'var(--font-mono)',
                    }}>{ACTION_ICONS[a.type] || '>'}</span>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    className="btn"
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      padding: '6px 14px',
                      color: 'var(--primary)',
                      borderColor: 'var(--primary-dim)',
                    }}
                    onClick={() => onSend(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--space-md) var(--space-xl)',
          gap: 'var(--space-sm)',
          borderTop: '1px dashed var(--border-dashed)',
          background: 'var(--bg)',
        }}>
          <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 'var(--font-size-xl)' }}>&gt;</span>
          <input
            ref={inputRef}
            className="input"
            style={{ border: 'none', background: 'transparent', flex: 1, fontSize: 'var(--font-size-lg)' }}
            placeholder={messages.length === 0 ? 'ASK_ABOUT_YOUR_GENOME...' : 'FOLLOW_UP...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={streaming}
          />
          {voiceSupported && !streaming && (
            <button
              type="button"
              title={voiceListening ? 'Stop dictation' : 'Dictate'}
              onClick={() => {
                if (voiceListening) {
                  onStopListening?.()
                } else {
                  onStartListening?.()
                }
              }}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: `1.5px solid ${voiceListening ? 'var(--sig-risk)' : 'var(--border)'}`,
                background: voiceListening ? 'rgba(196, 82, 78, 0.08)' : 'transparent',
                color: voiceListening ? 'var(--sig-risk)' : 'var(--text-tertiary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            </button>
          )}
          {streaming && (
            <span className="label" style={{ color: 'var(--primary)', whiteSpace: 'nowrap' }}>
              <span style={{ animation: 'blink 1s infinite' }}>{'// '}</span>
              {status || 'PROCESSING'}
            </span>
          )}
        </form>
      </div>
    </div>
  )
}
