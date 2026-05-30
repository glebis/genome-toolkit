import { useState } from 'react'
import type { LifeModifier } from '../../hooks/useLifeMap'

interface LifeModifiersProps {
  modifiers: LifeModifier[]
}

const CATEGORY_LABELS: Record<LifeModifier['category'], string> = {
  stress: 'Stress & lifestyle',
  'mental-health': 'Mental health',
  'family-history': 'Family history',
}

const CATEGORY_ORDER: LifeModifier['category'][] = ['stress', 'mental-health', 'family-history']

/** A range opt-in is offered ONLY for strong-evidence factors that define one.
 *  Mental-health / weak-evidence items can never produce a number. */
function canShowRange(m: LifeModifier): boolean {
  return m.evidence === 'strong' && !!m.range
}

function ModifierCard({ m }: { m: LifeModifier }) {
  const [showRange, setShowRange] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', background: 'var(--bg-inset)' }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{m.label}</div>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }}>
        {m.qualitative}
      </p>
      {m.actions.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
          {m.actions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      {canShowRange(m) && (
        <div style={{ marginTop: 10 }}>
          {!showRange ? (
            <button
              className="btn"
              style={{ fontSize: 'var(--font-size-xs)' }}
              onClick={() => setShowRange(true)}
            >
              Show range
            </button>
          ) : (
            <div
              style={{
                border: '1px dashed var(--sig-monitor, var(--border))',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                Associated with roughly <strong>{m.range!.lowYears}–{m.range!.highYears} years</strong> in population studies.
              </div>
              <div style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
                This is a wide, <strong>population-level</strong> association — <strong>not you</strong>, and heavily
                confounded. Shown only because you asked.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function LifeModifiers({ modifiers }: LifeModifiersProps) {
  if (modifiers.length === 0) return null
  return (
    <section>
      <h3 style={{ fontSize: 'var(--font-size-sm)', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 12 }}>
        LIFE CONTEXT
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {CATEGORY_ORDER.map((cat) => {
          const items = modifiers.filter((m) => m.category === cat)
          if (items.length === 0) return null
          return (
            <div key={cat}>
              <div style={{ fontSize: 'var(--font-size-xs)', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                {CATEGORY_LABELS[cat]}
              </div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {items.map((m) => (
                  <ModifierCard key={m.id} m={m} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
