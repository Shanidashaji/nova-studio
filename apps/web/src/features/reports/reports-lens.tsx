'use client';

import type { CapacityView, ReportsView } from '@nova/shared';
import { TALENT_KIND_LABELS } from '@nova/shared';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Meter, Segmented } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { Honesty, Stat, StatRow, Tabs, dayLabel } from '@/features/studio/ui';
import { date, money, pct } from '@/lib/format';
import { useCapacity, useReports } from '@/lib/queries';
import { utilTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';

const axis = {
  stroke: 'var(--line-strong)',
  fontSize: 11,
  tick: { fill: 'var(--text-3)' },
  tickLine: false,
};
const grid = { stroke: 'var(--line)', strokeDasharray: '0', vertical: false };
const tooltipStyle = {
  contentStyle: {
    background: 'var(--surface-2)',
    border: '1px solid var(--line-strong)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text)',
  },
  labelStyle: { color: 'var(--text-2)' },
  itemStyle: { color: 'var(--text)' },
  cursor: { fill: 'var(--surface-3)', opacity: 0.5 },
};

/** Capacity planning and studio reports. */
export function ReportsLens() {
  const [tab, setTab] = useState<'capacity' | 'reports'>('capacity');
  return (
    <div className="flex flex-col gap-3">
      <Tabs
        label="Reports"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'capacity', label: 'Capacity planning' },
          { value: 'reports', label: 'Reports' },
        ]}
      />
      {tab === 'capacity' ? <Capacity /> : <Reports />}
    </div>
  );
}

