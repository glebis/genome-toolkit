import { HeroHeader, InfoCallout, LoadingLabel } from '../common'
import { useResidenceHistory } from '../../hooks/useResidenceHistory'
import { useLifeMap } from '../../hooks/useLifeMap'
import { CountryAnchors } from './CountryAnchors'
import { MigrationContextMarker } from './MigrationContextMarker'
import { ResidenceHistoryInput } from './ResidenceHistoryInput'
import { LifeModifiers } from './LifeModifiers'

export function LifeMap() {
  const { state, addResidence, updateResidence, removeResidence, setCurrentCountry, setSex, setAge } =
    useResidenceHistory()
  const { anchors, blend, modifiers, table, loading } = useLifeMap({
    residences: state.residences,
    currentCountry: state.currentCountry,
    sex: state.sex,
    age: state.age,
  })

  if (loading) return <LoadingLabel />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <HeroHeader
        title="Life Map"
        description="A person is not one demographic. If you've lived across countries, your life-expectancy picture is mixed. This map shows each country's anchor side by side, plus a clearly-labeled migration blend — using real Eurostat (EU) and WHO (Russia) period life tables."
        genotypes={[]}
        glyphLabel="life map"
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
          <MigrationContextMarker blend={blend} />
        </section>

        <LifeModifiers modifiers={modifiers} />
      </div>

      <div
        style={{
          padding: '8px 24px',
          borderTop: '1px dashed var(--border-dashed, var(--border))',
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
