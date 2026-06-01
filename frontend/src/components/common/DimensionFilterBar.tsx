import { FilterChip } from './FilterChip'
import type { ActiveFilters } from '../../lib/filtering'

export interface FilterOption {
  value: string
  label: string
  color?: string
}

export interface FilterBarDimension {
  key: string
  label: string
  options: FilterOption[]
}

interface DimensionFilterBarProps {
  dimensions: FilterBarDimension[]
  active: ActiveFilters
  onChange: (key: string, value: string | null) => void
}

/**
 * Universal multi-dimension filter bar (#28). Renders one chip group per
 * dimension (symptom, substance, evidence, action type, ...) with an "All"
 * reset chip. Pairs with `filterItems` from lib/filtering.
 */
export function DimensionFilterBar({ dimensions, active, onChange }: DimensionFilterBarProps) {
  return (
    <div className="dimension-filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dimensions.map((dim) => {
        const selected = active[dim.key] ?? null
        return (
          <div
            key={dim.key}
            data-testid={`filter-group-${dim.key}`}
            style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginRight: 4,
            }}>
              {dim.label}
            </span>
            <FilterChip
              label="All"
              isActive={selected === null}
              onClick={() => onChange(dim.key, null)}
            />
            {dim.options.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                isActive={selected === opt.value}
                onClick={() => onChange(dim.key, selected === opt.value ? null : opt.value)}
                activeColor={opt.color}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
