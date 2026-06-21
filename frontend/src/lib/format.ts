/** Presentation helpers — pure functions, safe to unit test. */

/** Format integer minor units (cents) as a localized currency string. */
export function formatPrice(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/** "From $129.00" — used for list cards where only a starting price is known. */
export function formatPriceFrom(cents: number, currency = 'USD', locale = 'en-US'): string {
  return `From ${formatPrice(cents, currency, locale)}`;
}

/** Turn a snake_case attribute key into a human label: `hot_swappable` → `Hot swappable`. */
export function formatAttributeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Render a flexible attribute value for display (booleans become Yes/No). */
export function formatAttributeValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** Naive English pluralization helper for short UI strings. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * Condense a flexible attribute map into short chip labels for cards:
 *  - boolean `true` → the humanized key ("Hot swappable"); `false` is dropped
 *  - number → "Key 45"
 *  - string → the value verbatim ("75%")
 */
export function attributeChips(
  attributes: Record<string, string | number | boolean>,
  max = 3,
): string[] {
  const chips: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (chips.length >= max) break;
    if (typeof value === 'boolean') {
      if (value) chips.push(formatAttributeKey(key));
    } else if (typeof value === 'number') {
      chips.push(`${formatAttributeKey(key)} ${value}`);
    } else {
      chips.push(value);
    }
  }
  return chips;
}
