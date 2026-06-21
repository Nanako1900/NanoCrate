import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useTheme } from '@/components/theme/ThemeContext';
import { apiMode } from '@/lib/env';
import { cn } from '@/lib/cn';
import type { ThemePreference } from '@/lib/theme';

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: '跟随系统', hint: '跟随系统设置' },
  { value: 'light', label: '浅色', hint: '暖纸色' },
  { value: 'dark', label: '深色', hint: '暖炭色' },
];

function SettingsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AdminSettingsPage() {
  const { preference, setPreference } = useTheme();

  return (
    <>
      <AdminPageHeader
        breadcrumbs={[{ label: '后台', to: '/admin' }, { label: '设置' }]}
        title="设置"
        description="本设备的控制台偏好。"
      />
      <div className="grid max-w-2xl gap-5">
        <SettingsCard title="外观" description="主题偏好仅存于本设备 — 绝不存储会话令牌。">
          <fieldset>
            <legend className="sr-only">主题</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="主题">
              {THEME_OPTIONS.map((opt) => {
                const selected = preference === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPreference(opt.value)}
                    className={cn(
                      'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
                      selected ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface hover:border-line-strong',
                    )}
                  >
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-2xs text-ink-faint">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </SettingsCard>

        <SettingsCard title="环境" description="本控制台读写数据的位置。">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="label-mono normal-case text-ink-faint">API 模式</dt>
            <dd className="font-mono text-ink">{apiMode}</dd>
            <dt className="label-mono normal-case text-ink-faint">契约</dt>
            <dd className="font-mono text-ink">backend.md §9.5 (proposed)</dd>
          </dl>
        </SettingsCard>
      </div>
    </>
  );
}
