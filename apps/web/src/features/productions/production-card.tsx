'use client';

import { HEALTH_BAND_LABELS, PROJECT_TYPE_LABELS, type ProjectSummary } from '@nova/shared';
import { CalendarClock, Camera, Sparkles } from 'lucide-react';
import { Still } from '@/components/still';
import { Badge } from '@/components/ui/badge';
import { AvatarStack, Meter } from '@/components/ui/misc';
import { date, relativeDay } from '@/lib/format';
import { healthTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';

/** A production as a visual card: graded still, stage, health, progress, team and next milestone. */
export function ProductionCard({
  project: p,
  compact = false,
}: {
  project: ProjectSummary;
  compact?: boolean;
}) {
  const inspect = useWorkspace((s) => s.inspect);
  const tone = healthTone[p.health.band];
  const overdue = p.status === 'ACTIVE' && new Date(p.dueDate) < new Date();

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-1 transition-colors hover:border-line-strong">
      <Still
        id={p.id}
        type={p.type}
        accent={p.client.accentColor}
        src={p.coverImageUrl}
        alt={p.title}
        className={compact ? 'aspect-[16/8]' : undefined}
      >
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <span className="rounded bg-black/50 px-1.5 font-mono text-[10px] tracking-wider text-white/80 backdrop-blur-sm">
            {p.code}
          </span>
          {p.stage ? (
            <Badge
              tone={p.stage.status === 'BLOCKED' ? 'critical' : 'neutral'}
              className="border-white/15 bg-black/50 text-white/90 backdrop-blur-sm"
            >
              {p.stage.label}
            </Badge>
          ) : (
            <Badge tone="signal" className="bg-black/50 backdrop-blur-sm">
              Delivered
            </Badge>
          )}
        </div>
        {p.aiAssisted ? (
          <span className="absolute bottom-2 right-2.5 inline-flex items-center gap-1 rounded bg-black/50 px-1.5 text-[10px] text-ai backdrop-blur-sm">
            <Sparkles className="size-3" /> AI-assisted
          </span>
        ) : null}
      </Still>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text">
            <button
              type="button"
              onClick={() => inspect({ type: 'project', id: p.id })}
              className="text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-signal"
            >
              {p.title}
            </button>
          </h3>
          <p className="truncate text-xs text-text-3">
            {p.client.name} · {PROJECT_TYPE_LABELS[p.type]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Meter
            value={p.progress}
            tone={tone === 'neutral' ? 'signal' : (tone as 'signal')}
            label={`${p.title} progress`}
          />
          <span className="font-mono text-2xs tabular text-text-2">
            {Math.round(p.progress * 100)}%
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <Badge tone={tone}>
            {HEALTH_BAND_LABELS[p.health.band]}{' '}
            <span className="font-mono">{p.health.score}</span>
          </Badge>
          <AvatarStack names={p.team.map((m) => m.name)} size={20} />
        </div>
        {!compact ? (
          <div className="flex items-center justify-between border-t border-line pt-2 text-2xs text-text-3">
            <span className={cn('inline-flex items-center gap-1', overdue && 'text-critical')}>
              <CalendarClock className="size-3" /> Due {date(p.dueDate)} · {relativeDay(p.dueDate)}
            </span>
            {p.nextShoot ? (
              <span className="inline-flex items-center gap-1 text-info">
                <Camera className="size-3" /> {relativeDay(p.nextShoot.startsAt)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
