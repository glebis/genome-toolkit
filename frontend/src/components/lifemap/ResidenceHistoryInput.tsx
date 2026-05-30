import type { LifeTable, Residence, Sex } from '../../lib/lifeBlend'

interface ResidenceHistoryInputProps {
  table: LifeTable | null
  residences: Residence[]
  currentCountry: string
  sex: Sex
  age: number
  onAdd: (r: Residence) => void
  onUpdate: (country: string, patch: Partial<Residence>) => void
  onRemove: (country: string) => void
  onSetCurrent: (country: string) => void
  onSetSex: (sex: Sex) => void
  onSetAge: (age: number) => void
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-inset)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  padding: '4px 8px',
  fontSize: 'var(--font-size-sm)',
}

export function ResidenceHistoryInput(props: ResidenceHistoryInputProps) {
  const { table, residences, currentCountry, sex, age } = props
  const countries = table ? Object.entries(table.countries).map(([code, c]) => ({ code, name: c.name })) : []
  const available = countries.filter((c) => !residences.some((r) => r.country === c.code))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Sex + age */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="lifemap-sex" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Sex</label>
          <select id="lifemap-sex" aria-label="Sex" style={inputStyle} value={sex} onChange={(e) => props.onSetSex(e.target.value as Sex)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="lifemap-age" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Current age</label>
          <input
            id="lifemap-age"
            aria-label="Current age"
            type="number"
            min={0}
            max={110}
            style={{ ...inputStyle, width: 80 }}
            value={age}
            onChange={(e) => props.onSetAge(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Existing residences */}
      {residences.map((r) => {
        const name = countries.find((c) => c.code === r.country)?.name ?? r.country
        return (
          <div key={r.country} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ minWidth: 120 }}>{name}</span>
            <label htmlFor={`years-${r.country}`} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Years</label>
            <input
              id={`years-${r.country}`}
              aria-label={`Years lived in ${name}`}
              type="number"
              min={0}
              max={110}
              style={{ ...inputStyle, width: 70 }}
              value={r.years}
              onChange={(e) => props.onUpdate(r.country, { years: Number(e.target.value) })}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)' }}>
              <input
                type="radio"
                name="current-country"
                aria-label={`Set ${name} as current country`}
                checked={currentCountry === r.country}
                onChange={() => props.onSetCurrent(r.country)}
              />
              Current
            </label>
            <button className="btn" aria-label={`Remove ${name}`} style={{ fontSize: 'var(--font-size-xs)' }} onClick={() => props.onRemove(r.country)}>
              ✕
            </button>
          </div>
        )
      })}

      {/* Add a country */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label htmlFor="lifemap-add-country" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Add a country you've lived in</label>
        <select
          id="lifemap-add-country"
          aria-label="Add a country you've lived in"
          style={inputStyle}
          value=""
          onChange={(e) => { if (e.target.value) props.onAdd({ country: e.target.value, years: 0 }) }}
        >
          <option value="">Select…</option>
          {available.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
