'use client';

import { SHOOT_STATUSES, type ShootView } from '@nova/shared';
import { MapPin, Plus, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { ApiRequestError } from '@/lib/api';
import { date, time, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useAssets, useShoot, useTeam } from '@/lib/queries';
import { shootTone } from '@/lib/status';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection, KeyValue } from './inspector-router';

/** A call sheet: crew, equipment and conflicts for one shoot. */
export function ShootInspector({ id }: { id: string }) {
  const q = useShoot(id);
  if (q.isPending)
    return (
      <div className="p-4">
        <Skeleton className="h-40" />
      </div>
    );
  return <PanelState query={q}>{q.data ? <ShootBody s={q.data} /> : null}</PanelState>;
}

function ShootBody({ s }: { s: ShootView }) {
  const canWrite = useCan('schedule:write');
  const inspect = useWorkspace((st) => st.inspect);
  const team = useTeam();
  const assets = useAssets();
  const [member, setMember] = useState('');
  const [role, setRole] = useState('');
  const [asset, setAsset] = useState('');
  const [overlap, setOverlap] = useState<{ kind: 'crew' | 'asset'; message: string } | null>(null);

  const conflictHandler = (kind: 'crew' | 'asset') => (e: ApiRequestError) => {
    if (e.code === 'BOOKING_CONFLICT' || e.code === 'CREW_CONFLICT') {
      setOverlap({ kind, message: e.message });
      return true;
    }
    return false;
  };
  const book = useApiMutation<{ assetId: string; allowOverlap?: boolean }>(
    'POST',
    `/shoots/${s.id}/bookings`,
    {
      success: 'Equipment booked',
      onSuccess: () => {
        setAsset('');
        setOverlap(null);
      },
      onError: conflictHandler('asset'),
    },
  );
  const call = useApiMutation<{ teamMemberId: string; role: string; allowOverlap?: boolean }>(
    'POST',
    `/shoots/${s.id}/crew`,
    {
      success: 'Crew called',
      onSuccess: () => {
        setMember('');
        setRole('');
        setOverlap(null);
      },
      onError: conflictHandler('crew'),
    },
  );
  const release = useApiMutation<{ bookingId: string }>(
    'DELETE',
    ({ bookingId }) => `/shoots/${s.id}/bookings/${bookingId}`,
    { success: 'Equipment released' },
  );
  const releaseCrew = useApiMutation<{ crewCallId: string }>(
    'DELETE',
    ({ crewCallId }) => `/shoots/${s.id}/crew/${crewCallId}`,
    { success: 'Crew released' },
  );
  const update = useApiMutation<{ status: string }>('PATCH', `/shoots/${s.id}`, {
    success: 'Shoot updated',
  });

  const bookedIds = new Set(s.bookings.map((b) => b.asset.id));
  const crewIds = new Set(s.crew.map((c) => c.member.id));
  const conflictedBookings = new Set(s.conflicts.map((c) => c.bookingId).filter(Boolean));
  const conflictedCrew = new Set(s.conflicts.map((c) => c.crewCallId).filter(Boolean));

  return (
    <div>
      <div className="px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={() => inspect({ type: 'project', id: s.project.id, section: 'schedule' })}
          className="font-mono text-[10px] text-text-3 hover:text-text"
        >
          {s.project.code} · {s.project.title}
        </button>
        <h2 className="mt-1 text-lg font-semibold leading-6">{s.title}</h2>
        <p className="mt-1 flex items-center gap-1 text-sm text-text-2">
          <MapPin className="size-3.5" /> {s.location}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone={shootTone[s.status]}>{titleCase(s.status)}</Badge>
          {canWrite ? (
            <Select
              aria-label="Shoot status"
              value={s.status}
              onChange={(e) => update.mutate({ status: e.target.value })}
              className="h-7 w-36 text-xs"
            >
              {SHOOT_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {titleCase(x)}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>
      {s.conflicts.length > 0 ? (
        <div
          role="alert"
          className="mx-4 mb-3 rounded-[var(--radius-sm)] border border-critical-line bg-critical-soft p-2.5 text-xs text-critical"
        >
          {s.conflicts.map((c, i) => (
            <p key={i} className="flex gap-1.5">
              <TriangleAlert className="size-3.5 shrink-0" /> {c.with}
            </p>
          ))}
          <p className="mt-1 text-text-2">Release the item below and book an alternative.</p>
        </div>
      ) : null}
      <InspectorSection title="Call sheet">
        <KeyValue
          items={[
            [
              'Date',
              `${date(s.startsAt, { weekday: 'long', day: 'numeric', month: 'long' })}${date(s.startsAt) !== date(s.endsAt) ? ` – ${date(s.endsAt)}` : ''}`,
            ],
            ['Crew call', s.callTime ?? '—'],
            ['Window', `${time(s.startsAt)} – ${time(s.endsAt)}`],
            ['Notes', s.notes ?? '—'],
          ]}
        />
      </InspectorSection>
      <InspectorSection title={`Crew · ${s.crew.length}`}>
        <ul className="flex flex-col gap-1">
          {s.crew.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <Avatar name={c.member.name} size={22} />
              <button
                type="button"
                className="flex-1 truncate text-left hover:underline"
                onClick={() => inspect({ type: 'member', id: c.member.id })}
              >
                {c.member.name}
              </button>
              <span className="text-xs text-text-3">{c.role}</span>
              {conflictedCrew.has(c.id) ? (
                <TriangleAlert className="size-3.5 text-critical" aria-label="Conflict" />
              ) : null}
              {canWrite ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Release ${c.member.name}`}
                  onClick={() => releaseCrew.mutate({ crewCallId: c.id })}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <div className="mt-2 flex gap-1.5">
            <Select
              value={member}
              onChange={(e) => setMember(e.target.value)}
              aria-label="Crew member"
            >
              <option value="">Call crew…</option>
              {team.data
                ?.filter((m) => !crewIds.has(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.title}
                  </option>
                ))}
            </Select>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role"
              className="w-28"
              aria-label="Role on shoot"
            />
            <Button
              aria-label="Call crew member"
              disabled={!member || !role.trim()}
              loading={call.isPending}
              onClick={() => call.mutate({ teamMemberId: member, role })}
            >
              <Plus />
            </Button>
          </div>
        ) : null}
      </InspectorSection>
      <InspectorSection title={`Equipment · ${s.bookings.length}`}>
        <ul className="flex flex-col gap-1">
          {s.bookings.map((b) => (
            <li key={b.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="flex-1 truncate text-left hover:underline"
                onClick={() => inspect({ type: 'asset', id: b.asset.id })}
              >
                {b.asset.name}
              </button>
              <span className="font-mono text-[10px] text-text-3">{b.asset.category}</span>
              {conflictedBookings.has(b.id) ? <Badge tone="critical">Double-booked</Badge> : null}
              {canWrite ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Release ${b.asset.name}`}
                  onClick={() => release.mutate({ bookingId: b.id })}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <div className="mt-2 flex gap-1.5">
            <Select value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Equipment">
              <option value="">Book equipment…</option>
              {assets.data
                ?.filter((a) => !bookedIds.has(a.id) && a.status === 'AVAILABLE')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
            <Button
              aria-label="Book equipment"
              disabled={!asset}
              loading={book.isPending}
              onClick={() => book.mutate({ assetId: asset })}
            >
              <Plus />
            </Button>
          </div>
        ) : null}
        {overlap ? (
          <div
            role="alert"
            className="mt-2 rounded-[var(--radius-sm)] border border-attention-line bg-attention-soft p-2 text-xs text-attention"
          >
            <p>{overlap.message}</p>
            <div className="mt-1.5 flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setOverlap(null)}>
                Choose another
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  overlap.kind === 'asset'
                    ? book.mutate({ assetId: asset, allowOverlap: true })
                    : call.mutate({ teamMemberId: member, role, allowOverlap: true })
                }
              >
                Book anyway (recorded)
              </Button>
            </div>
          </div>
        ) : null}
      </InspectorSection>
    </div>
  );
}
