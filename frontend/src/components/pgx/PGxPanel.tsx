import { useState } from 'react'
import type { PGxEnzymeSection } from '../../types/pgx'
import { MetabolizerBar } from './MetabolizerBar'
import { DrugCard } from './DrugCard'

const MOCK_PGX: PGxEnzymeSection[] = [
  {
    enzyme: {
      symbol: 'CYP2D6', alleles: '*1/*4', status: 'intermediate', position: 25,
      description: 'One reduced-function allele (*4). You process CYP2D6 substrates more slowly than average. This affects how your body handles certain antidepressants, pain medications, and recreational substances.',
      guideline: 'CPIC',
    },
    drugs: [
      {
        drugClass: 'SSRIs', impact: 'adjust', statusText: 'May need dose adjustment',
        description: 'Fluoxetine and paroxetine are primarily metabolized by CYP2D6. With intermediate metabolism, standard doses may produce higher-than-expected blood levels. Your prescriber may start with a lower dose.',
        drugList: 'fluoxetine, paroxetine, fluvoxamine', category: 'prescription',
      },
      {
        drugClass: 'SNRIs', impact: 'ok', statusText: 'Standard dosing',
        description: 'Venlafaxine uses CYP2D6 as a secondary pathway. Your intermediate status has minimal impact on efficacy at standard doses.',
        drugList: 'venlafaxine, duloxetine', category: 'prescription',
      },
      {
        drugClass: 'Codeine & prodrug opioids', impact: 'danger', statusText: 'Discuss with prescriber',
        description: 'Codeine requires CYP2D6 to convert to morphine (the active form). With intermediate metabolism, you convert less — codeine may provide inadequate pain relief. Discuss alternative pain medications.',
        drugList: 'tramadol, hydrocodone, oxycodone (partial)', category: 'prescription',
      },
      {
        drugClass: 'MDMA / Ecstasy', impact: 'warn', statusText: 'Slower clearance — higher sensitivity',
        description: 'MDMA is primarily metabolized by CYP2D6. As an intermediate metabolizer, MDMA stays in your system longer. Standard recreational doses may produce stronger and longer effects. Redosing carries higher risk.',
        drugList: 'MDA, amphetamine (partial)', category: 'substance',
        dangerNote: 'If you take an SSRI and use MDMA, the combination creates dual serotonin load. With your slower CYP2D6, both substances clear more slowly, increasing serotonin syndrome risk.',
      },
      {
        drugClass: 'Psilocybin / Mushrooms', impact: 'adjust', statusText: 'Moderate impact',
        description: 'Psilocin (active metabolite) is partially processed by CYP2D6. Effects may last somewhat longer. Start with lower doses if exploring for the first time.',
        drugList: 'Note: MAO-A status also affects psychedelic metabolism', category: 'substance',
      },
    ],
  },
  {
    enzyme: {
      symbol: 'CYP3A4', alleles: '*1/*1', status: 'normal', position: 62,
      description: 'Both alleles are functional. CYP3A4 metabolizes roughly 50% of all medications. Standard dosing is expected to work for CYP3A4 substrates.',
      guideline: 'CPIC',
    },
    drugs: [
      {
        drugClass: 'Benzodiazepines (Xanax, Klonopin)', impact: 'ok', statusText: 'Standard metabolism',
        description: 'Alprazolam, clonazepam, and midazolam are metabolized by CYP3A4. Your normal status means expected clearance rates at standard doses.',
        drugList: 'alprazolam, clonazepam, midazolam, triazolam', category: 'prescription',
      },
      {
        drugClass: 'Cocaine', impact: 'ok', statusText: 'Normal metabolism',
        description: 'Cocaine is partially metabolized by CYP3A4. Your normal CYP3A4 means standard clearance. Note: cocaine is a potent CYP2D6 inhibitor — if used alongside CYP2D6 substrates (SSRIs, MDMA), it temporarily makes you a poorer metabolizer.',
        drugList: 'butyrylcholinesterase (primary)', category: 'substance',
        dangerNote: 'Your CYP2D6 is already intermediate. Cocaine further inhibits CYP2D6 while active. If you use cocaine alongside MDMA or while on SSRIs, CYP2D6 capacity drops to near-poor metabolizer levels.',
      },
      {
        drugClass: 'Ketamine', impact: 'ok', statusText: 'Normal CYP3A4 metabolism',
        description: 'Ketamine is metabolized by CYP3A4 and CYP2B6. Your normal CYP3A4 status means standard clearance. Increasingly used therapeutically for treatment-resistant depression.',
        drugList: 'esketamine (Spravato) — same pathway', category: 'substance',
      },
      {
        drugClass: 'Cannabis', impact: 'ok', statusText: 'Normal THC metabolism',
        description: 'THC is primarily metabolized by CYP2C9 and CYP3A4. Note: CBD is a CYP3A4 inhibitor — high-CBD products may temporarily slow metabolism of other CYP3A4 substrates (benzodiazepines, ketamine).',
        drugList: 'THC, CBD (inhibitor)', category: 'substance',
      },
    ],
  },
]

