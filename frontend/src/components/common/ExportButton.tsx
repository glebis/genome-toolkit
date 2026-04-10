import { PillButton } from './PillButton'

interface ExportButtonProps {
  label: string
  onClick: () => void
  accent?: boolean
}

export function ExportButton({ label, onClick, accent = false }: ExportButtonProps) {
  return (
    <PillButton
      onClick={onClick}
      color={accent ? 'var(--accent)' : 'var(--border-strong)'}
      style={{ color: accent ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      {label}
    </PillButton>
  )
}
