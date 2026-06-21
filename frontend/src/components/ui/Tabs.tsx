import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  ariaLabel: string;
  defaultTab?: string;
  className?: string;
}

/** WAI-ARIA tabs: roving tabindex, Arrow/Home/End navigation, aria-controls. */
export function Tabs({ tabs, ariaLabel, defaultTab, className }: TabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    let next = -1;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === -1) return;
    event.preventDefault();
    setActive(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-line">
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
                selected
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-soft hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="pt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive"
        >
          {tab.id === active && tab.content}
        </div>
      ))}
    </div>
  );
}
