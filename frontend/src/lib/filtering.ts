/**
 * Universal multi-dimension filter primitive (#28).
 *
 * A dimension knows how to extract the value(s) an item has for it. An item
 * passes when, for every active dimension (non-null selection), the item's
 * values include the selected value. Active dimensions are ANDed together.
 */

export interface FilterDimension<T> {
  key: string
  getValues: (item: T) => string[]
}

export type ActiveFilters = Record<string, string | null | undefined>

export function itemMatches<T>(
  item: T,
  dimensions: FilterDimension<T>[],
  active: ActiveFilters,
): boolean {
  for (const dim of dimensions) {
    const selected = active[dim.key]
    if (!selected) continue
    if (!dim.getValues(item).includes(selected)) return false
  }
  return true
}

export function filterItems<T>(
  items: T[],
  dimensions: FilterDimension<T>[],
  active: ActiveFilters,
): T[] {
  return items.filter((item) => itemMatches(item, dimensions, active))
}
