'use client';

import { LEAD_STAGES, PROJECT_TYPE_LABELS, type LeadStage, type LeadView } from '@nova/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel, PanelState } from '@/components/ui/panel';
import { useFocusFilter } from '@/features/shell/use-focus';
import { useCan } from '@/features/shell/user-context';
import { ago, money, relativeDay, titleCase } from '@/lib/format';
import { useClients, useLeads } from '@/lib/queries';
import { leadTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/store/workspace';
import { NewClientDialog, NewLeadDialog } from './client-dialogs';

/** Relationships and the sales pipeline, side by side: who we work with and who is coming next. */
export function ClientsLens() {
  const clients = useClients();
  const leads = useLeads();
  const inspect = useWorkspace((s) => s.inspect);
  const setFocus = useWorkspace((s) => s.setFocus);
  const { focus } = useFocusFilter();
  const canClient = useCan('client:write');
  const canSales = useCan('sales:write');
  const [newClient, setNewClient] = useState(false);
  const [newLead, setNewLead] = useState(false);

  const clientList = (clients.data ?? []).filter(
    (c) => focus?.type !== 'client' || c.id === focus.id,
  );
  const leadList = (leads.data ?? []).filter(
    (l) => focus?.type !== 'client' || l.client?.id === focus.id,
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel
        eyebrow="Relationships"
        title="Clients"
        action={
          canClient ? (
            <Button size="sm" onClick={() => setNewClient(true)}>
              <Plus /> Client
            </Button>
          ) : null
        }
        bodyClassName="px-0"
      >
        <PanelState
          query={clients}
          isEmpty={clientList.length === 0}
          empty={{ title: 'No clients yet.' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left">
                  {[
                    'Client',
                    'Industry',
                    'Active',
                    'Approvals waiting',
                    'Lifetime value',
                    'Last contact',
                    '',
                  ].map((h) => (
                    <th key={h} scope="col" className="eyebrow px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientList.map((c) => (
                  <tr key={c.id} className="border-t border-line/60 hover:bg-surface-2">
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <button
                        type="button"
                        onClick={() => inspect({ type: 'client', id: c.id })}
                        className="flex items-center gap-2.5"
                      >
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: c.accentColor ?? 'var(--text-3)' }}
                          aria-hidden
                        />
                        <span className="font-medium text-text hover:underline">{c.name}</span>
                      </button>
                    </th>
                    <td className="px-4 py-2 text-text-2">
                      {c.industry} · {c.city}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{c.activeProjects}</td>
                    <td className="px-4 py-2">
                      {c.pendingApprovals > 0 ? (
                        <Badge tone="attention">{c.pendingApprovals} waiting</Badge>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{money(c.lifetimeValue)}</td>
                    <td className="px-4 py-2 text-xs text-text-2">
                      {c.lastInteractionAt ? ago(c.lastInteractionAt) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFocus({ type: 'client', id: c.id, label: c.name })}
                      >
                        Focus
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelState>
      </Panel>

      <Panel
        eyebrow="Sales pipeline"
        title="Leads"
        action={
          canSales ? (
            <Button size="sm" onClick={() => setNewLead(true)}>
              <Plus /> Lead
            </Button>
          ) : null
        }
      >
        <PanelState query={leads} skeleton="block">
          <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {LEAD_STAGES.map((stage) => (
              <LeadColumn
                key={stage}
                stage={stage}
                leads={leadList.filter((l) => l.stage === stage)}
              />
            ))}
          </div>
        </PanelState>
      </Panel>
      <NewClientDialog open={newClient} onOpenChange={setNewClient} />
      <NewLeadDialog open={newLead} onOpenChange={setNewLead} />
    </div>
  );
}

function LeadColumn({ stage, leads }: { stage: LeadStage; leads: LeadView[] }) {
  const inspect = useWorkspace((s) => s.inspect);
  const total = leads.reduce((n, l) => n + l.estimatedValue, 0);
  return (
    <section
      className={cn(
        'flex w-56 shrink-0 flex-col rounded-[var(--radius-md)] border bg-surface-2',
        stage === 'WON' || stage === 'LOST' ? 'border-dashed border-line-strong' : 'border-line',
      )}
      aria-label={titleCase(stage)}
    >
      <header className="flex items-center justify-between px-3 py-2">
        <Badge tone={leadTone[stage]}>{titleCase(stage)}</Badge>
        <span className="font-mono text-2xs text-text-3">{money(total)}</span>
      </header>
      <ul className="flex flex-col gap-1.5 p-2 pt-0">
        {leads.length === 0 ? <li className="px-1 py-2 text-2xs text-text-3">—</li> : null}
        {leads.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => inspect({ type: 'lead', id: l.id })}
              className="w-full rounded-[var(--radius-sm)] border border-line bg-surface-1 p-2 text-left hover:border-line-strong"
            >
              <span className="block truncate text-sm font-medium">{l.title}</span>
              <span className="block truncate text-2xs text-text-3">
                {l.client?.name ?? l.prospectName} · {PROJECT_TYPE_LABELS[l.projectType]}
              </span>
              <span className="mt-1 flex justify-between font-mono text-[10px] text-text-3">
                <span className="text-text-2">{money(l.estimatedValue)}</span>
                {l.expectedCloseDate ? <span>{relativeDay(l.expectedCloseDate)}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
