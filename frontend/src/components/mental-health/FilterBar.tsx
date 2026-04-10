import type { Category, ActionType } from '../../types/genomics'
import { FilterChip, ExportButton, Toolbar } from '../common'

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'mood', label: 'Mood' },
  { key: 'stress', label: 'Stress' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'focus', label: 'Focus' },
]

const ACTION_TYPES: { key: ActionType; label: string }[] = [
  { key: 'consider', label: 'Consider' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'discuss', label: 'Discuss' },
  { key: 'try', label: 'Try' },
]

interface FilterBarProps {
  activeCategory: Category | null
  activeActionType: ActionType | null
  onCategoryChange: (cat: Category) => void
  onActionTypeChange: (type: ActionType) => void
  onClearAll: () => void
  onExport: (format: 'pdf' | 'md' | 'doctor') => void
}

export function FilterBar({ activeCategory, activeActionType, onCategoryChange, onActionTypeChange, onClearAll, onExport }: FilterBarProps) {
  return (
    <Toolbar
      left={<>
        <FilterChip label="All" isActive={activeCategory === null && activeActionType === null} onClick={onClearAll} />
        {CATEGORIES.map(c => (
          <FilterChip key={c.key} label={c.label} isActive={activeCategory === c.key} onClick={() => onCategoryChange(c.key)} />
        ))}
        <span style={{ width: 1, background: 'var(--border)', margin: '0 6px' }} />
        {ACTION_TYPES.map(t => (
          <FilterChip key={t.key} label={t.label} isActive={activeActionType === t.key} onClick={() => onActionTypeChange(t.key)} />
        ))}
      </>}
      right={<>
        <ExportButton label="Export PDF" onClick={() => onExport('pdf')} />
        <ExportButton label="Export MD" onClick={() => onExport('md')} />
        <ExportButton label="Print for doctor" accent onClick={() => onExport('doctor')} />
      </>}
    />
  )
}
