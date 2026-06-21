import type { AttributeSchema } from '@/services/admin-types';

/**
 * attribute_schema per product type — the source of the ★ dynamic attribute
 * form. Mirrors the attribute keys used in fixtures/products.ts so seeded
 * products validate against their own type. In live mode this comes from
 * product_type.attribute_schema (JSONB), per backend.md §7 / SPEC §5.
 */
export const ADMIN_ATTRIBUTE_SCHEMAS: Record<string, AttributeSchema> = {
  keyboard: {
    fields: [
      { name: 'layout', label: 'Layout', type: 'select', required: true, options: ['60%', '65%', '75%', 'TKL', 'full', '1800', 'split', 'numpad'] },
      { name: 'mount', label: 'Mount', type: 'select', required: true, options: ['gasket', 'top', 'tray'] },
      { name: 'case', label: 'Case', type: 'select', required: false, options: ['aluminum', 'polycarbonate'] },
      { name: 'connection', label: 'Connection', type: 'select', required: true, options: ['wired', 'wireless'] },
      { name: 'hot_swappable', label: 'Hot-swappable', type: 'bool', required: false, help: 'Switches can be swapped without soldering.' },
      { name: 'backlight', label: 'Backlight', type: 'select', required: false, options: ['none', 'white', 'rgb'] },
    ],
  },
  keycaps: {
    fields: [
      { name: 'profile', label: 'Profile', type: 'select', required: true, options: ['cherry', 'osa', 'sa', 'oem'] },
      { name: 'material', label: 'Material', type: 'select', required: true, options: ['PBT', 'ABS'] },
      { name: 'legends', label: 'Legends', type: 'select', required: false, options: ['dye-sub', 'doubleshot', 'blank'] },
      { name: 'compatibility', label: 'Compatibility', type: 'select', required: true, options: ['mx', 'choc'] },
    ],
  },
  switches: {
    fields: [
      { name: 'type', label: 'Type', type: 'select', required: true, options: ['linear', 'tactile', 'clicky'] },
      { name: 'actuation_g', label: 'Actuation force', type: 'number', required: true, unit: 'g', placeholder: '45' },
      { name: 'lubed', label: 'Factory lubed', type: 'bool', required: false },
      { name: 'mount', label: 'Mount', type: 'select', required: false, options: ['plate', 'pcb'] },
      { name: 'pack', label: 'Pack size', type: 'number', required: true, unit: 'pcs', placeholder: '70' },
    ],
  },
};
