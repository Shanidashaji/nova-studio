'use client';

import { FOOTAGE_STATUS_LABELS, type PostProductionItem } from '@nova/shared';
import { Check, ExternalLink, Send, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { Tone } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Meter, Segmented } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { Stat, StatRow } from '@/features/studio/ui';
import { date } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { usePostProduction, useTeam } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';

const STATES: { key: PostProductionItem['reviewState']; label: string; tone: Tone }[] = [
  { key: 'EDITING', label: 'Editing', tone: 'info' },
  { key: 'INTERNAL_REVIEW', label: 'Internal review', tone: 'ai' },
  { key: 'PENDING_CLIENT', label: 'Pending client review', tone: 'attention' },
  { key: 'OVERDUE', label: 'Overdue review', tone: 'critical' },
  { key: 'REVISION_REQUESTED', label: 'Revision requested', tone: 'critical' },
  { key: 'APPROVED', label: 'Approved', tone: 'signal' },
  { key: 'DELIVERED', label: 'Delivered', tone: 'neutral' },
];
const toneOf = (k: PostProductionItem['reviewState']) => STATES.find((s) => s.key === k)!;

/** Post-production board: editors, cut progress, internal then client review, revisions. */
export function PostLens() {
  const q = usePostProduction();
  const [filter, setFilter] = useState<'all' | PostProductionItem['reviewState']>('all');
  const items = (q.data?.items ?? []).filter((i) => filter === 'all' || i.reviewState === filter);
  const count = (k: PostProductionItem['reviewState']) =>
    q.data?.items.filter((i) => i.reviewState === k).length ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <StatRow>
        <Stat
          label="Editing"
          value={count('EDITING')}
          tone="info"
          onClick={() => setFilter('EDITING')}
        />
        <Stat
          label="Internal review"
          value={count('INTERNAL_REVIEW')}
          tone="ai"
          onClick={() => setFilter('INTERNAL_REVIEW')}
        />
        <Stat
          label="Pending client"
          value={count('PENDING_CLIENT')}
          tone="attention"
          onClick={() => setFilter('PENDING_CLIENT')}
        />
        <Stat
          label="Overdue reviews"
          value={count('OVERDUE')}
          tone={count('OVERDUE') ? 'critical' : 'neutral'}
          onClick={() => setFilter('OVERDUE')}
        />
        <Stat
          label="Revisions requested"
          value={count('REVISION_REQUESTED')}
          tone={count('REVISION_REQUESTED') ? 'critical' : 'neutral'}
          onClick={() => setFilter('REVISION_REQUESTED')}
        />
        <Stat
          label="Approved"
          value={count('APPROVED')}
          tone="signal"
          onClick={() => setFilter('APPROVED')}
        />
      </StatRow>
      <Segmented
        label="Review state"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all' as const, label: 'All' },
          ...STATES.map((s) => ({ value: s.key, label: s.label })),
        ]}
      />
      <PanelState
        query={q}
        skeleton="block"
        isEmpty={items.length === 0}
        empty={{ title: 'Nothing here.', body: 'No deliverable is in this state.' }}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {items.map((i) => (
            <Card key={i.deliverableId} i={i} />
          ))}
        </div>
      </PanelState>
      {q.data ? (
        <Panel title="Editors" eyebrow="Open assignments">
          <ul className="flex flex-wrap gap-2">
            {q.data.editors.map((e) => (
              <li
                key={e.id}
                className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-1.5 text-sm"
              >
                {e.name} <span className="text-2xs text-text-3">{e.title}</span>{' '}
                <span className="ml-1 font-mono">{e.assigned}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function Card({ i }: { i: PostProductionItem }) {
  const inspect = useWorkspace((s) => s.inspect);
  const team = useTeam();
  const canWrite = useCan('project:write');
  const canDecide = useCan('approval:decide');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(String(i.editProgress));
  const post = useApiMutation<Record<string, unknown>>(
    'PATCH',
    `/deliverables/${i.deliverableId}/post`,
    { success: 'Saved' },
  );
  const internal = useApiMutation<{ action: string; note?: string }>(
    'POST',
    `/deliverables/${i.deliverableId}/internal-review`,
    {
      success: (_r, b) =>
        b.action === 'REQUEST'
          ? 'Sent for internal review'
          : b.action === 'APPROVE'
            ? 'Passed internal review'
            : 'Changes requested',
      onSuccess: () => setNote(''),
    },
  );
  const send = useApiMutation<Record<string, never>>(
    'POST',
    `/deliverables/${i.deliverableId}/review`,
    { success: 'Sent to the client — an approval message was prepared' },
  );
  const st = toneOf(i.reviewState);
  const closed = i.reviewState === 'APPROVED' || i.reviewState === 'DELIVERED';

  return (
    <article
      className={cn(
        'rounded-[var(--radius-md)] border bg-surface-1 p-3',
        i.reviewState === 'OVERDUE' ? 'border-critical-line' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {i.name} <span className="font-mono text-xs text-text-3">v{i.version}</span>
          </p>
          <button
            type="button"
            onClick={() => inspect({ type: 'project', id: i.project.id, section: 'deliverables' })}
            className="inline-flex items-center gap-1 truncate text-2xs text-text-3 hover:text-text"
          >
            {i.project.code} · {i.project.title} · {i.project.clientName}{' '}
            <ExternalLink className="size-3" />
          </button>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <label className="text-text-2">
          Editor
          <Select
            className="mt-0.5 h-7 text-xs"
            value={i.editor?.id ?? ''}
            disabled={!canWrite || closed}
            onChange={(e) => post.mutate({ editorId: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {(team.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-text-2">
          Edit progress %
          <span className="mt-0.5 flex gap-1">
            <Input
              type="number"
              min={0}
              max={100}
              className="h-7 text-xs"
              value={progress}
              disabled={!canWrite || closed}
              onChange={(e) => setProgress(e.target.value)}
            />
            {Number(progress) !== i.editProgress ? (
              <Button size="sm" onClick={() => post.mutate({ editProgress: Number(progress) })}>
                Save
              </Button>
            ) : null}
          </span>
        </label>
      </div>
      <Meter value={i.editProgress / 100} className="mt-2" label={`${i.name} edit progress`} />
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-2xs text-text-3">
        <dt>Due</dt>
        <dd className="text-text-2">{i.dueDate ? date(i.dueDate) : '—'}</dd>
        <dt>Client review</dt>
        <dd className={cn(i.clientApproval?.overdue ? 'text-critical' : 'text-text-2')}>
          {i.clientApproval
            ? `${i.clientApproval.status.toLowerCase().replace('_', ' ')}${i.clientApproval.dueAt ? ` · due ${date(i.clientApproval.dueAt)}` : ''}`
            : 'not sent'}
        </dd>
        <dt>Feedback</dt>
        <dd className="text-text-2">
          {i.feedback.client} client · {i.feedback.internal} internal · {i.feedback.open} open
        </dd>
        <dt>Rounds</dt>
        <dd className={cn(i.roundsBeyondScope ? 'text-attention' : 'text-text-2')}>
          {i.rounds}
          {i.roundsBeyondScope ? ` (${i.roundsBeyondScope} beyond scope)` : ''}
        </dd>
        {i.footage.length ? (
          <>
            <dt>Footage</dt>
            <dd className="text-text-2">
              {i.footage.map((f) => `${f.title}: ${FOOTAGE_STATUS_LABELS[f.status]}`).join('; ')}
            </dd>
          </>
        ) : null}
      </dl>
      {i.internalReview === 'CHANGES_REQUESTED' && i.internalReviewNote ? (
        <p className="mt-2 rounded bg-critical-soft px-2 py-1 text-xs text-critical">
          Internal: {i.internalReviewNote}
        </p>
      ) : null}
      {!closed && canWrite ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2">
          {i.internalReview !== 'PENDING' &&
          i.reviewState !== 'PENDING_CLIENT' &&
          i.reviewState !== 'OVERDUE' ? (
            <Button size="sm" onClick={() => internal.mutate({ action: 'REQUEST' })}>
              Request internal review
            </Button>
          ) : null}
          {i.internalReview === 'PENDING' && canDecide ? (
            <>
              <Input
                aria-label="Internal review note"
                placeholder="Note (required for changes)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-7 min-w-36 flex-1 text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={!note.trim()}
                onClick={() => internal.mutate({ action: 'CHANGES', note })}
              >
                <Undo2 /> Changes
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => internal.mutate({ action: 'APPROVE', note: note || undefined })}
              >
                <Check /> Pass
              </Button>
            </>
          ) : null}
          {i.internalReview === 'APPROVED' &&
          (i.reviewState === 'EDITING' || i.reviewState === 'REVISION_REQUESTED') ? (
            <Button
              size="sm"
              variant="primary"
              loading={send.isPending}
              onClick={() => send.mutate({})}
            >
              <Send /> Send v{i.version + 1} to client
            </Button>
          ) : null}
          {i.internalReview === 'PENDING' && !canDecide ? (
            <span className="text-2xs text-text-3">Waiting for a reviewer.</span>
          ) : null}
        </div>
      ) : null}
      {i.reviewState === 'PENDING_CLIENT' || i.reviewState === 'OVERDUE' ? (
        <p className="mt-2 text-2xs text-text-3">
          Record the client’s decision and timecoded feedback in the project’s Deliverables tab.
        </p>
      ) : null}
    </article>
  );
}
