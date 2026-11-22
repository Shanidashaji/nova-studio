'use client';

import type { StudioBookingView } from '@nova/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Meter } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { dateTime, money, pct, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useProjects, useStudios } from '@/lib/queries';

/** Studio spaces and their bookings. The API rejects any overlapping booking (409). */
export function StudiosPanel() {
  const studios = useStudios();
  const canBook = useCan('studio:write');
  const [booking, setBooking] = useState(false);
  const [now] = useState(() => Date.now());
  return (
    <Panel
      eyebrow="Spaces"
      title="Studios"
      action={
        canBook ? (
          <Button size="sm" onClick={() => setBooking(true)}>
            <Plus /> Book studio
          </Button>
        ) : null
      }
    >
      <PanelState query={studios} skeleton="cards">
        <div className="grid gap-3 lg:grid-cols-3">
          {(studios.data ?? []).map((s) => {
            const upcoming = s.bookings
              .filter((b) => b.status !== 'CANCELLED' && new Date(b.endsAt).getTime() > now)
              .slice(0, 4);
            return (
              <section
                key={s.id}
                aria-label={s.name}
                className="rounded-[var(--radius-md)] border border-line bg-surface-2 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{s.name}</h3>
                    <p className="truncate text-xs text-text-3">
                      {s.kind} · {titleCase(s.location)} · {money(s.hourlyRate)}/h
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-text-3">
                    {pct(s.utilisation)} this week
                  </span>
                </div>
                <Meter
                  value={Math.min(1, s.utilisation)}
                  className="mt-2"
                  label={`${s.name} utilisation`}
                />
                <ul className="mt-2 flex flex-col gap-1">
                  {upcoming.length === 0 ? (
                    <li className="text-xs text-text-3">No upcoming bookings.</li>
                  ) : null}
                  {upcoming.map((b) => (
                    <BookingRow key={b.id} b={b} canBook={canBook} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </PanelState>
      <BookStudioDialog open={booking} onOpenChange={setBooking} />
    </Panel>
  );
}

function BookingRow({ b, canBook }: { b: StudioBookingView; canBook: boolean }) {
  const update = useApiMutation<{ status: 'CONFIRMED' | 'CANCELLED' }, StudioBookingView>(
    'PATCH',
    `/studio-bookings/${b.id}`,
    {
      success: (r) => (r.status === 'CANCELLED' ? 'Booking cancelled' : 'Booking confirmed'),
    },
  );
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="min-w-0 flex-1 truncate">
        {dateTime(b.startsAt)} · {b.title}
        {b.project ? <span className="text-text-3"> · {b.project.code}</span> : null}
      </span>
      {b.status === 'TENTATIVE' ? <Badge tone="attention">Tentative</Badge> : null}
      {canBook && b.status === 'TENTATIVE' ? (
        <button
          type="button"
          className="text-text-3 underline hover:text-text"
          onClick={() => update.mutate({ status: 'CONFIRMED' })}
        >
          confirm
        </button>
      ) : null}
      {canBook ? (
        <button
          type="button"
          className="text-text-3 underline hover:text-critical"
          onClick={() => update.mutate({ status: 'CANCELLED' })}
        >
          cancel
        </button>
      ) : null}
    </li>
  );
}

function BookStudioDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const studios = useStudios();
  const projects = useProjects();
  const [studioId, setStudioId] = useState('');
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [start, setStart] = useState('');
  const [hours, setHours] = useState('4');
  const [tentative, setTentative] = useState(false);
  const book = useApiMutation<Record<string, unknown>, StudioBookingView>(
    'POST',
    '/studio-bookings',
    {
      success: (b) => `${b.studio.name} booked`,
      onSuccess: () => {
        setTitle('');
        onOpenChange(false);
      },
    },
  );
  const submit = () => {
    const startsAt = new Date(start);
    book.mutate({
      studioId,
      title,
      projectId: projectId || undefined,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + Number(hours) * 3_600_000).toISOString(),
      status: tentative ? 'TENTATIVE' : 'CONFIRMED',
    });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Book a studio"
      description="NOVA refuses a booking that overlaps another one in the same studio."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={book.isPending}
            disabled={!studioId || !title || !start}
            onClick={submit}
          >
            Book
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Studio">
          {(p) => (
            <Select {...p} value={studioId} onChange={(e) => setStudioId(e.target.value)}>
              <option value="">Choose a studio</option>
              {(studios.data ?? [])
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Project (optional)">
          {(p) => (
            <Select {...p} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Internal</option>
              {(projects.data ?? []).map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.code} · {pr.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="What for?" className="sm:col-span-2">
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Starts">
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          )}
        </Field>
        <Field label="Hours">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              max={72}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          )}
        </Field>
        <label className="inline-flex items-center gap-2 text-sm text-text-2 sm:col-span-2">
          <input
            type="checkbox"
            className="size-3.5 accent-[var(--signal)]"
            checked={tentative}
            onChange={(e) => setTentative(e.target.checked)}
          />
          Tentative (hold the slot until confirmed)
        </label>
      </div>
    </Dialog>
  );
}
