'use client';

import type { ShootDaySummary } from '@nova/shared';
import { SHOOT_STATUS_LABELS } from '@nova/shared';
import { AlertTriangle, ArrowRight, Clock, Info, MapPin, Siren, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Meter } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { Stat, StatRow, dayLabel, useAttentionTarget } from '@/features/studio/ui';
import { ago, date, time } from '@/lib/format';
import { useCommandCenter } from '@/lib/queries';
import { shootTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';

const sevIcon = {
  critical: <Siren className="size-4 text-critical" aria-hidden />,
  warning: <AlertTriangle className="size-4 text-attention" aria-hidden />,
  info: <Info className="size-4 text-info" aria-hidden />,
};

/**
 * Studio command centre: what needs action now, what is shooting today, who and what is free,
 * and where work is piling up. Every figure opens the screen where it is dealt with.
 */
export function CommandCenter() {
  const q = useCommandCenter();
  const go = useAttentionTarget();
  const setLens = useWorkspace((s) => s.setLens);
  const d = q.data;

  return (
    <div className="flex flex-col gap-4">
      <PanelState query={q} skeleton="block">
        {d ? (
          <>
            <StatRow>
              <Stat
                label="Active projects"
                value={d.counts.activeProjects}
                hint={`${d.counts.projectsAtRisk} at risk`}
                tone={d.counts.projectsAtRisk ? 'attention' : 'neutral'}
                onClick={() => setLens('productions')}
              />
              <Stat
                label="Shoots today"
                value={d.today.length}
                hint={`${d.upcoming.length} in the next 14 days`}
                tone="info"
                onClick={() => setLens('shootday')}
              />
              <Stat
                label="Overdue tasks"
                value={d.counts.overdueTasks}
                hint={`${d.counts.blockedTasks} blocked`}
                tone={d.counts.overdueTasks ? 'critical' : 'neutral'}
                onClick={() => setLens('tasks')}
              />
              <Stat
                label="Client approvals"
                value={d.counts.pendingClientApprovals}
                hint={`${d.counts.overdueReviews} overdue · ${d.counts.revisionRequests} revisions`}
                tone={d.counts.overdueReviews ? 'attention' : 'neutral'}
                onClick={() => setLens('post')}
              />
              <Stat
                label="Script approvals"
                value={d.counts.pendingScriptApprovals}
                hint="waiting on review"
                tone={d.counts.pendingScriptApprovals ? 'attention' : 'neutral'}
                onClick={() => setLens('scripts')}
              />
              <Stat
                label="Messages to review"
                value={d.counts.messagesAwaitingReview}
                hint="prepared by automation"
                tone={d.counts.messagesAwaitingReview ? 'info' : 'neutral'}
                onClick={() => setLens('comms')}
              />
            </StatRow>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <Panel
                eyebrow="Act now"
                title="Attention required"
                className="border-critical-line/60"
              >
                {d.attention.length === 0 ? (
                  <p className="py-4 text-sm text-text-2">
                    Nothing needs immediate action. Every shoot, review and task is on track.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {d.attention.map((a, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => go(a.target)}
                          className={cn(
                            'flex w-full items-start gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2 text-left transition-colors hover:bg-surface-3',
                            a.severity === 'critical'
                              ? 'border-critical-line bg-critical-soft/40'
                              : a.severity === 'warning'
                                ? 'border-attention-line/70 bg-surface-2'
                                : 'border-line bg-surface-2',
                          )}
                        >
                          <span className="mt-0.5 shrink-0">{sevIcon[a.severity]}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{a.title}</span>
                            <span className="block truncate text-xs text-text-3">{a.detail}</span>
                          </span>
                          <ArrowRight className="mt-1 size-3.5 shrink-0 text-text-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                eyebrow={date(d.generatedAt, { weekday: 'long', day: 'numeric', month: 'long' })}
                title="Shooting today"
                action={
                  <button
                    type="button"
                    className="text-xs text-text-3 hover:text-text"
                    onClick={() => setLens('shootday')}
                  >
                    Shoot day →
                  </button>
                }
              >
                {d.today.length === 0 ? (
                  <p className="py-4 text-sm text-text-2">
                    No shoot today.
                    {d.upcoming[0]
                      ? ` Next: ${d.upcoming[0].title}, ${dayLabel(d.upcoming[0].startsAt.slice(0, 10))}.`
                      : ''}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {d.today.map((s) => (
                      <ShootRow key={s.id} s={s} />
                    ))}
                  </ul>
                )}
                {d.simultaneous.length ? (
                  <div className="mt-3 rounded-[var(--radius-sm)] border border-info-line bg-info-soft px-3 py-2 text-xs text-info">
                    <p className="font-medium">Simultaneous shoots</p>
                    {d.simultaneous.slice(0, 4).map((x) => (
                      <p key={x.date}>
                        {dayLabel(x.date)}: {x.shoots.map((s) => s.title).join(' · ')}
                      </p>
                    ))}
                  </div>
                ) : null}
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Panel eyebrow="Today" title="Studio availability">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <Avail
                    label="Crew on shoots"
                    value={`${d.availability.crewOnShoots} / ${d.availability.crewTotal}`}
                  />
                  <Avail label="Crew on leave" value={d.availability.crewOnLeave} />
                  <Avail label="Artists booked" value={d.availability.talentBooked} />
                  <Avail
                    label="Equipment out"
                    value={`${d.availability.equipmentOut} / ${d.availability.equipmentTotal}`}
                  />
                  <Avail label="In maintenance" value={d.availability.equipmentMaintenance} />
                  <Avail
                    label="Studios booked"
                    value={`${d.availability.studiosBooked} / ${d.availability.studiosTotal}`}
                  />
                </dl>
                <button
                  type="button"
                  onClick={() => setLens('reports')}
                  className="mt-3 text-xs text-text-3 hover:text-text"
                >
                  Capacity planning →
                </button>
              </Panel>
              <Panel eyebrow="Pipeline" title="Projects by stage">
                <ul className="flex flex-col gap-1.5">
                  {d.byStage.map((s) => {
                    const max = Math.max(1, ...d.byStage.map((x) => x.count));
                    return (
                      <li key={s.key} className="flex items-center gap-2 text-xs">
                        <span className="w-24 shrink-0 text-text-2">{s.label}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className="block h-full rounded-full bg-info"
                            style={{ width: `${(s.count / max) * 100}%` }}
                          />
                        </span>
                        <span className="w-5 text-right font-mono">{s.count}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-2xs text-text-3">
                  The longest bar with few exits is the bottleneck; see the attention queue below.
                </p>
              </Panel>
              <Panel eyebrow="Next 14 days" title="Deadlines">
                {d.deadlines.length === 0 ? (
                  <p className="text-sm text-text-2">No delivery due in the next two weeks.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {d.deadlines.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => go({ kind: 'inspect', type: 'project', id: p.id })}
                          className="w-full text-left"
                        >
                          <span className="flex justify-between gap-2 text-sm">
                            <span className="truncate">{p.title}</span>
                            <span
                              className={cn(
                                'shrink-0 font-mono text-xs',
                                p.daysLeft < 0
                                  ? 'text-critical'
                                  : p.daysLeft <= 3
                                    ? 'text-attention'
                                    : 'text-text-3',
                              )}
                            >
                              {p.daysLeft < 0 ? `${-p.daysLeft}d late` : `${p.daysLeft}d`}
                            </span>
                          </span>
                          <Meter
                            value={p.progress}
                            tone={p.daysLeft < 0 ? 'critical' : 'signal'}
                            className="mt-1"
                            label={`${p.title} progress`}
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel
                eyebrow="Today"
                title="Studio activity"
                action={
                  <button
                    type="button"
                    className="text-xs text-text-3 hover:text-text"
                    onClick={() => setLens('activity')}
                  >
                    All →
                  </button>
                }
              >
                {d.activityToday.length === 0 ? (
                  <p className="text-sm text-text-2">No changes recorded yet today.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {d.activityToday.slice(0, 7).map((a) => (
                      <li key={a.id} className="text-xs">
                        <span className="text-text-2">{a.summary}</span>
                        <span className="ml-1 font-mono text-[10px] text-text-3">
                          {ago(a.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        ) : null}
      </PanelState>
    </div>
  );
}

function Avail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs text-text-3">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

function ShootRow({ s }: { s: ShootDaySummary }) {
  const openShootDay = useWorkspace((st) => st.openShootDay);
  return (
    <li>
      <button
        type="button"
        onClick={() => openShootDay(s.id)}
        className="flex w-full flex-col gap-1 rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-left hover:border-line-strong"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{s.title}</span>
            <span className="block truncate text-2xs text-text-3">
              {s.project.code} · {s.project.title}
              {s.day.of > 1 ? ` · Day ${s.day.day} of ${s.day.of}` : ''}
            </span>
          </span>
          <Badge tone={shootTone[s.status]}>{SHOOT_STATUS_LABELS[s.status]}</Badge>
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-text-3">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> Call {s.callTime ?? time(s.startsAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" /> {s.location}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" /> {s.crew} crew · {s.talent} artists
          </span>
          {s.openIssues ? (
            <span className="text-critical">{s.openIssues} open issue(s)</span>
          ) : null}
          {s.delayMinutes ? (
            <span className="text-attention">{s.delayMinutes} min delay</span>
          ) : null}
        </span>
        {s.scenesToday ? (
          <span className="flex items-center gap-2 text-2xs text-text-3">
            <Meter value={s.scenesShot / s.scenesToday} label="Scenes shot" />
            <span className="shrink-0 font-mono">
              {s.scenesShot}/{s.scenesToday} scenes
            </span>
          </span>
        ) : null}
      </button>
    </li>
  );
}
