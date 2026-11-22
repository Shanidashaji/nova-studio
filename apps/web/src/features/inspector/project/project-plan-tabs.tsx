'use client';

import {
  BUDGET_GROUP_LABELS,
  BUDGET_GROUPS,
  type BudgetGroup,
  type ProjectDetail,
} from '@nova/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Meter } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { ReadinessList, useAttentionTarget } from '@/features/studio/ui';
import { date, money, pct } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useProjectBudget, useReadiness } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection } from '../inspector-router';

/** Budget plan per group against actual cost (approved + paid expenses) and committed artist fees. */
export function ProjectBudgetPlan({ p }: { p: ProjectDetail }) {
  const canProject = useCan('project:write');
  const canFinance = useCan('finance:write');
  const canEdit = canProject || canFinance;
  const q = useProjectBudget(p.id, p.finance !== null);
  const [group, setGroup] = useState<BudgetGroup>('CREW');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const add = useApiMutation<{ group: BudgetGroup; label: string; estimated: number }>(
    'POST',
    `/projects/${p.id}/budget-lines`,
    {
      success: 'Budget line added',
      onSuccess: () => {
        setLabel('');
        setAmount('');
      },
    },
  );
  const remove = useApiMutation<{ id: string }>('DELETE', ({ id }) => `/budget-lines/${id}`, {
    success: 'Budget line removed',
  });
  const update = useApiMutation<{ id: string; estimated: number }>(
    'PATCH',
    ({ id }) => `/budget-lines/${id}`,
    {
      transform: ({ estimated }) => ({ estimated }),
      success: 'Estimate updated',
    },
  );
  if (p.finance === null) return null;
  return (
    <PanelState query={q} skeleton="block">
      {q.data ? (
        <>
          <InspectorSection title="Budget plan vs actual">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Fig label="Estimated cost" value={money(q.data.estimated, { exact: true })} />
              <Fig
                label="Actual (approved + paid)"
                value={money(q.data.actual, { exact: true })}
                tone={q.data.variance > 0 ? 'text-critical' : undefined}
              />
              <Fig
                label="Variance"
                value={`${q.data.variance > 0 ? '+' : ''}${money(q.data.variance, { exact: true })}`}
                tone={q.data.variance > 0 ? 'text-critical' : 'text-signal'}
              />
              <Fig label="Used" value={pct(q.data.utilisation)} />
              <Fig label="Artist fees committed" value={money(q.data.committed, { exact: true })} />
              <Fig
                label="Margin on contract"
                value={money(q.data.margin, { exact: true })}
                tone={q.data.margin < 0 ? 'text-critical' : undefined}
              />
            </div>
            {q.data.pendingApproval ? (
              <p className="mt-2 text-xs text-attention">
                {money(q.data.pendingApproval, { exact: true })} of expenses are waiting for
                approval and not counted yet.
              </p>
            ) : null}
            <p className="mt-2 text-2xs text-text-3">{q.data.dataNote}</p>
          </InspectorSection>
          <InspectorSection title="By group">
            <ul className="flex flex-col gap-3">
              {q.data.groups
                .filter((g) => g.estimated || g.actual || g.committed)
                .map((g) => (
                  <li key={g.group}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>{BUDGET_GROUP_LABELS[g.group].split(' (')[0]}</span>
                      <span className="font-mono text-xs">
                        {money(g.actual)} / {money(g.estimated)}{' '}
                        <Badge
                          tone={
                            g.band === 'OVER'
                              ? 'critical'
                              : g.band === 'NEAR'
                                ? 'attention'
                                : 'signal'
                          }
                        >
                          {g.band === 'OVER' ? 'Over' : g.band === 'NEAR' ? 'Near' : 'Under'}
                        </Badge>
                      </span>
                    </div>
                    <Meter
                      value={Math.min(1, g.utilisation)}
                      tone={
                        g.band === 'OVER' ? 'critical' : g.band === 'NEAR' ? 'attention' : 'signal'
                      }
                      label={`${g.group} budget used`}
                      className="mt-1"
                    />
                    {g.committed ? (
                      <p className="text-2xs text-text-3">
                        + {money(g.committed)} artist fees booked
                      </p>
                    ) : null}
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {g.lines.map((l) => (
                        <li key={l.id} className="flex items-center gap-2 text-xs text-text-2">
                          <span className="min-w-0 flex-1 truncate">{l.label}</span>
                          {canEdit ? (
                            <Input
                              aria-label={`Estimate for ${l.label}`}
                              type="number"
                              min={0}
                              defaultValue={l.estimated}
                              className="h-6 w-24 text-right text-xs"
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isFinite(v) && v !== l.estimated)
                                  update.mutate({ id: l.id, estimated: v });
                              }}
                            />
                          ) : (
                            <span className="font-mono">{money(l.estimated)}</span>
                          )}
                          {canEdit ? (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Remove ${l.label}`}
                              onClick={() => remove.mutate({ id: l.id })}
                            >
                              <Trash2 />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
            {canEdit ? (
              <form
                className="mt-3 grid grid-cols-2 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (label.trim() && amount)
                    add.mutate({ group, label: label.trim(), estimated: Number(amount) });
                }}
              >
                <Select
                  aria-label="Group"
                  value={group}
                  onChange={(e) => setGroup(e.target.value as BudgetGroup)}
                  className="col-span-2"
                >
                  {BUDGET_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {BUDGET_GROUP_LABELS[g]}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label="Line"
                  placeholder="Line, e.g. Drone operator"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <Input
                  aria-label="Estimate (₹)"
                  type="number"
                  min={0}
                  placeholder="₹ estimate"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  className="col-span-2"
                  disabled={!label.trim() || !amount}
                >
                  <Plus /> Add budget line
                </Button>
              </form>
            ) : null}
          </InspectorSection>
          <InspectorSection title="Expenses on this project">
            {q.data.expenses.length === 0 ? (
              <p className="text-sm text-text-3">
                No expenses recorded. Record them in Finance → Expenses.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-xs">
                {q.data.expenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {e.title}{' '}
                      <span className="text-text-3">
                        · {BUDGET_GROUP_LABELS[e.group].split(' (')[0]} · {date(e.incurredOn)}
                      </span>
                    </span>
                    <span className="font-mono">{money(e.amount)}</span>
                    <Badge
                      tone={
                        e.status === 'PAID'
                          ? 'signal'
                          : e.status === 'APPROVED'
                            ? 'info'
                            : e.status === 'REJECTED'
                              ? 'neutral'
                              : 'attention'
                      }
                    >
                      {e.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </InspectorSection>
        </>
      ) : null}
    </PanelState>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface-2 px-2 py-1.5">
      <p className="text-2xs text-text-3">{label}</p>
      <p className={cn('font-mono text-sm', tone)}>{value}</p>
    </div>
  );
}

/** Pre-production checklist of the project with links to where each item is fixed. */
export function ProjectPreProduction({ p }: { p: ProjectDetail }) {
  const q = useReadiness(p.id);
  const go = useAttentionTarget();
  const openShootDay = useWorkspace((s) => s.openShootDay);
  return (
    <PanelState query={q} skeleton="block">
      {q.data ? (
        <>
          <InspectorSection title={`Pre-production · ${q.data.score}% ready`}>
            <ReadinessList
              items={q.data.items}
              onItem={(k) => go(q.data!.items.find((i) => i.key === k)?.target ?? null)}
            />
          </InspectorSection>
          <InspectorSection title="Shoot readiness">
            {q.data.shoots.length === 0 ? (
              <p className="text-sm text-text-3">No shoot scheduled.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {q.data.shoots.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => openShootDay(s.id)}
                      className="flex w-full items-center justify-between gap-2 text-left text-sm hover:underline"
                    >
                      <span className="truncate">
                        {s.title} <span className="text-2xs text-text-3">{date(s.startsAt)}</span>
                      </span>
                      <span
                        className={cn(
                          'font-mono text-xs',
                          s.canConfirm ? 'text-signal' : 'text-attention',
                        )}
                      >
                        {s.readinessScore}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </InspectorSection>
        </>
      ) : null}
    </PanelState>
  );
}
