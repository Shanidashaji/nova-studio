'use client';

import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis } from 'recharts';
import { Panel } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { money, pct } from '@/lib/format';
import { useFinance } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { PanelLink } from './panel-link';

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });

/** Mixes the vermilion→amber ramp for bar `i` of `n`. */
const ramp = (i: number, n: number) =>
  `color-mix(in oklab, var(--brand) ${Math.round(100 - (i / Math.max(1, n - 1)) * 100)}%, var(--brand-2))`;

/** Monthly income bars (demo finance) with last month's revenue, expenses and margin. */
export function BusinessGlance({ className }: { className?: string }) {
  const canRead = useCan('finance:read');
  const finance = useFinance(canRead);
  const setLens = useWorkspace((s) => s.setLens);

  const months = finance.data?.months ?? [];
  const rows = months.map((m) => ({ label: monthLabel(m.month), income: m.income }));
  const last = months.at(-1);
  const prev = months.at(-2);
  const change = (a?: number, b?: number) => (a !== undefined && b ? (a - b) / b : null);
  const margin = last && last.income > 0 ? (last.income - last.expenses) / last.income : null;

  return (
    <Panel
      icon={<BarChart3 />}
      title="Business Insights"
      eyebrow={canRead ? 'Demo data' : undefined}
      className={className}
      action={canRead ? <PanelLink onClick={() => setLens('business')}>Open</PanelLink> : null}
    >
      {canRead && rows.length && last ? (
        <div className="flex items-end gap-4">
          <div
            className="h-28 min-w-0 flex-1"
            role="img"
            aria-label={`Monthly income, last ${rows.length} months`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                barCategoryGap="22%"
              >
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9, fill: 'var(--text-3)' }}
                  interval={0}
                  height={14}
                />
                <RTooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  contentStyle={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: 'var(--text)',
                  }}
                  labelStyle={{ color: 'var(--text-2)' }}
                  formatter={(v) => [money(Number(v)), 'Income']}
                />
                <Bar dataKey="income" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {rows.map((r, i) => (
                    <Cell key={r.label + i} fill={ramp(i, rows.length)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <dl className="flex w-[104px] shrink-0 flex-col gap-2.5">
            <Stat
              label="Revenue"
              value={money(last.income)}
              delta={change(last.income, prev?.income)}
            />
            <Stat
              label="Expenses"
              value={money(last.expenses)}
              delta={change(last.expenses, prev?.expenses)}
              invert
            />
            <Stat label="Profitability" value={margin === null ? '—' : pct(margin)} />
          </dl>
        </div>
      ) : (
        <p className="pt-6 text-xs text-text-3">
          {canRead
            ? finance.isError
              ? 'Finance data could not load.'
              : 'Loading finance…'
            : 'Finance is not part of your role.'}
        </p>
      )}
    </Panel>
  );
}

function Stat({
  label,
  value,
  delta,
  invert,
}: {
  label: string;
  value: string;
  delta?: number | null;
  /** For costs, a rise is not good news. */
  invert?: boolean;
}) {
  const good = delta !== null && delta !== undefined && (invert ? delta <= 0 : delta >= 0);
  return (
    <div className="min-w-0">
      <dd className="truncate text-base font-bold leading-5 tabular tracking-tight text-text">
        {value}
      </dd>
      <dt className="flex items-center gap-1 text-[10px] text-text-3">
        {label}
        {delta !== null && delta !== undefined ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5',
              good ? 'text-signal' : 'text-critical',
            )}
            title="Against the month before"
          >
            {delta >= 0 ? (
              <TrendingUp className="size-3" aria-hidden />
            ) : (
              <TrendingDown className="size-3" aria-hidden />
            )}
            {pct(Math.abs(delta))}
          </span>
        ) : null}
      </dt>
    </div>
  );
}
