import { HeroHeader, InfoCallout, LoadingLabel, ExportBar } from '../common'
import { lifeMapToMarkdown, downloadFile, printPage } from '../../lib/export'
import { useResidenceHistory } from '../../hooks/useResidenceHistory'
import { useLifeMap } from '../../hooks/useLifeMap'
import { CountryAnchors } from './CountryAnchors'
import { MigrationContextMarker } from './MigrationContextMarker'
import { ResidenceHistoryInput } from './ResidenceHistoryInput'
import { LifeModifiers } from './LifeModifiers'
import { LifeExpectancyAxis } from './LifeExpectancyAxis'
import { LifeMapGlyph } from './LifeMapGlyph'

export function LifeMap() {
  const { state, addResidence, updateResidence, removeResidence, setCurrentCountry, setSex, setAge, toggleModifier } =
    useResidenceHistory()
  const { anchors, blend, modifiers, table, loading, error, reload } = useLifeMap({
    residences: state.residences,
    currentCountry: state.currentCountry,
    sex: state.sex,
    age: state.age,
  })

  const selectedModifiers = modifiers.filter((m) => state.modifierIds.includes(m.id))

  function handleExport(format: string) {
    if (format === 'md') {
      const md = lifeMapToMarkdown({
        sex: state.sex,
        age: state.age,
        currentCountry: state.currentCountry,
        anchors,
        residences: state.residences,
        blend,
        modifiers: selectedModifiers,
        retrieved: table?.retrieved,
      })
      downloadFile(md, `life-map-${new Date().toISOString().slice(0, 10)}.md`)
    } else if (format === 'pdf') {
      printPage('pdf')
    } else if (format === 'doctor') {
      printPage('doctor')
    }
  }

  if (loading) return <LoadingLabel />

  if (error) {
    return (
      <div role="alert" style={{ padding: '40px 24px', maxWidth: 560 }}>
        <p style={{ color: 'var(--text)', fontSize: 'var(--font-size-md)', marginBottom: 12 }}>
          Couldn't load the life-expectancy data.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 16 }}>
          The reference tables (Eurostat + WHO) didn't load. This is usually a temporary network issue.
        </p>
        <button className="btn" onClick={reload}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <HeroHeader
        title="Life Map"
        description="A person is not one demographic. If you've lived across countries, your life-expectancy picture is mixed. This map shows each country's anchor side by side, plus a clearly-labeled migration blend — using real Eurostat (EU) and WHO (Russia) period life tables."
        genotypes={[]}
        glyphLabel="life map"
        icon={<LifeMapGlyph countries={state.residences.map((r) => r.country)} size={100} label="life map" />}
      />

      <div className="section-content" style={{ padding: '28px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <ResidenceHistoryInput
          table={table}
          residences={state.residences}
          currentCountry={state.currentCountry}
          sex={state.sex}
          age={state.age}
          onAdd={addResidence}
          onUpdate={updateResidence}
          onRemove={removeResidence}
          onSetCurrent={setCurrentCountry}
          onSetSex={setSex}
          onSetAge={setAge}
        />

        <InfoCallout>
          Country figures are <strong>period life expectancy</strong> — population statistics for the
          selected sex and age, <strong>not a personal prediction</strong>. They are anchors for context;
          the blended marker below is an explicit heuristic. Ancestry and individual circumstances are not
          modelled here.
        </InfoCallout>

        <section>
          <h3 style={{ fontSize: 'var(--font-size-sm)', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 12 }}>
            COUNTRY ANCHORS
          </h3>
          <CountryAnchors anchors={anchors} currentCountry={state.currentCountry} />
          {anchors.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <LifeExpectancyAxis anchors={anchors} blend={blend} currentCountry={state.currentCountry} />
            </div>
          )}
          <MigrationContextMarker blend={blend} />
        </section>

        <LifeModifiers available={modifiers} selectedIds={state.modifierIds} onToggle={toggleModifier} />

        {anchors.length > 0 && <ExportBar onExport={handleExport} />}
      </div>

      <div
        style={{
          padding: '8px 24px',
          borderTop: '1px dashed var(--border-dashed)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        <span>{anchors.length} countries &middot; Eurostat + WHO</span>
        <span>GENOME_TOOLKIT // LIFE MAP</span>
      </div>
    </div>
  )
}
