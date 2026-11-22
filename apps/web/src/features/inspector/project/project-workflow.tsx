'use client';

import type { ProjectDetail, TransitionBlocker } from '@nova/shared';
import { ArrowRight, Check, CornerDownLeft, Lock, Send, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/field';
import { useCan } from '@/features/shell/user-context';
import { ApiRequestError } from '@/lib/api';
import { ago, date } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection } from '../inspector-router';

/** The workflow engine, visible: stage track, guarded transitions, approvals and history. */
export function ProjectWorkflow({ p }: { p: ProjectDetail }) {
  const canTransition = useCan('workflow:transition');
  const canWrite = useCan('project:write');
  const [sendBack, setSendBack] = useState(false);
  const [serverBlockers, setServerBlockers] = useState<TransitionBlocker[] | null>(null);
  const current = p.stages.find((s) => s.status === 'ACTIVE' || s.status === 'BLOCKED');

  const advance = useApiMutation<{ targetStageId?: string }, ProjectDetail>(
    'POST',
    `/projects/${p.id}/transitions`,
    {
      transform: (b) => ({ direction: 'FORWARD', ...b }),
      success: (r) => (r.stage ? `Moved to ${r.stage.label}` : `${p.title} delivered`),
      onSuccess: () => setServerBlockers(null),
      onError: (e: ApiRequestError) => {
        const blockers = (e.details as { blockers?: TransitionBlocker[] } | undefined)?.blockers;
        if (e.code === 'TRANSITION_BLOCKED' && blockers) {
          setServerBlockers(blockers);
          return true;
        }
        return false;
      },
    },
  );
  const skip = useApiMutation<{ stageId: string }>(
    'POST',
    ({ stageId }) => `/projects/${p.id}/stages/${stageId}/skip`,
    {
      transform: () => ({}),
      success: 'Stage skipped',
    },
  );
  const requestApproval = useApiMutation<{ stageId: string }>(
    'POST',
    ({ stageId }) => `/stages/${stageId}/approval-request`,
    {
      transform: () => ({}),
      success: 'Sign-off requested from the client',
    },
  );

  const blockers = serverBlockers ?? (p.advance.ok ? [] : p.advance.blockers);
  const pendingStageApproval = current
    ? p.approvals.find((a) => a.projectStageId === current.id && a.status === 'PENDING')
    : undefined;

  return (
    <>
      <InspectorSection title="Stage track">
        <ol className="relative flex flex-col">
          {p.stages.map((s, i) => {
            const done = s.status === 'DONE';
            const active = s.status === 'ACTIVE' || s.status === 'BLOCKED';
            return (
              <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0">
                {i < p.stages.length - 1 ? (
                  <span
                    className={cn(
                      'absolute left-[9px] top-5 h-[calc(100%-12px)] w-px',
                      done ? 'bg-signal-line' : 'bg-line',
                    )}
                    aria-hidden
                  />
                ) : null}
                <span
                  className={cn(
                    'relative z-[1] mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full border text-[10px]',
                    done && 'border-signal bg-signal text-on-signal',
                    active &&
                      (s.status === 'BLOCKED'
                        ? 'border-critical bg-critical-soft text-critical'
                        : 'border-signal bg-signal-soft text-signal'),
                    s.status === 'PENDING' && 'border-line-strong text-text-3',
                    s.status === 'SKIPPED' && 'border-dashed border-line-strong text-text-3',
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-sm',
                        active ? 'font-semibold text-text' : done ? 'text-text-2' : 'text-text-3',
                        s.status === 'SKIPPED' && 'line-through',
                      )}
                    >
                      {s.label}
                    </span>
                    {s.requiresApproval ? (
                      <Badge
                        tone={s.approved ? 'signal' : active ? 'attention' : 'neutral'}
                        dot={false}
                      >
                        {s.approved ? 'Approved' : 'Needs sign-off'}
                      </Badge>
                    ) : null}
                    <span className="ml-auto font-mono text-[10px] text-text-3">
                      {done && s.completedAt
                        ? date(s.completedAt)
                        : active && s.startedAt
                          ? `since ${date(s.startedAt)}`
                          : `${s.expectedDays}d plan`}
                    </span>
                  </div>
                  {active ? (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {s.exitCriteria.map((c) => (
                        <li key={c} className="text-xs text-text-2">
                          ◦ {c}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {s.owner ? <p className="text-2xs text-text-3">Owner · {s.owner.name}</p> : null}
                  {canTransition &&
                  s.status === 'PENDING' &&
                  s.skippable &&
                  p.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      disabled={skip.isPending}
                      onClick={() => skip.mutate({ stageId: s.id })}
                      className="mt-0.5 text-2xs text-text-3 underline-offset-2 hover:text-text hover:underline"
                    >
                      Skip this stage
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </InspectorSection>

      {p.status === 'ACTIVE' && current ? (
        <InspectorSection title="Move the work">
          {blockers.length > 0 ? (
            <BlockerList blockers={blockers} p={p} />
          ) : (
            <p className="mb-2 text-sm text-text-2">
              {p.advance.ok && p.advance.to
                ? `Everything blocking ${current.label} is done.`
                : `All ${current.label} work is complete.`}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {canTransition ? (
              <Button
                variant="primary"
                loading={advance.isPending}
                disabled={blockers.length > 0}
                onClick={() => advance.mutate({})}
              >
                {p.advance.ok && !p.advance.to
                  ? 'Complete delivery'
                  : `Advance to ${p.stages.find((s) => s.order > current.order && s.status !== 'SKIPPED')?.label ?? 'next stage'}`}
                <ArrowRight />
              </Button>
            ) : (
              <p className="text-xs text-text-3">
                <Lock className="inline size-3" /> Your role cannot move stages.
              </p>
            )}
            {canWrite && current.requiresApproval && !current.approved && !pendingStageApproval ? (
              <Button
                loading={requestApproval.isPending}
                onClick={() => requestApproval.mutate({ stageId: current.id })}
              >
                <Send /> Request sign-off
              </Button>
            ) : null}
            {canTransition && p.stages.some((s) => s.status === 'DONE') ? (
              <Button variant="ghost" onClick={() => setSendBack(true)}>
                <Undo2 /> Send back
              </Button>
            ) : null}
          </div>
          {pendingStageApproval ? (
            <p className="mt-2 text-xs text-attention">
              Sign-off requested {ago(pendingStageApproval.requestedAt)} — record the decision in
              Deliverables.
            </p>
          ) : null}
        </InspectorSection>
      ) : null}

      <InspectorSection title="Transition history">
        <ol className="flex flex-col gap-2">
          {p.transitions.map((t) => (
            <li key={t.id} className="flex gap-2 text-xs">
              <span
                className={cn(
                  'mt-1.5 size-1.5 shrink-0 rounded-full',
                  t.direction === 'BACKWARD' ? 'bg-attention' : 'bg-signal',
                )}
              />
              <span className="min-w-0 flex-1 text-text-2">
                {t.from ? `${t.from} → ` : ''}
                <span className="text-text">{t.to ?? 'Delivered'}</span>
                {t.direction === 'BACKWARD' ? (
                  <span className="text-attention"> (sent back)</span>
                ) : null}
                {t.reason ? <span className="block text-text-3">“{t.reason}”</span> : null}
                <span className="block text-text-3">
                  {t.actor ?? 'System'}
                  {t.source === 'ASSISTANT' ? ' via NOVA' : ''}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-text-3">{ago(t.createdAt)}</span>
            </li>
          ))}
        </ol>
      </InspectorSection>
      <SendBackDialog open={sendBack} onOpenChange={setSendBack} p={p} />
    </>
  );
}

function BlockerList({ blockers, p }: { blockers: TransitionBlocker[]; p: ProjectDetail }) {
  const inspect = useWorkspace((s) => s.inspect);
  return (
    <div
      role="status"
      className="rounded-[var(--radius-sm)] border border-critical-line bg-critical-soft p-2.5"
    >
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-critical">
        <Lock className="size-3.5" /> NOVA is holding this stage
      </p>
      <ul className="flex flex-col gap-1">
        {blockers.map((b) => (
          <li key={b.code} className="text-xs text-text-2">
            {b.message}
            {b.code === 'OPEN_BLOCKING_TASKS' ? (
              <span className="mt-0.5 flex flex-wrap gap-1">
                {b.taskIds.map((tid) => {
                  const t = p.tasks.find((x) => x.id === tid);
                  return (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => inspect({ type: 'task', id: tid })}
                      className="rounded border border-line-strong bg-surface-2 px-1.5 text-2xs text-text hover:border-text-3"
                    >
                      {t?.title ?? 'Task'} {t?.assignee ? `· ${t.assignee.name.split(' ')[0]}` : ''}
                    </button>
                  );
                })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SendBackDialog({
  open,
  onOpenChange,
  p,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  p: ProjectDetail;
}) {
  const earlier = p.stages.filter((s) => s.status === 'DONE');
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const send = useApiMutation<void>('POST', `/projects/${p.id}/transitions`, {
    transform: () => ({
      direction: 'BACKWARD',
      targetStageId: target || earlier.at(-1)?.id,
      reason,
    }),
    success: 'Work sent back',
    onSuccess: () => {
      setReason('');
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send work back"
      description="Reopens an earlier stage. The reason is recorded in the workflow history."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={send.isPending}
            disabled={reason.trim().length < 3}
            onClick={() => send.mutate()}
          >
            <CornerDownLeft /> Send back
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Return to">
          {(f) => (
            <Select
              {...f}
              value={target || earlier.at(-1)?.id}
              onChange={(e) => setTarget(e.target.value)}
            >
              {earlier.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Reason"
          hint="At least a few words — e.g. “Client wants a new opening sequence”."
        >
          {(f) => (
            <Textarea {...f} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
