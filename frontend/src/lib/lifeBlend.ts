// Pure country-blend life-expectancy logic for the Migrant Life-Map.
// No React, no IO — fully unit-testable. See docs/superpowers/specs/2026-05-30-migrant-life-map-design.md

export type Sex = 'male' | 'female'

export interface Residence {
  country: string
  years: number
}

export interface LifeTable {
  retrieved: string
  countries: Record<
    string,
    { name: string; source: string; ex_by_age: Record<Sex, Record<string, number>> }
  >
}

export interface CountryAnchor {
  country: string
  name: string
  exAtAge: number
  targetAge: number
}

export interface BlendMarker {
  targetAge: number
  spread: { min: number; max: number }
  heuristic: true
}

// Current residence is weighted more heavily — remaining life expectancy is
// driven mostly by current/future environment. This is an explicit heuristic.
const CURRENT_EMPHASIS = 2

const round1 = (n: number): number => Math.round(n * 10) / 10

/** Remaining life expectancy at `age` for a country/sex, mapping to the nearest
 *  available age bracket when the exact age is absent. null if no data. */
export function lifeExpectancyAtAge(
  table: LifeTable,
  country: string,
  sex: Sex,
  age: number,
): number | null {
  const c = table.countries[country]
  if (!c) return null
  const ages = c.ex_by_age[sex]
  if (!ages) return null
  const exact = ages[String(age)]
  if (exact != null) return exact
  const keys = Object.keys(ages).map(Number)
  if (keys.length === 0) return null
  const nearest = keys.reduce(
    (best, k) => (Math.abs(k - age) < Math.abs(best - age) ? k : best),
    keys[0],
  )
  return ages[String(nearest)]
}

/** Per-country anchors (the primary truth): target age = current age + ex.
 *  Countries without data are skipped. */
export function countryAnchors(
  table: LifeTable,
  residences: Residence[],
  sex: Sex,
  age: number,
): CountryAnchor[] {
  const out: CountryAnchor[] = []
  for (const r of residences) {
    const ex = lifeExpectancyAtAge(table, r.country, sex, age)
    if (ex == null) continue
    out.push({
      country: r.country,
      name: table.countries[r.country].name,
      exAtAge: ex,
      targetAge: round1(age + ex),
    })
  }
  return out
}

/** Years-lived-weighted blend with current-residence emphasis. Always reported
 *  as a heuristic alongside the anchor spread — never as "your life expectancy". */
export function blendMarker(
  anchors: CountryAnchor[],
  residences: Residence[],
  currentCountry: string,
): BlendMarker {
  const targets = anchors.map((a) => a.targetAge)
  const spread = { min: Math.min(...targets), max: Math.max(...targets) }

  if (anchors.length === 1) {
    return { targetAge: anchors[0].targetAge, spread, heuristic: true }
  }

  const yearsBy = new Map(residences.map((r) => [r.country, r.years]))
  let wsum = 0
  let acc = 0
  for (const a of anchors) {
    let w = yearsBy.get(a.country) ?? 0
    if (a.country === currentCountry) w *= CURRENT_EMPHASIS
    wsum += w
    acc += w * a.targetAge
  }

  if (wsum === 0) {
    const cur = anchors.find((a) => a.country === currentCountry) ?? anchors[0]
    return { targetAge: cur.targetAge, spread, heuristic: true }
  }

  return { targetAge: round1(acc / wsum), spread, heuristic: true }
}
