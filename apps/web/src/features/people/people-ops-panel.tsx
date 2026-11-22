'use client';

import { LEAVE_TYPES, type LeaveView } from '@nova/shared';
import { CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { date, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useDepartments, useEmployees, useLeave } from '@/lib/queries';

const leaveTone: Record<LeaveView['status'], Tone> = {
  PENDING: 'attention',
  APPROVED: 'signal',
  REJECTED: 'critical',
  CANCELLED: 'neutral',
};

/**
 * People operations next to workload: who is in today, leave (approved through the Approvals
 * lens; approved leave blocks crew calls) and departments. Restricted HR records stay in the API
 * for `hr:read` only and are never shown here.
 */
export function PeopleOpsPanel() {
  const employees = useEmployees();
  const leave = useLeave();
  const departments = useDepartments();
  const [requesting, setRequesting] = useState(false);
  const checkIn = useApiMutation<{ date: string; status: string; checkIn: string }, unknown>(
    'POST',
    '/hr/attendance',
    {
      success: 'Checked in for today',
    },
  );
  const today = new Date();

  return (
    <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
      <Panel
        eyebrow="Leave"
        title="Time off"
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              loading={checkIn.isPending}
              onClick={() =>
                checkIn.mutate({
                  date: today.toISOString(),
                  status: 'PRESENT',
                  checkIn: today.toISOString(),
                })
              }
            >
              Check in
            </Button>
            <Button size="sm" onClick={() => setRequesting(true)}>
              <CalendarPlus /> Request leave
            </Button>
          </div>
        }
        bodyClassName="px-0"
      >
        <PanelState
          query={leave}
          isEmpty={!leave.data?.length}
          empty={{ title: 'No leave requests.' }}
        >
          <ul className="divide-y divide-line/60">
            {(leave.data ?? []).slice(0, 12).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {l.member.name} · {titleCase(l.type)}
                  </p>
                  <p className="truncate text-xs text-text-3">
                    {date(l.startDate)}
                    {l.days > 1 ? ` – ${date(l.endDate)}` : ''} · {l.days} day
                    {l.days === 1 ? '' : 's'}
                    {l.reason ? ` · ${l.reason}` : ''}
                  </p>
                  {l.clashes.length && l.status !== 'REJECTED' && l.status !== 'CANCELLED' ? (
                    <p className="text-xs text-critical">
                      Called to {l.clashes.map((c) => c.title).join(', ')} during this leave
                    </p>
                  ) : null}
                </div>
                <Badge tone={leaveTone[l.status]}>{titleCase(l.status)}</Badge>
              </li>
            ))}
          </ul>
        </PanelState>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel eyebrow="Today" title="Who is in">
          <PanelState query={employees}>
            <ul className="flex flex-wrap gap-1.5">
              {(employees.data ?? []).map((e) => (
                <li key={e.id}>
                  <Badge
                    tone={
                      e.onLeaveToday
                        ? 'neutral'
                        : e.today === 'PRESENT' || e.today === 'ON_SHOOT' || e.today === 'REMOTE'
                          ? 'signal'
                          : 'neutral'
                    }
                  >
                    {e.name.split(' ')[0]} ·{' '}
                    {e.onLeaveToday
                      ? 'on leave'
                      : e.today
                        ? titleCase(e.today).toLowerCase()
                        : 'not recorded'}
                  </Badge>
                </li>
              ))}
            </ul>
          </PanelState>
        </Panel>
        <Panel eyebrow="Structure" title="Departments">
          <PanelState query={departments}>
            <ul className="flex flex-col gap-2 text-sm">
              {(departments.data ?? []).map((d) => (
                <li key={d.id}>
                  <p className="font-medium">
                    {d.name}{' '}
                    <span className="text-xs font-normal text-text-3">
                      · lead {d.lead?.name ?? '—'}
                    </span>
                  </p>
                  <p className="text-xs text-text-3">{d.members.map((m) => m.name).join(', ')}</p>
                </li>
              ))}
            </ul>
          </PanelState>
        </Panel>
      </div>
      <LeaveDialog open={requesting} onOpenChange={setRequesting} />
    </div>
  );
}

function LeaveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const canForOthers = useCan('hr:write');
  const employees = useEmployees();
  const [memberId, setMemberId] = useState('');
  const [type, setType] = useState('ANNUAL');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const request = useApiMutation<Record<string, unknown>, LeaveView>('POST', '/hr/leave', {
    success: (l) => `Leave requested for ${l.member.name} — waiting for approval`,
    onSuccess: () => {
      setReason('');
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Request leave"
      description="Goes to HR for approval. Once approved, NOVA blocks crew calls on those days."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={request.isPending}
            disabled={!start || !end}
            onClick={() =>
              request.mutate({
                teamMemberId: memberId || undefined,
                type,
                startDate: start,
                endDate: end,
                reason: reason || undefined,
              })
            }
          >
            Request
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {canForOthers ? (
          <Field label="For" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Myself</option>
                {(employees.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label="Type">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value)}>
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <span />
        <Field label="From">
          {(p) => (
            <Input {...p} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          )}
        </Field>
        <Field label="To">
          {(p) => <Input {...p} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
        <Field label="Reason (optional)" className="sm:col-span-2">
          {(p) => (
            <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
