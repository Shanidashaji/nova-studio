'use client';

import {
  PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskView,
  type UpdateTask,
} from '@nova/shared';
import { GitBranch, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { date, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useProject, useTask, useTeam } from '@/lib/queries';
import { taskTone } from '@/lib/status';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection } from './inspector-router';

export function TaskInspector({ id }: { id: string }) {
  const task = useTask(id);
  const project = useProject(task.data?.projectId ?? null);
  if (task.isPending)
    return (
      <div className="p-4">
        <Skeleton className="h-40" />
      </div>
    );
  // The task needs its project (stage, siblings). If that fails, say so instead of loading forever.
  if (task.data && project.isError) return <PanelState query={project}>{null}</PanelState>;
  return (
    <PanelState query={task}>
      {task.data && project.data ? (
        <TaskBody t={task.data} project={project.data} />
      ) : (
        <div className="p-4">
          <Skeleton className="h-40" />
        </div>
      )}
    </PanelState>
  );
}

function TaskBody({
  t,
  project,
}: {
  t: TaskView;
  project: NonNullable<ReturnType<typeof useProject>['data']>;
}) {
  const canWrite = useCan('task:write');
  const team = useTeam();
  const inspect = useWorkspace((s) => s.inspect);
  const back = useWorkspace((s) => s.back);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [addingDep, setAddingDep] = useState('');
  const stage = project.stages.find((s) => s.id === t.projectStageId);

  const update = useApiMutation<UpdateTask>('PATCH', `/tasks/${t.id}`, { success: 'Task updated' });
  const remove = useApiMutation<void>('DELETE', `/tasks/${t.id}`, {
    success: 'Task removed',
    onSuccess: back,
  });
  const addDep = useApiMutation<{ dependsOnId: string }>('POST', `/tasks/${t.id}/dependencies`, {
    success: 'Dependency added',
    onSuccess: () => setAddingDep(''),
  });
  const removeDep = useApiMutation<{ dependsOnId: string }>(
    'DELETE',
    ({ dependsOnId }) => `/tasks/${t.id}/dependencies/${dependsOnId}`,
    { success: 'Dependency removed' },
  );

  const deps = t.dependsOn
    .map((d) => project.tasks.find((x) => x.id === d))
    .filter(Boolean) as TaskView[];
  const dependents = project.tasks.filter((x) => x.dependsOn.includes(t.id));
  const candidates = project.tasks.filter((x) => x.id !== t.id && !t.dependsOn.includes(x.id));

  return (
    <div>
      <div className="px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={() => inspect({ type: 'project', id: project.id, section: 'tasks' })}
          className="font-mono text-[10px] text-text-3 hover:text-text"
        >
          {project.code} · {project.title} · {stage?.label}
        </button>
        <h2 className="mt-1 text-lg font-semibold leading-6">{t.title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={taskTone[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
          <Badge tone="neutral" dot={false}>
            {titleCase(t.priority)}
          </Badge>
          {t.isStageBlocking ? (
            <Badge tone="attention" dot={false}>
              Blocks {stage?.label ?? 'stage'}
            </Badge>
          ) : null}
        </div>
        {t.description ? <p className="mt-2 text-sm text-text-2">{t.description}</p> : null}
        {t.status === 'BLOCKED' && t.blockedReason ? (
          <p className="mt-2 rounded-[var(--radius-sm)] bg-critical-soft px-2 py-1.5 text-xs text-critical">
            Blocked: {t.blockedReason}
          </p>
        ) : null}
      </div>

      {canWrite ? (
        <InspectorSection title="Edit">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Status">
              {(p) => (
                <Select
                  {...p}
                  value={t.status}
                  disabled={update.isPending}
                  onChange={(e) =>
                    e.target.value === 'BLOCKED'
                      ? update.mutate({
                          status: 'BLOCKED',
                          blockedReason: blockReason || 'Blocked — reason not given',
                        })
                      : update.mutate({ status: e.target.value as TaskView['status'] })
                  }
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Assignee">
              {(p) => (
                <Select
                  {...p}
                  value={t.assignee?.id ?? ''}
                  disabled={update.isPending}
                  onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {team.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({Math.round((m.weeks[0]?.ratio ?? 0) * 100)}%)
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Due">
              {(p) => (
                <Input
                  {...p}
                  // Re-keyed on the saved value so a change made elsewhere shows up here.
                  key={t.dueDate ?? 'none'}
                  type="date"
                  defaultValue={t.dueDate?.slice(0, 10)}
                  onBlur={(e) =>
                    e.target.value !== t.dueDate?.slice(0, 10) &&
                    update.mutate({
                      dueDate: e.target.value ? new Date(`${e.target.value}T18:00:00`) : null,
                    })
                  }
                />
              )}
            </Field>
            <Field label="Priority">
              {(p) => (
                <Select
                  {...p}
                  value={t.priority}
                  onChange={(e) =>
                    update.mutate({ priority: e.target.value as TaskView['priority'] })
                  }
                >
                  {PRIORITIES.map((x) => (
                    <option key={x} value={x}>
                      {titleCase(x)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {t.status !== 'BLOCKED' ? (
            <div className="mt-2">
              <Field label="Blocked reason (used if you mark it blocked)">
                {(p) => (
                  <Input
                    {...p}
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Waiting on client artwork"
                  />
                )}
              </Field>
            </div>
          ) : null}
          <div className="mt-3 flex items-center justify-between">
            <Checkbox
              label="Blocks the stage"
              checked={t.isStageBlocking}
              onChange={(e) => update.mutate({ isStageBlocking: e.target.checked })}
            />
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          </div>
        </InspectorSection>
      ) : null}

      <InspectorSection title="Dependencies">
        <p className="mb-1 text-xs text-text-3">Waits on</p>
        {deps.length === 0 ? (
          <p className="text-sm text-text-3">Nothing — can start any time.</p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {deps.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <GitBranch className="size-3.5 text-text-3" />
              <button
                type="button"
                onClick={() => inspect({ type: 'task', id: d.id })}
                className="min-w-0 flex-1 truncate text-left hover:underline"
              >
                {d.title}
              </button>
              <Badge tone={taskTone[d.status]}>{TASK_STATUS_LABELS[d.status]}</Badge>
              {canWrite ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove dependency on ${d.title}`}
                  onClick={() => removeDep.mutate({ dependsOnId: d.id })}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canWrite && candidates.length > 0 ? (
          <div className="mt-2 flex gap-2">
            <Select
              value={addingDep}
              onChange={(e) => setAddingDep(e.target.value)}
              aria-label="Add a prerequisite task"
            >
              <option value="">Add a prerequisite…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
            <Button
              size="md"
              disabled={!addingDep}
              loading={addDep.isPending}
              onClick={() => addDep.mutate({ dependsOnId: addingDep })}
            >
              <Plus /> Add
            </Button>
          </div>
        ) : null}
        {dependents.length > 0 ? (
          <>
            <p className="mb-1 mt-3 text-xs text-text-3">Unblocks</p>
            <ul className="flex flex-col gap-1">
              {dependents.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => inspect({ type: 'task', id: d.id })}
                    className="text-sm text-text-2 hover:text-text hover:underline"
                  >
                    {d.title}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </InspectorSection>
      <InspectorSection title="Record">
        <p className="text-xs text-text-3">
          {t.completedAt ? `Completed ${date(t.completedAt)}. ` : ''}Last updated{' '}
          {date(t.updatedAt)}. Estimate {t.estimateHours ?? '—'}h.
        </p>
      </InspectorSection>
      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this task?"
        description={`“${t.title}” and its dependencies will be removed. The deletion is recorded in the audit trail.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete task
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-2">This cannot be undone.</p>
      </Dialog>
    </div>
  );
}
