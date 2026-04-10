export interface SSEEvent {
  event: string
  data: Record<string, unknown>
}

export async function* streamChat(
  sessionId: string,
  message: string,
  signal?: AbortSignal,
  pageContext?: string,
): AsyncGenerator<SSEEvent> {
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      ...(pageContext ? { page_context: pageContext } : {}),
    }),
    signal,
  })

  if (!resp.ok) throw new Error(`Chat failed: ${resp.status}`)
  if (!resp.body) throw new Error('No response body')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      // Skip SSE comments (ping lines like ": ping - ...")
      if (line.startsWith(':') || line.trim() === '') {
        continue
      }

      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6))
          yield { event: currentEvent, data }
        } catch {
          // skip malformed JSON
        }
        currentEvent = ''
      }
    }
  }
}
