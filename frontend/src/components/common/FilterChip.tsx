import { PillButton } from './PillButton'

interface FilterChipProps {
  label: React.ReactNode
  isActive: boolean
  onClick: () => void
  activeColor?: string
}

export function FilterChip({ label, isActive, onClick, activeColor = 'var(--primary)' }: FilterChipProps) {
  return (
    <PillButton
      onClick={onClick}
      color={isActive ? activeColor : 'var(--border)'}
      fontWeight={isActive ? 600 : 500}
      style={{ color: isActive ? activeColor : 'var(--text-secondary)' }}
    >
      {label}
    </PillButton>
  )
}
