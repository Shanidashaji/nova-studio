'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTask, PRIORITIES, type ProjectDetail, type TaskView } from '@nova/shared';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useTeam } from '@/lib/queries';

/** 18:00 local time on the calendar day the date input produced (parsed as UTC midnight). */
function endOfWorkday(day: Date): string {
  return new Date(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    18,
    0,
    0,
  ).toISOString();
}

type In = z.input<typeof CreateTask>;
type Out = z.output<typeof CreateTask>;

/** Creates a task inside a project stage. */
export function TaskDialog({
  open,
  onOpenChange,
  project,
  defaultStageId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: ProjectDetail;
  defaultStageId?: string;
}) {
  const team = useTeam();
  const { register, handleSubmit, formState, reset } = useForm<In, unknown, Out>({
    resolver: zodResolver(CreateTask),
    values: {
      projectId: project.id,
      projectStageId: defaultStageId,
      title: '',
      priority: 'MEDIUM',
      isStageBlocking: false,
    },
  });
  const create = useApiMutation<Out, TaskView>('POST', '/tasks', {
    success: (t) => `Task “${t.title}” added`,
    // The date input yields a calendar day; a task is due at the end of that working day.
    transform: (v) => ({ ...v, dueDate: v.dueDate ? endOfWorkday(v.dueDate) : undefined }),
    onSuccess: () => {
      reset();
      onOpenChange(false);
    },
  });
  const e = formState.errors;
  const submit = handleSubmit((v) => create.mutate(v));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`New task · ${project.title}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Add task
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Title" error={e.title?.message} className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              {...register('title')}
              placeholder="e.g. Colour grade the hero film"
              autoFocus
            />
          )}
        </Field>
        <Field label="Stage" error={e.projectStageId?.message}>
          {(p) => (
            <Select {...p} {...register('projectStageId')}>
              {project.stages
                .filter((s) => s.status !== 'SKIPPED')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Assignee" error={e.assigneeId?.message}>
          {(p) => (
            <Select {...p} {...register('assigneeId')}>
              <option value="">Unassigned</option>
              {team.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {Math.round((m.weeks[0]?.ratio ?? 0) * 100)}% loaded
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Due" error={e.dueDate?.message}>
          {(p) => <Input {...p} type="date" {...register('dueDate')} />}
        </Field>
        <Field label="Estimate (hours)" error={e.estimateHours?.message}>
          {(p) => <Input {...p} type="number" min={0} max={200} {...register('estimateHours')} />}
        </Field>
        <Field label="Priority" error={e.priority?.message}>
          {(p) => (
            <Select {...p} {...register('priority')}>
              {PRIORITIES.map((x) => (
                <option key={x} value={x}>
                  {titleCase(x)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex items-end pb-1.5">
          <Checkbox label="Blocks the stage from advancing" {...register('isStageBlocking')} />
        </div>
        <Field label="Description" error={e.description?.message} className="sm:col-span-2">
          {(p) => <Textarea {...p} {...register('description')} rows={2} />}
        </Field>
      </form>
    </Dialog>
  );
}
