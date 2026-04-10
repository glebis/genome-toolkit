import { describe, it, expect, vi, beforeEach } from 'vitest'
import { streamChat, type SSEEvent } from '../lib/sse'

function mockStream(chunks: string[]) {
  const encoder = new TextEncoder()
  let index = 0
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: () => {
          if (index < chunks.length) {
            return Promise.resolve({ done: false, value: encoder.encode(chunks[index++]) })
          }
          return Promise.resolve({ done: true, value: undefined })
        },
      }),
    },
  }
}

async function collect(gen: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = []
  for await (const e of gen) events.push(e)
  return events
}

describe('streamChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses a single SSE event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockStream(['event: message\ndata: {"text":"hello"}\n\n']),
    ))
    const events = await collect(streamChat('s1', 'hi'))
    expect(events).toEqual([{ event: 'message', data: { text: 'hello' } }])
  })

  it('parses multiple events in one chunk', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockStream([
        'event: a\ndata: {"n":1}\n\nevent: b\ndata: {"n":2}\n\n',
      ]),
    ))
    const events = await collect(streamChat('s1', 'hi'))
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ event: 'a', data: { n: 1 } })
    expect(events[1]).toEqual({ event: 'b', data: { n: 2 } })
  })

  it('handles events split across chunks (buffering)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockStream([
        'event: msg\nda',
        'ta: {"ok":true}\n\n',
      ]),
    ))
    const events = await collect(streamChat('s1', 'hi'))
    expect(events).toEqual([{ event: 'msg', data: { ok: true } }])
  })

  it('skips comment lines starting with ":"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockStream([
        ': ping\nevent: msg\ndata: {"v":1}\n\n',
      ]),
    ))
    const events = await collect(streamChat('s1', 'hi'))
    expect(events).toEqual([{ event: 'msg', data: { v: 1 } }])
  })

  it('skips blank lines', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockStream([
        '\n\nevent: x\n\ndata: {"a":1}\n\n',
      ]),
    ))
    const events = await collect(streamChat('s1', 'hi'))
    expect(events).toEqual([{ event: 'x', data: { a: 1 } }])
  })

  it('skips malformed JSON data without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockStream([
        'event: bad\ndata: {not json\n\nevent: good\ndata: {"ok":true}\n\n',
      ]),
    ))
    const events = await collect(streamChat('s1', 'hi'))
    expect(events).toEqual([{ event: 'good', data: { ok: true } }])
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(collect(streamChat('s1', 'hi'))).rejects.toThrow('Chat failed: 500')
  })

  it('throws on missing response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: null }))
    await expect(collect(streamChat('s1', 'hi'))).rejects.toThrow('No response body')
  })

  it('sends correct POST body with session_id and message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStream([]))
    vi.stubGlobal('fetch', fetchMock)
    await collect(streamChat('session-42', 'hello world'))
    expect(fetchMock).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'session-42', message: 'hello world' }),
      signal: undefined,
    })
  })

  it('handles empty stream with no events yielded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockStream([])))
    const events = await collect(streamChat('s1', 'hi'))
    expect(events).toEqual([])
  })

  it('skips event without a data line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockStream([
        'event: orphan\nevent: real\ndata: {"v":1}\n\n',
      ]),
    ))
    const events = await collect(streamChat('s1', 'hi'))
    // "orphan" has no data line; next "event: real" overwrites currentEvent
    expect(events).toEqual([{ event: 'real', data: { v: 1 } }])
  })

  it('passes abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStream([]))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await collect(streamChat('s1', 'hi', controller.signal))
    expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
      signal: controller.signal,
    }))
  })
})
