'use client';

import { APPROVAL_SUBJECT_LABELS, type ApprovalRequestView } from '@nova/shared';
import { useState } from 'react';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Panel, PanelState } from '@/components/ui/panel';
import { ago, money, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useApprovals } from '@/lib/queries';
import { cn } from '@/lib/utils';

const statusTone: Record<ApprovalRequestView['status'], Tone> = {
  PENDING: 'attention',
  APPROVED: 'signal',
  REJECTED: 'critical',
  CANCELLED: 'neutral',
};

/**
 * Everything waiting on a decision, in one place: expenses, purchase requests and leave (ADR-0010),
 * plus client and internal sign-offs on deliverables, shown separately because they are not
 * decided by NOVA users.
 */
export function ApprovalsLens() {
  const [scope, setScope] = useState<'waiting' | 'requested' | 'all'>('waiting');
  const inbox = useApprovals({ scope });
  const data = inbox.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['waiting', `Waiting on me${data ? ` (${data.counts.waitingOnMe})` : ''}`],
            ['requested', `Raised by me${data ? ` (${data.counts.myOpenRequests} open)` : ''}`],
            ['all', 'All'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={scope === key ? 'primary' : 'ghost'}
            onClick={() => setScope(key)}
            aria-pressed={scope === key}
          >
            {label}
          </Button>
        ))}
      </div>

      <Panel eyebrow="Decisions" title="Approval requests" bodyClassName="px-0">
        <PanelState
          query={inbox}
          isEmpty={!data?.requests.length}
          empty={{
            title: 'Nothing waiting.',
            body: 'Expenses, purchase requests and leave appear here when they need a decision.',
          }}
        >
          <ul className="divide-y divide-line/60">
            {(data?.requests ?? []).map((r) => (
              <RequestRow key={r.id} r={r} />
            ))}
          </ul>
        </PanelState>
      </Panel>

      {data && data.signOffs.length > 0 ? (
        <Panel eyebrow="Sign-offs" title="Client and studio sign-offs" bodyClassName="px-0">
          <ul className="divide-y divide-line/60">
            {data.signOffs.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span className="text-xs text-text-3">
                  {s.project.code} · {ago(s.requestedAt)}
                </span>
                <Badge tone="attention">{s.kind === 'CLIENT' ? 'Client' : 'Internal'}</Badge>
              </li>
            ))}
          </ul>
          <p className="px-4 pt-2 text-xs text-text-3">
            Record these decisions from the project’s Deliverables section.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}

function RequestRow({ r }: { r: ApprovalRequestView }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const decide = useApiMutation<{ decision: 'APPROVE' | 'REJECT'; reason?: string }, unknown>(
    'POST',
    `/approval-requests/${r.id}/decision`,
    {
      success: (_, body) =>
        body.decision === 'APPROVE' ? 'Approved' : 'Rejected — the requester has been told why',
      onSuccess: () => setRejecting(false),
    },
  );
  const current = r.steps.find((s) => s.order === r.currentStep);

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.title}</p>
          <p className="truncate text-xs text-text-3">
            {APPROVAL_SUBJECT_LABELS[r.subject]} · {r.requestedBy.name} · {ago(r.createdAt)}
            {r.project ? ` · ${r.project.code}` : ''}
          </p>
        </div>
        {r.amount !== null ? (
          <span className="font-mono text-xs">{money(r.amount, { exact: true })}</span>
        ) : null}
        <Badge tone={statusTone[r.status]}>{titleCase(r.status)}</Badge>
      </div>

      <ol className="flex flex-wrap gap-1.5" aria-label="Approval steps">
        {r.steps.map((s) => (
          <li
            key={s.id}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px]',
              s.status === 'APPROVED' && 'border-signal-line text-signal',
              s.status === 'REJECTED' && 'border-critical-line text-critical',
              s.status === 'PENDING' && 'border-attention-line text-attention',
              (s.status === 'WAITING' || s.status === 'SKIPPED') && 'border-line text-text-3',
            )}
          >
            {s.order}. {s.label} · {titleCase(s.status)}
            {s.decider ? ` · ${s.decider.name}` : ''}
          </li>
        ))}
      </ol>

      {r.status === 'REJECTED' && r.steps.find((s) => s.status === 'REJECTED')?.reason ? (
        <p className="text-xs text-critical">
          Reason: {r.steps.find((s) => s.status === 'REJECTED')!.reason}
        </p>
      ) : null}

      {r.status === 'PENDING' && current ? (
        <div className="flex flex-col gap-2">
          {r.canDecide ? (
            rejecting ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field label="Why is it being rejected?" className="flex-1">
                  {(p) => (
                    <Textarea
                      {...p}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                    />
                  )}
                </Field>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                    Back
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!reason.trim()}
                    loading={decide.isPending}
                    onClick={() => decide.mutate({ decision: 'REJECT', reason: reason.trim() })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  loading={decide.isPending}
                  onClick={() => decide.mutate({ decision: 'APPROVE' })}
                >
                  Approve · {current.label}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
                  Reject
                </Button>
              </div>
            )
          ) : (
            <p className="text-xs text-text-3">
              {r.blockedReason ?? `Waiting for ${current.label}.`}
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}
