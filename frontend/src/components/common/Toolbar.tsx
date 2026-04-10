interface ToolbarProps {
  left?: React.ReactNode
  right?: React.ReactNode
  border?: 'top' | 'bottom' | 'both' | 'none'
  padding?: string
}

export function Toolbar({ left, right, border = 'bottom', padding = '12px 24px' }: ToolbarProps) {
  const borderStyle = '1px dashed var(--border-dashed)'
  return (
    <div className="filter-bar" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding,
      borderTop: border === 'top' || border === 'both' ? borderStyle : undefined,
      borderBottom: border === 'bottom' || border === 'both' ? borderStyle : undefined,
    }}>
      <div style={{ display: 'flex', gap: 6 }}>{left}</div>
      <div style={{ display: 'flex', gap: 6 }}>{right}</div>
    </div>
  )
}
