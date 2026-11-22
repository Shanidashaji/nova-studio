'use client';

import type { StageKey, StageMetric } from '@nova/shared';
import {
  Activity,
  CalendarCheck,
  CircleCheck,
  FileText,
  Flag,
  Plus,
  Scissors,
  Send,
  TriangleAlert,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Skeleton, Tooltip } from '@/components/ui/misc';
import { NewProjectDialog } from '@/features/productions/new-project-dialog';
import { visibleLenses } from '@/features/shell/lenses';
import { useCan, useUser } from '@/features/shell/user-context';
import { usePulse } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace, type Lens } from '@/store/workspace';

const STAGE_ICON: Record<StageKey, LucideIcon> = {
  BRIEF: FileText,
  PRE_PRODUCTION: CalendarCheck,
  SHOOT: Video,
  EDIT: Scissors,
  REVIEW: CircleCheck,
  DELIVERY: Send,
};

/** Phone labels, so all six stations fit without scrolling sideways. */
const SHORT_LABEL: Partial<Record<StageKey, string>> = { PRE_PRODUCTION: 'Pre-prod' };

/** Shortcuts to the lenses that read like report tabs. */
const TABS: { lens: Lens; label: string }[] = [
  { lens: 'pulse', label: 'Overview' },
  { lens: 'schedule', label: 'Calendar' },
  { lens: 'business', label: 'Analytics' },
  { lens: 'activity', label: 'Reports' },
];

/**
 * The production lifecycle as a connected line of stations, always visible. The constraint (the
 * stage where work piles up fastest) is lit vermilion; hovering any station explains its
 * numbers, and clicking focuses the whole workspace on that stage.
 */
export function PipelineSpine() {
  const q = usePulse();
  const focus = useWorkspace((s) => s.focus);
  const focusStage = useWorkspace((s) => s.focusStage);

  const spine = q.data?.spine ?? [];
  const hot =
    spine.find((s) => s.isConstraint) ??
    spine.reduce<StageMetric | undefined>((m, s) => (!m || s.wip > m.wip ? s : m), undefined);

  return (
    <section aria-label="Production pipeline" className="relative z-[1] -mt-6 px-4 lg:px-8">
      <PipelineNav />
      {q.isPending ? (
        <div className="mt-5 grid grid-cols-6 gap-2 sm:gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : q.isError ? (
        <p className="mt-4 text-sm text-critical">Pipeline metrics could not load.</p>
      ) : (
        // All six stations fit a phone (short labels below `sm`); wider screens space them out.
        <div className="scrollbar-none -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ol className="relative flex min-w-[300px] items-start pb-2 pt-9 sm:min-w-[720px]">
            {/* The line the stations sit on: dotted lead-in, solid run, dotted run-out to the flag. */}
            <span
              aria-hidden
              className="absolute left-0 right-5 top-[60px] sm:right-8 h-px bg-[linear-gradient(90deg,transparent,var(--line-strong)_6%,var(--line-strong)_94%,transparent)]"
            />
            <Flag
              aria-hidden
              className="absolute right-0 top-[52px] size-4 text-text"
              strokeWidth={2}
            />
            {spine.map((stage) => (
              <StageNode
                key={stage.key}
                stage={stage}
                hot={stage.key === hot?.key && stage.wip > 0}
                focused={focus?.type === 'stage' && focus.id === stage.key}
                dimmed={focus?.type === 'stage' && focus.id !== stage.key}
                onFocus={() => focusStage(stage.key, stage.label)}
              />
            ))}
            <li className="w-5 shrink-0 sm:w-8" aria-hidden />
          </ol>
        </div>
      )}
    </section>
  );
}

