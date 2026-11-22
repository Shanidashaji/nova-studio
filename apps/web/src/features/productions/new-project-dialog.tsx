'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateProject,
  PRIORITIES,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
  STUDIO_LOCATIONS,
  STUDIO_LOCATION_LABELS,
  type ProjectDetail,
} from '@nova/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useClients, useWorkflows } from '@/lib/queries';
import { useWorkspace } from '@/store/workspace';

type In = z.input<typeof CreateProject>;
type Out = z.output<typeof CreateProject>;

const isoDay = (offset: number) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/** Opens a new production: it starts in the first stage of the chosen workflow. */
export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const clients = useClients();
  const workflows = useWorkflows();
  const inspect = useWorkspace((s) => s.inspect);
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(CreateProject),
    defaultValues: {
      priority: 'MEDIUM',
      location: 'KOZHIKODE',
      includedRevisions: 2,
      aiAssisted: false,
      startDate: isoDay(0),
      dueDate: isoDay(30),
    },
  });
  const { register, handleSubmit, formState, reset, setValue } = form;

  // Applied when the templates arrive and again each time the dialog opens: `reset()` after a
  // successful create clears the field, and the next project must start on the default too.
  useEffect(() => {
    const def = workflows.data?.find((w) => w.isDefault);
    if (open && def && !form.getValues('workflowTemplateId')) {
      setValue('workflowTemplateId', def.id);
    }
  }, [open, workflows.data, form, setValue]);

  const create = useApiMutation<Out, ProjectDetail>('POST', '/projects', {
    success: (p) => `${p.code} “${p.title}” opened in ${p.stage?.label ?? 'the pipeline'}`,
    onSuccess: (p) => {
      reset();
      onOpenChange(false);
      inspect({ type: 'project', id: p.id });
    },
  });

  const e = formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New production"
      description="Opens a project in the first stage of its workflow and records it in the audit trail."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            onClick={handleSubmit((v) => create.mutate(v))}
          >
            Open production
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={handleSubmit((v) => create.mutate(v))}
        noValidate
      >
        <Field label="Title" error={e.title?.message} className="sm:col-span-2">
          {(p) => (
            <Input
              {...p}
              {...register('title')}
              placeholder="e.g. Monsoon Collection Film"
              autoFocus
            />
          )}
        </Field>
        <Field label="Logline" error={e.logline?.message} className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              {...register('logline')}
              placeholder="One sentence on what this film is."
              rows={2}
            />
          )}
        </Field>
        <Field label="Client" error={e.clientId?.message}>
          {(p) => (
            <Select {...p} {...register('clientId')} defaultValue="">
              <option value="" disabled>
                Choose a client
              </option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Type" error={e.type?.message}>
          {(p) => (
            <Select {...p} {...register('type')} defaultValue="">
              <option value="" disabled>
                Choose a type
              </option>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROJECT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Workflow" error={e.workflowTemplateId?.message}>
          {(p) => (
            <Select {...p} {...register('workflowTemplateId')}>
              {workflows.data?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Studio" error={e.location?.message}>
          {(p) => (
            <Select {...p} {...register('location')}>
              {STUDIO_LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {STUDIO_LOCATION_LABELS[l]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Start" error={e.startDate?.message}>
          {(p) => <Input {...p} type="date" {...register('startDate')} />}
        </Field>
        <Field label="Due" error={e.dueDate?.message}>
          {(p) => <Input {...p} type="date" {...register('dueDate')} />}
        </Field>
        <Field label="Budget (₹)" error={e.budget?.message}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              step={1000}
              {...register('budget')}
              placeholder="350000"
            />
          )}
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
        <Field label="Included revision rounds" error={e.includedRevisions?.message}>
          {(p) => (
            <Input {...p} type="number" min={0} max={10} {...register('includedRevisions')} />
          )}
        </Field>
        <div className="flex items-end pb-1.5">
          <Checkbox label="AI-assisted pipeline (previs, clean-up)" {...register('aiAssisted')} />
        </div>
      </form>
    </Dialog>
  );
}
