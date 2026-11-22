'use client';

import type { Recommendation } from '@nova/shared';
import { Search, Sparkles, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Segmented } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { Honesty } from '@/features/studio/ui';
import { money } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useCasting, useRecommendations } from '@/lib/queries';
import { cn } from '@/lib/utils';

/**
 * Casting and crewing for one shoot: the characters its scenes need, who plays them, and
 * rule-based recommendations (with every reason shown) that the manager reviews and books.
 */
export function CastingPanel({ shootId }: { shootId: string }) {
  const casting = useCasting(shootId);
  const [kind, setKind] = useState<'talent' | 'crew'>('talent');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [asked, setAsked] = useState<{ role: string; description: string } | null>(null);

  const params =
    kind === 'talent'
      ? { shootId, role: asked?.role, description: asked?.description || undefined }
      : { shootId, role: asked?.role };
  const recs = useRecommendations(kind, params, !!asked?.role);

  const ask = (r: string, d = '') => {
    setRole(r);
    setDescription(d);
    setAsked({ role: r, description: d });
  };

  return (
    <Panel eyebrow="Rule-based recommendations" title="Find artists and crew" icon={<Sparkles />}>
      <div className="flex flex-col gap-3">
        <Segmented
          label="Looking for"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setAsked(null);
          }}
          options={[
            { value: 'talent', label: 'Artists' },
            { value: 'crew', label: 'Crew' },
          ]}
        />
        {kind === 'talent' && casting.data && casting.data.length ? (
          <div>
            <p className="mb-1 text-xs text-text-2">Parts in this shoot’s scenes</p>
            <ul className="flex flex-wrap gap-1.5">
              {casting.data.map((n) => {
                const confirmed = n.booked.find((b) => b.status === 'CONFIRMED');
                const held = n.booked.find((b) => b.status === 'HOLD');
                return (
                  <li key={n.character}>
                    <button
                      type="button"
                      onClick={() => ask(n.character)}
                      className={cn(
                        'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs pointer-coarse:h-10',
                        confirmed
                          ? 'border-signal-line bg-signal-soft text-signal'
                          : held
                            ? 'border-attention-line bg-attention-soft text-attention'
                            : 'border-critical-line bg-critical-soft text-critical',
                      )}
                    >
                      {n.character}
                      <span className="text-[10px] opacity-80">
                        {confirmed
                          ? `· ${confirmed.name}`
                          : held
                            ? `· hold: ${held.name}`
                            : '· not cast'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (role.trim()) ask(role.trim(), description.trim());
          }}
        >
          <Input
            aria-label={kind === 'talent' ? 'Part or character' : 'Crew role'}
            placeholder={
              kind === 'talent' ? 'Part, e.g. Mother, Hand model' : 'Role, e.g. DOP, Sound, Drone'
            }
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="text-base sm:text-sm"
          />
          {kind === 'talent' ? (
            <Input
              aria-label="Requirements"
              placeholder="Requirements, e.g. Malayalam, 30s, dance"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-base sm:text-sm"
            />
          ) : null}
          <Button type="submit" disabled={!role.trim()}>
            <Search /> Recommend
          </Button>
        </form>
        {asked ? (
          <PanelState
            query={recs}
            isEmpty={!recs.data?.candidates.length}
            empty={{
              title: 'Nobody matches.',
              body: 'Add artists to the roster or widen the requirements.',
            }}
          >
            {recs.data ? (
              <>
                <Honesty>{recs.data.explanation}</Honesty>
                <ul className="mt-2 flex flex-col gap-2">
                  {recs.data.candidates.map((c) => (
                    <Candidate key={c.id} c={c} shootId={shootId} kind={kind} role={asked.role} />
                  ))}
                </ul>
              </>
            ) : null}
          </PanelState>
        ) : null}
      </div>
    </Panel>
  );
}

function Candidate({
  c,
  shootId,
  kind,
  role,
}: {
  c: Recommendation;
  shootId: string;
  kind: 'talent' | 'crew';
  role: string;
}) {
  const [force, setForce] = useState(false);
  const book = useApiMutation<Record<string, unknown>>(
    'POST',
    kind === 'talent' ? `/shoots/${shootId}/talent` : `/shoots/${shootId}/crew`,
    {
      success: kind === 'talent' ? `${c.name} held for ${role}` : `${c.name} called as ${role}`,
    },
  );
  return (
    <li
      className={cn(
        'rounded-[var(--radius-md)] border bg-surface-2 p-3',
        c.available ? 'border-line' : 'border-dashed border-line',
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{c.name}</p>
          <p className="text-2xs text-text-3">
            {c.subtitle}
            {c.dayRate ? ` · ${money(c.dayRate)}/day` : ''}
          </p>
        </div>
        <Badge tone={c.available ? (c.score >= 60 ? 'signal' : 'info') : 'neutral'}>
          Score {c.score}
        </Badge>
        <Button
          size="sm"
          variant={c.available ? 'primary' : 'ghost'}
          disabled={book.isPending || (!c.available && !force)}
          onClick={() =>
            book.mutate(
              kind === 'talent'
                ? { talentId: c.id, character: role, status: 'HOLD', allowOverlap: force }
                : { teamMemberId: c.id, role, allowOverlap: force },
            )
          }
        >
          <UserPlus /> {kind === 'talent' ? 'Hold' : 'Call'}
        </Button>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-1">
        {c.reasons.map((r) => (
          <li
            key={r.label}
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px]',
              r.points >= 0 ? 'bg-signal-soft text-signal' : 'bg-attention-soft text-attention',
            )}
          >
            {r.points > 0 ? '+' : ''}
            {r.points} {r.label}
          </li>
        ))}
      </ul>
      {c.blockers.length ? (
        <div className="mt-1.5 text-xs text-critical">
          {c.blockers.join(' · ')}
          {c.blockers.every((b) => !/inactive|already/i.test(b)) ? (
            <label className="ml-2 inline-flex items-center gap-1 text-text-2">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />{' '}
              book anyway (overlap acknowledged)
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
