'use client';

import type { AssetView, ShootView } from '@nova/shared';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  TriangleAlert,
  Users,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Segmented, Tooltip } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useFocusFilter } from '@/features/shell/use-focus';
import { useCan } from '@/features/shell/user-context';
import { date, dateTime, time, titleCase, weekday } from '@/lib/format';
import { useSchedule } from '@/lib/queries';
import { shootTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { ShootCalendar, type CalendarView } from './calendar-views';
import { NewShootDialog } from './new-shoot-dialog';
import { StudiosPanel } from './studios-panel';

const DAYS = 21;
const DAY = 86400000;
/** The window starts two days before today, so today is always column 2. */
const TODAY_INDEX = 2;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The three-week window, `weeks` weeks away from the one around today. */
function windowStart(weeks: number) {
  const d = startOfToday();
  d.setDate(d.getDate() - TODAY_INDEX + weeks * 7);
  return d;
}

export function ScheduleLens() {
  const [view, setView] = useState<'board' | CalendarView>('week');
  const canSchedule = useCan('schedule:write');
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Calendar view"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'timeline', label: 'Timeline' },
            { value: 'board', label: 'Call sheets & equipment' },
          ]}
        />
        {canSchedule && view !== 'board' ? (
          <Button variant="primary" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus /> Schedule a shoot
          </Button>
        ) : null}
      </div>
      {view === 'board' ? <ResourceBoard /> : <ShootCalendar view={view} />}
      {view !== 'board' ? <StudiosPanel /> : null}
      <NewShootDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

