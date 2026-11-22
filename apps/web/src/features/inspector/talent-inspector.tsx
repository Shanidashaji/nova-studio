'use client';

import { TALENT_KIND_LABELS, type TalentDetail } from '@nova/shared';
import { Archive, ExternalLink, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { TalentDialog } from '@/features/talent/talent-dialog';
import { date, money } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useTalentOne } from '@/lib/queries';
import { shootTone } from '@/lib/status';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection, KeyValue } from './inspector-router';

/** An artist's profile, availability, bookings and the productions they worked on. */
export function TalentInspector({ id }: { id: string }) {
  const q = useTalentOne(id);
  if (q.isPending)
    return (
      <div className="p-4">
        <Skeleton className="h-40" />
      </div>
    );
  return <PanelState query={q}>{q.data ? <Body t={q.data} /> : null}</PanelState>;
}

function Body({ t }: { t: TalentDetail }) {
  const canWrite = useCan('schedule:write');
  const inspect = useWorkspace((s) => s.inspect);
  const openShootDay = useWorkspace((s) => s.openShootDay);
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const archive = useApiMutation<{ isActive: boolean }>('PATCH', `/talent/${t.id}`, {
    success: (_r, b) => (b.isActive ? 'Restored to the roster' : 'Archived from the roster'),
  });
  const block = useApiMutation<{ from: string; to: string; reason: string }>(
    'POST',
    `/talent/${t.id}/unavailability`,
    {
      success: 'Unavailability added',
      onSuccess: () => {
        setFrom('');
        setTo('');
        setReason('');
      },
    },
  );
  const unblock = useApiMutation<{ blockId: string }>(
    'DELETE',
    ({ blockId }) => `/talent/${t.id}/unavailability/${blockId}`,
    {
      success: 'Unavailability removed',
    },
  );
  const upcoming = t.bookings.filter(
    (b) => b.status !== 'RELEASED' && new Date(b.shoot.endsAt) >= new Date(),
  );
  const past = t.bookings.filter((b) => !upcoming.includes(b));

  return (
    <div>
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <Avatar name={t.name} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-6">{t.name}</h2>
          <p className="text-sm text-text-2">
            {TALENT_KIND_LABELS[t.kind]} · {t.baseCity}
            {t.willTravel ? ' · travels' : ' · local only'}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {!t.isActive ? <Badge>Archived</Badge> : null}
            {t.languages.map((l) => (
              <Badge key={l} tone="info" dot={false}>
                {l}
              </Badge>
            ))}
          </div>
        </div>
        {canWrite ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Edit profile"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        ) : null}
      </div>
      <InspectorSection title="Profile">
        <KeyValue
          items={[
            [
              'Email',
              t.email ? (
                <a key="e" href={`mailto:${t.email}`} className="hover:underline">
                  {t.email}
                </a>
              ) : (
                '—'
              ),
            ],
            [
              'Phone',
              t.phone ? (
                <a key="p" href={`tel:${t.phone.replace(/\s/g, '')}`} className="hover:underline">
                  {t.phone}
                </a>
              ) : (
                '—'
              ),
            ],
            ['Agency', t.agency ?? '—'],
            ['Plays', t.playingAgeMin != null ? `${t.playingAgeMin}–${t.playingAgeMax}` : '—'],
            ['Experience', `${t.experienceYears} years`],
            ...(t.dayRate ? ([['Day rate', money(t.dayRate)]] as [string, string][]) : []),
            [
              'Portfolio',
              t.portfolioUrl ? (
                <a
                  key="u"
                  href={t.portfolioUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  Open <ExternalLink className="size-3" />
                </a>
              ) : (
                '—'
              ),
            ],
          ]}
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {t.skills.map((s) => (
            <Badge key={s} dot={false}>
              {s}
            </Badge>
          ))}
        </div>
        {t.notes ? <p className="mt-2 text-xs text-text-2">{t.notes}</p> : null}
      </InspectorSection>

      <InspectorSection title="Unavailable">
        {t.unavailable.length === 0 ? (
          <p className="text-sm text-text-3">No blocked dates.</p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {t.unavailable.map((u) => (
            <li key={u.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                {date(u.from)} – {date(u.to)}
                {u.reason ? <span className="text-text-3"> · {u.reason}</span> : null}
              </span>
              {canWrite ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove"
                  onClick={() => unblock.mutate({ blockId: u.id })}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form
            className="mt-2 grid grid-cols-2 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              block.mutate({ from, to, reason });
            }}
          >
            <Input
              type="date"
              aria-label="From"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              aria-label="To"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
            <Input
              className="col-span-2"
              aria-label="Reason"
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit" size="sm" className="col-span-2" disabled={!from || !to}>
              <Plus /> Block dates
            </Button>
          </form>
        ) : null}
      </InspectorSection>

      <InspectorSection title={`Upcoming bookings (${upcoming.length})`}>
        {upcoming.length === 0 ? (
          <p className="text-sm text-text-3">Free — no upcoming shoot.</p>
        ) : null}
        <ul className="flex flex-col gap-1.5">
          {upcoming.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                className="w-full text-left hover:underline"
                onClick={() => openShootDay(b.shoot.id)}
              >
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{b.shoot.title}</span>
                  <Badge tone={b.status === 'CONFIRMED' ? 'signal' : 'attention'}>
                    {b.status === 'HOLD' ? 'Hold' : 'Confirmed'}
                  </Badge>
                </span>
                <span className="block text-2xs text-text-3">
                  {date(b.shoot.startsAt)} · {b.project.title} · as {b.character}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </InspectorSection>

      <InspectorSection title="History">
        {past.length === 0 ? <p className="text-sm text-text-3">No previous bookings.</p> : null}
        <ul className="flex flex-col gap-1.5">
          {past.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="min-w-0 text-left hover:underline"
                onClick={() => inspect({ type: 'project', id: b.project.id })}
              >
                <span className="block truncate">{b.project.title}</span>
                <span className="block text-2xs text-text-3">
                  {b.project.clientName} · as {b.character} · {date(b.shoot.startsAt)}
                </span>
              </button>
              <Badge tone={b.status === 'RELEASED' ? 'neutral' : shootTone[b.shoot.status]}>
                {b.status === 'RELEASED'
                  ? 'Released'
                  : b.shoot.status === 'WRAPPED'
                    ? 'Completed'
                    : b.shoot.status.toLowerCase()}
              </Badge>
            </li>
          ))}
        </ul>
      </InspectorSection>

      {canWrite ? (
        <div className="px-4 py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => archive.mutate({ isActive: !t.isActive })}
          >
            <Archive /> {t.isActive ? 'Archive from roster' : 'Restore to roster'}
          </Button>
        </div>
      ) : null}
      <TalentDialog open={editing} onOpenChange={setEditing} talent={t} />
    </div>
  );
}
