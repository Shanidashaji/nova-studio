'use client';

import type { ProjectDetail } from '@nova/shared';
import { Camera, MapPin, Plus, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Meter } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { ActivityItem } from '@/features/activity/activity-item';
import { NewShootDialog } from '@/features/schedule/new-shoot-dialog';
import { useCan } from '@/features/shell/user-context';
import { date, money, pct, time, titleCase } from '@/lib/format';
import { useActivity } from '@/lib/queries';
import { shootTone } from '@/lib/status';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection, KeyValue } from '../inspector-router';

export function ProjectSchedule({ p }: { p: ProjectDetail }) {
  const inspect = useWorkspace((s) => s.inspect);
  const canSchedule = useCan('schedule:write');
  const [creating, setCreating] = useState(false);
  return (
    <InspectorSection
      title="Shoots"
      action={
        canSchedule && p.status === 'ACTIVE' ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> Shoot
          </Button>
        ) : null
      }
    >
      {p.shoots.length === 0 ? <p className="text-sm text-text-3">No shoots scheduled.</p> : null}
      <ul className="flex flex-col gap-2">
        {p.shoots.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => inspect({ type: 'shoot', id: s.id })}
              className="w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 p-2.5 text-left hover:border-line-strong"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Camera className="size-3.5 text-info" /> {s.title}
                </span>
                <Badge tone={shootTone[s.status]}>{titleCase(s.status)}</Badge>
              </span>
              <span className="mt-1 block font-mono text-2xs text-text-3">
                {date(s.startsAt, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                {time(s.startsAt)}–{time(s.endsAt)} · {s.crew.length} crew · {s.bookings.length}{' '}
                items
              </span>
              <span className="mt-0.5 flex items-center gap-1 truncate text-2xs text-text-3">
                <MapPin className="size-3" /> {s.location}
              </span>
              {s.conflicts.length > 0 ? (
                <span className="mt-1 flex items-center gap-1 text-2xs text-critical">
                  <TriangleAlert className="size-3" /> {s.conflicts[0]!.with}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <NewShootDialog open={creating} onOpenChange={setCreating} projectId={p.id} />
    </InspectorSection>
  );
}

export function ProjectBudget({ p }: { p: ProjectDetail }) {
  // The API withholds the figures from roles that may not see what a production costs.
  if (p.finance === null || p.budget === null || p.spent === null) {
    return (
      <InspectorSection title="Budget">
        <p className="text-sm text-text-3">Budget and spend are not shown for your role.</p>
      </InspectorSection>
    );
  }
  const { finance } = p;
  const burn = p.budget ? p.spent / p.budget : 0;
  const gap = burn - p.progress;
  return (
    <>
      <InspectorSection title="Budget · demo data">
        <KeyValue
          items={[
            ['Budget', money(p.budget, { exact: true })],
            ['Spent', `${money(finance.expenses, { exact: true })} (${pct(burn)})`],
            ['Invoiced', money(finance.income, { exact: true })],
            ['Progress', pct(p.progress)],
          ]}
        />
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-2xs text-text-3">
            <span className="w-16">Spent</span>
            <Meter value={burn} tone={gap > 0.15 ? 'attention' : 'info'} label="Budget spent" />
          </div>
          <div className="flex items-center gap-2 text-2xs text-text-3">
            <span className="w-16">Progress</span>
            <Meter value={p.progress} label="Progress" />
          </div>
        </div>
        <p className={gap > 0.15 ? 'mt-2 text-xs text-attention' : 'mt-2 text-xs text-text-3'}>
          {gap > 0.15
            ? `Spending is ${Math.round(gap * 100)} points ahead of progress — review crew and rental costs.`
            : 'Spending is in step with progress.'}
        </p>
      </InspectorSection>
      <InspectorSection title="Expenses by category">
        {finance.byCategory.length === 0 ? (
          <p className="text-sm text-text-3">No expenses recorded.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {[...finance.byCategory]
              .sort((a, b) => b.amount - a.amount)
              .map((c) => (
                <li key={c.category} className="flex items-center justify-between text-sm">
                  <span className="text-text-2">{titleCase(c.category)}</span>
                  <span className="font-mono text-xs">{money(c.amount, { exact: true })}</span>
                </li>
              ))}
          </ul>
        )}
      </InspectorSection>
    </>
  );
}

export function ProjectHistory({ p }: { p: ProjectDetail }) {
  const q = useActivity({ projectId: p.id });
  const items = q.data?.pages.flatMap((x) => x.items) ?? [];
  return (
    <InspectorSection title="Audit trail">
      <PanelState query={q} isEmpty={items.length === 0} empty={{ title: 'No history yet.' }}>
        <ol>
          {items.map((a) => (
            <ActivityItem key={a.id} activity={a} compact />
          ))}
        </ol>
        {q.hasNextPage ? (
          <Button
            size="sm"
            className="mt-2"
            onClick={() => q.fetchNextPage()}
            loading={q.isFetchingNextPage}
          >
            Older
          </Button>
        ) : null}
      </PanelState>
    </InspectorSection>
  );
}
