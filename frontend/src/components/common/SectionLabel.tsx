interface SectionLabelProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

export function SectionLabel({ children, style }: SectionLabelProps) {
  return (
    <div style={{
      fontSize: 'var(--font-size-xs)',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: 'var(--text)',
      fontFamily: 'var(--font-mono)',
      marginBottom: 12,
      ...style,
    }}>
      {children}
    </div>
  )
}
