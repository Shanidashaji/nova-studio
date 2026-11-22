'use client';

import { SHOOT_STATUS_LABELS, type ShootView } from '@nova/shared';
import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel, PanelState } from '@/components/ui/panel';
import { useFocusFilter } from '@/features/shell/use-focus';
import { time } from '@/lib/format';
import { useSchedule } from '@/lib/queries';
import { shootTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';

export type CalendarView = 'day' | 'week' | 'month' | 'timeline';
const DAY = 86_400_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const touches = (s: ShootView, day: Date) =>
  new Date(s.startsAt) < addDays(day, 1) && new Date(s.endsAt) > startOfDay(day);

const statusBar: Record<ShootView['status'], string> = {
  PLANNED: 'bg-info-soft text-info border-info-line',
  CONFIRMED: 'bg-signal-soft text-signal border-signal-line',
  IN_PROGRESS: 'bg-attention-soft text-attention border-attention-line',
  WRAPPED: 'bg-surface-3 text-text-2 border-line',
  CANCELLED: 'bg-transparent text-text-3 border-dashed border-line line-through',
};

/** Day, week, month and timeline views of every shoot (multi-day shoots span their days). */
export function ShootCalendar({ view }: { view: CalendarView }) {
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const { from, to, days } = useMemo(() => {
    if (view === 'day') return { from: anchor, to: addDays(anchor, 1), days: [anchor] };
    if (view === 'week') {
      const m = mondayOf(anchor);
      return {
        from: m,
        to: addDays(m, 7),
        days: Array.from({ length: 7 }, (_, i) => addDays(m, i)),
      };
    }
    if (view === 'month') {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const start = mondayOf(first);
      return {
        from: start,
        to: addDays(start, 42),
        days: Array.from({ length: 42 }, (_, i) => addDays(start, i)),
      };
    }
    const start = addDays(anchor, -3);
    return {
      from: start,
      to: addDays(start, 28),
      days: Array.from({ length: 28 }, (_, i) => addDays(start, i)),
    };
  }, [view, anchor]);
  const q = useSchedule(from.toISOString(), to.toISOString());
  const { matchesProjectId } = useFocusFilter();
  const shoots = (q.data?.shoots ?? []).filter((s) => matchesProjectId(s.projectId));
  const step = view === 'day' ? 1 : view === 'week' ? 7 : view === 'month' ? 30 : 14;
  const move = (dir: number) =>
    setAnchor((a) =>
      view === 'month' ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * step),
    );
  const label =
    view === 'day'
      ? anchor.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : view === 'month'
        ? anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        : `${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${addDays(to, -1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;

  return (
    <Panel
      title={label}
      action={
        <span className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Earlier" onClick={() => move(-1)}>
            <ChevronLeft />
          </Button>
          <Button size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>
            Today
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Later" onClick={() => move(1)}>
            <ChevronRight />
          </Button>
        </span>
      }
    >
      <PanelState query={q} skeleton="block">
        {view === 'day' ? <DayView day={anchor} shoots={shoots} /> : null}
        {view === 'week' ? <WeekView days={days} shoots={shoots} /> : null}
        {view === 'month' ? (
          <MonthView
            days={days}
            month={anchor.getMonth()}
            shoots={shoots}
            onPick={(d) => setAnchor(d)}
          />
        ) : null}
        {view === 'timeline' ? <Timeline days={days} shoots={shoots} /> : null}
        <Legend />
      </PanelState>
    </Panel>
  );
}

function ShootChip({ s, compact }: { s: ShootView; compact?: boolean }) {
  const inspect = useWorkspace((st) => st.inspect);
  return (
    <button
      type="button"
      onClick={() => inspect({ type: 'shoot', id: s.id })}
      title={`${s.title} · ${s.project.title} · ${SHOOT_STATUS_LABELS[s.status]}${s.conflicts.length ? ' · has conflicts' : ''}`}
      className={cn(
        'block w-full truncate rounded border px-1.5 text-left text-[11px] leading-5',
        statusBar[s.status],
        s.conflicts.length && 'ring-1 ring-critical',
      )}
    >
      {s.conflicts.length ? (
        <TriangleAlert className="mr-0.5 inline size-3 text-critical" aria-label="Conflict" />
      ) : null}
      {compact ? s.title : `${time(s.startsAt)} ${s.title}`}
    </button>
  );
}

function DayView({ day, shoots }: { day: Date; shoots: ShootView[] }) {
  const inspect = useWorkspace((st) => st.inspect);
  const openShootDay = useWorkspace((st) => st.openShootDay);
  const list = shoots.filter((s) => touches(s, day));
  if (list.length === 0) return <p className="py-6 text-sm text-text-2">No shoot on this day.</p>;
  const hours = Array.from({ length: 18 }, (_, i) => i + 5); // 05:00–22:00
  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[560px]" style={{ height: hours.length * 32 + 24 }}>
        {hours.map((h, i) => (
          <div
            key={h}
            className="absolute inset-x-0 border-t border-line/60 text-[10px] text-text-3"
            style={{ top: 24 + i * 32 }}
          >
            <span className="absolute -top-2 left-0 bg-surface-1 pr-1 font-mono">
              {String(h).padStart(2, '0')}:00
            </span>
          </div>
        ))}
        {list.map((s, idx) => {
          const start = Math.max(new Date(s.startsAt).getTime(), day.getTime() + 5 * 3600_000);
          const end = Math.min(new Date(s.endsAt).getTime(), day.getTime() + 23 * 3600_000);
          const top = 24 + ((start - day.getTime()) / 3600_000 - 5) * 32;
          const height = Math.max(28, ((end - start) / 3600_000) * 32);
          const width = `calc((100% - 48px) / ${list.length})`;
          return (
            <div
              key={s.id}
              className={cn(
                'absolute overflow-hidden rounded-[var(--radius-sm)] border p-1.5 text-xs',
                statusBar[s.status],
              )}
              style={{ top, height, left: `calc(48px + ${idx} * ${width})`, width }}
            >
              <button
                type="button"
                className="block w-full text-left font-medium hover:underline"
                onClick={() => inspect({ type: 'shoot', id: s.id })}
              >
                {s.title}
              </button>
              <p className="truncate text-[10px] opacity-80">
                {s.project.code} · {s.location}
              </p>
              <p className="text-[10px] opacity-80">
                {time(s.startsAt)}–{time(s.endsAt)} · {s.crew.length} crew · {s.talent.length}{' '}
                artists
              </p>
              <button
                type="button"
                className="mt-0.5 text-[10px] underline"
                onClick={() => openShootDay(s.id)}
              >
                Shoot day →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ days, shoots }: { days: Date[]; shoots: ShootView[] }) {
  const today = new Date();
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((d) => {
        const list = shoots.filter((s) => touches(s, d));
        return (
          <section
            key={d.toISOString()}
            aria-label={d.toDateString()}
            className={cn(
              'min-h-24 rounded-[var(--radius-sm)] border p-1.5',
              sameDay(d, today)
                ? 'border-signal-line bg-signal-soft/30'
                : 'border-line bg-surface-2',
            )}
          >
            <h3 className="mb-1 flex items-baseline justify-between text-2xs text-text-3">
              <span>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
              <span className="font-mono text-sm text-text">{d.getDate()}</span>
            </h3>
            <div className="flex flex-col gap-1">
              {list.map((s) => (
                <ShootChip key={s.id} s={s} />
              ))}
              {list.length > 1 ? (
                <Badge tone="info" dot={false} className="self-start">
                  {list.length} simultaneous
                </Badge>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MonthView({
  days,
  month,
  shoots,
  onPick,
}: {
  days: Date[];
  month: number;
  shoots: ShootView[];
  onPick: (d: Date) => void;
}) {
  const today = new Date();
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-sm)] border border-line bg-line">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <div key={d} className="bg-surface-2 py-1 text-center text-2xs text-text-3">
          {d}
        </div>
      ))}
      {days.map((d) => {
        const list = shoots.filter((s) => touches(s, d));
        return (
          <div
            key={d.toISOString()}
            className={cn(
              'min-h-16 bg-surface-1 p-1 sm:min-h-24',
              d.getMonth() !== month && 'bg-surface-2',
            )}
          >
            <button
              type="button"
              onClick={() => onPick(d)}
              className={cn(
                'font-mono text-[10px] hover:underline',
                sameDay(d, today)
                  ? 'font-bold text-signal'
                  : d.getMonth() !== month
                    ? 'text-text-3'
                    : 'text-text-2',
              )}
            >
              {d.getDate()}
            </button>
            <div className="mt-0.5 flex flex-col gap-0.5">
              {list.slice(0, 3).map((s) => (
                <ShootChip key={s.id} s={s} compact />
              ))}
              {list.length > 3 ? (
                <span className="text-[10px] text-text-3">+{list.length - 3}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Timeline({ days, shoots }: { days: Date[]; shoots: ShootView[] }) {
  const inspect = useWorkspace((st) => st.inspect);
  const start = days[0]!.getTime();
  const span = days.length * DAY;
  const rows = [...shoots].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const [today] = useState(() => Date.now());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div
          className="ml-48 grid"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className={cn(
                'border-l border-line/50 text-center font-mono text-[9px]',
                sameDay(d, new Date()) ? 'text-signal' : 'text-text-3',
              )}
            >
              {d.toLocaleDateString('en-IN', { weekday: 'narrow' })}
              <br />
              {d.getDate()}
            </div>
          ))}
        </div>
        <ul className="mt-1 flex flex-col gap-1">
          {rows.map((s) => {
            const left = Math.max(0, (new Date(s.startsAt).getTime() - start) / span);
            const right = Math.min(1, (new Date(s.endsAt).getTime() - start) / span);
            return (
              <li key={s.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => inspect({ type: 'shoot', id: s.id })}
                  className="w-48 shrink-0 truncate pr-2 text-left text-xs hover:underline"
                >
                  <span className="font-mono text-[10px] text-text-3">{s.project.code}</span>{' '}
                  {s.title}
                </button>
                <div className="relative h-6 flex-1 rounded-sm bg-surface-2">
                  <span
                    className="absolute inset-y-0 w-px bg-signal"
                    style={{ left: `${((today - start) / span) * 100}%` }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => inspect({ type: 'shoot', id: s.id })}
                    aria-label={`${s.title}, ${SHOOT_STATUS_LABELS[s.status]}`}
                    className={cn(
                      'absolute inset-y-0.5 rounded border px-1 text-left text-[10px]',
                      statusBar[s.status],
                      s.conflicts.length && 'ring-1 ring-critical',
                    )}
                    style={{
                      left: `${left * 100}%`,
                      width: `${Math.max(1.5, (right - left) * 100)}%`,
                    }}
                  >
                    <span className="truncate">{s.dayCount > 1 ? `${s.dayCount} days` : ''}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {rows.length === 0 ? (
          <p className="py-6 text-sm text-text-2">No shoots in this window.</p>
        ) : null}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-2xs text-text-3">
      {(['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'WRAPPED'] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-sm border', statusBar[s])} />{' '}
          {SHOOT_STATUS_LABELS[s]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm ring-1 ring-critical" /> Has a double booking
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Badge tone={shootTone.CONFIRMED} dot={false}>
          n simultaneous
        </Badge>
      </span>
    </div>
  );
}