function PipelineNav() {
  const lens = useWorkspace((s) => s.lens);
  const setLens = useWorkspace((s) => s.setLens);
  const inspect = useWorkspace((s) => s.inspect);
  const canCreate = useCan('project:write');
  const { permissions } = useUser();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full sm:flex-none border border-line bg-surface-1 p-1 shadow-[var(--shadow-card)] scrollbar-none">
        <Tooltip content="Stage workflows and their rules">
          <button
            type="button"
            onClick={() => inspect({ type: 'workflows', id: 'all' })}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-xs font-medium text-ink-text transition-opacity hover:opacity-90"
          >
            <Activity className="size-3.5 text-brand-2" aria-hidden /> Production Pipeline
          </button>
        </Tooltip>
        {TABS.filter((t) => visibleLenses([t.lens], permissions).length > 0).map((t) => (
          <button
            key={t.lens}
            type="button"
            onClick={() => setLens(t.lens)}
            aria-current={lens === t.lens ? 'page' : undefined}
            className={cn(
              'relative h-8 shrink-0 rounded-full px-3.5 text-xs text-text-2 transition-colors hover:bg-surface-2 hover:text-text',
              lens === t.lens && 'font-semibold text-text',
            )}
          >
            {t.label}
            {lens === t.lens ? (
              <span
                className="absolute inset-x-3.5 bottom-1 h-0.5 rounded-full bg-brand"
                aria-hidden
              />
            ) : null}
          </button>
        ))}
      </div>
      {/* Projects has its own create button in its toolbar. */}
      {canCreate && lens !== 'productions' ? (
        <>
          <button
            type="button"
            onClick={() => setCreating(true)}
            aria-label="New Project"
            className="ml-auto inline-flex size-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink text-xs sm:w-auto sm:px-4 font-semibold text-ink-text shadow-[0_10px_24px_-12px_rgb(0_0_0/0.6)] transition-transform hover:-translate-y-px"
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden sm:inline">New Project</span>
          </button>
          <NewProjectDialog open={creating} onOpenChange={setCreating} />
        </>
      ) : null}
    </div>
  );
}

function StageNode({
  stage,
  hot,
  focused,
  dimmed,
  onFocus,
}: {
  stage: StageMetric;
  hot: boolean;
  focused: boolean;
  dimmed: boolean;
  onFocus: () => void;
}) {
  const Icon = STAGE_ICON[stage.key] ?? CircleCheck;
  const slow =
    stage.avgDwellDays !== null &&
    stage.expectedDays > 0 &&
    stage.avgDwellDays > stage.expectedDays * 1.15;

  return (
    <li
      className={cn(
        'relative flex flex-1 flex-col items-center text-center transition-opacity',
        dimmed && 'opacity-45',
      )}
    >
      {hot ? (
        <span className="absolute -top-7 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium text-ink-text">
          <span className="live-dot size-1.5 rounded-full bg-brand" aria-hidden />
          {stage.isConstraint ? 'Bottleneck' : 'Busiest'}
        </span>
      ) : null}
      <div className="grid h-12 place-items-center">
        <Tooltip
          content={
            <span>
              {stage.wip} in progress
              {stage.blocked ? ` · ${stage.blocked} blocked` : ''}
              {stage.atRisk ? ` · ${stage.atRisk} at risk` : ''}. Avg. {stage.avgDwellDays ?? '—'}{' '}
              days in stage (plan {stage.expectedDays}) · {stage.throughputPerWeek}/week leaving.
              {stage.isConstraint
                ? ' Constraint: work accumulates here fastest relative to how quickly it leaves.'
                : ''}
            </span>
          }
        >
          <button
            type="button"
            onClick={onFocus}
            aria-pressed={focused}
            aria-label={`Focus the workspace on ${stage.label}: ${stage.wip} in progress, ${stage.blocked} blocked`}
            className={cn(
              'relative grid place-items-center rounded-full border transition-[box-shadow,transform,border-color]',
              hot
                ? 'size-12 border-transparent bg-brand text-on-brand shadow-[0_0_0_6px_var(--brand-soft),0_10px_24px_-8px_var(--brand)] hover:scale-105'
                : 'size-9 border-line-strong bg-surface-1 text-text shadow-[var(--shadow-card)] hover:border-text-3',
              focused && 'ring-2 ring-brand ring-offset-2 ring-offset-[var(--bg)]',
            )}
          >
            <Icon className={hot ? 'size-5' : 'size-4'} strokeWidth={2} />
            {stage.blocked > 0 ? (
              <TriangleAlert
                className="absolute -right-1.5 -top-1.5 size-4 rounded-full bg-surface-1 p-0.5 text-critical"
                aria-hidden
              />
            ) : null}
          </button>
        </Tooltip>
      </div>
      <p
        className={cn(
          'mt-1.5 text-[11px] font-semibold leading-tight sm:text-xs',
          hot ? 'text-brand' : 'text-text',
        )}
      >
        <span className="sm:hidden">{SHORT_LABEL[stage.key] ?? stage.label}</span>
        <span className="hidden sm:inline">{stage.label}</span>
      </p>
      <p
        className={cn('font-mono text-[11px] tabular', slow ? 'text-attention' : 'text-text-3')}
        title={slow ? 'Running slower than plan' : undefined}
      >
        {stage.wip}
      </p>
    </li>
  );
}
