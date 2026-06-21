import { formatAttributeKey, formatAttributeValue } from '@/lib/format';

interface SpecListProps {
  attributes: Record<string, string | number | boolean>;
}

/** Spec-sheet attribute table — the mono-typed technical voice of the design. */
export function SpecList({ attributes }: SpecListProps) {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return null;

  return (
    <dl className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt className="label-mono">{formatAttributeKey(key)}</dt>
          <dd className="font-mono text-sm tabular-nums text-ink">{formatAttributeValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
