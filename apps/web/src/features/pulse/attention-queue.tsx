'use client';

import type { AttentionItem, AttentionKind } from '@nova/shared';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlarmClock,
  ArrowRight,
  Ban,
  CalendarX,
  CircleCheck,
  Flame,
  Info,
  MessageSquareMore,
  MessageSquareWarning,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useFocusFilter } from '@/features/shell/use-focus';
import { useCan } from '@/features/shell/user-context';
import { useApiMutation } from '@/lib/mutations';
import { usePulse } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';

const SEVERITY = {
  critical: { icon: 'text-critical bg-critical-soft', text: 'text-critical', label: 'Critical' },
  warning: { icon: 'text-attention bg-attention-soft', text: 'text-attention', label: 'Warning' },
  info: { icon: 'text-signal bg-signal-soft', text: 'text-signal', label: 'Ready' },
} as const;

const KIND_ICON: Record<AttentionKind, LucideIcon> = {
  OVERDUE_PROJECT: AlarmClock,
  APPROVAL_WAITING: MessageSquareMore,
  CHANGES_REQUESTED: MessageSquareWarning,
  BLOCKED_TASK: Ban,
  OVERDUE_TASK: AlarmClock,
  BOOKING_CONFLICT: CalendarX,
  CREW_OVERLOAD: UsersRound,
  BUDGET_BURN: Flame,
  STAGE_READY: CircleCheck,
};

/**
 * Ranked decisions. Each item says why it is here (the rule and its numbers) and offers the one
 * action that moves it forward. The next shoot closes the list, so the day ahead is in one place.
 */
export function AttentionQueue({ className }: { className?: string }) {
  const q = usePulse();
  const { matchesProjectId, active } = useFocusFilter();
  const items = (q.data?.attention ?? []).filter((i) => !active || matchesProjectId(i.project?.id));

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Urgent Attention
          {items.length ? (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 font-mono text-[10px] font-semibold text-on-brand">
              {items.length}
            </span>
          ) : null}
          <Tooltip content="NOVA ranks open issues by severity × urgency × impact. Scores are deterministic heuristics over live data.">
            <Info className="size-3.5 text-text-3" aria-label="How ranking works" />
          </Tooltip>
        </span>
      }
      className={className}
      bodyClassName="px-2 pb-2 flex flex-col min-h-0"
    >
      <PanelState
        query={q}
        isEmpty={items.length === 0}
        empty={{
          title: 'All clear.',
          body: active
            ? 'Nothing needs a decision within the current focus.'
            : 'Nothing needs a decision right now.',
        }}
      >
        <ol className="flex max-h-[420px] min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto xl:max-h-none">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <AttentionRow item={item} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </PanelState>
    </Panel>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const inspect = useWorkspace((s) => s.inspect);
  const setLens = useWorkspace((s) => s.setLens);
  const canTransition = useCan('workflow:transition');
  const advance = useApiMutation<{ projectId: string }>(
    'POST',
    ({ projectId }) => `/projects/${projectId}/transitions`,
    {
      transform: () => ({ direction: 'FORWARD' }),
      success: () => `${item.project?.title ?? 'Project'} advanced`,
    },
  );
  const s = SEVERITY[item.severity];
  const Icon = KIND_ICON[item.kind] ?? TriangleAlert;

  const open = () => {
    const e = item.entity;
    if (e.type === 'deliverable' && item.project)
      return inspect({ type: 'project', id: item.project.id, section: 'deliverables' });
    if (e.type === 'asset' || item.kind === 'BOOKING_CONFLICT') {
      setLens('schedule');
      // Equipment and crew can both be double-booked; open whichever this item is about.
      return inspect({ type: e.type === 'member' ? 'member' : 'asset', id: e.id });
    }
    if (e.type === 'deliverable') return;
    if (e.type === 'member' && item.kind === 'CREW_OVERLOAD') setLens('people');
    inspect({ type: e.type, id: e.id });
  };

  const onAction = () => {
    if (item.action?.kind === 'advance' && item.project)
      return advance.mutate({ projectId: item.project.id });
    if (item.action?.kind === 'decide' && item.project)
      return inspect({ type: 'project', id: item.project.id, section: 'deliverables' });
    open();
  };

  const showAction = item.action && !(item.action.kind === 'advance' && !canTransition);

  return (
    <div className="group relative flex items-start gap-3 rounded-[12px] px-2 py-2.5 transition-colors hover:bg-surface-2">
      <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px]', s.icon)}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={open}
          className="block text-left text-xs font-semibold leading-[18px] text-text hover:underline hover:underline-offset-4"
        >
          {item.title}
        </button>
        <p className="line-clamp-1 text-2xs text-text-3" title={item.reason}>
          {item.project ? <span>{item.project.title} · </span> : null}
          {item.reason}
        </p>
        {showAction ? (
          <Button
            size="sm"
            variant={item.action!.kind === 'advance' ? 'primary' : 'ghost'}
            className="-ml-1 mt-1 h-6 px-1.5 text-2xs pointer-coarse:h-9 pointer-coarse:text-xs"
            loading={advance.isPending}
            onClick={onAction}
          >
            {item.action!.label} <ArrowRight />
          </Button>
        ) : null}
      </div>
      <Tooltip content={`Priority score ${item.score} / 100`}>
        <span className={cn('shrink-0 text-[10px] font-semibold', s.text)}>{s.label}</span>
      </Tooltip>
    </div>
  );
}
