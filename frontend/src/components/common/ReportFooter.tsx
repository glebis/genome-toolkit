interface ReportFooterProps {
  left: React.ReactNode
  right: React.ReactNode
}

export function ReportFooter({ left, right }: ReportFooterProps) {
  return (
    <footer style={{
      padding: 'var(--space-xs) var(--space-lg)',
      borderTop: '1px dashed var(--border-dashed)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <span className="label">{left}</span>
      <span className="label">{right}</span>
    </footer>
  )
}