/** Three-week window of call sheets with the equipment grid (the original resources view). */
function ResourceBoard() {
  /** Weeks the window is shifted from today (0 = the window around today). */
  const [weeks, setWeeks] = useState(0);
  const from = useMemo(() => windowStart(weeks), [weeks]);
  const to = useMemo(() => {
    const d = new Date(from);
    d.setDate(d.getDate() + DAYS);
    return d;
  }, [from]);
  const q = useSchedule(from.toISOString(), to.toISOString());
  const [creating, setCreating] = useState(false);
  const canSchedule = useCan('schedule:write');
  const { matchesProjectId } = useFocusFilter();
  const inspect = useWorkspace((s) => s.inspect);

  const shoots = (q.data?.shoots ?? []).filter((s) => matchesProjectId(s.projectId));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Schedule window">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Earlier weeks"
            onClick={() => setWeeks((w) => w - 2)}
          >
            <ChevronLeft />
          </Button>
          <Button size="sm" disabled={weeks === 0} onClick={() => setWeeks(0)}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Later weeks"
            onClick={() => setWeeks((w) => w + 2)}
          >
            <ChevronRight />
          </Button>
        </div>
        <p className="text-sm text-text-2" aria-live="polite">
          {date(from)} – {date(new Date(to.getTime() - DAY))} · shoots, crew calls and equipment
          bookings
        </p>
        {canSchedule ? (
          <Button variant="primary" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus /> Schedule a shoot
          </Button>
        ) : null}
      </div>

      {q.data && q.data.conflicts.length > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-critical-line bg-critical-soft px-3 py-2"
        >
          {q.data.conflicts.map((c) => (
            <p key={c.bookingIds.join()} className="flex items-center gap-2 text-sm text-critical">
              <TriangleAlert className="size-4 shrink-0" />
              <span>
                <button
                  type="button"
                  className="font-medium underline-offset-4 hover:underline"
                  onClick={() =>
                    inspect({
                      type: c.resourceType === 'asset' ? 'asset' : 'member',
                      id: c.resourceId,
                    })
                  }
                >
                  {c.resourceName}
                </button>{' '}
                is double-booked on{' '}
                {date(c.at, { weekday: 'short', day: 'numeric', month: 'short' })}. Open either
                shoot to swap or release it.
              </span>
            </p>
          ))}
        </div>
      ) : null}

      <Panel eyebrow="Call sheets" title="Shoots">
        <PanelState
          query={q}
          skeleton="block"
          isEmpty={shoots.length === 0}
          empty={{
            title: 'No shoots in this window.',
            body: 'Schedule one to book crew and equipment.',
          }}
        >
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {shoots.map((s) => (
              <ShootCard key={s.id} shoot={s} />
            ))}
          </ul>
        </PanelState>
      </Panel>

      <Panel eyebrow="Availability" title="Equipment" bodyClassName="px-0 pb-2">
        <PanelState query={q} skeleton="block">
          {q.data ? (
            <EquipmentGrid assets={q.data.assets} from={from} matchesProjectId={matchesProjectId} />
          ) : null}
        </PanelState>
      </Panel>
      <StudiosPanel />
      <NewShootDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function ShootCard({ shoot: s }: { shoot: ShootView }) {
  const inspect = useWorkspace((st) => st.inspect);
  const conflicted = s.conflicts.length > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => inspect({ type: 'shoot', id: s.id })}
        className={cn(
          'flex w-full gap-3 rounded-[var(--radius-md)] border bg-surface-2 p-3 text-left transition-colors hover:border-line-strong',
          conflicted ? 'border-critical-line' : 'border-line',
          // A cancelled shoot is set back with a dashed outline, not by fading its text
          // below a readable contrast.
          s.status === 'CANCELLED' && 'border-dashed bg-transparent',
        )}
      >
        <div className="w-12 shrink-0 text-center">
          <p className="font-mono text-[10px] uppercase text-text-3">{weekday(s.startsAt)}</p>
          <p className="font-mono text-xl leading-6">{date(s.startsAt, { day: '2-digit' })}</p>
          <p className="font-mono text-[10px] text-text-3">
            {date(s.startsAt, { month: 'short' })}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold">{s.title}</p>
            <Badge tone={shootTone[s.status]}>{titleCase(s.status)}</Badge>
          </div>
          <p className="truncate text-xs text-text-3">
            {s.project.code} · {s.project.title}
          </p>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-text-2">
            <MapPin className="size-3 shrink-0" /> {s.location}
          </p>
          <p className="mt-1 font-mono text-2xs text-text-3">
            Call {s.callTime ?? time(s.startsAt)} · {time(s.startsAt)}–{time(s.endsAt)}
            {new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime() > DAY
              ? ` (to ${date(s.endsAt)})`
              : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-2xs text-text-3">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" /> {s.crew.length} crew
            </span>
            <span className="inline-flex items-center gap-1">
              <Camera className="size-3" /> {s.bookings.length} items
            </span>
            {conflicted ? (
              <span className="inline-flex items-center gap-1 text-critical">
                <TriangleAlert className="size-3" /> {s.conflicts.length} conflict
                {s.conflicts.length > 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

/** Rows = equipment, columns = days. Booked cells are filled; overlapping bookings are hatched red. */
function EquipmentGrid({
  assets,
  from,
  matchesProjectId,
}: {
  assets: AssetView[];
  from: Date;
  matchesProjectId: (id: string | null | undefined) => boolean;
}) {
  const inspect = useWorkspace((s) => s.inspect);
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = startOfToday().getTime();
  const todayIdx = days.findIndex((d) => d.getTime() === today);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-36 bg-surface-1 px-4 py-1 text-left sm:w-56"
            >
              <span className="eyebrow">Item</span>
            </th>
            {days.map((d, i) => (
              <th
                key={i}
                scope="col"
                className={cn(
                  'px-0 py-1 text-center font-mono text-[10px] font-normal',
                  i === todayIdx ? 'text-signal' : 'text-text-3',
                )}
              >
                <span className="block">{weekday(d).slice(0, 2)}</span>
                <span className="block">{date(d, { day: '2-digit' })}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id} className="group">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-surface-1 px-4 py-0.5 text-left font-normal group-hover:bg-surface-2"
              >
                <button
                  type="button"
                  onClick={() => inspect({ type: 'asset', id: a.id })}
                  className="flex w-full items-center gap-1.5 truncate text-left text-text-2 hover:text-text"
                >
                  {a.status === 'MAINTENANCE' ? (
                    <Wrench
                      className="size-3 shrink-0 text-attention"
                      aria-label="In maintenance"
                    />
                  ) : null}
                  <span className="truncate">{a.name}</span>
                </button>
              </th>
              {days.map((d, i) => {
                const dayStart = d.getTime();
                const dayEnd = dayStart + DAY;
                const hits = a.bookings.filter(
                  (b) =>
                    new Date(b.startsAt).getTime() < dayEnd &&
                    new Date(b.endsAt).getTime() > dayStart,
                );
                const conflict = hits.some((b) => b.conflict) && hits.length > 1;
                const dim = hits.length > 0 && !hits.some((b) => matchesProjectId(b.project?.id));
                const label = hits
                  .map((b) => b.shoot?.title ?? b.project?.title ?? 'Booking')
                  .join(' + ');
                return (
                  <td
                    key={i}
                    className={cn(
                      'h-6 border-l border-line/40 p-0.5',
                      i === todayIdx && 'bg-signal-soft/40',
                    )}
                  >
                    {a.status === 'MAINTENANCE' ? (
                      <span
                        className="block h-full rounded-sm bg-[repeating-linear-gradient(135deg,var(--attention-soft)_0_3px,transparent_3px_6px)]"
                        title="Maintenance"
                      />
                    ) : hits.length > 0 ? (
                      <Tooltip content={`${label} · ${dateTime(hits[0]!.startsAt)}`}>
                        <button
                          type="button"
                          onClick={() =>
                            hits[0]!.shoot
                              ? inspect({ type: 'shoot', id: hits[0]!.shoot.id })
                              : hits[0]!.project &&
                                inspect({ type: 'project', id: hits[0]!.project.id })
                          }
                          aria-label={`${a.name}: ${label}${conflict ? ' (conflict)' : ''}`}
                          className={cn(
                            'block h-full w-full rounded-sm',
                            conflict
                              ? 'bg-[repeating-linear-gradient(135deg,var(--critical)_0_3px,var(--critical-soft)_3px_6px)]'
                              : hits[0]!.shoot
                                ? 'bg-info/70 hover:bg-info'
                                : 'bg-cat-3/60 hover:bg-cat-3',
                            dim && 'opacity-30',
                          )}
                        />
                      </Tooltip>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-4 px-4 pt-2 text-2xs text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-info/70" /> Shoot booking
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-cat-3/60" /> Post-production
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,var(--critical)_0_2px,var(--critical-soft)_2px_4px)]" />{' '}
          Double-booked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,var(--attention-soft)_0_2px,transparent_2px_4px)] ring-1 ring-attention-line" />{' '}
          Maintenance
        </span>
      </div>
    </div>
  );
}
