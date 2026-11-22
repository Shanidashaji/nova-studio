'use client';

import { PROJECT_TYPE_LABELS } from '@nova/shared';
import { Crosshair, Mail, MessageCircle, Phone, Plus, Users, Video } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { LogInteractionDialog, NewLeadDialog } from '@/features/clients/client-dialogs';
import { useCan } from '@/features/shell/user-context';
import { ago, money, titleCase } from '@/lib/format';
import { useClient } from '@/lib/queries';
import { healthTone, leadTone } from '@/lib/status';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection, KeyValue } from './inspector-router';

const ICON = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Users,
  WHATSAPP: MessageCircle,
  FEEDBACK: Video,
} as const;

export function ClientInspector({ id }: { id: string }) {
  const q = useClient(id);
  const inspect = useWorkspace((s) => s.inspect);
  const setFocus = useWorkspace((s) => s.setFocus);
  const canWrite = useCan('client:write');
  const canSales = useCan('sales:write');
  const [logging, setLogging] = useState(false);
  const [leading, setLeading] = useState(false);
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
          <div className="px-4 pb-3 pt-4">
            <div className="flex items-start gap-3">
              <span
                className="mt-1.5 size-3 rounded-full"
                style={{ background: q.data.accentColor ?? 'var(--text-3)' }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-6">{q.data.name}</h2>
                <p className="text-sm text-text-2">
                  {q.data.industry} · {q.data.city}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFocus({ type: 'client', id: q.data.id, label: q.data.name })}
              >
                <Crosshair /> Focus
              </Button>
            </div>
            {q.data.notes ? <p className="mt-2 text-xs text-text-3">{q.data.notes}</p> : null}
          </div>
          <InspectorSection title="Relationship">
            <KeyValue
              items={[
                ['Contact', q.data.contactName ?? '—'],
                ['Email', q.data.contactEmail ?? '—'],
                ['Status', titleCase(q.data.status)],
                // Withheld from roles that may not see what productions cost.
                ...(q.data.lifetimeValue === null
                  ? []
                  : ([['Lifetime value', money(q.data.lifetimeValue)]] as [string, string][])),
                [
                  'Waiting on them',
                  q.data.pendingApprovals ? `${q.data.pendingApprovals} approval(s)` : 'Nothing',
                ],
              ]}
            />
          </InspectorSection>
          <InspectorSection title="Productions">
            <ul className="flex flex-col gap-1">
              {q.data.projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => inspect({ type: 'project', id: p.id })}
                    className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.title}</span>
                      <span className="block text-2xs text-text-3">
                        {p.code} · {p.stage?.label ?? 'Delivered'}
                        {p.budget === null ? null : ` · ${money(p.budget)}`}
                      </span>
                    </span>
                    <Badge tone={healthTone[p.health.band]}>{p.health.score}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </InspectorSection>
          <InspectorSection
            title="Communication"
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setLogging(true)}>
                  <Plus /> Log
                </Button>
              ) : null
            }
          >
            <ol className="flex flex-col gap-2">
              {q.data.interactions.map((i) => {
                const Icon = ICON[i.type];
                return (
                  <li key={i.id} className="flex gap-2 text-sm">
                    <Icon
                      className="mt-0.5 size-3.5 shrink-0 text-text-3"
                      aria-label={titleCase(i.type)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-text-2">{i.summary}</span>
                      <span className="block text-2xs text-text-3">
                        {titleCase(i.type)}
                        {i.project ? ` · ${i.project.title}` : ''}
                        {i.loggedBy ? ` · ${i.loggedBy}` : ''} · {ago(i.occurredAt)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </InspectorSection>
          <InspectorSection
            title="Opportunities"
            action={
              canSales ? (
                <Button size="sm" onClick={() => setLeading(true)}>
                  <Plus /> Lead
                </Button>
              ) : null
            }
          >
            {q.data.leads.length === 0 ? (
              <p className="text-sm text-text-3">No open opportunities.</p>
            ) : null}
            <ul className="flex flex-col gap-1">
              {q.data.leads.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => inspect({ type: 'lead', id: l.id })}
                    className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{l.title}</span>
                      <span className="text-2xs text-text-3">
                        {PROJECT_TYPE_LABELS[l.projectType]} · {money(l.estimatedValue)}
                      </span>
                    </span>
                    <Badge tone={leadTone[l.stage]}>{titleCase(l.stage)}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </InspectorSection>
          <LogInteractionDialog
            open={logging}
            onOpenChange={setLogging}
            clientId={q.data.id}
            projects={q.data.projects.map((p) => ({ id: p.id, title: p.title }))}
          />
          <NewLeadDialog open={leading} onOpenChange={setLeading} clientId={q.data.id} />
        </div>
      ) : null}
    </PanelState>
  );
}
