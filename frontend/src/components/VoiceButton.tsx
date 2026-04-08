import { type CSSProperties, useCallback } from 'react'
import type { VoiceState } from '../hooks/useVoice'

interface VoiceButtonProps {
  voiceEnabled: boolean
  state: VoiceState
  recordingTime: number
  onToggleVoice: () => void
  onStartListening: () => void
  onStopListening: () => void
  onStopSpeaking: () => void
}

// Microphone SVG paths for different states
const MicIcon = ({ state }: { state: VoiceState }) => {
  const isActive = state === 'recording'
  const isSpeaking = state === 'speaking'
  const isLoading = state === 'loading'

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={isActive ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: 'all 0.2s ease' }}
    >
      {isSpeaking || isLoading ? (
        // Sound wave icon when speaking/loading
        <>
          <line x1="4" y1="8" x2="4" y2="16" />
          <line x1="8" y1="5" x2="8" y2="19" />
          <line x1="12" y1="2" x2="12" y2="22" />
          <line x1="16" y1="5" x2="16" y2="19" />
          <line x1="20" y1="8" x2="20" y2="16" />
        </>
      ) : (
        // Microphone icon
        <>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
          {/* Strike-through when not enabled */}
          {state === 'idle' && (
            <line x1="2" y1="2" x2="22" y2="22" strokeWidth={2} opacity={0.6} />
          )}
        </>
      )}
    </svg>
  )
}

export function VoiceButton({
  voiceEnabled,
  state,
  recordingTime,
  onToggleVoice,
  onStartListening,
  onStopListening,
  onStopSpeaking,
}: VoiceButtonProps) {

  const handleClick = useCallback(() => {
    if (!voiceEnabled) {
      onToggleVoice()
      return
    }

    switch (state) {
      case 'idle':
        onStartListening()
        break
      case 'recording':
        onStopListening()
        break
      case 'speaking':
      case 'loading':
        onStopSpeaking()
        break
    }
  }, [voiceEnabled, state, onToggleVoice, onStartListening, onStopListening, onStopSpeaking])

  const handleLongPress = useCallback(() => {
    if (voiceEnabled) {
      onToggleVoice()
    }
  }, [voiceEnabled, onToggleVoice])

  // Color based on state
  const getColor = (): string => {
    if (!voiceEnabled) return 'var(--text-tertiary)'
    switch (state) {
      case 'recording': return 'var(--sig-risk)'
      case 'speaking': return 'var(--primary)'
      case 'loading': return 'var(--primary-dim)'
      default: return 'var(--accent)'
    }
  }

  const getBorderColor = (): string => {
    if (!voiceEnabled) return 'var(--border)'
    switch (state) {
      case 'recording': return 'var(--sig-risk)'
      case 'speaking': return 'var(--primary)'
      case 'loading': return 'var(--primary-dim)'
      default: return 'var(--accent-dim)'
    }
  }

  const getTitle = (): string => {
    if (!voiceEnabled) return 'Enable voice mode'
    switch (state) {
      case 'recording': return `Recording... ${recordingTime.toFixed(1)}s (click to stop)`
      case 'speaking': return 'Speaking... (click to stop)'
      case 'loading': return 'Generating speech...'
      default: return 'Click to speak (long-press to disable voice)'
    }
  }

  // Ring animation size based on recording time
  const ringScale = state === 'recording'
    ? 1 + Math.sin(recordingTime * 4) * 0.15 + Math.min(recordingTime * 0.02, 0.3)
    : 1

  const buttonStyle: CSSProperties = {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: `1.5px solid ${getBorderColor()}`,
    background: state === 'recording'
      ? `rgba(196, 82, 78, 0.08)`
      : 'transparent',
    color: getColor(),
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.25s ease',
    padding: 0,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  }

  const ringStyle: CSSProperties = {
    position: 'absolute',
    inset: -3,
    borderRadius: '50%',
    border: `1.5px solid ${getColor()}`,
    opacity: state === 'recording' ? 0.4 : 0,
    transform: `scale(${ringScale})`,
    transition: state === 'recording' ? 'transform 0.1s ease, opacity 0.3s ease' : 'opacity 0.3s ease',
    pointerEvents: 'none',
  }

  const pulseRingStyle: CSSProperties = {
    position: 'absolute',
    inset: -6,
    borderRadius: '50%',
    border: `1px solid ${getColor()}`,
    opacity: state === 'recording' ? 0.2 : 0,
    transform: `scale(${ringScale * 1.1})`,
    transition: state === 'recording' ? 'transform 0.1s ease, opacity 0.3s ease' : 'opacity 0.3s ease',
    pointerEvents: 'none',
  }

  // Speaking wave animation via CSS
  const speakingPulse: CSSProperties = {
    position: 'absolute',
    inset: -2,
    borderRadius: '50%',
    border: `1px solid var(--primary)`,
    opacity: state === 'speaking' ? 1 : 0,
    animation: state === 'speaking' ? 'voicePulse 1.5s ease-in-out infinite' : 'none',
    pointerEvents: 'none',
  }

  // Time indicator for recording
  const showTime = state === 'recording' && recordingTime > 0.5

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
      <style>{`
        @keyframes voicePulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.2); opacity: 0; }
        }
        @keyframes loadingSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <button
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); handleLongPress() }}
        title={getTitle()}
        style={buttonStyle}
      >
        {/* Animated rings */}
        <span style={ringStyle} />
        <span style={pulseRingStyle} />
        <span style={speakingPulse} />

        {/* Loading spinner ring */}
        {state === 'loading' && (
          <span style={{
            position: 'absolute',
            inset: -2,
            borderRadius: '50%',
            border: '1.5px solid transparent',
            borderTopColor: 'var(--primary)',
            animation: 'loadingSpin 0.8s linear infinite',
            pointerEvents: 'none',
          }} />
        )}

        <MicIcon state={voiceEnabled ? state : 'idle'} />
      </button>

      {/* Recording time label */}
      {showTime && (
        <span style={{
          fontSize: 'var(--font-size-xs)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--sig-risk)',
          letterSpacing: 'var(--tracking-wide)',
          fontWeight: 500,
          minWidth: 32,
        }}>
          {recordingTime.toFixed(1)}s
        </span>
      )}

      {/* Voice enabled dot */}
      {voiceEnabled && state === 'idle' && (
        <span style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--accent)',
        }} />
      )}
    </div>
  )
}
