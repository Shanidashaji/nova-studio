'use client';

import {
  PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskBoardItem,
  type TaskStatus,
} from '@nova/shared';
import { ChevronLeft, ChevronRight, Link2, Plus, Search, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Avatar, Segmented } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { Stat, StatRow } from '@/features/studio/ui';
import { TaskDialog } from '@/features/tasks/task-dialog';
import { date, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useProject, useProjects, useTaskBoard, useTeam } from '@/lib/queries';
import { taskTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';

type View = 'board' | 'list' | 'calendar';
type Flag = '' | 'overdue' | 'blocked';

/** Every task across productions as a Kanban board, a sortable list or a calendar. */
export function TasksLens() {
  const [view, setView] = useState<View>('board');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('');
  const [flag, setFlag] = useState<Flag>('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const canWrite = useCan('task:write');
  const projects = useProjects({ status: 'ACTIVE' });
  const team = useTeam();
  const board = useTaskBoard({
    projectId: projectId || undefined,
    assigneeId: assigneeId || undefined,
    priority: priority || undefined,
    flag: flag || undefined,
    q: q.trim() || undefined,
  });
  const project = useProject(creating ? projectId : null);

  return (
    <div className="flex flex-col gap-3">
      {board.data ? (
        <StatRow>
          <Stat label="Open" value={board.data.counts.open} onClick={() => setFlag('')} />
          <Stat
            label="Overdue"
            value={board.data.counts.overdue}
            tone={board.data.counts.overdue ? 'critical' : 'neutral'}
            onClick={() => setFlag('overdue')}
          />
          <Stat
            label="Blocked"
            value={board.data.counts.blocked}
            tone={board.data.counts.blocked ? 'attention' : 'neutral'}
            hint="status or unfinished dependency"
            onClick={() => setFlag('blocked')}
          />
          <Stat label="Done (14 days)" value={board.data.counts.done} tone="signal" />
        </StatRow>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <Segmented<View>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: 'Board' },
            { value: 'list', label: 'List' },
            { value: 'calendar', label: 'Calendar' },
          ]}
        />
        <label className="relative min-w-40 flex-1">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-text-3" />
          <Input
            placeholder="Search tasks"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 text-base sm:text-sm"
          />
        </label>
        <Select
          aria-label="Project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-48"
        >
          <option value="">All projects</option>
          {(projects.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.title}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Assignee"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="w-40"
        >
          <option value="">Anyone</option>
          {(team.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-32"
        >
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {titleCase(p)}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Flag"
          value={flag}
          onChange={(e) => setFlag(e.target.value as Flag)}
          className="w-32"
        >
          <option value="">All</option>
          <option value="overdue">Overdue</option>
          <option value="blocked">Blocked</option>
        </Select>
        {canWrite ? (
          <Button
            variant="primary"
            disabled={!projectId}
            title={projectId ? undefined : 'Choose a project first'}
            onClick={() => setCreating(true)}
          >
            <Plus /> New task
          </Button>
        ) : null}
      </div>
      <PanelState
        query={board}
        skeleton="block"
        isEmpty={!board.data?.items.length}
        empty={{ title: 'No tasks match.', body: 'Change the filters.' }}
      >
        {board.data ? (
          view === 'board' ? (
            <Board items={board.data.items} canWrite={canWrite} />
          ) : view === 'list' ? (
            <List items={board.data.items} />
          ) : (
            <Calendar items={board.data.items} />
          )
        ) : null}
      </PanelState>
      {project.data ? (
        <TaskDialog open={creating} onOpenChange={setCreating} project={project.data} />
      ) : null}
    </div>
  );
}

function TaskCard({ t, canWrite }: { t: TaskBoardItem; canWrite: boolean }) {
  const inspect = useWorkspace((s) => s.inspect);
  const move = useApiMutation<{ status: TaskStatus }>('PATCH', `/tasks/${t.id}`, {
    success: (_r, b) => `Moved to ${TASK_STATUS_LABELS[b.status].toLowerCase()}`,
  });
  return (
    <li
      className={cn(
        'rounded-[var(--radius-sm)] border bg-surface-1 p-2.5',
        t.overdue ? 'border-critical-line' : t.blocked ? 'border-attention-line' : 'border-line',
      )}
    >
      <button
        type="button"
        onClick={() => inspect({ type: 'task', id: t.id })}
        className="block w-full text-left"
      >
        <span className="block text-sm font-medium leading-5">{t.title}</span>
        <span className="block truncate text-2xs text-text-3">
          {t.project.code} · {t.project.title}
          {t.shoot ? ` · ${t.shoot.title}` : ''}
        </span>
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs">
        {t.assignee ? (
          <Avatar name={t.assignee.name} size={18} />
        ) : (
          <span className="text-text-3">Unassigned</span>
        )}
        <Badge
          tone={
            t.priority === 'URGENT' ? 'critical' : t.priority === 'HIGH' ? 'attention' : 'neutral'
          }
          dot={false}
        >
          {titleCase(t.priority)}
        </Badge>
        {t.dueDate ? (
          <span className={cn('font-mono', t.overdue ? 'text-critical' : 'text-text-3')}>
            {date(t.dueDate)}
          </span>
        ) : null}
        {t.overdue ? <Badge tone="critical">Overdue</Badge> : null}
        {t.blockers.length ? (
          <span
            className="inline-flex items-center gap-1 text-attention"
            title={t.blockers.map((b) => b.title).join(', ')}
          >
            <Link2 className="size-3" /> waits on {t.blockers.length}
          </span>
        ) : null}
      </div>
      {canWrite ? (
        <Select
          aria-label={`Move ${t.title}`}
          value={t.status}
          disabled={move.isPending}
          onChange={(e) => move.mutate({ status: e.target.value as TaskStatus })}
          className="mt-2 h-7 text-xs"
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      ) : null}
    </li>
  );
}

function Board({ items, canWrite }: { items: TaskBoardItem[]; canWrite: boolean }) {
  return (
    <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
      {TASK_STATUSES.map((s) => {
        const col = items.filter((t) => t.status === s);
        return (
          <section
            key={s}
            aria-label={TASK_STATUS_LABELS[s]}
            className="w-[78vw] max-w-xs shrink-0 snap-start rounded-[var(--radius-md)] border border-line bg-surface-2 p-2 sm:w-72 lg:w-auto lg:max-w-none"
          >
            <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <Badge tone={taskTone[s]}>{TASK_STATUS_LABELS[s]}</Badge>
              </span>
              <span className="font-mono text-text-3">{col.length}</span>
            </h3>
            <ul className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto">
              {col.map((t) => (
                <TaskCard key={t.id} t={t} canWrite={canWrite} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

type SortKey = 'due' | 'priority' | 'project' | 'status';
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function List({ items }: { items: TaskBoardItem[] }) {
  const inspect = useWorkspace((s) => s.inspect);
  const [sort, setSort] = useState<SortKey>('due');
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        sort === 'due'
          ? (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
          : sort === 'priority'
            ? PRIORITY_RANK[a.priority]! - PRIORITY_RANK[b.priority]!
            : sort === 'project'
              ? a.project.code.localeCompare(b.project.code)
              : TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status),
      ),
    [items, sort],
  );
  const header = (key: SortKey, label: string) => (
    <th
      scope="col"
      className="eyebrow px-3 py-2 font-medium"
      aria-sort={sort === key ? 'ascending' : 'none'}
    >
      <button
        type="button"
        className={cn('hover:text-text', sort === key && 'text-text')}
        onClick={() => setSort(key)}
      >
        {label}
      </button>
    </th>
  );
  return (
    <Panel bodyClassName="px-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left">
              <th scope="col" className="eyebrow px-3 py-2 font-medium">
                Task
              </th>
              {header('project', 'Project')}
              <th scope="col" className="eyebrow px-3 py-2 font-medium">
                Owner
              </th>
              {header('priority', 'Priority')}
              {header('due', 'Due')}
              {header('status', 'Status')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className="border-t border-line/60 hover:bg-surface-2">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => inspect({ type: 'task', id: t.id })}
                  >
                    {t.title}
                  </button>
                  {t.blockers.length ? (
                    <span className="ml-2 text-2xs text-attention">
                      waits on {t.blockers.map((b) => b.title).join(', ')}
                    </span>
                  ) : null}
                </th>
                <td className="px-3 py-2 text-xs text-text-2">
                  {t.project.code} · {t.project.title}
                </td>
                <td className="px-3 py-2 text-xs">{t.assignee?.name ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{titleCase(t.priority)}</td>
                <td className={cn('px-3 py-2 font-mono text-xs', t.overdue && 'text-critical')}>
                  {t.dueDate ? date(t.dueDate) : '—'}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={taskTone[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
                  {t.blocked && t.status !== 'BLOCKED' ? (
                    <TriangleAlert
                      className="ml-1 inline size-3 text-attention"
                      aria-label="Blocked by a dependency"
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Calendar({ items }: { items: TaskBoardItem[] }) {
  const inspect = useWorkspace((s) => s.inspect);
  const [offset, setOffset] = useState(0);
  const month = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [offset]);
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = new Map<string, TaskBoardItem[]>();
  for (const t of items) {
    if (!t.dueDate) continue;
    const k = key(new Date(t.dueDate));
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  const todayKey = key(new Date());
  const undated = items.filter((t) => !t.dueDate).length;
  return (
    <Panel
      title={month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      action={
        <span className="flex gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Previous month"
            onClick={() => setOffset((o) => o - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button size="sm" disabled={offset === 0} onClick={() => setOffset(0)}>
            This month
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Next month"
            onClick={() => setOffset((o) => o + 1)}
          >
            <ChevronRight />
          </Button>
        </span>
      }
    >
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-sm)] border border-line bg-line text-xs">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="bg-surface-2 px-1.5 py-1 text-center text-2xs text-text-3">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const list = byDay.get(key(d)) ?? [];
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'min-h-16 bg-surface-1 p-1 sm:min-h-24',
                d.getMonth() !== month.getMonth() && 'bg-surface-2 text-text-3',
              )}
            >
              <div
                className={cn(
                  'mb-0.5 font-mono text-[10px]',
                  key(d) === todayKey && 'font-bold text-signal',
                )}
              >
                {d.getDate()}
              </div>
              <ul className="flex flex-col gap-0.5">
                {list.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => inspect({ type: 'task', id: t.id })}
                      className={cn(
                        'block w-full truncate rounded px-1 text-left text-[10px] leading-4 sm:text-2xs',
                        t.status === 'DONE'
                          ? 'bg-surface-3 text-text-3 line-through'
                          : t.overdue
                            ? 'bg-critical-soft text-critical'
                            : 'bg-info-soft text-info',
                      )}
                    >
                      {t.title}
                    </button>
                  </li>
                ))}
                {list.length > 3 ? (
                  <li className="text-[10px] text-text-3">+{list.length - 3} more</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
      {undated ? (
        <p className="mt-2 text-2xs text-text-3">
          {undated} task(s) have no due date and are not shown.
        </p>
      ) : null}
    </Panel>
  );
}
