interface EmptyStateProps {
  message: string
  hint?: string
}

export function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '32px 0',
      color: 'var(--text-secondary)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-sm)',
    }}>
      {message}
      {hint && (
        <div style={{ marginTop: 6, fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}
