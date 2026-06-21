import { describe, expect, it } from 'vitest';
import {
  attributeValuesFrom,
  coerceAttributes,
  emptyAttributeValues,
  validateAttributeValues,
} from './attribute-form';
import type { AttributeSchema } from '@/services/admin-types';

const schema: AttributeSchema = {
  fields: [
    { name: 'layout', label: 'Layout', type: 'select', required: true, options: ['75%', 'TKL'] },
    { name: 'actuation_g', label: 'Actuation', type: 'number', required: true },
    { name: 'hot_swappable', label: 'Hot-swap', type: 'bool', required: false },
    { name: 'note', label: 'Note', type: 'text', required: false },
  ],
};

describe('attribute-form', () => {
  it('seeds empty values by type', () => {
    expect(emptyAttributeValues(schema)).toEqual({ layout: '', actuation_g: '', hot_swappable: false, note: '' });
  });

  it('seeds values from stored attributes (numbers → strings, bool preserved)', () => {
    const values = attributeValuesFrom(schema, { layout: '75%', actuation_g: 45, hot_swappable: true });
    expect(values).toEqual({ layout: '75%', actuation_g: '45', hot_swappable: true, note: '' });
  });

  it('flags missing required fields, located by name', () => {
    const errors = validateAttributeValues(schema, emptyAttributeValues(schema));
    expect(errors.layout).toMatch(/required/i);
    expect(errors.actuation_g).toMatch(/required/i);
    expect(errors.hot_swappable).toBeUndefined(); // bool is always present
  });

  it('rejects a non-numeric number and an off-list select', () => {
    const errors = validateAttributeValues(schema, { layout: 'NOPE', actuation_g: 'abc', hot_swappable: false, note: '' });
    expect(errors.actuation_g).toMatch(/number/i);
    expect(errors.layout).toMatch(/valid/i);
  });

  it('coerces to typed attributes and omits empty optionals', () => {
    const out = coerceAttributes(schema, { layout: '75%', actuation_g: '45', hot_swappable: true, note: '' });
    expect(out).toEqual({ layout: '75%', actuation_g: 45, hot_swappable: true });
  });
});