function Capacity() {
  const [days, setDays] = useState<'14' | '28' | '56'>('28');
  const q = useCapacity({ days });
  const openShootDay = useWorkspace((s) => s.openShootDay);
  const inspect = useWorkspace((s) => s.inspect);
  return (
    <PanelState query={q} skeleton="block">
      {q.data ? (
        <div className="flex flex-col gap-3">
          <Verdict c={q.data} />
          <div className="flex items-center gap-2">
            <Segmented
              label="Horizon"
              value={days}
              onChange={setDays}
              options={[
                { value: '14', label: '2 weeks' },
                { value: '28', label: '4 weeks' },
                { value: '56', label: '8 weeks' },
              ]}
            />
          </div>
          <StatRow>
            <Stat
              label="Shoots at once (max)"
              value={q.data.shootCapacity.value}
              hint={`limited by ${q.data.shootCapacity.limitedBy}`}
            />
            <Stat
              label="Peak in window"
              value={q.data.peakConcurrent.count}
              hint={q.data.peakConcurrent.date ? dayLabel(q.data.peakConcurrent.date) : '—'}
              tone={
                q.data.peakConcurrent.count >= q.data.shootCapacity.value ? 'attention' : 'neutral'
              }
            />
            <Stat
              label="Overlapping shoots"
              value={q.data.overlaps.length}
              tone={q.data.overlaps.length ? 'info' : 'neutral'}
            />
            <Stat
              label="Resource conflicts"
              value={q.data.conflicts}
              tone={q.data.conflicts ? 'critical' : 'signal'}
            />
            <Stat
              label="Crew / artists"
              value={`${q.data.totals.crew} / ${q.data.totals.talent}`}
            />
            <Stat
              label="Equipment available"
              value={`${q.data.totals.equipment - q.data.totals.equipmentInMaintenance}`}
              hint={`${q.data.totals.equipmentInMaintenance} in maintenance`}
            />
          </StatRow>
          <Panel title="Daily load" eyebrow="Shoots per day against how many the studio can run">
            <div className="overflow-x-auto">
              <div
                className="flex min-w-[640px] items-end gap-1"
                role="list"
                aria-label="Shoots per day"
              >
                {q.data.days.map((d) => {
                  const over = d.shoots.length > d.shootCapacity;
                  const full = d.shoots.length === d.shootCapacity && d.shoots.length > 0;
                  return (
                    <div
                      key={d.date}
                      role="listitem"
                      className="flex flex-1 flex-col items-center gap-1"
                      title={`${dayLabel(d.date)}: ${d.shoots.length} shoot(s), capacity ${d.shootCapacity}; ${d.crewBooked} crew, ${d.talentBooked} artists, ${d.equipmentBooked} items booked`}
                    >
                      <div className="flex h-24 w-full flex-col-reverse gap-px rounded-sm bg-surface-2">
                        {d.shoots.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => openShootDay(s.id)}
                            aria-label={`${s.title} on ${dayLabel(d.date)}`}
                            className={cn(
                              'w-full flex-1 rounded-sm',
                              over ? 'bg-critical' : full ? 'bg-attention' : 'bg-info',
                            )}
                            style={{ maxHeight: `${100 / Math.max(3, d.shootCapacity)}%` }}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-[9px] text-text-3">{d.date.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-2 text-2xs text-text-3">
              Blue: room left · Amber: at capacity · Red: more shoots than directors, camera
              operators or camera bodies available that day. Tap a block to open the shoot.
            </p>
          </Panel>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="Team workload" eyebrow="Estimated hours vs capacity, per week">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={q.data.workload.map((w) => ({
                      week: date(w.weekStart),
                      hours: w.hours,
                      capacity: w.capacity,
                    }))}
                    margin={{ left: -16, right: 8, top: 8 }}
                  >
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="week" {...axis} />
                    <YAxis {...axis} />
                    <RTooltip {...tooltipStyle} />
                    <Bar
                      dataKey="capacity"
                      name="Capacity (h)"
                      fill="var(--cat-3)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="hours"
                      name="Booked (h)"
                      fill="var(--cat-1)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Overlapping shoots" eyebrow="Running at the same time">
              {q.data.overlaps.length === 0 ? (
                <p className="text-sm text-text-2">No shoots overlap in this window.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {q.data.overlaps.map((o) => (
                    <li key={`${o.a.id}${o.b.id}`} className="flex flex-wrap items-center gap-1">
                      <span className="font-mono text-xs text-text-3">{dayLabel(o.date)}</span>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => openShootDay(o.a.id)}
                      >
                        {o.a.title}
                      </button>
                      <span className="text-text-3">+</span>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => openShootDay(o.b.id)}
                      >
                        {o.b.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              title="Crew"
              eyebrow="Shoot days in window · utilisation this week"
              bodyClassName="px-0"
            >
              <ul className="divide-y divide-line/60">
                {q.data.crew.map((c) => (
                  <li key={c.member.id}>
                    <button
                      type="button"
                      onClick={() => inspect({ type: 'member', id: c.member.id })}
                      className="flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {c.member.name}{' '}
                        <span className="text-2xs text-text-3">{c.member.title}</span>
                      </span>
                      <span className="font-mono text-xs">{c.shootDays}d</span>
                      <Badge tone={utilTone[c.band]}>{pct(c.utilisation)}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Artists booked" eyebrow="Shoot days in window" bodyClassName="px-0">
              {q.data.talent.length === 0 ? (
                <p className="px-4 text-sm text-text-2">No artist bookings in this window.</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {q.data.talent.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => inspect({ type: 'talent', id: t.id })}
                        className="flex w-full items-center gap-3 px-4 py-1.5 text-left text-sm hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {t.name}{' '}
                          <span className="text-2xs text-text-3">{TALENT_KIND_LABELS[t.kind]}</span>
                        </span>
                        <span className="font-mono text-xs">{t.bookedDays}d</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      ) : null}
    </PanelState>
  );
}

function Verdict({ c }: { c: CapacityView }) {
  const v = c.verdict;
  return (
    <div
      className={cn(
        'flex gap-3 rounded-[var(--radius-md)] border p-4',
        v.canTakeMore
          ? 'border-signal-line bg-signal-soft'
          : 'border-attention-line bg-attention-soft',
      )}
    >
      {v.canTakeMore ? (
        <CheckCircle2 className="size-6 shrink-0 text-signal" aria-hidden />
      ) : (
        <XCircle className="size-6 shrink-0 text-attention" aria-hidden />
      )}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-text-2">
          Can the studio take another project?
        </p>
        <p
          className={cn('text-lg font-semibold', v.canTakeMore ? 'text-signal' : 'text-attention')}
        >
          {v.headline}
        </p>
        <ul className="mt-1 list-disc pl-4 text-xs text-text-2">
          {v.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-1 text-2xs text-text-3">
          Rule-based estimate from shoot capacity (directors, camera operators, camera bodies,
          leave) and task hours — not a forecast model.
        </p>
      </div>
    </div>
  );
}

function Reports() {
  const q = useReports();
  const inspect = useWorkspace((s) => s.inspect);
  return (
    <PanelState query={q} skeleton="block">
      {q.data ? <ReportBody r={q.data} inspect={(id) => inspect({ type: 'project', id })} /> : null}
    </PanelState>
  );
}

function ReportBody({ r, inspect }: { r: ReportsView; inspect: (id: string) => void }) {
  const exportCsv = () => {
    const rows = [
      ['Code', 'Project', 'Client', 'Status', 'Progress %', 'Health', 'Due'],
      ...r.projects.performance.map((p) => [
        p.code,
        p.title,
        p.client,
        p.status,
        String(Math.round(p.progress * 100)),
        String(p.health),
        p.dueDate.slice(0, 10),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `nova-project-report-${r.generatedAt.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="flex flex-col gap-3">
      <Honesty>{r.dataNote}</Honesty>
      <StatRow>
        <Stat label="Active projects" value={r.projects.active} />
        <Stat
          label="Delivered"
          value={r.projects.delivered}
          hint={
            r.projects.onTimeRate !== null ? `${pct(r.projects.onTimeRate)} on time` : undefined
          }
          tone="signal"
        />
        <Stat
          label="Delayed"
          value={r.projects.delayed.length}
          tone={r.projects.delayed.length ? 'critical' : 'neutral'}
        />
        <Stat
          label="Shoots (12 weeks)"
          value={r.shoots.total}
          hint={`${r.shoots.wrapped} wrapped`}
        />
        <Stat
          label="Delay on set"
          value={`${Math.round(r.shoots.delayMinutes / 60)}h`}
          hint={`${r.shoots.issues} issues logged`}
        />
        <Stat
          label="Revision rounds"
          value={r.revisions.rounds}
          hint={`${r.revisions.averageRounds.toFixed(1)} per deliverable · ${r.revisions.beyondScope} beyond scope`}
          tone={r.revisions.beyondScope ? 'attention' : 'neutral'}
        />
      </StatRow>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Shoot utilisation" eyebrow="Shoot days per week (8 weeks back, 4 ahead)">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={r.shoots.weeks.map((w) => ({
                  week: date(w.weekStart),
                  days: w.shootDays,
                  shoots: w.shoots,
                }))}
                margin={{ left: -16, right: 8, top: 8 }}
              >
                <CartesianGrid {...grid} />
                <XAxis dataKey="week" {...axis} interval={1} />
                <YAxis {...axis} allowDecimals={false} />
                <RTooltip {...tooltipStyle} />
                <Bar dataKey="days" name="Shoot days" fill="var(--cat-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Production progress" eyebrow="Active projects by stage">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.projects.byStage} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <RTooltip {...tooltipStyle} />
                <Bar dataKey="count" name="Projects" fill="var(--cat-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <Panel
        title="Project performance"
        eyebrow="Progress, health and due date"
        bodyClassName="px-0"
        action={
          <Button size="sm" onClick={exportCsv}>
            Export CSV
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left">
                {['Project', 'Client', 'Progress', 'Health', 'Due', 'Status'].map((h) => (
                  <th key={h} scope="col" className="eyebrow px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.projects.performance.map((p) => (
                <tr key={p.id} className="border-t border-line/60">
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <button type="button" className="hover:underline" onClick={() => inspect(p.id)}>
                      {p.code} · {p.title}
                    </button>
                  </th>
                  <td className="px-4 py-2 text-xs text-text-2">{p.client}</td>
                  <td className="w-32 px-4 py-2">
                    <Meter value={p.progress} label={`${p.title} progress`} />
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2 font-mono text-xs',
                      p.health < 50
                        ? 'text-critical'
                        : p.health < 75
                          ? 'text-attention'
                          : 'text-signal',
                    )}
                  >
                    {p.health}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{date(p.dueDate)}</td>
                  <td className="px-4 py-2 text-xs">{p.status.toLowerCase().replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Delayed projects">
          {r.projects.delayed.length === 0 ? (
            <p className="text-sm text-text-2">No active project is past its due date.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {r.projects.delayed.map((p) => (
                <li key={p.id}>
                  <button type="button" className="hover:underline" onClick={() => inspect(p.id)}>
                    {p.title}
                  </button>{' '}
                  <span className="text-critical">{p.daysLate} days late</span>{' '}
                  <span className="text-2xs text-text-3">{p.stage}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Upcoming deliveries" eyebrow="Next 30 days">
          {r.projects.upcomingDeliveries.length === 0 ? (
            <p className="text-sm text-text-2">Nothing due in the next 30 days.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {r.projects.upcomingDeliveries.map((p) => (
                <li key={p.id}>
                  <button type="button" className="w-full text-left" onClick={() => inspect(p.id)}>
                    <span className="flex justify-between text-sm">
                      <span className="truncate">{p.title}</span>
                      <span className="font-mono text-xs">{date(p.dueDate)}</span>
                    </span>
                    <Meter value={p.progress} label={`${p.title} progress`} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {r.budget ? (
          <Panel
            title="Budget performance"
            eyebrow="Estimate vs actual (approved + paid)"
            bodyClassName="px-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left">
                    {['Project', 'Estimate', 'Actual', 'Variance', 'Used'].map((h) => (
                      <th key={h} scope="col" className="eyebrow px-4 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.budget.map((b) => (
                    <tr key={b.id} className="border-t border-line/60">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={() => inspect(b.id)}
                        >
                          {b.code} · {b.title}
                        </button>
                      </th>
                      <td className="px-4 py-1.5 font-mono text-xs">{money(b.estimated)}</td>
                      <td className="px-4 py-1.5 font-mono text-xs">{money(b.actual)}</td>
                      <td
                        className={cn(
                          'px-4 py-1.5 font-mono text-xs',
                          b.variance > 0 ? 'text-critical' : 'text-signal',
                        )}
                      >
                        {b.variance > 0 ? '+' : ''}
                        {money(b.variance)}
                      </td>
                      <td className="px-4 py-1.5 font-mono text-xs">{pct(b.utilisation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}
        <Panel title="Revisions" eyebrow="Feedback by source">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-2xs text-text-3">Client notes</dt>
              <dd className="font-mono">{r.revisions.clientFeedback}</dd>
            </div>
            <div>
              <dt className="text-2xs text-text-3">Internal notes</dt>
              <dd className="font-mono">{r.revisions.internalFeedback}</dd>
            </div>
            <div>
              <dt className="text-2xs text-text-3">Deliverables</dt>
              <dd className="font-mono">{r.revisions.deliverables}</dd>
            </div>
            <div>
              <dt className="text-2xs text-text-3">Rounds beyond scope</dt>
              <dd className="font-mono">{r.revisions.beyondScope}</dd>
            </div>
          </dl>
        </Panel>
        <Panel
          title="Crew utilisation"
          eyebrow="Shoot days ±30 days · open tasks"
          bodyClassName="px-0"
        >
          <ul className="divide-y divide-line/60 text-sm">
            {r.crew.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-4 py-1.5">
                <span className="flex-1 truncate">
                  {c.name} <span className="text-2xs text-text-3">{c.title}</span>
                </span>
                <span className="font-mono text-xs">
                  {c.shootDays}d · {c.openTasks} tasks
                </span>
                <span className="w-12 text-right font-mono text-xs">{pct(c.utilisation)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Artist utilisation" bodyClassName="px-0">
          <ul className="divide-y divide-line/60 text-sm">
            {r.talent.slice(0, 12).map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-4 py-1.5">
                <span className="flex-1 truncate">
                  {t.name}{' '}
                  <span className="text-2xs text-text-3">{TALENT_KIND_LABELS[t.kind]}</span>
                </span>
                <span className="font-mono text-xs">
                  {t.bookings} bookings · {t.shootDays}d
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title="Client activity"
          eyebrow="Last 90 days"
          bodyClassName="px-0"
          className="lg:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left">
                  {[
                    'Client',
                    'Active',
                    'Completed',
                    'Interactions',
                    'Messages',
                    'Last contact',
                  ].map((h) => (
                    <th key={h} scope="col" className="eyebrow px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.clients.map((c) => (
                  <tr key={c.id} className="border-t border-line/60">
                    <th scope="row" className="px-4 py-1.5 text-left font-normal">
                      {c.name}
                    </th>
                    <td className="px-4 py-1.5 font-mono text-xs">{c.activeProjects}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">{c.completedProjects}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">{c.interactions90d}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">{c.messages90d}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">
                      {c.lastContact ? date(c.lastContact) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
