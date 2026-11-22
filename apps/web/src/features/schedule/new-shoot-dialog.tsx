'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateShoot,
  STUDIO_LOCATIONS,
  STUDIO_LOCATION_LABELS,
  type ShootView,
} from '@nova/shared';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useApiMutation } from '@/lib/mutations';
import { useProjects } from '@/lib/queries';
import { useWorkspace } from '@/store/workspace';

type In = z.input<typeof CreateShoot>;
type Out = z.output<typeof CreateShoot>;

const local = (offsetDays: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** Schedules a shoot; crew and equipment are then booked from the shoot inspector. */
export function NewShootDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId?: string;
}) {
  const projects = useProjects({ status: 'ACTIVE' });
  const inspect = useWorkspace((s) => s.inspect);
  const { register, handleSubmit, formState, reset } = useForm<In, unknown, Out>({
    resolver: zodResolver(CreateShoot),
    values: {
      projectId: projectId ?? '',
      title: '',
      location: '',
      city: 'KOZHIKODE',
      startsAt: local(3, 8),
      endsAt: local(3, 18),
      callTime: '07:30',
    },
  });
  const create = useApiMutation<Out, ShootView>('POST', '/shoots', {
    success: (s) => `“${s.title}” scheduled — now book crew and equipment`,
    transform: (v) => ({
      ...v,
      startsAt: new Date(v.startsAt).toISOString(),
      endsAt: new Date(v.endsAt).toISOString(),
    }),
    onSuccess: (s) => {
      reset();
      onOpenChange(false);
      inspect({ type: 'shoot', id: s.id });
    },
  });
  const e = formState.errors;
  const submit = handleSubmit((v) => create.mutate(v));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule a shoot"
      description="Times are local studio time. Equipment bookings follow the shoot window."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Schedule
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
        <Field label="Production" error={e.projectId?.message} className="sm:col-span-2">
          {(p) => (
            <Select {...p} {...register('projectId')}>
              <option value="" disabled>
                Choose a production
              </option>
              {projects.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Shoot title" error={e.title?.message} className="sm:col-span-2">
          {(p) => <Input {...p} {...register('title')} placeholder="e.g. Product macro day" />}
        </Field>
        <Field label="Location" error={e.location?.message}>
          {(p) => (
            <Input
              {...p}
              {...register('location')}
              placeholder="Studio floor, HiLITE Business Park"
            />
          )}
        </Field>
        <Field label="City" error={e.city?.message}>
          {(p) => (
            <Select {...p} {...register('city')}>
              {STUDIO_LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {STUDIO_LOCATION_LABELS[l]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Starts" error={e.startsAt?.message}>
          {(p) => <Input {...p} type="datetime-local" {...register('startsAt')} />}
        </Field>
        <Field label="Ends" error={e.endsAt?.message}>
          {(p) => <Input {...p} type="datetime-local" {...register('endsAt')} />}
        </Field>
        <Field label="Crew call (HH:MM)" error={e.callTime?.message}>
          {(p) => <Input {...p} {...register('callTime')} placeholder="07:30" />}
        </Field>
        <Field label="Notes" error={e.notes?.message} className="sm:col-span-2">
          {(p) => <Textarea {...p} {...register('notes')} rows={2} />}
        </Field>
      </form>
    </Dialog>
  );
}
