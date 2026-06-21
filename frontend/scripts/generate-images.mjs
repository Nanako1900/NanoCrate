// Generates on-brand SVG product placeholders into public/img/keyboards/.
// Top-down keyboard "renders" tinted per product — deterministic, no external
// assets, explicit viewBox so <img width/height> avoids layout shift.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', 'public', 'img', 'keyboards');

const PAPER = '#f1ece1';
const PLATE = '#e7e0d2';
const INK = '#2b261f';

/** slug, display name, kicker label, accent (hex), keycap columns. */
const products = [
  ['nano75', 'Nano75', '75% · GASKET', '#e8913a', 15],
  ['nano-tkl', 'Nano TKL', 'TKL · TOP MOUNT', '#3f74b0', 17],
  ['nano60', 'Nano60', '60% · WIRELESS', '#cf5b4a', 14],
  ['nano-full', 'Nano Full', 'FULL · GASKET', '#5a9e6f', 20],
  ['nano65', 'Nano65', '65% · GASKET', '#3fa3a0', 15],
  ['nano-split', 'Nano Split', 'SPLIT · ERGO', '#8a6fb0', 12],
  ['nano-1800', 'Nano 1800', '1800 · COMPACT', '#6b7280', 18],
  ['nano-numpad', 'Nano Numpad', 'NUMPAD · HOT-SWAP', '#d98324', 4],
  ['pbt-bento', 'Bento PBT', 'KEYCAPS · CHERRY', '#caa46a', 12],
  ['gmk-dusk', 'Dusk', 'KEYCAPS · OSA', '#5b6bb0', 12],
  ['nano-linear-red', 'Linear Red', 'SWITCHES · LINEAR', '#cf5b4a', 10],
  ['nano-tactile-brown', 'Tactile Brown', 'SWITCHES · TACTILE', '#9c6b43', 10],
];

const W = 800;
const H = 600;

function keycaps(cols, accent) {
  const rows = 5;
  const pad = 90;
  const gap = 10;
  const gridW = W - pad * 2;
  const cell = (gridW - gap * (cols - 1)) / cols;
  const size = Math.min(cell, 46);
  const startX = pad;
  const startY = 250;
  let rects = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (size + gap);
      const y = startY + r * (size + gap);
      if (y + size > H - 70) continue;
      // scatter a few accent keycaps for visual rhythm
      const isAccent = (r * cols + c) % 11 === 0 || (r === rows - 1 && c === 0);
      const fill = isAccent ? accent : '#fbf8f1';
      rects += `<rect x="${x.toFixed(1)}" y="${y}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="6" fill="${fill}" stroke="${INK}" stroke-opacity="0.10"/>`;
    }
  }
  return rects;
}

function svg(name, kicker, accent, cols) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${name}">
  <defs>
    <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
      <path d="M 36 0 L 0 0 0 36" fill="none" stroke="${INK}" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect x="56" y="200" width="${W - 112}" height="${H - 270}" rx="22" fill="${PLATE}" stroke="${INK}" stroke-opacity="0.12"/>
  <rect x="56" y="200" width="8" height="${H - 270}" fill="${accent}"/>
  ${keycaps(cols, accent)}
  <text x="72" y="110" font-family="ui-sans-serif, system-ui, sans-serif" font-size="62" font-weight="700" fill="${INK}" letter-spacing="-1.5">${name}</text>
  <text x="74" y="150" font-family="ui-monospace, monospace" font-size="20" letter-spacing="3" fill="${INK}" fill-opacity="0.55">${kicker}</text>
  <text x="${W - 72}" y="110" text-anchor="end" font-family="ui-monospace, monospace" font-size="20" letter-spacing="2" fill="${accent}" font-weight="600">NANOCRATE</text>
</svg>
`;
}

await mkdir(OUT, { recursive: true });
await Promise.all(
  products.map(([slug, name, kicker, accent, cols]) =>
    writeFile(path.join(OUT, `${slug}.svg`), svg(name, kicker, accent, cols), 'utf8'),
  ),
);
console.log(`Generated ${products.length} placeholder images in ${OUT}`);
