'use client';

import type { AttentionAction, ReadinessItem } from '@nova/shared';
import { CircleAlert, CircleCheck, CircleDashed, CircleMinus } from 'lucide-react';
import type { Tone } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useWorkspace, type InspectType, type Lens } from '@/store/workspace';

/** A compact figure with a label, for the top of a lens. Click to act on it. */
export function Stat({
  label,
  value,
  tone = 'neutral',
  hint,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  hint?: string;
  onClick?: () => void;
}) {
  const color: Record<Tone, string> = {
    neutral: 'text-text',
    signal: 'text-signal',
    attention: 'text-attention',
    critical: 'text-critical',
    info: 'text-info',
    ai: 'text-ai',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col items-start rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2 text-left',
        onClick && 'transition-colors hover:border-line-strong hover:bg-surface-3',
      )}
    >
      <span className={cn('font-mono text-xl leading-7', color[tone])}>{value}</span>
      <span className="truncate text-2xs text-text-2">{label}</span>
      {hint ? <span className="truncate text-[10px] text-text-3">{hint}</span> : null}
    </Tag>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{children}</div>;
}

const statusIcon = {
  done: <CircleCheck className="size-4 text-signal" aria-label="Done" />,
  missing: <CircleAlert className="size-4 text-critical" aria-label="Missing" />,
  warning: <CircleDashed className="size-4 text-attention" aria-label="Needs attention" />,
  na: <CircleMinus className="size-4 text-text-3" aria-label="Not applicable" />,
};

/** Checklist of readiness items (done / missing / warning), blocking ones marked. */
export function ReadinessList({
  items,
  onItem,
}: {
  items: (Pick<ReadinessItem, 'key' | 'label' | 'status' | 'detail'> & { blocking?: boolean })[];
  onItem?: (key: string) => void;
}) {
  return (
    <ul className="flex flex-col divide-y divide-line/60">
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            disabled={!onItem}
            onClick={() => onItem?.(i.key)}
            className="flex w-full items-start gap-2.5 py-2 text-left enabled:hover:bg-surface-2 disabled:cursor-default"
          >
            <span className="mt-0.5 shrink-0">{statusIcon[i.status]}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm">
                {i.label}
                {i.blocking && i.status === 'missing' ? (
                  <span className="rounded bg-critical-soft px-1 text-[10px] font-medium text-critical">
                    Blocks confirmation
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-text-3">{i.detail}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Goes wherever an attention item points: a lens, an inspector or the shoot-day screen. */
export function useAttentionTarget() {
  const setLens = useWorkspace((s) => s.setLens);
  const inspect = useWorkspace((s) => s.inspect);
  const openShootDay = useWorkspace((s) => s.openShootDay);
  return (t: AttentionAction['target'] | null) => {
    if (!t) return;
    if (t.kind === 'lens') setLens(t.lens as Lens);
    else if (t.kind === 'shoot-day') openShootDay(t.shootId);
    else inspect({ type: t.type as InspectType, id: t.id });
  };
}

export const minutes = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;

/** `YYYY-MM-DD` of today in India Standard Time (the studio's day). */
export function istToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export function dayLabel(key: string) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Simple tab strip with ARIA tab semantics. */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string; badge?: number }[];
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="scrollbar-none flex gap-1 overflow-x-auto border-b border-line"
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm pointer-coarse:h-11',
            value === t.value
              ? 'border-text font-medium text-text'
              : 'border-transparent text-text-3 hover:text-text',
          )}
        >
          {t.label}
          {t.badge ? (
            <span className="rounded-full bg-surface-3 px-1.5 font-mono text-[10px] text-text-2">
              {t.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Notice that a figure or feature is rule-based, simulated or demo data. */
export function Honesty({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'attention';
}) {
  return (
    <p
      className={cn(
        'rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs',
        tone === 'info'
          ? 'border-info-line bg-info-soft text-info'
          : 'border-attention-line bg-attention-soft text-attention',
      )}
    >
      {children}
    </p>
  );
}

/** Comma-separated list ↔ array helpers for simple tag inputs. */
export const listToText = (a: string[]) => a.join(', ');
export const textToList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Field errors of a VALIDATION_FAILED response, keyed by field path ({} for other errors). */
export function fieldErrors(e: { code: string; details?: unknown }): Record<string, string> {
  if (e.code !== 'VALIDATION_FAILED' || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as { path: string; message: string }[])
    if (!out[d.path]) out[d.path] = d.message;
  return out;
}
