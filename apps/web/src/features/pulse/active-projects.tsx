'use client';

import type { ProjectSummary, StageKey } from '@nova/shared';
import { CalendarDays } from 'lucide-react';
import { Still } from '@/components/still';
import { AvatarStack } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useFocusFilter } from '@/features/shell/use-focus';
import { date } from '@/lib/format';
import { useProjects } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { PanelLink } from './panel-link';

/**
 * Stage pill colours on the stills: each stage keeps one hue across the workspace. The pills
 * carry small white text, so every shade is dark enough for 4.5:1 against white.
 */
const STAGE_PILL: Record<StageKey, string> = {
  BRIEF: 'bg-[#6c4bd6]',
  PRE_PRODUCTION: 'bg-[#2f62d1]',
  SHOOT: 'bg-[#157a4a]',
  EDIT: 'bg-[#1f6fb8]',
  REVIEW: 'bg-[#a85a00]',
  DELIVERY: 'bg-[#11613c]',
};

/** The four active productions that most need eyes, as graded-still tiles. */
export function ActiveProjects({ className }: { className?: string }) {
  const projects = useProjects({ status: 'ACTIVE', sort: 'health' });
  const { matches, active } = useFocusFilter();
  const setLens = useWorkspace((s) => s.setLens);
  const shown = (projects.data ?? []).filter(matches);

  return (
    <Panel
      icon={<span className="size-2 rounded-full bg-brand" />}
      title="Active Projects"
      eyebrow={active ? 'In focus' : undefined}
      className={className}
      action={<PanelLink onClick={() => setLens('productions')}>View all</PanelLink>}
    >
      <PanelState
        query={projects}
        skeleton="cards"
        isEmpty={shown.length === 0}
        empty={{
          title: 'Nothing in production here.',
          body: 'No active productions match the current focus.',
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {shown.slice(0, 4).map((p) => (
            <ProjectTile key={p.id} project={p} />
          ))}
        </div>
      </PanelState>
    </Panel>
  );
}

function ProjectTile({ project: p }: { project: ProjectSummary }) {
  const inspect = useWorkspace((s) => s.inspect);
  const blocked = p.stage?.status === 'BLOCKED';
  const overdue = new Date(p.dueDate) < new Date();
  const pct = Math.round(p.progress * 100);
  const bar =
    p.health.band === 'CRITICAL'
      ? 'bg-critical'
      : p.health.band === 'AT_RISK'
        ? 'bg-attention'
        : 'bg-[linear-gradient(90deg,#3b6fe0,#5aa2ff)]';

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface-1 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]">
      <Still
        id={p.id}
        type={p.type}
        accent={p.client.accentColor}
        src={p.coverImageUrl}
        alt={p.title}
        ratio="16 / 10"
        className="m-1.5 mb-0 rounded-[10px]"
      >
        <div className="absolute inset-x-0 top-0 flex items-start justify-end p-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm',
              blocked ? 'bg-critical' : p.stage ? STAGE_PILL[p.stage.key] : 'bg-[#16804f]',
            )}
          >
            <span className="size-1.5 rounded-full bg-white/85" aria-hidden />
            {p.stage ? (blocked ? `${p.stage.label} · blocked` : p.stage.label) : 'Delivered'}
          </span>
        </div>
      </Still>
      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-bold text-text" title={`${p.code} · ${p.title}`}>
            <button
              type="button"
              onClick={() => inspect({ type: 'project', id: p.id })}
              className="text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-signal"
            >
              {p.title}
            </button>
          </h3>
          <p className="truncate text-2xs text-text-3">{p.logline ?? p.client.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`${p.title} progress`}
          >
            <div className={cn('h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-2xs tabular text-text-2">{pct}%</span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-2xs',
              overdue ? 'text-critical' : 'text-text-2',
            )}
          >
            <CalendarDays className="size-3" aria-hidden />
            {date(p.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <AvatarStack names={p.team.map((m) => m.name)} size={20} max={3} />
        </div>
      </div>
    </article>
  );
}
