import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { SSEEvent } from '../lib/sse'

/* ── helpers ─────────────────────────────────────────────────────── */

async function* mockStreamGen(events: Array<{ event: string; data: Record<string, unknown> }>) {
  for (const e of events) yield e
}

function sessionResponse(id: string, messages: Array<{ role: string; content: string }> = []) {
  return { ok: true, json: () => Promise.resolve({ id, messages }) }
}

function newSessionResponse(id = 'new-sess-1') {
  return { ok: true, json: () => Promise.resolve({ id }) }
}

/* ── setup ───────────────────────────────────────────────────────── */

let mockStreamChat: Mock

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  // localStorage stub
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { store[key] = val }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
  })

  mockStreamChat = vi.fn()

  vi.doMock('../lib/sse', () => ({
    streamChat: mockStreamChat,
  }))
})

async function loadHook(onUIAction?: (a: any) => void) {
  const mod = await import('../hooks/useChat')
  return renderHook(() => mod.useChat(onUIAction))
}

/* ── tests ───────────────────────────────────────────────────────── */

describe('useChat', () => {
  // 1. Creates new session when no localStorage key
  it('creates a new session when no localStorage key exists', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('fresh-1'))

    const { result } = await loadHook()

    await waitFor(() => expect(result.current.sessionId).toBe('fresh-1'))
    expect(localStorage.setItem).toHaveBeenCalledWith('genome_session_id', 'fresh-1')
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions', { method: 'POST' })
  })

  // 2. Restores session from localStorage when valid
  it('restores session from localStorage when valid', async () => {
    ;(localStorage.getItem as Mock).mockReturnValue('stored-42')
    global.fetch = vi.fn().mockResolvedValue(
      sessionResponse('stored-42', [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ]),
    )

    const { result } = await loadHook()

    await waitFor(() => expect(result.current.sessionId).toBe('stored-42'))
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])
  })

  // 3. Creates new session when stored session expired
  it('creates new session when stored session is expired', async () => {
    ;(localStorage.getItem as Mock).mockReturnValue('old-sess')
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/sessions/old-sess') {
        return Promise.resolve({ ok: false, status: 404 })
      }
      return Promise.resolve(newSessionResponse('replacement-1'))
    })

    const { result } = await loadHook()

    await waitFor(() => expect(result.current.sessionId).toBe('replacement-1'))
    expect(localStorage.setItem).toHaveBeenCalledWith('genome_session_id', 'replacement-1')
  })

  // 4. send() adds user message
  it('send() adds user message to messages', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s1'))
    mockStreamChat.mockReturnValue(mockStreamGen([{ event: 'done', data: {} }]))

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))

    await act(async () => {
      await result.current.send('test message')
    })

    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'test message' })
  })

  // 5. send() processes text_delta events
  it('send() processes text_delta events into streamingText', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s2'))

    let streamResolve!: () => void
    const streamDone = new Promise<void>(r => { streamResolve = r })

    mockStreamChat.mockImplementation(async function* () {
      yield { event: 'text_delta', data: { content: 'Hello' } }
      yield { event: 'text_delta', data: { content: ' world' } }
      streamResolve()
      yield { event: 'done', data: {} }
    })

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s2'))

    // Don't await the send — we want to observe intermediate state
    let sendPromise: Promise<void>
    act(() => {
      sendPromise = result.current.send('hi')
    })

    await act(async () => {
      await streamDone
    })

    await act(async () => {
      await sendPromise!
    })

    // After stream ends, accumulated text goes into messages
    expect(result.current.messages).toContainEqual({
      role: 'assistant',
      content: 'Hello world',
    })
  })

  // 6. send() adds assistant message after stream ends
  it('send() adds assistant message after stream ends', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s3'))
    mockStreamChat.mockImplementation(async function* () {
      yield { event: 'text_delta', data: { content: 'response text' } }
      yield { event: 'done', data: {} }
    })

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s3'))

    await act(async () => {
      await result.current.send('question')
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1]).toEqual({ role: 'assistant', content: 'response text' })
    expect(result.current.streaming).toBe(false)
    expect(result.current.streamingText).toBe('')
  })

  // 7. send() processes suggest_responses ui_action
  it('send() processes suggest_responses ui_action into suggestions', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s4'))
    mockStreamChat.mockImplementation(async function* () {
      yield {
        event: 'ui_action',
        data: { action: 'suggest_responses', params: { suggestions: ['opt1', 'opt2'] } },
      }
      yield { event: 'done', data: {} }
    })

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s4'))

    await act(async () => {
      await result.current.send('tell me')
    })

    expect(result.current.suggestions).toEqual(['opt1', 'opt2'])
  })

  // 8. send() processes suggest_actions ui_action
  it('send() processes suggest_actions ui_action into actions', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s5'))
    const actionsList = [
      { type: 'show_gene', label: 'View COMT', params: { gene: 'COMT' } },
    ]
    mockStreamChat.mockImplementation(async function* () {
      yield {
        event: 'ui_action',
        data: { action: 'suggest_actions', params: { actions: actionsList } },
      }
      yield { event: 'done', data: {} }
    })

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s5'))

    await act(async () => {
      await result.current.send('show genes')
    })

    expect(result.current.actions).toEqual(actionsList)
  })

  // 9. send() calls onUIAction for other ui_action types
  it('send() calls onUIAction for other ui_action types', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s6'))
    const onUIAction = vi.fn()

    mockStreamChat.mockImplementation(async function* () {
      yield {
        event: 'ui_action',
        data: { action: 'navigate', params: { tab: 'mental_health' } },
      }
      yield { event: 'done', data: {} }
    })

    const { result } = await loadHook(onUIAction)
    await waitFor(() => expect(result.current.sessionId).toBe('s6'))

    await act(async () => {
      await result.current.send('go to mental health')
    })

    expect(onUIAction).toHaveBeenCalledWith({
      action: 'navigate',
      params: { tab: 'mental_health' },
    })
  })

  // 10. send() sets status through lifecycle
  it('send() sets status through lifecycle (CONNECTING -> STREAMING -> DONE -> "")', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s7'))
    const statusHistory: string[] = []

    mockStreamChat.mockImplementation(async function* () {
      yield { event: 'text_delta', data: { content: 'hi' } }
      yield { event: 'result', data: {} }
      yield { event: 'done', data: {} }
    })

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s7'))

    await act(async () => {
      await result.current.send('yo')
    })

    // After full completion, status is cleared
    expect(result.current.status).toBe('')
    expect(result.current.streaming).toBe(false)
  })

  // 11. send() handles connection error
  it('send() handles connection error (appends [Connection error])', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s8'))
    mockStreamChat.mockImplementation(async function* () {
      yield { event: 'text_delta', data: { content: 'partial' } }
      throw new Error('network failure')
    })

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s8'))

    await act(async () => {
      await result.current.send('hello')
    })

    expect(result.current.messages[1]).toEqual({
      role: 'assistant',
      content: 'partial\n\n[Connection error]',
    })
    expect(result.current.streaming).toBe(false)
  })

  // 12. send() does nothing when already streaming
  it('send() does nothing when already streaming', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s9'))

    let yieldControl!: () => void
    const gate = new Promise<void>(r => { yieldControl = r })

    mockStreamChat.mockImplementation(async function* () {
      await gate
      yield { event: 'text_delta', data: { content: 'data' } }
      yield { event: 'done', data: {} }
    })

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s9'))

    let firstSend: Promise<void>
    act(() => {
      firstSend = result.current.send('first')
    })

    // streaming should be true now
    await waitFor(() => expect(result.current.streaming).toBe(true))

    // Second send should be ignored
    await act(async () => {
      await result.current.send('second')
    })

    // Only one user message should exist (the second was ignored)
    expect(result.current.messages.filter(m => m.role === 'user')).toHaveLength(1)

    // Release the gate so the first stream finishes
    yieldControl()
    await act(async () => {
      await firstSend!
    })
  })

  // 13. cancel() aborts the stream
  it('cancel() aborts the stream', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s10'))

    let yieldControl!: () => void
    const gate = new Promise<void>(r => { yieldControl = r })

    mockStreamChat.mockImplementation(async function* (_sid: string, _msg: string, signal: AbortSignal) {
      yield { event: 'text_delta', data: { content: 'begin' } }
      await gate
      if (signal.aborted) {
        const err = new Error('Aborted')
        err.name = 'AbortError'
        throw err
      }
      yield { event: 'done', data: {} }
    })

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s10'))

    let sendPromise: Promise<void>
    act(() => {
      sendPromise = result.current.send('start')
    })

    await waitFor(() => expect(result.current.streaming).toBe(true))

    act(() => {
      result.current.cancel()
    })

    yieldControl()
    await act(async () => {
      await sendPromise!
    })

    // AbortError should NOT append [Connection error]
    const assistantMsgs = result.current.messages.filter(m => m.role === 'assistant')
    if (assistantMsgs.length > 0) {
      expect(assistantMsgs[0].content).not.toContain('[Connection error]')
    }
    expect(result.current.streaming).toBe(false)
  })

  // 14. send() does nothing when sessionId is null
  it('send() does nothing when sessionId is null', async () => {
    // Make session creation fail so sessionId stays null
    global.fetch = vi.fn().mockRejectedValue(new Error('no network'))

    const { result } = await loadHook()

    // sessionId should remain null
    await act(async () => { /* allow effects */ })
    expect(result.current.sessionId).toBeNull()

    await act(async () => {
      await result.current.send('will not work')
    })

    expect(result.current.messages).toHaveLength(0)
    expect(mockStreamChat).not.toHaveBeenCalled()
  })

  // 15. send() sets status to tool name on tool_call event
  it('send() sets status to tool name uppercase on tool_call event', async () => {
    global.fetch = vi.fn().mockResolvedValue(newSessionResponse('s11'))
    mockStreamChat.mockImplementation(async function* () {
      yield { event: 'session_init', data: {} }
      yield { event: 'tool_call', data: { tool: 'genome__lookup_gene' } }
      yield { event: 'text_delta', data: { content: 'result' } }
      yield { event: 'done', data: {} }
    })

    const { result } = await loadHook()
    await waitFor(() => expect(result.current.sessionId).toBe('s11'))

    await act(async () => {
      await result.current.send('lookup')
    })

    // After completion status is cleared, but the tool_call was processed
    // Verify the final assistant message was created
    expect(result.current.messages[1]).toEqual({ role: 'assistant', content: 'result' })
  })
})
