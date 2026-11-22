'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateClient,
  CreateLead,
  INTERACTION_TYPES,
  LEAD_SOURCES,
  LogInteraction,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
  type ClientDetail,
  type LeadView,
} from '@nova/shared';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useClients } from '@/lib/queries';
import { useWorkspace } from '@/store/workspace';

type DialogProps = { open: boolean; onOpenChange: (o: boolean) => void };

export function NewClientDialog({ open, onOpenChange }: DialogProps) {
  const inspect = useWorkspace((s) => s.inspect);
  const { register, handleSubmit, formState, reset } = useForm<
    z.input<typeof CreateClient>,
    unknown,
    z.output<typeof CreateClient>
  >({ resolver: zodResolver(CreateClient) });
  const create = useApiMutation<z.output<typeof CreateClient>, ClientDetail>('POST', '/clients', {
    success: (c) => `${c.name} added as a client`,
    onSuccess: (c) => {
      reset();
      onOpenChange(false);
      inspect({ type: 'client', id: c.id });
    },
  });
  const e = formState.errors;
  const submit = handleSubmit((v) => create.mutate(v));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New client"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Add client
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Company" error={e.name?.message} className="sm:col-span-2">
          {(p) => <Input {...p} {...register('name')} autoFocus />}
        </Field>
        <Field label="Industry" error={e.industry?.message}>
          {(p) => <Input {...p} {...register('industry')} placeholder="Hospitality" />}
        </Field>
        <Field label="City" error={e.city?.message}>
          {(p) => <Input {...p} {...register('city')} placeholder="Kozhikode" />}
        </Field>
        <Field label="Contact name" error={e.contactName?.message}>
          {(p) => <Input {...p} {...register('contactName')} />}
        </Field>
        <Field label="Contact email" error={e.contactEmail?.message}>
          {(p) => <Input {...p} type="email" {...register('contactEmail')} />}
        </Field>
        <Field label="Contact phone" error={e.contactPhone?.message}>
          {(p) => <Input {...p} {...register('contactPhone')} />}
        </Field>
      </form>
    </Dialog>
  );
}

export function NewLeadDialog({
  open,
  onOpenChange,
  clientId,
}: DialogProps & { clientId?: string }) {
  const clients = useClients();
  const inspect = useWorkspace((s) => s.inspect);
  const { register, handleSubmit, formState, reset } = useForm<
    z.input<typeof CreateLead>,
    unknown,
    z.output<typeof CreateLead>
  >({
    resolver: zodResolver(CreateLead),
    values: {
      clientId: clientId ?? '',
      title: '',
      projectType: 'BRAND_FILM',
      estimatedValue: '' as unknown as number,
      source: 'WEBSITE',
    },
  });
  const create = useApiMutation<z.output<typeof CreateLead>, LeadView>('POST', '/leads', {
    success: (l) => `Lead “${l.title}” added`,
    transform: (v) => ({ ...v, clientId: v.clientId || undefined }),
    onSuccess: (l) => {
      reset();
      onOpenChange(false);
      inspect({ type: 'lead', id: l.id });
    },
  });
  const e = formState.errors;
  const submit = handleSubmit((v) => create.mutate(v));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New lead"
      description="Enquiries from the website, WhatsApp, referrals or social."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Add lead
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Title" error={e.title?.message} className="sm:col-span-2">
          {(p) => (
            <Input {...p} {...register('title')} placeholder="Festive campaign film" autoFocus />
          )}
        </Field>
        <Field label="Existing client" error={e.clientId?.message}>
          {(p) => (
            <Select {...p} {...register('clientId')}>
              <option value="">— New prospect —</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Prospect name"
          error={e.prospectName?.message}
          hint="If not an existing client"
        >
          {(p) => <Input {...p} {...register('prospectName')} />}
        </Field>
        <Field label="Project type" error={e.projectType?.message}>
          {(p) => (
            <Select {...p} {...register('projectType')}>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROJECT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Source" error={e.source?.message}>
          {(p) => (
            <Select {...p} {...register('source')}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Estimated value (₹)" error={e.estimatedValue?.message}>
          {(p) => (
            <Input {...p} type="number" min={0} step={10000} {...register('estimatedValue')} />
          )}
        </Field>
        <Field label="Expected close" error={e.expectedCloseDate?.message}>
          {(p) => <Input {...p} type="date" {...register('expectedCloseDate')} />}
        </Field>
      </form>
    </Dialog>
  );
}

export function LogInteractionDialog({
  open,
  onOpenChange,
  clientId,
  projects,
}: DialogProps & { clientId: string; projects: { id: string; title: string }[] }) {
  const { register, handleSubmit, formState, reset } = useForm<
    z.input<typeof LogInteraction>,
    unknown,
    z.output<typeof LogInteraction>
  >({
    resolver: zodResolver(LogInteraction),
    defaultValues: { type: 'CALL' },
  });
  const log = useApiMutation<z.output<typeof LogInteraction>>(
    'POST',
    `/clients/${clientId}/interactions`,
    {
      success: 'Interaction logged',
      transform: (v) => ({ ...v, projectId: v.projectId || undefined }),
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    },
  );
  const e = formState.errors;
  const submit = handleSubmit((v) => log.mutate(v));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log client interaction"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={log.isPending} onClick={submit}>
            Log
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Type" error={e.type?.message}>
          {(p) => (
            <Select {...p} {...register('type')}>
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Production (optional)" error={e.projectId?.message}>
          {(p) => (
            <Select {...p} {...register('projectId')}>
              <option value="">—</option>
              {projects.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Summary" error={e.summary?.message} className="sm:col-span-2">
          {(p) => (
            <Textarea
              {...p}
              {...register('summary')}
              placeholder="What was discussed or decided?"
              autoFocus
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
