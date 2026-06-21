import type { ProductDetail, ProductListItem, Variant } from '@/services/types';

/**
 * Mechanical-keyboard reference data for the mock backend. One rich internal
 * shape is projected into the two contract shapes (list item / detail) so the
 * mock can never drift between endpoints. Mirrors backend.md §9.3 field-for-field.
 */
export interface MockProduct {
  slug: string;
  name: string;
  type: string; // product_type key
  description: string;
  image: string;
  currency: string;
  attributes: Record<string, string | number | boolean>;
  createdAt: string; // ISO — drives the `newest` sort
  variants: Variant[];
}

const USD = 'USD';

function v(
  id: string,
  sku: string,
  name: string,
  priceCents: number,
  available: number,
  attributes: Record<string, string | number | boolean>,
): Variant {
  return { id, sku, name, price_cents: priceCents, currency: USD, attributes, available };
}

export const mockProducts: MockProduct[] = [
  {
    slug: 'nano75',
    name: 'Nano75',
    type: 'keyboard',
    description:
      'A 75% gasket-mounted board with a CNC aluminum case and a flex-cut plate. Hot-swappable, quiet by design, and tuned for long typing sessions.',
    image: '/img/keyboards/nano75.svg',
    currency: USD,
    attributes: { layout: '75%', hot_swappable: true, mount: 'gasket', case: 'aluminum', connection: 'wired' },
    createdAt: '2026-06-18T09:00:00Z',
    variants: [
      v('v_nano75_red', 'NANO75-RED-PBTW', '75% / Red linear / White PBT', 12900, 12, { switch: 'red', keycaps: 'pbt-white' }),
      v('v_nano75_brn', 'NANO75-BRN-PBTC', '75% / Brown tactile / Charcoal PBT', 13400, 6, { switch: 'brown', keycaps: 'pbt-charcoal' }),
      v('v_nano75_slt', 'NANO75-SLT-PBTW', '75% / Silent linear / White PBT', 14200, 0, { switch: 'silent-red', keycaps: 'pbt-white' }),
    ],
  },
  {
    slug: 'nano-tkl',
    name: 'Nano TKL',
    type: 'keyboard',
    description:
      'Tenkeyless precision. A rigid top-mount plate for a crisp, consistent bottom-out, with PBT dye-sub legends that will not fade.',
    image: '/img/keyboards/nano-tkl.svg',
    currency: USD,
    attributes: { layout: 'TKL', hot_swappable: true, mount: 'top', case: 'aluminum', connection: 'wired' },
    createdAt: '2026-06-17T09:00:00Z',
    variants: [
      v('v_tkl_brn', 'NANOTKL-BRN-PBTC', 'TKL / Brown tactile / Charcoal PBT', 14900, 9, { switch: 'brown', keycaps: 'pbt-charcoal' }),
      v('v_tkl_red', 'NANOTKL-RED-PBTW', 'TKL / Red linear / White PBT', 14900, 3, { switch: 'red', keycaps: 'pbt-white' }),
    ],
  },
  {
    slug: 'nano60',
    name: 'Nano60',
    type: 'keyboard',
    description:
      'A compact 60% for minimalists. Wireless tri-mode, an internal battery for weeks of use, and a polycarbonate case for a softer sound profile.',
    image: '/img/keyboards/nano60.svg',
    currency: USD,
    attributes: { layout: '60%', hot_swappable: true, mount: 'gasket', case: 'polycarbonate', connection: 'wireless' },
    createdAt: '2026-06-16T09:00:00Z',
    variants: [
      v('v_60_red', 'NANO60-RED-PBTW', '60% / Red linear / White PBT', 10900, 21, { switch: 'red', keycaps: 'pbt-white' }),
      v('v_60_slt', 'NANO60-SLT-PBTC', '60% / Silent linear / Charcoal PBT', 11900, 4, { switch: 'silent-red', keycaps: 'pbt-charcoal' }),
    ],
  },
  {
    slug: 'nano-full',
    name: 'Nano Full',
    type: 'keyboard',
    description:
      'The full-size workhorse. Every key in reach, a south-facing PCB for clean shine-through, and a dense aluminum frame that stays put.',
    image: '/img/keyboards/nano-full.svg',
    currency: USD,
    attributes: { layout: 'full', hot_swappable: true, mount: 'gasket', case: 'aluminum', connection: 'wired', backlight: 'white' },
    createdAt: '2026-06-15T09:00:00Z',
    variants: [
      v('v_full_brn', 'NANOFULL-BRN-PBTC', 'Full / Brown tactile / Charcoal PBT', 16900, 7, { switch: 'brown', keycaps: 'pbt-charcoal' }),
      v('v_full_slt', 'NANOFULL-SLT-PBTW', 'Full / Silent linear / White PBT', 17900, 11, { switch: 'silent-red', keycaps: 'pbt-white' }),
    ],
  },
  {
    slug: 'nano65',
    name: 'Nano65',
    type: 'keyboard',
    description:
      'A 65% with a dedicated arrow cluster — the sweet spot between compact and complete. Gasket mount, hot-swap, and a satisfying typing thock.',
    image: '/img/keyboards/nano65.svg',
    currency: USD,
    attributes: { layout: '65%', hot_swappable: true, mount: 'gasket', case: 'aluminum', connection: 'wireless' },
    createdAt: '2026-06-14T09:00:00Z',
    variants: [
      v('v_65_red', 'NANO65-RED-PBTW', '65% / Red linear / White PBT', 11900, 15, { switch: 'red', keycaps: 'pbt-white' }),
      v('v_65_brn', 'NANO65-BRN-PBTC', '65% / Brown tactile / Charcoal PBT', 12400, 2, { switch: 'brown', keycaps: 'pbt-charcoal' }),
    ],
  },
  {
    slug: 'nano-split',
    name: 'Nano Split',
    type: 'keyboard',
    description:
      'A columnar split for ergonomic typists. Tent it, splay it, and remap every key. Two halves, one low-latency wireless link.',
    image: '/img/keyboards/nano-split.svg',
    currency: USD,
    attributes: { layout: 'split', hot_swappable: true, mount: 'tray', case: 'polycarbonate', connection: 'wireless' },
    createdAt: '2026-06-13T09:00:00Z',
    variants: [
      v('v_split_brn', 'NANOSPLIT-BRN-MX', 'Split / Brown tactile / Blank', 18900, 5, { switch: 'brown', keycaps: 'blank' }),
      v('v_split_red', 'NANOSPLIT-RED-MX', 'Split / Red linear / Blank', 18900, 0, { switch: 'red', keycaps: 'blank' }),
    ],
  },
  {
    slug: 'nano-1800',
    name: 'Nano 1800',
    type: 'keyboard',
    description:
      'The 1800 compact: a numpad without the footprint. Full-feature layout squeezed into a TKL-ish frame for spreadsheets and shortcuts alike.',
    image: '/img/keyboards/nano-1800.svg',
    currency: USD,
    attributes: { layout: '1800', hot_swappable: true, mount: 'gasket', case: 'aluminum', connection: 'wired' },
    createdAt: '2026-06-12T09:00:00Z',
    variants: [
      v('v_1800_brn', 'NANO1800-BRN-PBTC', '1800 / Brown tactile / Charcoal PBT', 15900, 8, { switch: 'brown', keycaps: 'pbt-charcoal' }),
    ],
  },
  {
    slug: 'nano-numpad',
    name: 'Nano Numpad',
    type: 'keyboard',
    description:
      'A standalone hot-swap numpad. Pair it with a TKL, drop it on either side, and keep your data entry fast and tactile.',
    image: '/img/keyboards/nano-numpad.svg',
    currency: USD,
    attributes: { layout: 'numpad', hot_swappable: true, mount: 'tray', case: 'aluminum', connection: 'wireless' },
    createdAt: '2026-06-11T09:00:00Z',
    variants: [
      v('v_num_red', 'NANONUM-RED-PBTW', 'Numpad / Red linear / White PBT', 6900, 30, { switch: 'red', keycaps: 'pbt-white' }),
      v('v_num_brn', 'NANONUM-BRN-PBTC', 'Numpad / Brown tactile / Charcoal PBT', 6900, 18, { switch: 'brown', keycaps: 'pbt-charcoal' }),
    ],
  },
  {
    slug: 'pbt-bento',
    name: 'Bento PBT Keycaps',
    type: 'keycaps',
    description:
      'A cohesive PBT dye-sub set in warm neutrals with a single amber accent row. Cherry profile, shine-resistant, fits standard layouts.',
    image: '/img/keyboards/pbt-bento.svg',
    currency: USD,
    attributes: { profile: 'cherry', material: 'PBT', legends: 'dye-sub', compatibility: 'mx' },
    createdAt: '2026-06-10T09:00:00Z',
    variants: [
      v('v_bento_base', 'KC-BENTO-BASE', 'Base kit (140 keys)', 8900, 14, { kit: 'base' }),
      v('v_bento_full', 'KC-BENTO-FULL', 'Base + extras (172 keys)', 10900, 6, { kit: 'full' }),
    ],
  },
  {
    slug: 'gmk-dusk',
    name: 'Dusk Keycaps',
    type: 'keycaps',
    description:
      'A cool indigo-to-slate gradient set with steel-blue modifiers. Doubleshot ABS, OSA profile, built to last through years of bottom-outs.',
    image: '/img/keyboards/gmk-dusk.svg',
    currency: USD,
    attributes: { profile: 'osa', material: 'ABS', legends: 'doubleshot', compatibility: 'mx' },
    createdAt: '2026-06-09T09:00:00Z',
    variants: [
      v('v_dusk_base', 'KC-DUSK-BASE', 'Base kit (132 keys)', 11900, 9, { kit: 'base' }),
    ],
  },
  {
    slug: 'nano-linear-red',
    name: 'Nano Linear Red Switches',
    type: 'switches',
    description:
      'Smooth, factory-lubed linear switches with a 45g actuation. A 70-pack for a full keyboard with spares. Plate-mount, MX-compatible.',
    image: '/img/keyboards/nano-linear-red.svg',
    currency: USD,
    attributes: { type: 'linear', actuation_g: 45, lubed: true, mount: 'plate', pack: 70 },
    createdAt: '2026-06-08T09:00:00Z',
    variants: [
      v('v_red_70', 'SW-RED-70', 'Red linear · 70 pack', 3500, 50, { pack: 70 }),
      v('v_red_110', 'SW-RED-110', 'Red linear · 110 pack', 5200, 22, { pack: 110 }),
    ],
  },
  {
    slug: 'nano-tactile-brown',
    name: 'Nano Tactile Brown Switches',
    type: 'switches',
    description:
      'A gentle tactile bump at 55g for typists who want feedback without the click. Factory-lubed, MX-compatible, sold in a 70-pack.',
    image: '/img/keyboards/nano-tactile-brown.svg',
    currency: USD,
    attributes: { type: 'tactile', actuation_g: 55, lubed: true, mount: 'plate', pack: 70 },
    createdAt: '2026-06-07T09:00:00Z',
    variants: [
      v('v_brn_70', 'SW-BRN-70', 'Brown tactile · 70 pack', 3700, 40, { pack: 70 }),
    ],
  },
];

export function priceFromCents(product: MockProduct): number {
  return Math.min(...product.variants.map((variant) => variant.price_cents));
}

export function toListItem(product: MockProduct): ProductListItem {
  return {
    slug: product.slug,
    name: product.name,
    type: product.type,
    price_from_cents: priceFromCents(product),
    currency: product.currency,
    attributes: product.attributes,
    image: product.image,
  };
}

export function toDetail(product: MockProduct): ProductDetail {
  return {
    slug: product.slug,
    name: product.name,
    description: product.description,
    type: product.type,
    attributes: product.attributes,
    variants: product.variants,
  };
}