type DrugFilter = 'all' | 'antidepressants' | 'pain' | 'cardio' | 'substances' | 'safety'

const FILTERS: { key: DrugFilter; label: string }[] = [
  { key: 'all', label: 'All enzymes' },
  { key: 'antidepressants', label: 'Antidepressants' },
  { key: 'pain', label: 'Pain' },
  { key: 'substances', label: 'Substances' },
  { key: 'safety', label: 'Safety notes only' },
]

export function PGxPanel() {
  const [filter, setFilter] = useState<DrugFilter>('all')

  const filterDrugs = (drugs: typeof MOCK_PGX[0]['drugs']) => {
    if (filter === 'all') return drugs
    if (filter === 'substances') return drugs.filter(d => d.category === 'substance')
    if (filter === 'safety') return drugs.filter(d => d.impact === 'danger' || d.dangerNote)
    if (filter === 'antidepressants') return drugs.filter(d =>
      d.drugClass.includes('SSRI') || d.drugClass.includes('SNRI')
    )
    if (filter === 'pain') return drugs.filter(d =>
      d.drugClass.toLowerCase().includes('codeine') || d.drugClass.toLowerCase().includes('opioid')
    )
    return drugs
  }

  return (
    <div>
      {/* Hero */}
      <div style={{ padding: '40px 24px 32px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
          PGx / Drug Metabolism
        </div>
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.8, maxWidth: 720, fontFamily: 'var(--font-mono)' }}>
          How your enzymes process medications and substances. {MOCK_PGX.length} enzymes analyzed, covering prescription drugs and recreational substances with harm reduction context.
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 24px', borderBottom: '1px dashed var(--border-dashed)',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: filter === f.key ? 600 : 500,
                textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px',
                border: `1px solid ${filter === f.key ? (f.key === 'safety' ? '#b84a4a' : 'var(--primary)') : 'var(--border)'}`,
                background: 'transparent',
                color: filter === f.key ? (f.key === 'safety' ? '#b84a4a' : 'var(--primary)') : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px',
            border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer',
          }}>
            Print for prescriber
          </button>
          <button style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px',
            border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
          }}>
            Export
          </button>
        </div>
      </div>

      <div style={{ padding: '24px' }}>
        {/* Disclaimer */}
        <div style={{
          background: 'var(--bg-raised)', border: '1.5px solid var(--primary)', borderRadius: 6,
          padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 16, color: 'var(--primary)', flexShrink: 0, fontWeight: 600 }}>i</span>
          <div style={{ fontSize: 10, lineHeight: 1.6 }}>
            This is <strong>not medical advice</strong>. Pharmacogenomics shows how your genes <em>may</em> affect drug metabolism.
            Always discuss medication changes with your prescriber. Substance information is provided for <strong>harm reduction</strong> purposes.
          </div>
        </div>

        {/* Enzyme sections */}
        {MOCK_PGX.map((section, i) => {
          const filteredDrugs = filterDrugs(section.drugs)
          if (filter !== 'all' && filteredDrugs.length === 0) return null

          return (
            <div key={section.enzyme.symbol} style={{ marginBottom: 28 }}>
              {/* Enzyme header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{section.enzyme.symbol}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>{section.enzyme.alleles}</span>
                </div>
                {section.enzyme.guideline && (
                  <span style={{ fontSize: 8, background: 'var(--primary)', color: 'var(--bg-raised)', padding: '3px 8px', borderRadius: 3, letterSpacing: '0.1em' }}>
                    {section.enzyme.guideline} GUIDELINE
                  </span>
                )}
              </div>

              <MetabolizerBar enzyme={section.enzyme} />

              <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, marginBottom: 16 }}>
                {section.enzyme.description}
              </div>

              {/* Drug cards grouped by category */}
              {filteredDrugs.some(d => d.category === 'prescription') && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, marginTop: 8 }}>
                    Prescription medications
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {filteredDrugs.filter(d => d.category === 'prescription').map(drug => (
                      <DrugCard key={drug.drugClass} drug={drug} />
                    ))}
                  </div>
                </>
              )}

              {filteredDrugs.some(d => d.category === 'substance') && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, marginTop: 8 }}>
                    Substances
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {filteredDrugs.filter(d => d.category === 'substance').map(drug => (
                      <DrugCard key={drug.drugClass} drug={drug} />
                    ))}
                  </div>
                </>
              )}

              {/* Enzyme footer */}
              <div style={{
                borderTop: '1px dashed var(--border-dashed)', paddingTop: 10,
                display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)',
              }}>
                <span>Based on {section.enzyme.guideline || 'CPIC'} guidelines (2025)</span>
              </div>

              {/* Separator between enzymes */}
              {i < MOCK_PGX.length - 1 && (
                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0 28px' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <footer style={{
        padding: '8px 24px', borderTop: '1px dashed var(--border-dashed)',
        display: 'flex', justifyContent: 'space-between', fontSize: 10,
        color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        <span>{MOCK_PGX.length} enzymes / harm reduction mode</span>
        <span>GENOME_TOOLKIT // PGX / DRUGS</span>
      </footer>
    </div>
  )
}
