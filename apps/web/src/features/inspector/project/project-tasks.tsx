'use client';

import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type ProjectDetail,
  type TaskStatus,
  type TaskView,
} from '@nova/shared';
import { GitBranch, ListChecks, Lock, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Avatar, Segmented, Skeleton } from '@/components/ui/misc';
import { useCan } from '@/features/shell/user-context';
import { TaskDialog } from '@/features/tasks/task-dialog';
import { date } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { taskTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection } from '../inspector-router';

const DependencyGraph = dynamic(
  () => import('@/features/workflow/dependency-graph').then((m) => m.DependencyGraph),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80" />,
  },
);

/** Tasks grouped by stage, with inline status changes and a dependency graph view. */
export function ProjectTasks({ p }: { p: ProjectDetail }) {
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [creating, setCreating] = useState(false);
  const canWrite = useCan('task:write');
  const current = p.stages.find((s) => s.status === 'ACTIVE' || s.status === 'BLOCKED');
  const [showAll, setShowAll] = useState(false);
  const stages = showAll
    ? p.stages
    : p.stages.filter((s) => s.id === current?.id || s.status === 'PENDING');

  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-3">
        <Segmented
          label="Task view"
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: 'List' },
            { value: 'graph', label: 'Dependencies' },
          ]}
        />
        {canWrite ? (
          <Button size="sm" variant="primary" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus /> Task
          </Button>
        ) : null}
      </div>
      {view === 'graph' ? (
        <div className="p-4">
          <DependencyGraph tasks={p.tasks} stages={p.stages} />
          <p className="mt-2 text-2xs text-text-3">
            Arrows point from prerequisite to dependent task. Click a task to open it.
          </p>
        </div>
      ) : (
        <>
          {stages.map((s) => {
            const tasks = p.tasks.filter((t) => t.projectStageId === s.id);
            if (tasks.length === 0 && s.id !== current?.id) return null;
            return (
              <InspectorSection
                key={s.id}
                title={`${s.label} · ${tasks.filter((t) => t.status === 'DONE').length}/${tasks.length}`}
                action={s.id === current?.id ? <Badge tone="signal">Current</Badge> : null}
              >
                <ul className="flex flex-col gap-1">
                  {tasks.map((t) => (
                    <TaskRow key={t.id} task={t} all={p.tasks} canWrite={canWrite} />
                  ))}
                  {tasks.length === 0 ? (
                    <li className="text-xs text-text-3">No tasks in this stage yet.</li>
                  ) : null}
                </ul>
              </InspectorSection>
            );
          })}
          <div className="px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              <ListChecks /> {showAll ? 'Hide completed stages' : 'Show completed stages'}
            </Button>
          </div>
        </>
      )}
      <TaskDialog
        open={creating}
        onOpenChange={setCreating}
        project={p}
        defaultStageId={current?.id}
      />
    </>
  );
}

function TaskRow({
  task: t,
  all,
  canWrite,
}: {
  task: TaskView;
  all: TaskView[];
  canWrite: boolean;
}) {
  const inspect = useWorkspace((s) => s.inspect);
  const update = useApiMutation<{ status: TaskStatus }>('PATCH', `/tasks/${t.id}`, {
    success: (_, b) => `“${t.title}” → ${TASK_STATUS_LABELS[b.status]}`,
  });
  const waitingOn = t.dependsOn
    .map((id) => all.find((x) => x.id === id))
    .filter((x) => x && x.status !== 'DONE');
  const overdue = t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < new Date();

  return (
    <li className="group flex items-start gap-2 rounded-[var(--radius-sm)] px-1 py-1.5 hover:bg-surface-2">
      <span
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          {
            neutral: 'bg-text-3',
            info: 'bg-info',
            critical: 'bg-critical',
            attention: 'bg-attention',
            signal: 'bg-signal',
            ai: 'bg-ai',
          }[taskTone[t.status]],
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => inspect({ type: 'task', id: t.id })}
          className={cn(
            'block text-left text-sm hover:underline',
            t.status === 'DONE' ? 'text-text-3 line-through' : 'text-text',
          )}
        >
          {t.title}
        </button>
        <p className="flex flex-wrap items-center gap-x-2 text-2xs text-text-3">
          {t.isStageBlocking ? <span className="text-text-2">Blocks stage</span> : null}
          {t.dueDate ? (
            <span className={cn(overdue && 'text-critical')}>Due {date(t.dueDate)}</span>
          ) : null}
          {waitingOn.length > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-attention">
              <GitBranch className="size-3" /> waits on {waitingOn.map((w) => w!.title).join(', ')}
            </span>
          ) : null}
        </p>
        {t.status === 'BLOCKED' && t.blockedReason ? (
          <p className="text-2xs text-critical">{t.blockedReason}</p>
        ) : null}
      </div>
      {t.assignee ? <Avatar name={t.assignee.name} size={20} /> : null}
      {canWrite ? (
        <Select
          aria-label={`Status of ${t.title}`}
          value={t.status}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ status: e.target.value as TaskStatus })}
          className="h-7 w-[108px] shrink-0 text-xs"
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      ) : (
        <Badge tone={taskTone[t.status]}>
          {TASK_STATUS_LABELS[t.status]} <Lock className="size-2.5" />
        </Badge>
      )}
    </li>
  );
}
