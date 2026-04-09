import { useState, useCallback, useRef, useEffect, useMemo } from 'react'

export type VoiceState = 'idle' | 'recording' | 'loading' | 'speaking'

export function useVoice() {
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartRef = useRef<number>(0)

  // Check browser support
  const supported = typeof window !== 'undefined' && (
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  )

  // Derived state machine
  const state: VoiceState = useMemo(() => {
    if (speaking) return 'speaking'
    if (loading) return 'loading'
    if (listening) return 'recording'
    return 'idle'
  }, [listening, speaking, loading])

  // Recording timer
  useEffect(() => {
    if (listening) {
      recordingStartRef.current = Date.now()
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime((Date.now() - recordingStartRef.current) / 1000)
      }, 100)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setRecordingTime(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [listening])

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !text) return

    // Cancel any current speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    utterance.pitch = 1.0

    // Prefer a natural-sounding voice
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v =>
      v.name.includes('Samantha') || v.name.includes('Karen') ||
      v.name.includes('Google') || v.name.includes('Natural')
    ) || voices.find(v => v.lang.startsWith('en'))
    if (preferred) utterance.voice = preferred

    utterance.onstart = () => { setLoading(false); setSpeaking(true) }
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => { setSpeaking(false); setLoading(false) }

    synthRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [voiceEnabled])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel()
    setSpeaking(false)
    setLoading(false)
  }, [])

  const startListening = useCallback((onResult: (text: string) => void) => {
    if (!supported || listening) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    let handled = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      if (handled) return
      // Only use final results
      const result = event.results[event.results.length - 1]
      if (!result.isFinal) return
      handled = true
      const text = result[0].transcript
      setListening(false)
      recognition.stop()
      onResult(text)
    }

    recognition.onerror = () => { setListening(false); handled = true }
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [supported, listening])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const toggleVoice = useCallback(() => {
    if (voiceEnabled) {
      stopSpeaking()
      stopListening()
    }
    setVoiceEnabled(prev => !prev)
  }, [voiceEnabled, stopSpeaking, stopListening])

  // Load voices (some browsers load async)
  useEffect(() => {
    window.speechSynthesis?.getVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', () => {
      window.speechSynthesis.getVoices()
    })
  }, [])

  return {
    voiceEnabled,
    listening,
    speaking,
    supported,
    state,
    recordingTime,
    toggleVoice,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
  }
}
