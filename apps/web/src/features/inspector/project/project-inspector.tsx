'use client';

import {
  HEALTH_BAND_LABELS,
  PRIORITIES,
  PROJECT_TYPE_LABELS,
  STUDIO_LOCATION_LABELS,
  type ProjectDetail,
} from '@nova/shared';
import { Crosshair, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Still } from '@/components/still';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Avatar, Meter, Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { date, money, relativeDay, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useProject } from '@/lib/queries';
import { healthTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection, KeyValue } from '../inspector-router';
import { ProjectBudget, ProjectHistory, ProjectSchedule } from './project-extras';
import { ProjectDeliverables } from './project-deliverables';
import { ProjectBudgetPlan, ProjectPreProduction } from './project-plan-tabs';
import { ProjectTasks } from './project-tasks';
import { ProjectWorkflow } from './project-workflow';

const TABS = [
  ['overview', 'Overview'],
  ['workflow', 'Workflow'],
  ['pre', 'Pre-production'],
  ['tasks', 'Tasks'],
  ['deliverables', 'Deliverables'],
  ['schedule', 'Shoots'],
  ['budget', 'Budget'],
  ['history', 'History'],
] as const;
type Tab = (typeof TABS)[number][0];

/** A production's whole world in one panel: workflow, tasks, deliverables, shoots, money, history. */
export function ProjectInspector({ id, section }: { id: string; section?: string }) {
  const q = useProject(id);
  const [tab, setTab] = useState<Tab>(
    (TABS.find(([k]) => k === section)?.[0] as Tab) ?? 'overview',
  );

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="aspect-video" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  return (
    <PanelState query={q}>
      {q.data ? (
        <div>
          <ProjectHeader p={q.data} />
          <div
            role="tablist"
            aria-label="Project sections"
            className="scrollbar-none sticky top-0 z-10 flex gap-0.5 overflow-x-auto border-b border-line bg-surface-1 px-2 py-1.5"
          >
            {/* No Budget tab when the API withheld the figures from this role. */}
            {TABS.filter(([key]) => key !== 'budget' || q.data.finance !== null).map(
              ([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  type="button"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    'h-7 shrink-0 rounded-[var(--radius-sm)] px-2.5 text-xs',
                    tab === key ? 'bg-surface-3 text-text' : 'text-text-3 hover:text-text',
                  )}
                >
                  {label}
                  {key === 'tasks' && q.data.blockedTasks > 0 ? (
                    <span className="ml-1 text-critical">•</span>
                  ) : null}
                  {key === 'deliverables' && q.data.pendingApprovals > 0 ? (
                    <span className="ml-1 text-attention">•</span>
                  ) : null}
                </button>
              ),
            )}
          </div>
          <div role="tabpanel">
            {tab === 'overview' ? <Overview p={q.data} /> : null}
            {tab === 'workflow' ? <ProjectWorkflow p={q.data} /> : null}
            {tab === 'tasks' ? <ProjectTasks p={q.data} /> : null}
            {tab === 'deliverables' ? <ProjectDeliverables p={q.data} /> : null}
            {tab === 'schedule' ? <ProjectSchedule p={q.data} /> : null}
            {tab === 'pre' ? <ProjectPreProduction p={q.data} /> : null}
            {tab === 'budget' ? (
              <>
                <ProjectBudgetPlan p={q.data} />
                <ProjectBudget p={q.data} />
              </>
            ) : null}
            {tab === 'history' ? <ProjectHistory p={q.data} /> : null}
          </div>
        </div>
      ) : null}
    </PanelState>
  );
}

function ProjectHeader({ p }: { p: ProjectDetail }) {
  const setFocus = useWorkspace((s) => s.setFocus);
  return (
    <div>
      <Still
        id={p.id}
        type={p.type}
        accent={p.client.accentColor}
        src={p.coverImageUrl}
        alt={p.title}
        className="aspect-[16/7]"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-1)] via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-mono text-[10px] tracking-wider text-text-2">
            {p.code} · {PROJECT_TYPE_LABELS[p.type]}{' '}
            {p.aiAssisted ? (
              <span className="text-ai">
                <Sparkles className="inline size-3" /> AI-assisted
              </span>
            ) : null}
          </p>
          <h2 className="font-display text-3xl leading-8 text-text">{p.title}</h2>
          <p className="text-sm text-text-2">{p.client.name}</p>
        </div>
      </Still>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <Badge tone={healthTone[p.health.band]}>
          {HEALTH_BAND_LABELS[p.health.band]} · {p.health.score}
        </Badge>
        <Badge tone={p.stage?.status === 'BLOCKED' ? 'critical' : 'neutral'}>
          {p.stage?.label ?? titleCase(p.status)}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setFocus({ type: 'project', id: p.id, label: p.title })}
        >
          <Crosshair /> Focus workspace
        </Button>
      </div>
    </div>
  );
}

