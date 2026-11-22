'use client';

import type { ApprovalView, DeliverableView, ProjectDetail } from '@nova/shared';
import { Check, MessageSquarePlus, RotateCcw, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Still } from '@/components/still';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useCan } from '@/features/shell/user-context';
import { ago, date, duration, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { approvalTone, deliverableTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { InspectorSection } from '../inspector-router';

/** Review loop: versions sent, client feedback by timecode, approvals and revision scope. */
export function ProjectDeliverables({ p }: { p: ProjectDetail }) {
  const stageApprovals = p.approvals.filter((a) => !a.deliverableId && a.status === 'PENDING');
  return (
    <>
      {stageApprovals.length > 0 ? (
        <InspectorSection title="Stage sign-off">
          {stageApprovals.map((a) => (
            <ApprovalRow key={a.id} approval={a} />
          ))}
        </InspectorSection>
      ) : null}
      {p.deliverables.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-3">No deliverables planned yet.</p>
      ) : null}
      {p.deliverables.map((d) => (
        <DeliverableBlock key={d.id} d={d} p={p} />
      ))}
    </>
  );
}

function DeliverableBlock({ d, p }: { d: DeliverableView; p: ProjectDetail }) {
  const canWrite = useCan('project:write');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const latest = d.rounds.at(-1);
  const pending = d.approvals.find((a) => a.status === 'PENDING');
  const beyond = d.rounds.filter((r) => !r.includedInScope).length;
  const send = useApiMutation<void>('POST', `/deliverables/${d.id}/review`, {
    transform: () => ({}),
    success: `${d.name} v${d.currentVersion + 1} sent for client review`,
  });
  const canSend =
    canWrite &&
    !pending &&
    d.status !== 'APPROVED' &&
    d.status !== 'DELIVERED' &&
    d.status !== 'PLANNED' &&
    d.internalReviewStatus === 'APPROVED';
  const internalLabel = {
    NOT_STARTED: 'Internal review not started',
    PENDING: 'In internal review',
    APPROVED: 'Passed internal review',
    CHANGES_REQUESTED: 'Internal changes requested',
  }[d.internalReviewStatus];
  const ratio = d.aspectRatio === '9:16' ? '9 / 16' : d.aspectRatio === '1:1' ? '1 / 1' : '16 / 9';

  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="flex gap-3">
        <Still
          id={`${p.id}-${d.id}`}
          type={p.type}
          accent={p.client.accentColor}
          src={d.previewImageUrl}
          alt={d.name}
          ratio={ratio}
          className="w-20 shrink-0 self-start rounded-[var(--radius-sm)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">{d.name}</p>
            <Badge tone={deliverableTone[d.status]}>{titleCase(d.status)}</Badge>
          </div>
          <p className="font-mono text-2xs text-text-3">
            {d.aspectRatio} · {duration(d.durationSec)} · {d.format}
          </p>
          <p className="mt-1 text-xs text-text-2">
            Version {d.currentVersion || '—'}
            {d.rounds.length
              ? ` · round ${d.rounds.length} of ${p.includedRevisions} included`
              : ''}
            {beyond > 0 ? <span className="text-critical"> · {beyond} beyond scope</span> : null}
          </p>
          {d.status !== 'APPROVED' && d.status !== 'DELIVERED' && d.status !== 'PLANNED' ? (
            <p className="mt-0.5 text-2xs text-text-3">
              {d.editor ? `Editor ${d.editor.name} · ${d.editProgress}% · ` : ''}
              <span
                className={d.internalReviewStatus === 'APPROVED' ? 'text-signal' : 'text-attention'}
              >
                {internalLabel}
              </span>
              {d.internalReviewStatus !== 'APPROVED' && !pending
                ? ' — pass it in Post & Reviews before sending to the client'
                : ''}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {canSend ? (
              <Button size="sm" loading={send.isPending} onClick={() => send.mutate()}>
                <Send /> Send v{d.currentVersion + 1} for review
              </Button>
            ) : null}
            {canWrite && latest ? (
              <Button size="sm" variant="ghost" onClick={() => setFeedbackOpen(true)}>
                <MessageSquarePlus /> Log feedback
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {pending ? (
        <div className="mt-3">
          <ApprovalRow approval={pending} />
        </div>
      ) : null}
      {latest && latest.feedback.length > 0 ? (
        <div className="mt-3">
          <p className="eyebrow mb-1">Round {latest.number} feedback</p>
          <ul className="flex flex-col gap-1">
            {latest.feedback.map((f) => (
              <FeedbackRow key={f.id} f={f} canWrite={canWrite} />
            ))}
          </ul>
        </div>
      ) : null}
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        deliverable={d}
        contact={p.client.name}
      />
    </section>
  );
}

function FeedbackRow({
  f,
  canWrite,
}: {
  f: DeliverableView['rounds'][number]['feedback'][number];
  canWrite: boolean;
}) {
  const toggle = useApiMutation<void>('PATCH', `/feedback/${f.id}`, {
    transform: () => ({ status: f.status === 'OPEN' ? 'RESOLVED' : 'OPEN' }),
    success: f.status === 'OPEN' ? 'Note resolved' : 'Note reopened',
  });
  return (
    <li className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-2 py-1.5 text-xs">
      {f.timecode ? (
        <span className="shrink-0 rounded bg-surface-3 px-1 font-mono text-[10px] text-info">
          {f.timecode}
        </span>
      ) : null}
      <span
        className={cn(
          'min-w-0 flex-1',
          f.status === 'RESOLVED' ? 'text-text-3 line-through' : 'text-text',
        )}
      >
        {f.body}
        <span className="block text-[10px] text-text-3 no-underline">
          {f.source === 'INTERNAL' ? 'Internal · ' : 'Client · '}
          {f.author} · {ago(f.createdAt)}
        </span>
      </span>
      {canWrite ? (
        <Button
          size="icon-sm"
          variant="ghost"
          loading={toggle.isPending}
          onClick={() => toggle.mutate()}
          aria-label={f.status === 'OPEN' ? 'Mark resolved' : 'Reopen'}
        >
          {f.status === 'OPEN' ? <Check /> : <RotateCcw />}
        </Button>
      ) : null}
    </li>
  );
}

/** Records the client's decision. Clients decide outside NOVA; the studio records it here. */
function ApprovalRow({ approval: a }: { approval: ApprovalView }) {
  const canDecide = useCan('approval:decide');
  const [mode, setMode] = useState<'APPROVED' | 'CHANGES_REQUESTED' | null>(null);
  const [note, setNote] = useState('');
  const decide = useApiMutation<void>('POST', `/approvals/${a.id}/decision`, {
    transform: () => ({ status: mode, note: note || undefined }),
    success: mode === 'APPROVED' ? 'Approval recorded' : 'Change request recorded',
    onSuccess: () => {
      setMode(null);
      setNote('');
    },
  });
  return (
    <div className="rounded-[var(--radius-sm)] border border-attention-line bg-attention-soft p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-text">{a.title}</p>
        <Badge tone={approvalTone[a.status]}>
          Waiting {ago(a.requestedAt).replace(' ago', '')}
        </Badge>
      </div>
      <p className="text-2xs text-text-3">
        Requested {date(a.requestedAt, { weekday: 'short', day: 'numeric', month: 'short' })}
        {a.dueAt ? (
          <span className={a.overdue ? 'font-medium text-critical' : undefined}>
            {' '}
            · review due {date(a.dueAt, { weekday: 'short', day: 'numeric', month: 'short' })}
            {a.overdue ? ' — overdue' : ''}
          </span>
        ) : null}
      </p>
      {canDecide ? (
        mode ? (
          <div className="mt-2 flex flex-col gap-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === 'APPROVED' ? 'Optional note' : 'What does the client want changed?'
              }
              rows={2}
              aria-label="Decision note"
            />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={mode === 'APPROVED' ? 'primary' : 'danger'}
                loading={decide.isPending}
                onClick={() => decide.mutate()}
              >
                Record {mode === 'APPROVED' ? 'approval' : 'change request'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" variant="primary" onClick={() => setMode('APPROVED')}>
              <Check /> Client approved
            </Button>
            <Button size="sm" variant="danger" onClick={() => setMode('CHANGES_REQUESTED')}>
              <X /> Changes requested
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}

function FeedbackDialog({
  open,
  onOpenChange,
  deliverable,
  contact,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deliverable: DeliverableView;
  contact: string;
}) {
  const [timecode, setTimecode] = useState('');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState(contact);
  const [source, setSource] = useState<'CLIENT' | 'INTERNAL'>('CLIENT');
  const add = useApiMutation<void>('POST', `/deliverables/${deliverable.id}/feedback`, {
    transform: () => ({ timecode: timecode || undefined, body, author, source }),
    success: 'Feedback logged',
    onSuccess: () => {
      setTimecode('');
      setBody('');
      onOpenChange(false);
    },
  });
  const tcValid = !timecode || /^\d{2}:\d{2}:\d{2}:\d{2}$/.test(timecode);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Feedback · ${deliverable.name} v${deliverable.currentVersion}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={add.isPending}
            disabled={!body.trim() || !tcValid || !author.trim()}
            onClick={() => add.mutate()}
          >
            Log feedback
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Timecode"
          error={tcValid ? undefined : 'Use HH:MM:SS:FF'}
          hint="Optional · HH:MM:SS:FF"
        >
          {(f) => (
            <Input
              {...f}
              value={timecode}
              onChange={(e) => setTimecode(e.target.value)}
              placeholder="00:00:12:08"
              className="font-mono"
            />
          )}
        </Field>
        <Field label="From">
          {(f) => <Input {...f} value={author} onChange={(e) => setAuthor(e.target.value)} />}
        </Field>
        <Field label="Feedback from" className="sm:col-span-2">
          {(f) => (
            <Select
              {...f}
              value={source}
              onChange={(e) => setSource(e.target.value as 'CLIENT' | 'INTERNAL')}
            >
              <option value="CLIENT">The client</option>
              <option value="INTERNAL">Internal review (studio)</option>
            </Select>
          )}
        </Field>
        <Field label="Note" className="sm:col-span-2">
          {(f) => (
            <Textarea {...f} value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
