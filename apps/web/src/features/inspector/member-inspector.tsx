'use client';

import { STUDIO_LOCATION_LABELS, TASK_STATUS_LABELS } from '@nova/shared';
import { Camera, Crosshair } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { date, relativeDay } from '@/lib/format';
import { useMember } from '@/lib/queries';
import { taskTone, utilTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection } from './inspector-router';

export function MemberInspector({ id }: { id: string }) {
  const q = useMember(id);
  const inspect = useWorkspace((s) => s.inspect);
  const setFocus = useWorkspace((s) => s.setFocus);
  if (q.isPending)
    return (
      <div className="p-4">
        <Skeleton className="h-40" />
      </div>
    );
  return (
    <PanelState query={q}>
      {q.data ? (
        <div>
          <div className="flex items-center gap-3 px-4 pb-3 pt-4">
            <Avatar name={q.data.name} size={48} />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-6">{q.data.name}</h2>
              <p className="text-sm text-text-2">
                {q.data.title} · {STUDIO_LOCATION_LABELS[q.data.baseLocation]}
              </p>
              {q.data.email ? (
                <p className="font-mono text-2xs text-text-3">{q.data.email}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setFocus({ type: 'member', id: q.data.id, label: q.data.name })}
            >
              <Crosshair /> Focus
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 px-4 pb-3">
            {q.data.skills.map((s) => (
              <Badge key={s} tone="neutral" dot={false}>
                {s}
              </Badge>
            ))}
          </div>
          <InspectorSection title={`Load · ${q.data.weeklyCapacityHours}h / week`}>
            <div className="grid grid-cols-4 gap-1.5">
              {q.data.weeks.map((w, i) => (
                <div
                  key={w.weekStart}
                  className="rounded-[var(--radius-sm)] border border-line p-2 text-center"
                >
                  <p className="text-[10px] text-text-3">
                    {i === 0 ? 'Next 7d' : date(w.weekStart)}
                  </p>
                  <p
                    className={cn(
                      'font-mono text-base',
                      {
                        neutral: 'text-text',
                        signal: 'text-signal',
                        attention: 'text-attention',
                        critical: 'text-critical',
                        info: 'text-info',
                        ai: 'text-ai',
                      }[utilTone[w.band]],
                    )}
                  >
                    {Math.round(w.ratio * 100)}%
                  </p>
                  <p className="font-mono text-[10px] text-text-3">{w.hours}h</p>
                </div>
              ))}
            </div>
          </InspectorSection>
          <InspectorSection
            title={`Open tasks · ${q.data.openTasks}${q.data.overdueTasks ? ` (${q.data.overdueTasks} overdue)` : ''}`}
          >
            <ul className="flex flex-col gap-1">
              {q.data.tasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => inspect({ type: 'task', id: t.id })}
                    className="flex w-full items-start gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{t.title}</span>
                      <span className="block truncate text-2xs text-text-3">
                        {t.project.title}
                        {t.dueDate ? ` · due ${relativeDay(t.dueDate)}` : ''}
                        {t.estimateHours ? ` · ${t.estimateHours}h` : ''}
                      </span>
                    </span>
                    <Badge tone={taskTone[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </InspectorSection>
          <InspectorSection title="Upcoming shoots">
            {q.data.upcomingShoots.length === 0 ? (
              <p className="text-sm text-text-3">None scheduled.</p>
            ) : null}
            <ul className="flex flex-col gap-1">
              {q.data.upcomingShoots.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => inspect({ type: 'shoot', id: s.id })}
                    className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-left text-sm hover:bg-surface-2"
                  >
                    <Camera className="size-3.5 text-info" />{' '}
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="text-2xs text-text-3">
                      {s.role} · {relativeDay(s.startsAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </InspectorSection>
          <InspectorSection title="Productions">
            <ul className="flex flex-col gap-1">
              {q.data.projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => inspect({ type: 'project', id: p.id })}
                    className="flex w-full justify-between rounded-[var(--radius-sm)] px-1 py-1 text-left text-sm hover:bg-surface-2"
                  >
                    <span>{p.title}</span>
                    <span className="text-xs text-text-3">{p.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </InspectorSection>
        </div>
      ) : null}
    </PanelState>
  );
}
