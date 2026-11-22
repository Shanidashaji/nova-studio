'use client';

import { CalendarRange, MapPin } from 'lucide-react';
import { Still } from '@/components/still';
import { Panel, PanelState } from '@/components/ui/panel';
import { useFocusFilter } from '@/features/shell/use-focus';
import { date, relativeDay, time, weekday } from '@/lib/format';
import { useProjects, usePulse } from '@/lib/queries';
import { useWorkspace } from '@/store/workspace';
import { PanelLink } from './panel-link';

/** The next shoot as a call-sheet card over the production's still, then the one after it. */
export function UpcomingShoots({ className }: { className?: string }) {
  const q = usePulse();
  const projects = useProjects({ status: 'ACTIVE', sort: 'health' });
  const { matchesProjectId } = useFocusFilter();
  const setLens = useWorkspace((s) => s.setLens);
  const inspect = useWorkspace((s) => s.inspect);

  const shoots = (q.data?.upcoming ?? []).filter(
    (u) => u.kind === 'shoot' && matchesProjectId(u.project.id),
  );
  const [next, after] = shoots;
  const project = next ? projects.data?.find((p) => p.id === next.project.id) : undefined;
  const open = (id: string) => inspect({ type: 'shoot', id: id.replace('shoot:', '') });

  return (
    <Panel
      icon={<CalendarRange />}
      title="Upcoming Shoots"
      className={className}
      action={<PanelLink onClick={() => setLens('schedule')}>View calendar</PanelLink>}
    >
      <PanelState
        query={q}
        skeleton="block"
        isEmpty={!next}
        empty={{ title: 'No shoots booked.', body: 'Nothing is on the call sheet yet.' }}
      >
        {next ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => open(next.id)}
              // Named by its visible text (title, production, day and time are all on the card).
              className="group relative block overflow-hidden rounded-[12px] text-left"
            >
              <Still
                id={next.project.id}
                type={project?.type ?? 'BRAND_FILM'}
                accent={project?.client.accentColor ?? null}
                src={project?.coverImageUrl}
                alt={next.project.title}
                ratio="16 / 7"
                className="transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <span className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-transparent" />
              <span className="absolute inset-y-0 left-0 flex items-center gap-3 p-3 text-white">
                <span className="grid w-12 shrink-0 place-items-center rounded-[10px] bg-white/12 py-1.5 text-center leading-none backdrop-blur-sm">
                  <span className="text-[9px] uppercase tracking-wider text-white/75">
                    {date(next.at, { month: 'short' })}
                  </span>
                  <span className="text-xl font-bold">{date(next.at, { day: 'numeric' })}</span>
                  <span className="text-[9px] text-white/75">{weekday(next.at)}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{next.project.title}</span>
                  <span className="block truncate text-[11px] text-white/80">{next.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-white/70">
                    {next.location ? (
                      <>
                        <MapPin className="size-3" aria-hidden />
                        <span className="truncate">{next.location}</span> ·{' '}
                      </>
                    ) : null}
                    {time(next.at)}
                  </span>
                </span>
              </span>
            </button>
            {after ? (
              <button
                type="button"
                onClick={() => open(after.id)}
                className="flex items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 text-left text-2xs transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-text">{after.project.title}</span>
                  <span className="text-text-3"> · {after.title}</span>
                </span>
                <span className="shrink-0 font-mono text-text-3">
                  {relativeDay(after.at)} {time(after.at)}
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
      </PanelState>
    </Panel>
  );
}
