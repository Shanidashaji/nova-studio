'use client';

import { LEAD_STAGES, PROJECT_TYPE_LABELS } from '@nova/shared';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { date, money, titleCase } from '@/lib/format';
import { useApiMutation } from '@/lib/mutations';
import { useLeads } from '@/lib/queries';
import { leadTone } from '@/lib/status';
import { useWorkspace } from '@/store/workspace';
import { InspectorSection, KeyValue } from './inspector-router';

export function LeadInspector({ id }: { id: string }) {
  const q = useLeads();
  const canWrite = useCan('sales:write');
  const inspect = useWorkspace((s) => s.inspect);
  const update = useApiMutation<{ stage: string }>('PATCH', `/leads/${id}`, {
    success: (_, b) => `Lead moved to ${titleCase(b.stage)}`,
  });
  const l = q.data?.find((x) => x.id === id);
  if (q.isPending)
    return (
      <div className="p-4">
        <Skeleton className="h-40" />
      </div>
    );

  return (
    <PanelState query={q} isEmpty={!l} empty={{ title: 'Lead not found.' }}>
      {l ? (
        <div>
          <div className="px-4 pb-3 pt-4">
            <p className="eyebrow">Sales lead</p>
            <h2 className="text-lg font-semibold">{l.title}</h2>
            <p className="text-sm text-text-2">
              {l.client ? (
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => inspect({ type: 'client', id: l.client!.id })}
                >
                  {l.client.name}
                </button>
              ) : (
                <>
                  {l.prospectName} <span className="text-text-3">(prospect)</span>
                </>
              )}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={leadTone[l.stage]}>{titleCase(l.stage)}</Badge>
              {canWrite ? (
                <Select
                  aria-label="Lead stage"
                  value={l.stage}
                  onChange={(e) => update.mutate({ stage: e.target.value })}
                  className="h-7 w-40 text-xs"
                >
                  {LEAD_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          </div>
          <InspectorSection title="Opportunity">
            <KeyValue
              items={[
                ['Type', PROJECT_TYPE_LABELS[l.projectType]],
                ['Value', money(l.estimatedValue, { exact: true })],
                ['Source', titleCase(l.source)],
                [
                  'Expected close',
                  l.expectedCloseDate
                    ? date(l.expectedCloseDate, { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—',
                ],
                [
                  'Converted to',
                  l.convertedProject ? (
                    <button
                      key="p"
                      type="button"
                      className="hover:underline"
                      onClick={() => inspect({ type: 'project', id: l.convertedProject!.id })}
                    >
                      {l.convertedProject.code} · {l.convertedProject.title}
                    </button>
                  ) : (
                    '—'
                  ),
                ],
              ]}
            />
            {l.stage === 'WON' && !l.convertedProject ? (
              <p className="mt-2 text-xs text-text-3">
                Won — open the production from Productions → New production to start its pipeline.
              </p>
            ) : null}
          </InspectorSection>
        </div>
      ) : null}
    </PanelState>
  );
}
