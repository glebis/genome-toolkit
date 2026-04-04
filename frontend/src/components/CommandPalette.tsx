import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../hooks/useChat'

interface Props {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  streaming: boolean
  streamingText: string
  status: string
  suggestions: string[]
  onSend: (text: string) => void
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

export function CommandPalette({ open, onClose, messages, streaming, streamingText, status, suggestions, onSend }: Props) {
  const [input, setInput] = useState('')
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

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
        background: 'rgba(58, 58, 56, 0.3)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%',
        maxWidth: 640,
        background: 'var(--bg-raised)',
        border: '1px solid var(--primary)',
        maxHeight: '65vh',
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
        {messages.length > 0 && (
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-md)',
              maxHeight: '45vh',
            }}
          >
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 'var(--space-md)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="label" style={{ color: msg.role === 'user' ? 'var(--accent)' : 'var(--primary)' }}>
                    {msg.role === 'user' ? 'INPUT //' : 'OUTPUT //'}
                  </span>
                  {msg.role === 'assistant' && (
                    <button
                      className="btn"
                      style={{
                        fontSize: '8px',
                        padding: '1px 5px',
                        opacity: 0.5,
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.5' }}
                      onClick={() => handleCopyMessage(i)}
                    >
                      {copiedIdx === i ? 'COPIED' : 'COPY'}
                    </button>
                  )}
                </div>
                <div style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}
                     className={msg.role === 'assistant' ? 'chat-markdown' : undefined}>
                  {msg.role === 'assistant'
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    : msg.content}
                </div>
              </div>
            ))}
            {streaming && streamingText && (
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <span className="label label--primary">OUTPUT //</span>
                <div style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}
                     className="chat-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                  <span style={{ animation: 'blink 1s infinite', color: 'var(--primary)' }}>_</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Suggested responses */}
        {suggestions.length > 0 && !streaming && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-xs)',
            padding: 'var(--space-sm) var(--space-md)',
            borderTop: '1px dashed var(--border-dashed)',
          }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="btn"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  padding: '4px 10px',
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

        {/* Input */}
        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--space-sm) var(--space-md)',
          gap: 'var(--space-sm)',
          borderTop: messages.length > 0 ? '1px dashed var(--border-dashed)' : 'none',
        }}>
          <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 'var(--font-size-lg)' }}>&gt;</span>
          <input
            ref={inputRef}
            className="input"
            style={{ border: 'none', background: 'transparent', flex: 1, fontSize: 'var(--font-size-md)' }}
            placeholder={messages.length === 0 ? 'ASK_ABOUT_YOUR_GENOME...' : 'FOLLOW_UP...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={streaming}
          />
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
