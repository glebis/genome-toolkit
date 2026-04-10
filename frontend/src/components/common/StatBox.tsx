interface StatBoxProps {
  value: React.ReactNode
  label: string
  color?: string
}

export function StatBox({ value, label, color = 'var(--text)' }: StatBoxProps) {
  return (
    <div className="stat-box" style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{
        fontSize: 20,
        fontWeight: 600,
        color,
        fontFamily: 'var(--font-mono)',
      }}>
        {value}
      </span>
      <span style={{
        fontSize: 'var(--font-size-xs)',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'var(--text-secondary)',
        marginTop: 2,
        fontFamily: 'var(--font-mono)',
      }}>
        {label}
      </span>
    </div>
  )
}
