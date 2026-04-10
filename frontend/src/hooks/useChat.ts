import { useState, useCallback, useRef, useEffect } from 'react'
import { streamChat } from '../lib/sse'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface UIAction {
  action: string
  params: Record<string, string>
}

export interface AgentAction {
  type: 'add_to_checklist' | 'show_gene' | 'show_variant' | 'open_link'
  label: string
  params: Record<string, string>
}

export function useChat(onUIAction?: (action: UIAction) => void) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [status, setStatus] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [actions, setActions] = useState<AgentAction[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('genome_session_id')
    if (stored) {
      fetch(`/api/sessions/${stored}`)
        .then(r => {
          if (r.ok) return r.json()
          throw new Error('session expired')
        })
        .then(s => {
          setSessionId(s.id)
          if (s.messages && s.messages.length > 0) {
            setMessages(s.messages.map((m: any) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })))
          }
        })
        .catch(() => {
          fetch('/api/sessions', { method: 'POST' })
            .then(r => r.json())
            .then(s => {
              setSessionId(s.id)
              localStorage.setItem('genome_session_id', s.id)
            })
        })
    } else {
      fetch('/api/sessions', { method: 'POST' })
        .then(r => r.json())
        .then(s => {
          setSessionId(s.id)
          localStorage.setItem('genome_session_id', s.id)
        })
        .catch(() => {})
    }
  }, [])

  const send = useCallback(async (text: string, pageContext?: string) => {
    if (!sessionId || streaming) return

    setMessages(prev => [...prev, { role: 'user', content: text }])
    setStreaming(true)
    setStreamingText('')
    setStatus('CONNECTING')
    setSuggestions([])
    setActions([])

    const abort = new AbortController()
    abortRef.current = abort

    let accumulated = ''
    try {
      for await (const event of streamChat(sessionId, text, abort.signal, pageContext)) {
        if (event.event === 'text_delta') {
          accumulated += event.data.content as string
          setStreamingText(accumulated)
          setStatus('STREAMING')
        } else if (event.event === 'tool_call') {
          const toolName = (event.data.tool as string || '').split('__').pop() || 'tool'
          setStatus(toolName.toUpperCase())
        } else if (event.event === 'session_init') {
          setStatus('THINKING')
        } else if (event.event === 'ui_action') {
          const action = event.data as unknown as UIAction
          if (action.action === 'suggest_responses') {
            const s = (action.params as unknown as { suggestions: string[] }).suggestions
            if (Array.isArray(s)) setSuggestions(s)
          } else if (action.action === 'suggest_actions') {
            const a = (action.params as unknown as { actions: AgentAction[] }).actions
            if (Array.isArray(a)) setActions(a)
          } else if (onUIAction) {
            onUIAction(action)
          }
          setStatus('UPDATING_VIEW')
        } else if (event.event === 'result') {
          setStatus('DONE')
        } else if (event.event === 'done') {
          break
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        accumulated += '\n\n[Connection error]'
        setStatus('ERROR')
      }
    }

    if (accumulated) {
      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
    }
    setStreamingText('')
    setStreaming(false)
    setStatus('')
  }, [sessionId, streaming, onUIAction])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { messages, streaming, streamingText, status, suggestions, actions, send, cancel, sessionId }
}
