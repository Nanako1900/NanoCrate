import { useId } from 'react';

/**
 * Lightweight, dependency-free SVG charts that are part of the design system:
 * token-driven colors (currentColor + Tailwind text-*), monospace axes, hairline
 * grid, and theme-adaptive (everything resolves through CSS variables). Code is
 * shipped inside the dashboard chunk, so it never weighs on first paint.
 */

const W = 640;
const H = 200;
const PAD = { top: 16, right: 12, bottom: 26, left: 12 };

export interface TrendPoint {
  date: string;
  value: number;
}

export function LineChart({ data, label }: { data: TrendPoint[]; label: string }) {
  const gradId = useId();
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;
  const gridLines = [0, 0.5, 1].map((t) => PAD.top + innerH - t * innerH);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" className="text-interactive" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" className="text-interactive" />
        </linearGradient>
      </defs>
      {gridLines.map((gy, i) => (
        <line key={i} x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} className="text-line" stroke="currentColor" strokeWidth={1} strokeDasharray="2 4" />
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} className="text-interactive" stroke="currentColor" strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) =>
        i % 3 === 0 ? (
          <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-faint font-mono" fontSize={10}>
            {d.date.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({ data, label }: { data: BarDatum[]; label: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const barW = Math.min(slot * 0.5, 48);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const cx = PAD.left + slot * i + slot / 2;
        return (
          <g key={d.label}>
            <rect x={cx - barW / 2} y={PAD.top + innerH - h} width={barW} height={h} rx={3} className="text-accent" fill="currentColor" />
            <text x={cx} y={PAD.top + innerH - h - 5} textAnchor="middle" className="fill-ink-soft font-mono" fontSize={10}>
              {d.value}
            </text>
            <text x={cx} y={H - 8} textAnchor="middle" className="fill-ink-faint font-mono" fontSize={9}>
              {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
