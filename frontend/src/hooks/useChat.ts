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

export function useChat(onUIAction?: (action: UIAction) => void) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/sessions', { method: 'POST' })
      .then(r => r.json())
      .then(s => setSessionId(s.id))
      .catch(() => {})
  }, [])

  const send = useCallback(async (text: string) => {
    if (!sessionId || streaming) return

    setMessages(prev => [...prev, { role: 'user', content: text }])
    setStreaming(true)
    setStreamingText('')

    const abort = new AbortController()
    abortRef.current = abort

    let accumulated = ''
    try {
      for await (const event of streamChat(sessionId, text, abort.signal)) {
        if (event.event === 'text_delta') {
          accumulated += event.data.content as string
          setStreamingText(accumulated)
        } else if (event.event === 'ui_action' && onUIAction) {
          onUIAction(event.data as unknown as UIAction)
        } else if (event.event === 'done') {
          break
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        accumulated += '\n\n[Connection error]'
      }
    }

    if (accumulated) {
      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
    }
    setStreamingText('')
    setStreaming(false)
  }, [sessionId, streaming, onUIAction])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { messages, streaming, streamingText, send, cancel, sessionId }
}
