import { useState } from 'react'
import type { PGxEnzymeSection, DrugImpact } from '../../types/pgx'
import { MetabolizerBar } from './MetabolizerBar'
import { DrugCard } from './DrugCard'
import { MedicationInput } from './MedicationInput'
import { HeroHeader, FilterChip, ExportButton, InfoCallout, LoadingLabel, Toolbar, GeneCrossRefBadges } from '../common'
import { isPrescriberScope } from '../../types/pgx'
import { usePGxData } from '../../hooks/usePGxData'
import { useMyMedications, normalizeDrugName } from '../../hooks/useMyMedications'
import { useSubstancesData } from '../../hooks/useSubstancesData'
import type { SubstanceCard } from '../../hooks/useSubstancesData'
import { printPage, downloadFile, pgxToMarkdown, exportPdf } from '../../lib/export'
import './medications.css'

type DrugFilter = 'all' | 'my-meds' | 'antidepressants' | 'pain' | 'cardio' | 'substances' | 'safety'

const BASE_FILTERS: { key: DrugFilter; label: string }[] = [
  { key: 'all', label: 'All enzymes' },
  { key: 'antidepressants', label: 'Antidepressants' },
  { key: 'pain', label: 'Pain' },
  { key: 'substances', label: 'Substances' },
  { key: 'safety', label: 'Safety notes only' },
]

interface PGxPanelProps {
  onExport?: (format: string) => void
  onAddToChecklist?: (title: string, gene: string) => void
}

function drugMatchesMedications(drug: PGxEnzymeSection['drugs'][0], medications: string[]): boolean {
  if (medications.length === 0) return false
  const medNorms = medications.map(normalizeDrugName)
  const drugListLower = drug.drugList.toLowerCase()
  const classLower = drug.drugClass.toLowerCase()
  return medNorms.some(m => drugListLower.includes(m) || classLower.includes(m))
}

interface EnzymeImpact {
  enzyme: PGxEnzymeSection['enzyme']
  drug: PGxEnzymeSection['drugs'][0]
}

interface PinnedDrugGroup {
  drugClass: string
  impacts: EnzymeImpact[]
  worstImpact: DrugImpact
}

const IMPACT_RANK: Record<DrugImpact, number> = { ok: 0, adjust: 1, warn: 2, danger: 3 }

function drugClassBaseKey(drugClass: string): string {
  return drugClass.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase()
}

function groupPinnedByDrug(sections: PGxEnzymeSection[], medications: string[]): PinnedDrugGroup[] {
  if (medications.length === 0) return []
  const groups = new Map<string, { label: string; impacts: EnzymeImpact[] }>()
  for (const section of sections) {
    for (const drug of section.drugs) {
      if (!drugMatchesMedications(drug, medications)) continue
      const key = drugClassBaseKey(drug.drugClass)
      const existing = groups.get(key)
      if (existing) {
        existing.impacts.push({ enzyme: section.enzyme, drug })
      } else {
        groups.set(key, { label: drug.drugClass, impacts: [{ enzyme: section.enzyme, drug }] })
      }
    }
  }
  return Array.from(groups.values()).map(({ label, impacts }) => ({
    drugClass: label,
    impacts: impacts.sort((a, b) => IMPACT_RANK[b.drug.impact] - IMPACT_RANK[a.drug.impact]),
    worstImpact: impacts.reduce((worst, i) =>
      IMPACT_RANK[i.drug.impact] > IMPACT_RANK[worst] ? i.drug.impact : worst,
      'ok' as DrugImpact
    ),
  }))
}

