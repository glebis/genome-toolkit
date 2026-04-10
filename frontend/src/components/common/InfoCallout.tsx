interface InfoCalloutProps {
  children: React.ReactNode
}

export function InfoCallout({ children }: InfoCalloutProps) {
  return (
    <div className="info-callout" style={{
      background: 'var(--bg-raised)',
      border: '1.5px solid var(--primary)',
      borderRadius: 6,
      padding: '16px 18px',
      marginBottom: 24,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}>
      <span style={{
        fontSize: 'var(--font-size-md)',
        color: 'var(--primary)',
        flexShrink: 0,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
      }}>
        i
      </span>
      <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.7, fontFamily: 'var(--font-mono)' }}>
        {children}
      </div>
    </div>
  )
}
