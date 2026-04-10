import type { CSSProperties } from 'react'

interface PillButtonProps {
  children: React.ReactNode
  onClick: () => void
  color?: string
  fontWeight?: number
  style?: CSSProperties
}

export function PillButton({ children, onClick, color = 'var(--text-secondary)', fontWeight = 500, style }: PillButtonProps) {
  return (
    <button
      className="pill-btn"
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        fontWeight,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        padding: '4px 10px',
        border: `1px solid ${color}`,
        borderRadius: 2,
        background: 'transparent',
        color,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
