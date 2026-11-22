'use client';

import type { ActivityView } from '@nova/shared';
import { Bot, Cog } from 'lucide-react';
import { Avatar, Tooltip } from '@/components/ui/misc';
import { ago, dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useWorkspace, type InspectType } from '@/store/workspace';

const INSPECTABLE: Record<string, InspectType> = {
  project: 'project',
  task: 'task',
  member: 'member',
  client: 'client',
  shoot: 'shoot',
  asset: 'asset',
  lead: 'lead',
};

/** One audit entry: who did what, when, and from where (UI, assistant or system). */
export function ActivityItem({
  activity: a,
  compact = false,
}: {
  activity: ActivityView;
  compact?: boolean;
}) {
  const inspect = useWorkspace((s) => s.inspect);
  const target: { type: InspectType; id: string; section?: string } | null =
    a.entityType === 'deliverable' && a.projectId
      ? { type: 'project', id: a.projectId, section: 'deliverables' }
      : INSPECTABLE[a.entityType]
        ? { type: INSPECTABLE[a.entityType]!, id: a.entityId }
        : a.projectId
          ? { type: 'project', id: a.projectId }
          : null;

  return (
    <li
      className={cn(
        'flex gap-2.5 border-b border-line/60 py-2 last:border-b-0',
        compact && 'py-1.5',
      )}
    >
      <span className="mt-0.5">
        {a.source === 'ASSISTANT' ? (
          <span
            className="grid size-5 place-items-center rounded-full bg-ai-soft text-ai"
            title="Via NOVA assistant"
          >
            <Bot className="size-3" />
          </span>
        ) : a.actor ? (
          <Avatar name={a.actor.name} size={20} />
        ) : (
          <span
            className="grid size-5 place-items-center rounded-full bg-surface-3 text-text-3"
            title="System"
          >
            <Cog className="size-3" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        {target ? (
          <button
            type="button"
            onClick={() => inspect(target)}
            className={cn(
              'text-left text-text-2 hover:text-text',
              compact ? 'line-clamp-2 text-xs' : 'text-sm',
            )}
          >
            {a.summary}
          </button>
        ) : (
          <p className={cn('text-text-2', compact ? 'line-clamp-2 text-xs' : 'text-sm')}>
            {a.summary}
          </p>
        )}
        {!compact ? (
          <p className="mt-0.5 font-mono text-2xs text-text-3">
            {a.action} ·{' '}
            {a.source === 'ASSISTANT' ? 'via NOVA (confirmed by user)' : a.source.toLowerCase()}
          </p>
        ) : null}
      </div>
      <Tooltip content={dateTime(a.createdAt)}>
        <span className="shrink-0 font-mono text-2xs text-text-3">{ago(a.createdAt)}</span>
      </Tooltip>
    </li>
  );
}
