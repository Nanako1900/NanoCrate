import type { AttributeSchema } from '@/services/admin-types';

/**
 * attribute_schema per product type — the source of the ★ dynamic attribute
 * form. §9.5 fields are lean { name, type, required?, options? }; `label`/`help`/
 * `unit` here are OPTIONAL frontend display hints (Simplified Chinese for the
 * zh-CN admin). A live backend may omit them, in which case the form derives a
 * label from `name`. `name`/`options`/values stay as stored data (English).
 *
 * Options here mirror the storefront fixtures (fixtures/products.ts) so seeded
 * products validate against their own type. The live backend's migration-0007
 * seed may use a leaner set / different casing (e.g. 'tkl' vs 'TKL'); reconcile
 * the option sets with §9.5 when wiring live — flagged, not changed unilaterally.
 */
export const ADMIN_ATTRIBUTE_SCHEMAS: Record<string, AttributeSchema> = {
  keyboard: {
    fields: [
      { name: 'layout', label: '布局', type: 'select', required: true, options: ['60%', '65%', '75%', 'TKL', 'full', '1800', 'split', 'numpad'] },
      { name: 'mount', label: '定位结构', type: 'select', required: true, options: ['gasket', 'top', 'tray'] },
      { name: 'case', label: '外壳', type: 'select', required: false, options: ['aluminum', 'polycarbonate'] },
      { name: 'connection', label: '连接', type: 'select', required: true, options: ['wired', 'wireless'] },
      { name: 'hot_swappable', label: '热插拔', type: 'bool', required: false, help: '无需焊接即可更换轴体。' },
      { name: 'backlight', label: '背光', type: 'select', required: false, options: ['none', 'white', 'rgb'] },
    ],
  },
  keycaps: {
    fields: [
      { name: 'profile', label: '键帽高度', type: 'select', required: true, options: ['cherry', 'osa', 'sa', 'oem'] },
      { name: 'material', label: '材质', type: 'select', required: true, options: ['PBT', 'ABS'] },
      { name: 'legends', label: '字符工艺', type: 'select', required: false, options: ['dye-sub', 'doubleshot', 'blank'] },
      { name: 'compatibility', label: '兼容', type: 'select', required: true, options: ['mx', 'choc'] },
    ],
  },
  switches: {
    fields: [
      { name: 'type', label: '类型', type: 'select', required: true, options: ['linear', 'tactile', 'clicky'] },
      { name: 'actuation_g', label: '触发压力', type: 'number', required: true, unit: 'g', placeholder: '45' },
      { name: 'lubed', label: '出厂润滑', type: 'bool', required: false },
      { name: 'mount', label: '安装方式', type: 'select', required: false, options: ['plate', 'pcb'] },
      { name: 'pack', label: '数量', type: 'number', required: true, unit: '个', placeholder: '70' },
    ],
  },
};
