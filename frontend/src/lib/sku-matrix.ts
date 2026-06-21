/**
 * Helpers for the ★ Variant/SKU matrix editor: an option matrix (e.g.
 * switch × keycaps) expands to the cartesian product, one variant per
 * combination, each with a suggested SKU and its own price/stock.
 */
export interface OptionGroup {
  /** Attribute name, e.g. "switch". */
  name: string;
  /** Possible values, e.g. ["red", "brown"]. */
  values: string[];
}

export interface Combination {
  /** attribute name → chosen value */
  attributes: Record<string, string>;
  /** human label, e.g. "red / brown" */
  label: string;
}

function token(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6);
}

/** Cartesian product of the groups' values (groups with no values are ignored). */
export function expandMatrix(groups: OptionGroup[]): Combination[] {
  const active = groups.filter((g) => g.name.trim() && g.values.length > 0);
  if (active.length === 0) return [];
  let combos: Record<string, string>[] = [{}];
  for (const group of active) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const value of group.values) next.push({ ...combo, [group.name]: value });
    }
    combos = next;
  }
  return combos.map((attributes) => ({
    attributes,
    label: Object.values(attributes).join(' / '),
  }));
}

/** Suggest a SKU from a base code + the combination's values. */
export function suggestSku(base: string, attributes: Record<string, string>): string {
  const root = base.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'SKU';
  const parts = Object.values(attributes).map(token).filter(Boolean);
  return [root, ...parts].join('-');
}

/** Parse a comma/newline separated list into trimmed, de-duplicated values. */
export function parseValues(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter((v) => v && !seen.has(v) && seen.add(v));
}