export function PGxPanel({ onExport, onAddToChecklist }: PGxPanelProps) {
  const { sections: MOCK_PGX, allDrugNames, loading } = usePGxData()
  const { medications, addMedication, removeMedication, clearAll } = useMyMedications()
  const { substances, loading: substancesLoading } = useSubstancesData()
  const [filter, setFilter] = useState<DrugFilter>('all')
  const [addedDrugs, setAddedDrugs] = useState<Set<string>>(new Set())
  const [expandedSubstance, setExpandedSubstance] = useState<string | null>(null)
  const [expandedEnzyme, setExpandedEnzyme] = useState<string | null>(null)

  if (loading && substancesLoading) return <LoadingLabel />

  const FILTERS = medications.length > 0
    ? [{ key: 'my-meds' as DrugFilter, label: `My medications (${medications.length})` }, ...BASE_FILTERS]
    : BASE_FILTERS

  const filterDrugs = (drugs: PGxEnzymeSection['drugs']) => {
    if (filter === 'all') return drugs
    if (filter === 'my-meds') return drugs.filter(d => drugMatchesMedications(d, medications))
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

  const pinnedGroups = groupPinnedByDrug(MOCK_PGX, medications)

  return (
    <div>
      {/* Hero */}
      <HeroHeader
        title="PGx / Drug Metabolism"
        description={`How your enzymes process medications and substances. ${MOCK_PGX.length} enzymes analyzed, covering prescription drugs and recreational substances with harm reduction context.`}
        genotypes={MOCK_PGX.map(s => s.enzyme.alleles.replace('*', ''))}
        glyphLabel="your enzymes"
      />

      {/* Filters */}
      <Toolbar
        left={<>
          {FILTERS.map(f => (
            <FilterChip key={f.key} label={f.label} isActive={filter === f.key} onClick={() => setFilter(f.key)} activeColor={f.key === 'safety' ? 'var(--sig-danger)' : undefined} />
          ))}
        </>}
        right={<>
          <ExportButton label="Print for prescriber" accent onClick={() => printPage('prescriber')} />
          <ExportButton label="Export" onClick={() => { const md = pgxToMarkdown(MOCK_PGX); downloadFile(md, `pgx-report-${new Date().toISOString().slice(0,10)}.md`) }} />
          <ExportButton label="Export PDF" onClick={() => exportPdf(pgxToMarkdown(MOCK_PGX), 'pgx')} />
        </>}
      />

      <div className="section-content" style={{ padding: '24px' }}>
        {/* Medication input */}
        <MedicationInput
          allDrugNames={allDrugNames}
          selected={medications}
          onAdd={addMedication}
          onRemove={removeMedication}
          onClear={clearAll}
        />

        {/* Pinned: Your Medications (drug-first, multi-enzyme) */}
        {pinnedGroups.length > 0 && (
          <div className="pinned-meds">
            <div className="pinned-meds-title">Your medications</div>
            <div className="pinned-meds-list">
              {pinnedGroups.map(group => (
                <div key={group.drugClass} className="pinned-drug-group">
                  {group.impacts.length > 1 && (
                    <div className="pinned-drug-enzymes-row">
                      {group.impacts.map(({ enzyme, drug }) => (
                        <span key={enzyme.symbol} className={`pinned-enzyme-badge pinned-enzyme-badge--${drug.impact}`}>
                          {enzyme.symbol} · {enzyme.alleles}
                        </span>
                      ))}
                    </div>
                  )}
                  {group.impacts.map(({ enzyme, drug }) => (
                    <div key={enzyme.symbol}>
                      {group.impacts.length === 1 && (
                        <div className="pinned-meds-enzyme">
                          via {enzyme.symbol} · {enzyme.alleles}
                        </div>
                      )}
                      <DrugCard
                        drug={group.impacts.length > 1
                          ? { ...drug, drugClass: `${drug.drugClass} — ${enzyme.symbol}` }
                          : drug
                        }
                        added={addedDrugs.has(drug.drugClass)}
                        onAddToChecklist={drug.dangerNote && onAddToChecklist ? (title) => {
                          setAddedDrugs(prev => new Set(prev).add(drug.drugClass))
                          onAddToChecklist(title, enzyme.symbol)
                        } : undefined}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <hr className="pinned-meds-divider" />
          </div>
        )}

        {/* Disclaimer */}
        <InfoCallout>
            This is <strong>not medical advice</strong>. Pharmacogenomics shows how your genes <em>may</em> affect drug metabolism.
            Always discuss medication changes with your prescriber. Substance information is provided for <strong>harm reduction</strong> purposes.
        </InfoCallout>

        {/* Empty state for my-meds filter */}
        {filter === 'my-meds' && pinnedGroups.length === 0 && medications.length > 0 && (
          <div style={{ padding: '24px 0', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
            {MOCK_PGX.length === 0
              ? 'Waiting for enzyme data to load…'
              : 'No drug cards found matching your medications.'}
          </div>
        )}

        {/* Enzyme sections */}
        {filter !== 'my-meds' && MOCK_PGX.map((section, i) => {
          const filteredDrugs = filterDrugs(section.drugs)
          if (filter !== 'all' && filteredDrugs.length === 0) return null

          return (
            <div key={section.enzyme.symbol} className="enzyme-section" style={{ marginBottom: 28 }}>
              {/* Enzyme header — clickable to expand about */}
              <div
                role={section.enzyme.about ? 'button' : undefined}
                tabIndex={section.enzyme.about ? 0 : undefined}
                onClick={() => section.enzyme.about && setExpandedEnzyme(
                  expandedEnzyme === section.enzyme.symbol ? null : section.enzyme.symbol
                )}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && section.enzyme.about) {
                    e.preventDefault()
                    setExpandedEnzyme(expandedEnzyme === section.enzyme.symbol ? null : section.enzyme.symbol)
                  }
                }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
                  cursor: section.enzyme.about ? 'pointer' : 'default',
                }}
                aria-expanded={expandedEnzyme === section.enzyme.symbol}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{section.enzyme.symbol}</span>
                  <span style={{
                    fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)',
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 2,
                  }}>
                    {section.enzyme.geneType}
                  </span>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{section.enzyme.alleles}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <GeneCrossRefBadges symbol={section.enzyme.symbol} currentSection="pgx" />
                  </span>
                  {section.enzyme.about && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                      {expandedEnzyme === section.enzyme.symbol ? '▴ hide' : '▾ what does this do?'}
                    </span>
                  )}
                </div>
                {section.enzyme.guideline && (
                  <span style={{ fontSize: 'var(--font-size-xs)', background: 'var(--primary)', color: 'var(--bg-raised)', padding: '3px 8px', borderRadius: 3, letterSpacing: '0.1em' }}>
                    {section.enzyme.guideline} GUIDELINE
                  </span>
                )}
              </div>

              <MetabolizerBar enzyme={section.enzyme} />

              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text)', lineHeight: 1.7, marginBottom: 16 }}>
                {section.enzyme.description}
              </div>

              {/* Expanded "about" educational block */}
              {expandedEnzyme === section.enzyme.symbol && section.enzyme.about && (
                <div style={{
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '12px 16px',
                  marginBottom: 16,
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: 1.7,
                  color: 'var(--text)',
                }}>
                  <div style={{
                    fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-secondary)',
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6,
                  }}>
                    About {section.enzyme.symbol}
                  </div>
                  {section.enzyme.about}
                </div>
              )}

              {/* Drug cards, partitioned by evidence scope. Only guideline/label
                  scopes get prescriber framing; everything else (pk_only,
                  harm_reduction, exploratory) is grouped + labeled as
                  "not genotype-backed dosing" but stays VISIBLE by default. */}
              {(() => {
                const prescriberDrugs = filteredDrugs.filter(d => isPrescriberScope(d.evidenceScope))
                const otherDrugs = filteredDrugs.filter(d => !isPrescriberScope(d.evidenceScope))

                const renderCardGroup = (drugs: typeof filteredDrugs, category: 'prescription' | 'substance', heading: string) => {
                  const inGroup = drugs.filter(d => d.category === category)
                  if (inGroup.length === 0) return null
                  return (
                    <>
                      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, marginTop: 8 }}>
                        {heading}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        {inGroup.map(drug => (
                          <DrugCard
                            key={drug.drugClass}
                            drug={drug}
                            added={addedDrugs.has(drug.drugClass)}
                            onAddToChecklist={drug.dangerNote && onAddToChecklist ? (title) => {
                              setAddedDrugs(prev => new Set(prev).add(drug.drugClass))
                              onAddToChecklist(title, section.enzyme.symbol)
                            } : undefined}
                          />
                        ))}
                      </div>
                    </>
                  )
                }

                return (
                  <>
                    {/* Prescriber-grade group (guideline/label only) */}
                    {prescriberDrugs.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                          Prescriber discussion points
                        </div>
                        {renderCardGroup(prescriberDrugs, 'prescription', 'Prescription medications')}
                        {renderCardGroup(prescriberDrugs, 'substance', 'Substances')}
                      </div>
                    )}

                    {/* Not-for-prescribing group — kept visible, clearly labeled */}
                    {otherDrugs.length > 0 && (
                      <div style={{
                        marginBottom: 8,
                        borderLeft: '2px solid var(--border)',
                        paddingLeft: 12,
                      }}>
                        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                          Not genotype-backed dosing
                        </div>
                        {renderCardGroup(otherDrugs, 'prescription', 'Prescription medications')}
                        {renderCardGroup(otherDrugs, 'substance', 'Substances')}
                      </div>
                    )}
                  </>
                )
              })()}

              {/* Enzyme footer */}
              <div style={{
                borderTop: '1px dashed var(--border-dashed)', paddingTop: 10,
                display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)',
              }}>
                <span>
                  {section.enzyme.guideline
                    ? `Guideline-backed: ${section.enzyme.guideline}. Verify current prescribing guidance with a clinician.`
                    : 'Exploratory metabolism note. Not guideline-backed for dosing.'}
                </span>
              </div>

              {/* Separator between enzymes */}
              {i < MOCK_PGX.length - 1 && (
                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0 28px' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Substances section */}
      {substances.length > 0 && (
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{
            borderTop: '2px solid var(--border)',
            paddingTop: 24,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
              Substances & Harm Reduction
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              Harm-reduction notes — <strong>not genotype-backed dosing</strong> and not encouragement.
              Your genotype does not specify a dose; these are general safety notes.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {substances.map((s) => {
              const isExpanded = expandedSubstance === s.name
              return (
                <div
                  key={s.name}
                  style={{
                    background: 'var(--bg-raised)',
                    borderLeft: `4px solid ${s.borderColor}`,
                    borderRadius: '0 6px 6px 0',
                    padding: '14px 18px',
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedSubstance(isExpanded ? null : s.name)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>{s.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: s.statusColor, fontFamily: 'var(--font-mono)' }}>
                        {s.status}
                      </span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                        {isExpanded ? '▴' : '▾'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Enzymes: {s.relevantEnzymes.length > 0 ? s.relevantEnzymes.join(', ') : '—'} · Genes: {s.genes}
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 12 }}>
                      {s.description && (
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text)', lineHeight: 1.6, marginBottom: 10 }}>
                          {s.description}
                        </div>
                      )}
                      <div style={{
                        padding: '10px 14px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                      }}>
                        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          {s.harmTitle}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text)', lineHeight: 1.7 }}>
                          {s.harmText}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="risk-footer" style={{
        padding: '8px 24px', borderTop: '1px dashed var(--border-dashed)',
        display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)',
        color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        <span>{MOCK_PGX.length} enzymes · {substances.length} substances / harm reduction mode</span>
        <span>GENOME_TOOLKIT // PGX / DRUGS</span>
      </footer>
    </div>
  )
}