function Overview({ p }: { p: ProjectDetail }) {
  const canWrite = useCan('project:write');
  const inspect = useWorkspace((s) => s.inspect);
  const update = useApiMutation<Record<string, string>>('PATCH', `/projects/${p.id}`, {
    success: 'Project updated',
  });
  const late = p.projection.daysLate;

  return (
    <>
      {p.logline ? <p className="px-4 pt-3 text-sm italic text-text-2">“{p.logline}”</p> : null}
      <InspectorSection title="Progress">
        <div className="flex items-center gap-3">
          <Meter
            value={p.progress}
            tone={
              healthTone[p.health.band] === 'neutral'
                ? 'signal'
                : (healthTone[p.health.band] as 'signal')
            }
            label="Progress"
          />
          <span className="font-mono text-sm">{Math.round(p.progress * 100)}%</span>
        </div>
        <p className={cn('mt-2 text-xs', late > 0 ? 'text-attention' : 'text-text-3')}>
          NOVA estimate: delivery around{' '}
          <span className="font-mono">{date(p.projection.projectedDelivery)}</span>
          {late > 0
            ? ` — ${late} day${late > 1 ? 's' : ''} after the due date`
            : ' — on or before the due date'}
          . Based on remaining stage plans and this project’s pace so far.
        </p>
      </InspectorSection>
      <InspectorSection title={`Health ${p.health.score}/100`}>
        {p.health.deductions.length === 0 ? (
          <p className="text-sm text-text-2">
            No risk signals. Schedule, budget, approvals and tasks are in line.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {p.health.deductions.map((d) => (
              <li key={d.code} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-text-2">{d.label}</span>
                <span className="font-mono text-xs text-critical">−{d.points}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-2xs text-text-3">
          Explainable heuristic over live data, not a prediction model.
        </p>
      </InspectorSection>
      <InspectorSection title="Details">
        <KeyValue
          items={[
            [
              'Client',
              <button
                key="c"
                type="button"
                className="hover:underline"
                onClick={() => inspect({ type: 'client', id: p.client.id })}
              >
                {p.client.name}
              </button>,
            ],
            ['Workflow', p.workflow.name],
            ['Studio', STUDIO_LOCATION_LABELS[p.location]],
            ['Started', date(p.startDate, { day: 'numeric', month: 'short', year: 'numeric' })],
            [
              'Due',
              `${date(p.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })} · ${relativeDay(p.dueDate)}`,
            ],
            // Withheld from roles that may not see what a production costs.
            ...(p.budget === null
              ? []
              : ([['Budget', `${money(p.spent)} of ${money(p.budget)} spent`]] as [
                  string,
                  string,
                ][])),
            ['Revisions', `${p.includedRevisions} rounds included`],
          ]}
        />
        {canWrite ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-text-3">
              Priority
              <Select
                className="mt-1"
                value={p.priority}
                onChange={(e) => update.mutate({ priority: e.target.value })}
                disabled={update.isPending}
              >
                {PRIORITIES.map((x) => (
                  <option key={x} value={x}>
                    {titleCase(x)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-text-3">
              Status
              <Select
                className="mt-1"
                value={p.status}
                onChange={(e) => update.mutate({ status: e.target.value })}
                disabled={update.isPending || p.status === 'DELIVERED'}
              >
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On hold</option>
                <option value="CANCELLED">Cancelled</option>
                {p.status === 'DELIVERED' ? <option value="DELIVERED">Delivered</option> : null}
              </Select>
            </label>
          </div>
        ) : null}
      </InspectorSection>
      <InspectorSection title="Team">
        <ul className="flex flex-col gap-1.5">
          {p.members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => inspect({ type: 'member', id: m.id })}
                className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-1 py-1 text-left hover:bg-surface-2"
              >
                <Avatar name={m.name} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.name}</span>
                  <span className="block truncate text-2xs text-text-3">{m.title}</span>
                </span>
                <span className="text-xs text-text-2">{m.role}</span>
              </button>
            </li>
          ))}
        </ul>
      </InspectorSection>
    </>
  );
}
