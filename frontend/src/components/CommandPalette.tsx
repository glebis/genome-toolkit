import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../hooks/useChat'

interface Props {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  streaming: boolean
  streamingText: string
  onSend: (text: string) => void
}

export function CommandPalette({ open, onClose, messages, streaming, streamingText, onSend }: Props) {
  const [input, setInput] = useState('')
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
        }}>
          <span className="label label--accent">GENOME_AI // COMMAND_INTERFACE</span>
          <span className="label">ESC // CLOSE</span>
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
              <div key={i} style={{ marginBottom: 'var(--space-md)' }}>
                <span className="label" style={{ color: msg.role === 'user' ? 'var(--accent)' : 'var(--primary)' }}>
                  {msg.role === 'user' ? 'INPUT //' : 'OUTPUT //'}
                </span>
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
            <span className="label" style={{ animation: 'blink 1s infinite', color: 'var(--primary)' }}>
              PROCESSING
            </span>
          )}
        </form>
      </div>
    </div>
  )
}
