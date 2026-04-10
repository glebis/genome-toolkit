import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockSpeechRecognition() {
  return class MockSpeechRecognition {
    continuous = false
    interimResults = false
    lang = ''
    onresult: ((event: any) => void) | null = null
    onerror: (() => void) | null = null
    onend: (() => void) | null = null
    start = vi.fn()
    stop = vi.fn(() => {
      this.onend?.()
    })

    simulateResult(transcript: string) {
      this.onresult?.({
        results: [{ 0: { transcript }, isFinal: true, length: 1 }],
      } as any)
    }

    simulateError() {
      this.onerror?.()
    }
  }
}

function createMockSpeechSynthesis() {
  return {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn(() => [
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Default', lang: 'en-US' },
    ]),
    addEventListener: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('useVoice', () => {
  let mockSynth: ReturnType<typeof createMockSpeechSynthesis>

  beforeEach(() => {
    vi.resetModules()

    const MockRecognition = createMockSpeechRecognition()
    vi.stubGlobal('SpeechRecognition', MockRecognition)
    vi.stubGlobal('webkitSpeechRecognition', MockRecognition)
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        rate = 1
        pitch = 1
        voice: any = null
        text = ''
        onstart: (() => void) | null = null
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor(text: string) {
          this.text = text
        }
      },
    )

    mockSynth = createMockSpeechSynthesis()
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSynth,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function importAndRender() {
    const mod = await import('../hooks/useVoice')
    return renderHook(() => mod.useVoice())
  }

  // 1
  it('supported is true when SpeechRecognition exists', async () => {
    const { result } = await importAndRender()
    expect(result.current.supported).toBe(true)
  })

  // 2
  it('supported is false when SpeechRecognition does not exist', async () => {
    vi.resetModules()
    // Remove both speech recognition globals entirely
    const g = globalThis as any
    delete g.SpeechRecognition
    delete g.webkitSpeechRecognition
    // Also remove from window
    const w = window as any
    Object.defineProperty(w, 'SpeechRecognition', { value: undefined, configurable: true })
    Object.defineProperty(w, 'webkitSpeechRecognition', { value: undefined, configurable: true })
    // The hook checks 'SpeechRecognition' in window, so we need to fully remove
    delete w.SpeechRecognition
    delete w.webkitSpeechRecognition

    const mod = await import('../hooks/useVoice')
    const { result } = renderHook(() => mod.useVoice())
    expect(result.current.supported).toBe(false)
  })

  // 3
  it('initial state is idle', async () => {
    const { result } = await importAndRender()
    expect(result.current.state).toBe('idle')
    expect(result.current.voiceEnabled).toBe(false)
    expect(result.current.listening).toBe(false)
    expect(result.current.speaking).toBe(false)
  })

  // 4
  it('toggleVoice enables voice', async () => {
    const { result } = await importAndRender()
    act(() => {
      result.current.toggleVoice()
    })
    expect(result.current.voiceEnabled).toBe(true)
  })

  // 5
  it('toggleVoice disables voice and stops speaking/listening', async () => {
    const { result } = await importAndRender()

    // Enable voice first
    act(() => {
      result.current.toggleVoice()
    })
    expect(result.current.voiceEnabled).toBe(true)

    // Disable voice
    act(() => {
      result.current.toggleVoice()
    })
    expect(result.current.voiceEnabled).toBe(false)
    // speechSynthesis.cancel should have been called when disabling
    expect(mockSynth.cancel).toHaveBeenCalled()
  })

  // 6
  it('speak does nothing when voiceEnabled is false', async () => {
    const { result } = await importAndRender()
    act(() => {
      result.current.speak('hello')
    })
    expect(mockSynth.speak).not.toHaveBeenCalled()
  })

  // 7
  it('speak does nothing with empty text', async () => {
    const { result } = await importAndRender()
    act(() => {
      result.current.toggleVoice()
    })
    act(() => {
      result.current.speak('')
    })
    expect(mockSynth.speak).not.toHaveBeenCalled()
  })

  // 8
  it('speak calls speechSynthesis.speak when enabled', async () => {
    const { result } = await importAndRender()
    act(() => {
      result.current.toggleVoice()
    })
    act(() => {
      result.current.speak('hello world')
    })
    expect(mockSynth.speak).toHaveBeenCalledTimes(1)
    const utterance = mockSynth.speak.mock.calls[0][0]
    expect(utterance.text).toBe('hello world')
  })

  // 9
  it('speak cancels previous speech first', async () => {
    const { result } = await importAndRender()
    act(() => {
      result.current.toggleVoice()
    })
    act(() => {
      result.current.speak('first')
    })
    // cancel is called before speak
    expect(mockSynth.cancel).toHaveBeenCalled()
    const cancelOrder = mockSynth.cancel.mock.invocationCallOrder[0]
    const speakOrder = mockSynth.speak.mock.invocationCallOrder[0]
    expect(cancelOrder).toBeLessThan(speakOrder)
  })

  // 10
  it('startListening sets listening=true and state=recording', async () => {
    const { result } = await importAndRender()
    const onResult = vi.fn()
    act(() => {
      result.current.startListening(onResult)
    })
    expect(result.current.listening).toBe(true)
    expect(result.current.state).toBe('recording')
  })

  // 11
  it('startListening calls onResult with transcript on final result', async () => {
    const MockRecognition = createMockSpeechRecognition()
    vi.stubGlobal('SpeechRecognition', MockRecognition)

    // We need to capture the recognition instance
    let capturedInstance: InstanceType<typeof MockRecognition> | null = null
    const OriginalMock = MockRecognition
    const SpyRecognition = class extends OriginalMock {
      constructor() {
        super()
        capturedInstance = this
      }
    }
    vi.stubGlobal('SpeechRecognition', SpyRecognition)
    vi.stubGlobal('webkitSpeechRecognition', SpyRecognition)
    vi.resetModules()

    const mod = await import('../hooks/useVoice')
    const { result } = renderHook(() => mod.useVoice())

    const onResult = vi.fn()
    act(() => {
      result.current.startListening(onResult)
    })

    expect(capturedInstance).not.toBeNull()
    act(() => {
      capturedInstance!.simulateResult('test transcript')
    })

    expect(onResult).toHaveBeenCalledWith('test transcript')
    expect(result.current.listening).toBe(false)
  })

  // 12
  it('stopListening sets listening=false', async () => {
    const { result } = await importAndRender()
    const onResult = vi.fn()
    act(() => {
      result.current.startListening(onResult)
    })
    expect(result.current.listening).toBe(true)

    act(() => {
      result.current.stopListening()
    })
    expect(result.current.listening).toBe(false)
  })

  // 13
  it('recording timer increments while listening', async () => {
    vi.useFakeTimers()

    const MockRecognition = createMockSpeechRecognition()
    vi.stubGlobal('SpeechRecognition', MockRecognition)
    vi.stubGlobal('webkitSpeechRecognition', MockRecognition)
    vi.resetModules()

    const mod = await import('../hooks/useVoice')
    const { result } = renderHook(() => mod.useVoice())

    const onResult = vi.fn()
    act(() => {
      result.current.startListening(onResult)
    })
    expect(result.current.recordingTime).toBe(0)

    // Advance 500ms (5 intervals of 100ms)
    act(() => {
      vi.advanceTimersByTime(500)
    })

    // recordingTime should be > 0 now
    expect(result.current.recordingTime).toBeGreaterThan(0)
  })

  // 14
  it('recording timer resets to 0 when listening stops', async () => {
    vi.useFakeTimers()

    const MockRecognition = createMockSpeechRecognition()
    vi.stubGlobal('SpeechRecognition', MockRecognition)
    vi.stubGlobal('webkitSpeechRecognition', MockRecognition)
    vi.resetModules()

    const mod = await import('../hooks/useVoice')
    const { result } = renderHook(() => mod.useVoice())

    const onResult = vi.fn()
    act(() => {
      result.current.startListening(onResult)
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.recordingTime).toBeGreaterThan(0)

    act(() => {
      result.current.stopListening()
    })
    expect(result.current.recordingTime).toBe(0)
  })

  // 15
  it('speak picks preferred voice (Samantha)', async () => {
    const { result } = await importAndRender()
    act(() => {
      result.current.toggleVoice()
    })
    act(() => {
      result.current.speak('hello')
    })

    const utterance = mockSynth.speak.mock.calls[0][0]
    expect(utterance.voice).toEqual({ name: 'Samantha', lang: 'en-US' })
  })

  // 16
  it('stopSpeaking calls speechSynthesis.cancel and sets speaking=false', async () => {
    const { result } = await importAndRender()
    act(() => {
      result.current.stopSpeaking()
    })
    expect(mockSynth.cancel).toHaveBeenCalled()
    expect(result.current.speaking).toBe(false)
  })

  // 17
  it('speak sets speaking=true on utterance.onstart', async () => {
    const { result } = await importAndRender()
    act(() => {
      result.current.toggleVoice()
    })
    act(() => {
      result.current.speak('hello')
    })

    const utterance = mockSynth.speak.mock.calls[0][0]
    act(() => {
      utterance.onstart?.()
    })
    expect(result.current.speaking).toBe(true)
    expect(result.current.state).toBe('speaking')

    act(() => {
      utterance.onend?.()
    })
    expect(result.current.speaking).toBe(false)
    expect(result.current.state).toBe('idle')
  })
})
