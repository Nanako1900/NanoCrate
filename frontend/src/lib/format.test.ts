import { describe, expect, it } from 'vitest';
import {
  attributeChips,
  formatAttributeKey,
  formatAttributeValue,
  formatPrice,
  formatPriceFrom,
  pluralize,
} from './format';

describe('formatPrice', () => {
  it('formats integer cents as USD', () => {
    expect(formatPrice(12900)).toBe('$129.00');
  });

  it('rounds the minor units correctly', () => {
    expect(formatPrice(5099)).toBe('$50.99');
  });
});

describe('formatPriceFrom', () => {
  it('prefixes "From"', () => {
    expect(formatPriceFrom(12900)).toBe('From $129.00');
  });
});

describe('formatAttributeKey', () => {
  it('humanizes snake_case', () => {
    expect(formatAttributeKey('hot_swappable')).toBe('Hot swappable');
  });

  it('humanizes kebab-case', () => {
    expect(formatAttributeKey('case-material')).toBe('Case material');
  });
});

describe('formatAttributeValue', () => {
  it('renders booleans as Yes/No', () => {
    expect(formatAttributeValue(true)).toBe('Yes');
    expect(formatAttributeValue(false)).toBe('No');
  });

  it('passes strings and numbers through', () => {
    expect(formatAttributeValue('75%')).toBe('75%');
    expect(formatAttributeValue(45)).toBe('45');
  });
});

describe('attributeChips', () => {
  it('drops false booleans, humanizes true ones, and labels numbers', () => {
    const chips = attributeChips(
      { layout: '75%', hot_swappable: true, wireless: false, actuation: 45 },
      4,
    );
    expect(chips).toEqual(['75%', 'Hot swappable', 'Actuation 45']);
  });

  it('respects the max count', () => {
    expect(attributeChips({ a: '1', b: '2', c: '3', d: '4' }, 2)).toHaveLength(2);
  });
});

describe('pluralize', () => {
  it('returns the singular for 1 and plural otherwise', () => {
    expect(pluralize(1, 'result')).toBe('result');
    expect(pluralize(0, 'result')).toBe('results');
    expect(pluralize(2, 'result')).toBe('results');
  });
});
