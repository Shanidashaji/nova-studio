'use client';

import {
  FOOTAGE_STATUSES,
  FOOTAGE_STATUS_LABELS,
  SHOOT_LOG_KIND_LABELS,
  SHOOT_STATUS_LABELS,
  type SceneView,
  type ShootLogKind,
  type ShootWorkspaceView,
} from '@nova/shared';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';
import { Avatar, Meter, Segmented } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { ReadinessList, Stat, Tabs, dayLabel, istToday, minutes } from '@/features/studio/ui';
import { CastingPanel } from '@/features/talent/casting-panel';
import { ago, time } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useShootDayList, useShootWorkspace, useTeam } from '@/lib/queries';
import { shootTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';

const shiftDay = (key: string, n: number) =>
  new Date(new Date(`${key}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

type Tab = 'scenes' | 'log' | 'people' | 'callsheet' | 'checklist' | 'readiness';

/** The set's screen: today's shoots, the running order of scenes, the log and the call sheet. */
export function ShootDayLens() {
  const selected = useWorkspace((s) => s.shootDayId);
  const openShootDay = useWorkspace((s) => s.openShootDay);
  const [chosenDay, setChosenDay] = useState(istToday());
  const ws = useShootWorkspace(selected);
  // A shoot opened from elsewhere shows its own day when it is not on the chosen one.
  const day =
    ws.data && !ws.data.days.some((d) => d.key === chosenDay) ? ws.data.days[0]!.key : chosenDay;
  const list = useShootDayList(day);
  /** Changing the day clears the selection; the day's first shoot is then opened. */
  const setDay = (next: string | ((d: string) => string)) => {
    setChosenDay(typeof next === 'function' ? next(day) : next);
    openShootDay(null);
  };

  // A shoot opened from elsewhere shows its own day; otherwise pick the day's first shoot.
  useEffect(() => {
    if (!selected && list.data?.shoots[0]) openShootDay(list.data.shoots[0].id);
  }, [selected, list.data, openShootDay]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Day">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous day"
            onClick={() => setDay((d) => shiftDay(d, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button size="sm" disabled={day === istToday()} onClick={() => setDay(istToday())}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next day"
            onClick={() => setDay((d) => shiftDay(d, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <p className="text-sm font-medium" aria-live="polite">
          {dayLabel(day)}
        </p>
        <div className="scrollbar-none flex w-full gap-1.5 overflow-x-auto sm:w-auto">
          {(list.data?.shoots ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openShootDay(s.id)}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-xs pointer-coarse:h-10',
                selected === s.id
                  ? 'border-text bg-text text-bg'
                  : 'border-line bg-surface-2 text-text-2 hover:text-text',
              )}
            >
              {s.title}
              {s.day.of > 1 ? ` · D${s.day.day}/${s.day.of}` : ''}
            </button>
          ))}
        </div>
      </div>

      {list.data && list.data.shoots.length === 0 && !selected ? (
        <Panel>
          <p className="py-6 text-sm text-text-2">
            No shoot on {dayLabel(day)}.
            {list.data.next ? (
              <>
                {' '}
                Next:{' '}
                <button
                  type="button"
                  className="font-medium underline-offset-4 hover:underline"
                  onClick={() => openShootDay(list.data!.next!.id)}
                >
                  {list.data.next.title}, {dayLabel(list.data.next.startsAt.slice(0, 10))}
                </button>
              </>
            ) : null}
          </p>
        </Panel>
      ) : null}

      {selected ? (
        <PanelState query={ws} skeleton="block">
          {ws.data ? <Workspace w={ws.data} day={day} setDay={setChosenDay} /> : null}
        </PanelState>
      ) : null}
    </div>
  );
}

function Workspace({
  w,
  day,
  setDay,
}: {
  w: ShootWorkspaceView;
  day: string;
  setDay: (d: string) => void;
}) {
  const s = w.shoot;
  const canSchedule = useCan('schedule:write');
  const canTask = useCan('task:write');
  const canLog = canSchedule || canTask;
  const inspect = useWorkspace((st) => st.inspect);
  const [tab, setTab] = useState<Tab>('scenes');
  const status = useApiMutation<{ status: string }>('PATCH', `/shoots/${s.id}`, {
    success: (_r, b) =>
      `Shoot ${SHOOT_STATUS_LABELS[b.status as keyof typeof SHOOT_STATUS_LABELS].toLowerCase()}`,
  });
  const today = w.days.find((d) => d.key === day);
  const scenesToday = w.scenes.filter((x) => !x.shootDate || x.shootDate.slice(0, 10) === day);
  const otherScenes = w.scenes.filter((x) => x.shootDate && x.shootDate.slice(0, 10) !== day);
  const shotToday = scenesToday.filter((x) => x.status === 'SHOT').length;
  const liveToday = scenesToday.filter((x) => x.status !== 'DROPPED').length;

  const next =
    s.status === 'PLANNED'
      ? {
          to: 'CONFIRMED',
          label: 'Confirm shoot',
          icon: CheckCircle2,
          disabled: !w.readiness.canConfirm,
        }
      : s.status === 'CONFIRMED'
        ? {
            to: 'IN_PROGRESS',
            label: 'Start shoot day',
            icon: Play,
            disabled: !w.readiness.canStart,
          }
        : s.status === 'IN_PROGRESS'
          ? { to: 'WRAPPED', label: 'Wrap shoot', icon: Square, disabled: false }
          : null;

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <div className="flex flex-col gap-3 pt-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => inspect({ type: 'project', id: s.project.id })}
              className="font-mono text-[10px] text-text-3 hover:text-text"
            >
              {s.project.code} · {s.project.title} · {w.client.name}
            </button>
            <h2 className="text-xl font-semibold leading-7">{s.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-2">
              <Badge tone={shootTone[s.status]}>{SHOOT_STATUS_LABELS[s.status]}</Badge>
              {today ? (
                <span className="font-medium">
                  Day {today.day} of {today.of}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {s.location}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-3">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" /> Crew call {w.crewCallTime ?? '—'} · Talent call{' '}
                {s.callTime ?? time(s.startsAt)}
              </span>
              <span>Wrap {time(s.endsAt)}</span>
              {w.productionManager ? (
                <span>PM {w.productionManager.name}</span>
              ) : (
                <span className="text-attention">No production manager</span>
              )}
              {w.client.contactName ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" /> {w.client.contactName}
                  {w.client.contactPhone ? (
                    <a
                      className="underline-offset-4 hover:underline"
                      href={`tel:${w.client.contactPhone.replace(/\s/g, '')}`}
                    >
                      {w.client.contactPhone}
                    </a>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
          {canSchedule && next ? (
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <Button
                variant="primary"
                size="lg"
                disabled={next.disabled || status.isPending}
                onClick={() => status.mutate({ status: next.to })}
              >
                <next.icon /> {next.label}
              </Button>
              {next.disabled ? (
                <button
                  type="button"
                  className="text-xs text-attention hover:underline"
                  onClick={() => setTab('readiness')}
                >
                  {next.to === 'IN_PROGRESS' && w.readiness.canConfirm
                    ? 'Publish the call sheet first'
                    : 'Not ready — see what is missing'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Scenes shot today"
            value={`${shotToday}/${liveToday}`}
            tone={liveToday && shotToday === liveToday ? 'signal' : 'neutral'}
          />
          <Stat
            label="Shoot progress"
            value={`${w.progress.total ? Math.round((w.progress.shot / w.progress.total) * 100) : 0}%`}
            hint={`${minutes(w.progress.minutesShot)} of ${minutes(w.progress.minutesPlanned)} planned`}
          />
          <Stat
            label="Delay logged"
            value={minutes(w.delayMinutes)}
            tone={w.delayMinutes >= 30 ? 'attention' : 'neutral'}
          />
          <Stat
            label="Open issues"
            value={w.openIssues}
            tone={w.openIssues ? 'critical' : 'neutral'}
            onClick={() => setTab('log')}
          />
        </div>
        {w.progress.total ? (
          <Meter
            value={w.progress.shot / w.progress.total}
            className="mt-3"
            label="Shoot progress"
          />
        ) : null}
        {w.days.length > 1 ? (
          <div className="mt-3">
            <Segmented
              label="Shoot day"
              value={day}
              onChange={setDay}
              options={w.days.map((d) => ({
                value: d.key,
                label: `Day ${d.day} · ${dayLabel(d.key)}`,
              }))}
            />
          </div>
        ) : null}
      </Panel>

      <Tabs<Tab>
        label="Shoot day sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'scenes', label: 'Scenes', badge: liveToday },
          { value: 'log', label: 'Log', badge: w.openIssues },
          {
            value: 'people',
            label: 'Cast & crew',
            badge: s.crew.length + w.talent.filter((t) => t.status !== 'RELEASED').length,
          },
          { value: 'callsheet', label: 'Call sheet' },
          {
            value: 'checklist',
            label: 'Checklist',
            badge: w.checklist.filter((c) => !c.done).length,
          },
          { value: 'readiness', label: 'Readiness' },
        ]}
      />

      {tab === 'scenes' ? (
        <div className="flex flex-col gap-2">
          {scenesToday.length === 0 ? (
            <p className="py-4 text-sm text-text-2">
              No scenes planned for this day. Schedule scenes from Scripts → Scene breakdown.
            </p>
          ) : (
            scenesToday.map((sc) => <SceneCard key={sc.id} sc={sc} canEdit={canLog} />)
          )}
          {otherScenes.length ? (
            <details className="rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2">
              <summary className="cursor-pointer text-sm text-text-2">
                {otherScenes.length} scene(s) on other days of this shoot
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {otherScenes.map((sc) => (
                  <SceneCard key={sc.id} sc={sc} canEdit={canLog} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
      {tab === 'log' ? <LogTab w={w} canLog={canLog} /> : null}
      {tab === 'people' ? <PeopleTab w={w} canEdit={canSchedule} /> : null}
      {tab === 'callsheet' ? (
        <CallSheetTab
          key={`${w.crewCallTime}|${w.callSheetNotes}|${w.productionManager?.id}`}
          w={w}
          canEdit={canSchedule}
        />
      ) : null}
      {tab === 'checklist' ? <ChecklistTab w={w} canEdit={canLog} canRemove={canSchedule} /> : null}
      {tab === 'readiness' ? (
        <Panel title={`Readiness ${w.readiness.score}%`} eyebrow="Before the camera rolls">
          <ReadinessList
            items={w.readiness.items}
            onItem={(k) =>
              setTab(
                k === 'callsheet'
                  ? 'callsheet'
                  : k === 'checklist'
                    ? 'checklist'
                    : k === 'crew' || k === 'casting' || k === 'manager'
                      ? 'people'
                      : 'readiness',
              )
            }
          />
        </Panel>
      ) : null}
    </div>
  );
}

function SceneCard({ sc, canEdit }: { sc: SceneView; canEdit: boolean }) {
  const update = useApiMutation<{ status: string }>('PATCH', `/scenes/${sc.id}`, {
    success: (_r, b) =>
      b.status === 'SHOT'
        ? `Scene ${sc.number} shot`
        : b.status === 'DROPPED'
          ? `Scene ${sc.number} dropped`
          : `Scene ${sc.number} reopened`,
  });
  return (
    <article
      className={cn(
        'rounded-[var(--radius-md)] border bg-surface-2 p-3',
        sc.status === 'SHOT'
          ? 'border-signal-line'
          : sc.status === 'DROPPED'
            ? 'border-dashed border-line'
            : 'border-line',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-3 font-mono text-sm">
          {sc.number}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium', sc.status === 'DROPPED' && 'line-through')}>
            {sc.heading}
          </p>
          <p className="text-2xs text-text-3">
            {sc.plannedStart ? `${sc.plannedStart} · ` : ''}
            {minutes(sc.estimatedMinutes)} ·{' '}
            {sc.setting === 'INT_EXT'
              ? 'Int./Ext.'
              : sc.setting === 'INT'
                ? 'Interior'
                : 'Exterior'}{' '}
            · {sc.timeOfDay.toLowerCase()}
            {sc.location ? ` · ${sc.location}` : ''}
          </p>
          {sc.description ? <p className="mt-1 text-xs text-text-2">{sc.description}</p> : null}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {sc.characters.map((c) => (
              <Badge key={c} tone="info" dot={false}>
                {c}
              </Badge>
            ))}
            {sc.props.slice(0, 6).map((p) => (
              <Badge key={p} dot={false}>
                {p}
              </Badge>
            ))}
            {sc.equipment.map((e) => (
              <Badge key={e} tone="ai" dot={false}>
                {e}
              </Badge>
            ))}
          </div>
          {sc.requirements ? (
            <p className="mt-1 text-2xs text-attention">{sc.requirements}</p>
          ) : null}
        </div>
      </div>
      {canEdit ? (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {sc.status !== 'SHOT' && sc.status !== 'DROPPED' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => update.mutate({ status: 'DROPPED' })}
              >
                <XCircle /> Drop
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={update.isPending}
                onClick={() => update.mutate({ status: 'SHOT' })}
              >
                <CheckCircle2 /> Mark shot
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => update.mutate({ status: 'SCHEDULED' })}
            >
              <RotateCcw /> Reopen
            </Button>
          )}
        </div>
      ) : null}
    </article>
  );
}

function LogTab({ w, canLog }: { w: ShootWorkspaceView; canLog: boolean }) {
  const [kind, setKind] = useState<ShootLogKind>('ISSUE');
  const [body, setBody] = useState('');
  const [mins, setMins] = useState('');
  const add = useApiMutation<{ kind: ShootLogKind; body: string; minutesLost: number }>(
    'POST',
    `/shoots/${w.shoot.id}/log`,
    {
      success: (_r, b) => `${SHOOT_LOG_KIND_LABELS[b.kind]} logged`,
      onSuccess: () => {
        setBody('');
        setMins('');
      },
    },
  );
  const resolve = useApiMutation<{ id: string; resolved: boolean }>(
    'PATCH',
    ({ id }) => `/shoot-log/${id}`,
    {
      transform: ({ resolved }) => ({ resolved }),
      success: (_r, b) => (b.resolved ? 'Marked resolved' : 'Reopened'),
    },
  );
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      {canLog ? (
        <Panel title="Log from the set">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim())
                add.mutate({
                  kind,
                  body: body.trim(),
                  minutesLost: kind === 'DELAY' ? Number(mins || 0) : 0,
                });
            }}
          >
            <Segmented<ShootLogKind>
              label="Kind"
              value={kind}
              onChange={setKind}
              options={(['ISSUE', 'DELAY', 'SCHEDULE_CHANGE', 'NOTE'] as const).map((k) => ({
                value: k,
                label: SHOOT_LOG_KIND_LABELS[k],
              }))}
            />
            <Textarea
              aria-label="What happened"
              placeholder="What happened, and what is the plan?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="text-base sm:text-sm"
            />
            {kind === 'DELAY' ? (
              <label className="flex items-center gap-2 text-xs text-text-2">
                Minutes lost
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  inputMode="numeric"
                  value={mins}
                  onChange={(e) => setMins(e.target.value)}
                  className="w-24 text-base sm:text-sm"
                />
              </label>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              disabled={!body.trim() || add.isPending}
              loading={add.isPending}
            >
              <Plus /> Add to log
            </Button>
            <p className="text-2xs text-text-3">
              Issues and delays of 30 minutes or more notify the schedulers.
            </p>
          </form>
        </Panel>
      ) : null}
      <Panel title="Shoot log" eyebrow={`${w.log.length} entries`}>
        {w.log.length === 0 ? (
          <p className="text-sm text-text-2">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/60">
            {w.log.map((l) => (
              <li key={l.id} className="flex items-start gap-2 py-2">
                <Badge
                  tone={
                    l.kind === 'ISSUE'
                      ? l.resolvedAt
                        ? 'neutral'
                        : 'critical'
                      : l.kind === 'DELAY'
                        ? 'attention'
                        : l.kind === 'SCHEDULE_CHANGE'
                          ? 'info'
                          : 'neutral'
                  }
                >
                  {SHOOT_LOG_KIND_LABELS[l.kind]}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', l.resolvedAt && 'text-text-3 line-through')}>
                    {l.body}
                  </p>
                  <p className="text-2xs text-text-3">
                    {l.author} · {ago(l.createdAt)}
                    {l.minutesLost ? ` · ${minutes(l.minutesLost)} lost` : ''}
                  </p>
                </div>
                {canLog && l.kind === 'ISSUE' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => resolve.mutate({ id: l.id, resolved: !l.resolvedAt })}
                  >
                    {l.resolvedAt ? 'Reopen' : 'Resolve'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function PeopleTab({ w, canEdit }: { w: ShootWorkspaceView; canEdit: boolean }) {
  const inspect = useWorkspace((st) => st.inspect);
  const updateBooking = useApiMutation<{ id: string; status: string }>(
    'PATCH',
    ({ id }) => `/talent-bookings/${id}`,
    {
      transform: ({ status }) => ({ status }),
      success: (_r, b) =>
        b.status === 'CONFIRMED'
          ? 'Artist confirmed'
          : b.status === 'RELEASED'
            ? 'Artist released'
            : 'Booking on hold',
    },
  );
  const conflicted = new Set(
    w.shoot.conflicts.map((c) => c.crewCallId ?? c.talentBookingId).filter(Boolean),
  );
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel
        title="Crew"
        eyebrow={`Call ${w.crewCallTime ?? '—'}`}
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => inspect({ type: 'shoot', id: w.shoot.id })}
          >
            <Users /> Manage
          </Button>
        }
      >
        {w.shoot.crew.length === 0 ? (
          <p className="text-sm text-text-2">Nobody called yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {w.shoot.crew.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Avatar name={c.member.name} size={26} />
                <button
                  type="button"
                  onClick={() => inspect({ type: 'member', id: c.member.id })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm">{c.member.name}</span>
                  <span className="block truncate text-2xs text-text-3">{c.role}</span>
                </button>
                {conflicted.has(c.id) ? <Badge tone="critical">Double-booked</Badge> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-2xs text-text-3">
          <Camera className="mr-1 inline size-3" />
          {w.shoot.bookings.length} equipment item(s):{' '}
          {w.shoot.bookings.map((b) => b.asset.name).join(', ') || 'none'}
        </p>
      </Panel>
      <Panel title="Artists" eyebrow={`Talent call ${w.shoot.callTime ?? '—'}`}>
        {w.talent.length === 0 ? (
          <p className="text-sm text-text-2">No artists booked.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {w.talent.map((t) => (
              <li
                key={t.id}
                className={cn(
                  'flex flex-wrap items-center gap-2',
                  t.status === 'RELEASED' && 'opacity-60',
                )}
              >
                <Avatar name={t.talent.name} size={26} />
                <button
                  type="button"
                  onClick={() => inspect({ type: 'talent', id: t.talent.id })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm">{t.talent.name}</span>
                  <span className="block truncate text-2xs text-text-3">
                    as {t.character}
                    {t.talent.phone ? ` · ${t.talent.phone}` : ''}
                  </span>
                </button>
                <Badge
                  tone={
                    t.status === 'CONFIRMED'
                      ? 'signal'
                      : t.status === 'HOLD'
                        ? 'attention'
                        : 'neutral'
                  }
                >
                  {t.status === 'HOLD'
                    ? 'On hold'
                    : t.status === 'CONFIRMED'
                      ? 'Confirmed'
                      : 'Released'}
                </Badge>
                {conflicted.has(t.id) ? <Badge tone="critical">Double-booked</Badge> : null}
                {canEdit && t.status !== 'RELEASED' ? (
                  <span className="flex gap-1">
                    {t.status === 'HOLD' ? (
                      <Button
                        size="sm"
                        onClick={() => updateBooking.mutate({ id: t.id, status: 'CONFIRMED' })}
                      >
                        Confirm
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updateBooking.mutate({ id: t.id, status: 'RELEASED' })}
                    >
                      Release
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {canEdit && w.shoot.status !== 'WRAPPED' && w.shoot.status !== 'CANCELLED' ? (
        <div className="lg:col-span-2">
          <CastingPanel shootId={w.shoot.id} />
        </div>
      ) : null}
    </div>
  );
}

function CallSheetTab({ w, canEdit }: { w: ShootWorkspaceView; canEdit: boolean }) {
  const team = useTeam();
  const [crewCall, setCrewCall] = useState(w.crewCallTime ?? '');
  const [notes, setNotes] = useState(w.callSheetNotes ?? '');
  const [pm, setPm] = useState(w.productionManager?.id ?? '');
  const save = useApiMutation<Record<string, unknown>>(
    'PATCH',
    `/shoots/${w.shoot.id}/production`,
    { success: 'Call sheet saved' },
  );
  const publish = useApiMutation<void>('POST', `/shoots/${w.shoot.id}/call-sheet/publish`, {
    success: 'Call sheet published to the crew',
  });
  const dirty =
    crewCall !== (w.crewCallTime ?? '') ||
    notes !== (w.callSheetNotes ?? '') ||
    pm !== (w.productionManager?.id ?? '');
  const sorted = useMemo(() => [...w.scenes].filter((x) => x.status !== 'DROPPED'), [w.scenes]);
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Panel
        title="Call sheet"
        eyebrow={
          w.callSheetPublishedAt ? `Published ${ago(w.callSheetPublishedAt)}` : 'Not published'
        }
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs text-text-2">
            Crew call
            <Input
              type="time"
              value={crewCall}
              disabled={!canEdit}
              onChange={(e) => setCrewCall(e.target.value)}
              className="mt-1 text-base sm:text-sm"
            />
          </label>
          <label className="text-xs text-text-2">
            Production manager
            <Select
              value={pm}
              disabled={!canEdit}
              onChange={(e) => setPm(e.target.value)}
              className="mt-1"
            >
              <option value="">Not assigned</option>
              {(team.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.title}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-text-2">
            Notes for the crew (parking, safety, nearest hospital, weather plan)
            <Textarea
              value={notes}
              disabled={!canEdit}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 text-base sm:text-sm"
              rows={4}
            />
          </label>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!dirty || save.isPending}
                loading={save.isPending}
                onClick={() =>
                  save.mutate({
                    crewCallTime: crewCall || null,
                    callSheetNotes: notes,
                    productionManagerId: pm || null,
                  })
                }
              >
                Save
              </Button>
              <Button
                variant="primary"
                disabled={dirty || publish.isPending}
                loading={publish.isPending}
                onClick={() => publish.mutate()}
              >
                {w.callSheetPublishedAt ? 'Re-publish to crew' : 'Publish to crew'}
              </Button>
              {dirty ? (
                <span className="self-center text-2xs text-attention">Save before publishing.</span>
              ) : null}
            </div>
          ) : null}
          <label className="mt-2 text-xs text-text-2">
            Footage
            <Select
              value={w.footageStatus}
              disabled={!canEdit}
              onChange={(e) => save.mutate({ footageStatus: e.target.value })}
              className="mt-1"
            >
              {FOOTAGE_STATUSES.map((f) => (
                <option key={f} value={f}>
                  {FOOTAGE_STATUS_LABELS[f]}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Panel>
      <Panel title="Running order" eyebrow={`${sorted.length} scenes`}>
        <ol className="flex flex-col divide-y divide-line/60 text-sm">
          {sorted.map((sc) => (
            <li key={sc.id} className="flex gap-3 py-1.5">
              <span className="w-12 shrink-0 font-mono text-xs text-text-3">
                {sc.plannedStart ?? '—'}
              </span>
              <span className="w-8 shrink-0 font-mono text-xs">{sc.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{sc.heading}</span>
                <span className="block truncate text-2xs text-text-3">
                  {sc.shootDate ? `${dayLabel(sc.shootDate.slice(0, 10))} · ` : ''}
                  {minutes(sc.estimatedMinutes)}
                  {sc.characters.length ? ` · ${sc.characters.join(', ')}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function ChecklistTab({
  w,
  canEdit,
  canRemove,
}: {
  w: ShootWorkspaceView;
  canEdit: boolean;
  canRemove: boolean;
}) {
  const [label, setLabel] = useState('');
  const toggle = useApiMutation<{ id: string; done: boolean }>(
    'PATCH',
    ({ id }) => `/shoots/${w.shoot.id}/checklist/${id}`,
    { transform: ({ done }) => ({ done }) },
  );
  const add = useApiMutation<{ label: string }>('POST', `/shoots/${w.shoot.id}/checklist`, {
    success: 'Item added',
    onSuccess: () => setLabel(''),
  });
  const remove = useApiMutation<{ id: string }>(
    'DELETE',
    ({ id }) => `/shoots/${w.shoot.id}/checklist/${id}`,
  );
  return (
    <Panel
      title="Pre-shoot checklist"
      eyebrow={`${w.checklist.filter((c) => c.done).length} of ${w.checklist.length} done`}
    >
      <ul className="flex flex-col">
        {w.checklist.map((c) => (
          <li key={c.id} className="flex items-center gap-2 border-b border-line/60 py-1">
            <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[var(--signal)]"
                checked={c.done}
                disabled={!canEdit}
                onChange={(e) => toggle.mutate({ id: c.id, done: e.target.checked })}
              />
              <span className={cn(c.done && 'text-text-3 line-through')}>{c.label}</span>
            </label>
            {c.doneBy ? (
              <span className="hidden text-2xs text-text-3 sm:inline">{c.doneBy}</span>
            ) : null}
            {canRemove ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${c.label}`}
                onClick={() => remove.mutate({ id: c.id })}
              >
                <Trash2 />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) add.mutate({ label: label.trim() });
          }}
        >
          <Input
            aria-label="New checklist item"
            placeholder="Add an item"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="text-base sm:text-sm"
          />
          <Button type="submit" disabled={!label.trim()}>
            <Plus /> Add
          </Button>
        </form>
      ) : null}
    </Panel>
  );
}
