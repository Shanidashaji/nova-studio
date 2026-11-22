'use client';

import { STUDIO_LOCATION_LABELS, type MemberView, type WorkloadWeek } from '@nova/shared';
import { Camera } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Segmented, Tooltip } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useFocusFilter } from '@/features/shell/use-focus';
import { date, relativeDay } from '@/lib/format';
import { useTeam } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { PeopleOpsPanel } from './people-ops-panel';

const BAND_CELL = {
  AVAILABLE: 'bg-info-soft text-info',
  BALANCED: 'bg-signal-soft text-signal',
  STRETCHED: 'bg-attention-soft text-attention',
  OVERLOADED: 'bg-critical-soft text-critical',
} as const;

/** Team workload as a heatmap over four rolling weeks, plus who is on which production. */
export function PeopleLens() {
  const q = useTeam();
  const [loc, setLoc] = useState<'ALL' | 'KOZHIKODE' | 'CHENNAI'>('ALL');
  const { focus, projectsById } = useFocusFilter();
  const inspect = useWorkspace((s) => s.inspect);

  const inFocus = (m: MemberView) => {
    if (!focus) return true;
    if (focus.type === 'member') return m.id === focus.id;
    return m.projects.some((p) => {
      const proj = projectsById.get(p.id);
      if (!proj) return false;
      return focus.type === 'stage'
        ? proj.stage?.key === focus.id
        : focus.type === 'client'
          ? proj.client.id === focus.id
          : proj.id === focus.id;
    });
  };
  const members = (q.data ?? []).filter(
    (m) => (loc === 'ALL' || m.baseLocation === loc) && inFocus(m),
  );
  const weeks = q.data?.[0]?.weeks ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-text-2">
          Estimated hours from open tasks and shoot days, against each person’s weekly capacity.
        </p>
        <div className="ml-auto">
          <Segmented
            label="Studio"
            value={loc}
            onChange={setLoc}
            options={[
              { value: 'ALL', label: 'Both studios' },
              { value: 'KOZHIKODE', label: 'Kozhikode' },
              { value: 'CHENNAI', label: 'Chennai' },
            ]}
          />
        </div>
      </div>

      <Panel eyebrow="Rolling 7-day windows" title="Workload" bodyClassName="px-0">
        <PanelState
          query={q}
          isEmpty={members.length === 0}
          empty={{ title: 'Nobody matches.', body: 'No team members match the current filters.' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="eyebrow px-4 py-2 font-medium">
                    Person
                  </th>
                  {weeks.map((w, i) => (
                    <th
                      key={w.weekStart}
                      scope="col"
                      className="eyebrow px-2 py-2 text-center font-medium"
                    >
                      {i === 0 ? 'Next 7 days' : `From ${date(w.weekStart)}`}
                    </th>
                  ))}
                  <th scope="col" className="eyebrow px-4 py-2 font-medium">
                    Productions
                  </th>
                  <th scope="col" className="eyebrow px-4 py-2 font-medium">
                    Next shoot
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-line/60 hover:bg-surface-2">
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <button
                        type="button"
                        onClick={() => inspect({ type: 'member', id: m.id })}
                        className="flex items-center gap-2.5 text-left"
                      >
                        <Avatar name={m.name} size={30} />
                        <span>
                          <span className="block font-medium text-text hover:underline">
                            {m.name}
                          </span>
                          <span className="block text-2xs text-text-3">
                            {m.title} · {STUDIO_LOCATION_LABELS[m.baseLocation]}
                          </span>
                        </span>
                      </button>
                    </th>
                    {m.weeks.map((w) => (
                      <td key={w.weekStart} className="px-1.5 py-2">
                        <WeekCell week={w} />
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      <div className="flex max-w-64 flex-wrap gap-1">
                        {m.projects.slice(0, 4).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => inspect({ type: 'project', id: p.id })}
                            className="rounded border border-line px-1.5 text-2xs text-text-2 hover:border-line-strong hover:text-text"
                          >
                            {p.title}
                          </button>
                        ))}
                        {m.projects.length > 4 ? (
                          <span className="text-2xs text-text-3">+{m.projects.length - 4}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-text-2">
                      {m.upcomingShoots[0] ? (
                        <button
                          type="button"
                          onClick={() => inspect({ type: 'shoot', id: m.upcomingShoots[0]!.id })}
                          className="inline-flex items-center gap-1 hover:text-text"
                        >
                          <Camera className="size-3 text-info" />{' '}
                          {relativeDay(m.upcomingShoots[0].startsAt)}
                        </button>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3 px-4 pt-3 text-2xs text-text-3">
            {(['AVAILABLE', 'BALANCED', 'STRETCHED', 'OVERLOADED'] as const).map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-sm', BAND_CELL[b])} />
                {b === 'AVAILABLE'
                  ? '< 40% available'
                  : b === 'BALANCED'
                    ? '40–85% balanced'
                    : b === 'STRETCHED'
                      ? '85–100% stretched'
                      : '> 100% overloaded'}
              </span>
            ))}
          </div>
        </PanelState>
      </Panel>
      <PeopleOpsPanel />
    </div>
  );
}

function WeekCell({ week }: { week: WorkloadWeek }) {
  return (
    <Tooltip content={`${week.hours}h of ${week.capacity}h capacity`}>
      <div
        className={cn(
          'mx-auto flex h-9 w-full min-w-20 flex-col items-center justify-center rounded-[var(--radius-sm)]',
          BAND_CELL[week.band],
        )}
      >
        <span className="font-mono text-sm tabular">{Math.round(week.ratio * 100)}%</span>
        <span className="font-mono text-[10px]">{week.hours}h</span>
      </div>
    </Tooltip>
  );
}
