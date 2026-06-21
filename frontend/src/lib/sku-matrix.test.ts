import { describe, expect, it } from 'vitest';
import { expandMatrix, parseValues, suggestSku } from './sku-matrix';

describe('sku-matrix', () => {
  it('expands the cartesian product of option groups', () => {
    const combos = expandMatrix([
      { name: 'switch', values: ['red', 'brown'] },
      { name: 'keycaps', values: ['white', 'charcoal'] },
    ]);
    expect(combos).toHaveLength(4);
    expect(combos.map((c) => c.label)).toEqual(['red / white', 'red / charcoal', 'brown / white', 'brown / charcoal']);
    expect(combos[0].attributes).toEqual({ switch: 'red', keycaps: 'white' });
  });

  it('ignores empty groups', () => {
    expect(expandMatrix([{ name: 'switch', values: [] }, { name: '', values: ['x'] }])).toEqual([]);
  });

  it('suggests a SKU from a base + values', () => {
    expect(suggestSku('nano75', { switch: 'red', keycaps: 'pbt-white' })).toBe('NANO75-RED-PBTWHI');
  });

  it('parses comma/newline lists and de-duplicates', () => {
    expect(parseValues('red, brown\nred,  silent ')).toEqual(['red', 'brown', 'silent']);
  });
});
