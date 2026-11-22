'use client';

import { Users } from 'lucide-react';
import { Panel, PanelState } from '@/components/ui/panel';
import { useTeam } from '@/lib/queries';
import { useWorkspace } from '@/store/workspace';
import { PanelLink } from './panel-link';

const GROUP_COLORS = ['#1f9d61', '#3b6fe0', '#e08a1e', '#e2462a'];

/**
 * This week's booked hours against capacity: one ring for the whole team, then the four largest
 * roles. Hours come from task estimates and shoot bookings in the live data.
 */
export function TeamCapacity({ className }: { className?: string }) {
  const q = useTeam();
  const setLens = useWorkspace((s) => s.setLens);

  const weeks = (q.data ?? []).flatMap((m) => (m.weeks[0] ? [{ m, w: m.weeks[0] }] : []));
  const hours = weeks.reduce((n, x) => n + x.w.hours, 0);
  const capacity = weeks.reduce((n, x) => n + x.w.capacity, 0);
  const overall = capacity > 0 ? hours / capacity : 0;

  const groups = new Map<string, { hours: number; capacity: number; people: number }>();
  for (const { m, w } of weeks) {
    const g = groups.get(m.title) ?? { hours: 0, capacity: 0, people: 0 };
    g.hours += w.hours;
    g.capacity += w.capacity;
    g.people += 1;
    groups.set(m.title, g);
  }
  const top = [...groups.entries()]
    .sort((a, b) => b[1].capacity - a[1].capacity)
    .slice(0, 4)
    .map(([title, g], i) => ({
      title,
      ratio: g.capacity ? g.hours / g.capacity : 0,
      people: g.people,
      color: GROUP_COLORS[i]!,
    }));

  return (
    <Panel
      icon={<Users />}
      title="Team Capacity"
      eyebrow="This week"
      className={className}
      action={<PanelLink onClick={() => setLens('people')}>View team</PanelLink>}
    >
      <PanelState query={q} isEmpty={weeks.length === 0} empty={{ title: 'No team yet.' }}>
        <div className="flex items-center gap-4">
          <Ring value={overall} />
          <ul className="flex min-w-0 flex-1 flex-col gap-2">
            {top.map((g) => (
              <li key={g.title} className="flex items-center gap-2 text-2xs">
                <span className="size-2 shrink-0 rounded-full" style={{ background: g.color }} />
                <span className="min-w-0 flex-1 truncate text-text-2" title={`${g.people} people`}>
                  {g.title}
                </span>
                <span className="font-mono tabular text-text">{Math.round(g.ratio * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </PanelState>
    </Panel>
  );
}

function Ring({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const pct = Math.round(value * 100);
  return (
    <div
      className="relative grid size-[92px] shrink-0 place-items-center"
      role="img"
      aria-label={`Team at ${pct}% of capacity this week`}
    >
      <svg viewBox="0 0 80 80" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--text)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
        />
      </svg>
      <div className="text-center leading-none">
        <p className="text-xl font-bold tabular tracking-tight text-text">{pct}%</p>
        <p className="mt-1 text-[9px] text-text-3">Overall</p>
      </div>
    </div>
  );
}
