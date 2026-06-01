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

// Beyond this gap between the nearest lower and upper age brackets we refuse to
// interpolate — a far future bracket (e.g. WHO age-60 ex applied to a 38yo) is a
// conditional-on-survival expectation and not valid for current-age anchoring.
const MAX_INTERPOLATION_GAP_YEARS = 5

/** Resolve remaining life expectancy for `age` at exact age x.
 *  Exact age is preferred; otherwise we linearly interpolate, but ONLY between a
 *  lower and an upper bracket that are within MAX_INTERPOLATION_GAP_YEARS. Sparse
 *  age-0/age-60 tables (WHO) therefore yield null for a working-age person rather
 *  than misusing the age-60 conditional expectation. The returned bracketAge is
 *  the exact age the ex value refers to, so target age = bracketAge + ex stays honest. */
function resolveBracket(
  table: LifeTable,
  country: string,
  sex: Sex,
  age: number,
): { bracketAge: number; ex: number } | null {
  const c = table.countries[country]
  if (!c) return null
  const ages = c.ex_by_age[sex]
  if (!ages) return null
  const exact = ages[String(age)]
  if (exact != null) return { bracketAge: age, ex: exact }
  const keys = Object.keys(ages).map(Number).sort((a, b) => a - b)
  if (keys.length === 0) return null
  const lower = [...keys].reverse().find((k) => k < age)
  const upper = keys.find((k) => k > age)
  if (lower == null || upper == null) return null
  if (upper - lower > MAX_INTERPOLATION_GAP_YEARS) return null

  const lowerEx = ages[String(lower)]
  const upperEx = ages[String(upper)]
  const t = (age - lower) / (upper - lower)
  return { bracketAge: age, ex: round1(lowerEx + (upperEx - lowerEx) * t) }
}

/** Remaining life expectancy at (or nearest to) `age` for a country/sex.
 *  null if no data. */
export function lifeExpectancyAtAge(
  table: LifeTable,
  country: string,
  sex: Sex,
  age: number,
): number | null {
  const b = resolveBracket(table, country, sex, age)
  return b ? b.ex : null
}

/** Per-country anchors (the primary truth): target age = bracketAge + ex, where
 *  bracketAge is the exact age the ex value refers to (current age for an exact or
 *  interpolated hit). Countries without usable current-age data — including sparse
 *  age-0/age-60 tables — are skipped rather than anchored to a far bracket. */
export function countryAnchors(
  table: LifeTable,
  residences: Residence[],
  sex: Sex,
  age: number,
): CountryAnchor[] {
  const out: CountryAnchor[] = []
  for (const r of residences) {
    const b = resolveBracket(table, r.country, sex, age)
    if (b == null) continue
    out.push({
      country: r.country,
      name: table.countries[r.country].name,
      exAtAge: b.ex,
      targetAge: round1(b.bracketAge + b.ex),
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
