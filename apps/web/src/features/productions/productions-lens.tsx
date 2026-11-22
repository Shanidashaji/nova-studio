'use client';

import {
  HEALTH_BAND_LABELS,
  STAGE_KEYS,
  STAGE_LABELS,
  type ProjectListQuery,
  type ProjectSummary,
} from '@nova/shared';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { AvatarStack, Meter, Segmented } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { useFocusFilter } from '@/features/shell/use-focus';
import { useCan } from '@/features/shell/user-context';
import { date, money, relativeDay } from '@/lib/format';
import { useProjects } from '@/lib/queries';
import { healthTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { NewProjectDialog } from './new-project-dialog';
import { ProductionCard } from './production-card';

type View = 'grid' | 'board' | 'table';

export function ProductionsLens() {
  const [view, setView] = useState<View>('grid');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectListQuery['status']>('ACTIVE');
  const [health, setHealth] = useState<'' | 'ON_TRACK' | 'AT_RISK' | 'CRITICAL'>('');
  const [sort, setSort] = useState<ProjectListQuery['sort']>('due');
  const [creating, setCreating] = useState(false);
  const canCreate = useCan('project:write');

  // One request per pause in typing, not one per keystroke.
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const query = useProjects({
    q: search || undefined,
    status,
    health: health || undefined,
    sort,
  });
  const { matches } = useFocusFilter();
  const items = (query.data ?? []).filter(matches);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-text-3" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by title, code or client"
            className="pl-8"
            aria-label="Filter productions"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectListQuery['status'])}
          className="w-auto"
          aria-label="Status"
        >
          <option value="ACTIVE">Active</option>
          <option value="DELIVERED">Delivered</option>
          <option value="ALL">All</option>
        </Select>
        <Select
          value={health}
          onChange={(e) => setHealth(e.target.value as typeof health)}
          className="w-auto"
          aria-label="Health"
        >
          <option value="">Any health</option>
          <option value="ON_TRACK">On track</option>
          <option value="AT_RISK">At risk</option>
          <option value="CRITICAL">Critical</option>
        </Select>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as ProjectListQuery['sort'])}
          className="w-auto"
          aria-label="Sort by"
        >
          <option value="due">Sort: due date</option>
          <option value="health">Sort: health</option>
          <option value="progress">Sort: progress</option>
          <option value="budget">Sort: budget</option>
          <option value="title">Sort: title</option>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Segmented<View>
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'board', label: 'Stages' },
              { value: 'table', label: 'Table' },
            ]}
          />
          {canCreate ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New production
            </Button>
          ) : null}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {items.length} productions shown
      </p>

      <PanelState
        query={query}
        skeleton="cards"
        isEmpty={items.length === 0}
        empty={{
          title: 'No productions match.',
          body: 'Try clearing the filters or the workspace focus.',
        }}
      >
        {view === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((p) => (
              <ProductionCard key={p.id} project={p} />
            ))}
          </div>
        ) : view === 'board' ? (
          <StageBoard items={items} />
        ) : (
          <ProjectTable items={items} />
        )}
      </PanelState>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

/** Kanban by lifecycle stage — the workflow as columns. */
function StageBoard({ items }: { items: ProjectSummary[] }) {
  const inspect = useWorkspace((s) => s.inspect);
  const delivered = items.filter((p) => !p.stage);
  return (
    <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
      {[...STAGE_KEYS, 'DONE' as const].map((key) => {
        const list = key === 'DONE' ? delivered : items.filter((p) => p.stage?.key === key);
        return (
          <section
            key={key}
            className="flex w-64 shrink-0 flex-col rounded-[var(--radius-md)] border border-line bg-surface-1"
            aria-label={key === 'DONE' ? 'Delivered' : STAGE_LABELS[key]}
          >
            <header className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-sm font-semibold">
                {key === 'DONE' ? 'Delivered' : STAGE_LABELS[key]}
              </span>
              <span className="font-mono text-xs text-text-3">{list.length}</span>
            </header>
            <ul className="flex flex-col gap-2 p-2">
              {list.length === 0 ? (
                <li className="px-1 py-3 text-xs text-text-3">No productions</li>
              ) : null}
              {list.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => inspect({ type: 'project', id: p.id })}
                    className="w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 p-2.5 text-left transition-colors hover:border-line-strong"
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-text-3">{p.code}</span>
                      <Badge tone={healthTone[p.health.band]}>{p.health.score}</Badge>
                    </span>
                    <span className="mt-1 block truncate text-sm font-medium">{p.title}</span>
                    <span className="block truncate text-2xs text-text-3">{p.client.name}</span>
                    <span className="mt-2 flex items-center gap-2">
                      <Meter value={p.progress} label={`${p.title} progress`} />
                      <span className="font-mono text-[10px] text-text-3">
                        {Math.round(p.progress * 100)}%
                      </span>
                    </span>
                    <span className="mt-2 flex items-center justify-between text-[10px] text-text-3">
                      <span className={cn(p.blockedTasks > 0 && 'text-critical')}>
                        {p.blockedTasks > 0 ? `${p.blockedTasks} blocked · ` : ''}
                        {p.openTasks} open
                      </span>
                      <span>Due {relativeDay(p.dueDate)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ProjectTable({ items }: { items: ProjectSummary[] }) {
  const inspect = useWorkspace((s) => s.inspect);
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface-1">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {[
              'Production',
              'Client',
              'Stage',
              'Health',
              'Progress',
              'Due',
              'Budget used',
              'Team',
            ].map((h) => (
              <th key={h} scope="col" className="eyebrow px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b border-line/60 last:border-b-0 hover:bg-surface-2">
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => inspect({ type: 'project', id: p.id })}
                  className="text-left"
                >
                  <span className="block font-medium text-text hover:underline">{p.title}</span>
                  <span className="font-mono text-[10px] text-text-3">{p.code}</span>
                </button>
              </td>
              <td className="px-3 py-2 text-text-2">{p.client.name}</td>
              <td className="px-3 py-2 text-text-2">{p.stage?.label ?? 'Delivered'}</td>
              <td className="px-3 py-2">
                <Badge tone={healthTone[p.health.band]}>
                  {HEALTH_BAND_LABELS[p.health.band]} {p.health.score}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <div className="flex w-28 items-center gap-2">
                  <Meter value={p.progress} label={`${p.title} progress`} />
                  <span className="font-mono text-2xs text-text-3">
                    {Math.round(p.progress * 100)}%
                  </span>
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-text-2">{date(p.dueDate)}</td>
              <td className="px-3 py-2 font-mono text-xs text-text-2">
                {money(p.spent)} / {money(p.budget)}
              </td>
              <td className="px-3 py-2">
                <AvatarStack names={p.team.map((m) => m.name)} size={20} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
