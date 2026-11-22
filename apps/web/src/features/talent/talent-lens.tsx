'use client';

import { TALENT_KIND_LABELS, TALENT_KINDS, type TalentKind, type TalentView } from '@nova/shared';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Avatar, Meter } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { Tabs } from '@/features/studio/ui';
import { money, titleCase } from '@/lib/format';
import { useTalent, useTeam } from '@/lib/queries';
import { utilTone } from '@/lib/status';
import { useWorkspace } from '@/store/workspace';
import { TalentDialog } from './talent-dialog';

/** The artist roster and the crew, with availability; casting happens per shoot. */
export function TalentLens() {
  const [tab, setTab] = useState<'artists' | 'crew'>('artists');
  return (
    <div className="flex flex-col gap-3">
      <Tabs
        label="People"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'artists', label: 'Artists' },
          { value: 'crew', label: 'Crew' },
        ]}
      />
      {tab === 'artists' ? <Artists /> : <Crew />}
    </div>
  );
}

function Artists() {
  const canWrite = useCan('schedule:write');
  const inspect = useWorkspace((s) => s.inspect);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<TalentKind | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const query = useTalent({
    q: q.trim() || undefined,
    kind: kind || undefined,
    freeFrom: from && to ? from : undefined,
    freeTo: from && to ? to : undefined,
    includeInactive: archived ? 'true' : undefined,
  });
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search artists</span>
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-text-3" />
          <Input
            placeholder="Name, skill, language, city"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 text-base sm:text-sm"
          />
        </label>
        <Select
          aria-label="Profile type"
          value={kind}
          onChange={(e) => setKind(e.target.value as TalentKind | '')}
          className="w-40"
        >
          <option value="">All types</option>
          {TALENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {TALENT_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <label className="text-xs text-text-2">
          Free from
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 w-36"
          />
        </label>
        <label className="text-xs text-text-2">
          to
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 w-36"
          />
        </label>
        <label className="flex h-8 items-center gap-1.5 text-xs text-text-2">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />{' '}
          Show archived
        </label>
        {canWrite ? (
          <Button variant="primary" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus /> Add artist
          </Button>
        ) : null}
      </div>
      {from && to ? (
        <p className="text-xs text-text-3">
          Showing only artists with no booking or unavailability between {from} and {to}.
        </p>
      ) : null}
      <Panel bodyClassName="px-0" title={`${query.data?.length ?? '…'} artists`}>
        <PanelState
          query={query}
          isEmpty={!query.data?.length}
          empty={{ title: 'No artists match.', body: 'Clear the filters, or add an artist.' }}
        >
          <ul className="grid grid-cols-1 divide-y divide-line/60 md:grid-cols-2 md:divide-y-0">
            {(query.data ?? []).map((t) => (
              <ArtistRow key={t.id} t={t} onOpen={() => inspect({ type: 'talent', id: t.id })} />
            ))}
          </ul>
        </PanelState>
      </Panel>
      <TalentDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function ArtistRow({ t, onOpen }: { t: TalentView; onOpen: () => void }) {
  return (
    <li className="md:border-b md:border-line/60">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
      >
        <Avatar name={t.name} size={32} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{t.name}</span>
            {!t.isActive ? <Badge>Archived</Badge> : null}
          </span>
          <span className="block truncate text-2xs text-text-3">
            {TALENT_KIND_LABELS[t.kind]} · {t.baseCity}
            {t.playingAgeMin != null ? ` · plays ${t.playingAgeMin}–${t.playingAgeMax}` : ''} ·{' '}
            {t.experienceYears} yrs
            {t.dayRate ? ` · ${money(t.dayRate)}/day` : ''}
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            {t.skills.slice(0, 4).map((s) => (
              <Badge key={s} dot={false}>
                {s}
              </Badge>
            ))}
            {t.languages.map((l) => (
              <Badge key={l} tone="info" dot={false}>
                {l}
              </Badge>
            ))}
          </span>
        </span>
        <span className="shrink-0 text-right text-2xs text-text-3">
          <span className="block font-mono text-sm text-text">{t.upcoming}</span>upcoming
        </span>
      </button>
    </li>
  );
}

function Crew() {
  const team = useTeam();
  const inspect = useWorkspace((s) => s.inspect);
  return (
    <Panel bodyClassName="px-0" title="Crew and staff" eyebrow="Workload next 7 days">
      <PanelState query={team}>
        <ul className="divide-y divide-line/60">
          {(team.data ?? []).map((m) => {
            const w = m.weeks[0];
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => inspect({ type: 'member', id: m.id })}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
                >
                  <Avatar name={m.name} size={32} />
                  <span className="min-w-40 flex-1">
                    <span className="block text-sm font-medium">{m.name}</span>
                    <span className="block text-2xs text-text-3">
                      {m.title} · {titleCase(m.baseLocation)} · {m.skills.slice(0, 3).join(', ')}
                    </span>
                  </span>
                  <span className="w-40">
                    <span className="flex justify-between text-2xs text-text-3">
                      <span>{w ? `${w.hours}h of ${w.capacity}h` : '—'}</span>
                      <Badge tone={w ? utilTone[w.band] : 'neutral'}>
                        {w ? titleCase(w.band) : '—'}
                      </Badge>
                    </span>
                    <Meter
                      value={Math.min(1, w?.ratio ?? 0)}
                      tone={
                        w && w.ratio > 1 ? 'critical' : w && w.ratio > 0.85 ? 'attention' : 'signal'
                      }
                      className="mt-1"
                      label={`${m.name} workload`}
                    />
                  </span>
                  <span className="w-28 text-right text-2xs text-text-3">
                    {m.upcomingShoots.length} upcoming shoot(s)
                    <br />
                    {m.openTasks} open tasks
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PanelState>
    </Panel>
  );
}
