'use client';

import type { UpdateStageDefinition, WorkflowTemplateView } from '@nova/shared';
import { Copy, Lock } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';
import { PanelState } from '@/components/ui/panel';
import { useCan } from '@/features/shell/user-context';
import { useApiMutation } from '@/lib/mutations';
import { useWorkflows } from '@/lib/queries';
import { InspectorSection } from './inspector-router';

/**
 * Workflow templates: the lifecycles projects follow. Stage plans (expected days), approval
 * gates and skippable stages are edited here; new templates start as a copy.
 */
export function WorkflowsInspector() {
  const q = useWorkflows();
  const canManage = useCan('workflow:manage');
  if (q.isPending)
    return (
      <div className="p-4">
        <Skeleton className="h-60" />
      </div>
    );
  return (
    <PanelState query={q}>
      <div className="px-4 pb-2 pt-4">
        <p className="eyebrow">Workflow engine</p>
        <h2 className="text-lg font-semibold">Workflow templates</h2>
        <p className="text-sm text-text-2">
          Changes apply to how every project on the template is planned and gated.
        </p>
        {!canManage ? (
          <p className="mt-2 text-xs text-text-3">
            <Lock className="inline size-3" /> Read-only for your role.
          </p>
        ) : null}
      </div>
      {q.data?.map((t) => (
        <TemplateBlock key={t.id} t={t} canManage={canManage} />
      ))}
    </PanelState>
  );
}

function TemplateBlock({ t, canManage }: { t: WorkflowTemplateView; canManage: boolean }) {
  const [name, setName] = useState('');
  const clone = useApiMutation<void>('POST', '/workflows', {
    transform: () => ({ name, basedOnId: t.id }),
    success: `Workflow “${name}” created`,
    onSuccess: () => setName(''),
  });
  return (
    <InspectorSection
      title={`${t.name} · ${t.projectCount} project${t.projectCount === 1 ? '' : 's'}`}
      action={t.isDefault ? <Badge tone="signal">Default</Badge> : null}
    >
      {t.description ? <p className="mb-2 text-xs text-text-3">{t.description}</p> : null}
      <ol className="flex flex-col gap-1.5">
        {t.stages.map((s) => (
          <StageRow key={s.id} s={s} canManage={canManage} />
        ))}
      </ol>
      {canManage ? (
        <div className="mt-3 flex gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New template name"
            aria-label="New template name"
          />
          <Button
            disabled={name.trim().length < 1}
            loading={clone.isPending}
            onClick={() => clone.mutate()}
          >
            <Copy /> Copy
          </Button>
        </div>
      ) : null}
    </InspectorSection>
  );
}

function StageRow({
  s,
  canManage,
}: {
  s: WorkflowTemplateView['stages'][number];
  canManage: boolean;
}) {
  const update = useApiMutation<UpdateStageDefinition>('PATCH', `/workflows/stages/${s.id}`, {
    success: `${s.label} updated`,
  });
  return (
    <li className="rounded-[var(--radius-sm)] border border-line bg-surface-2 p-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-text-3">
          {String(s.order).padStart(2, '0')}
        </span>
        <span className="flex-1 text-sm font-medium">{s.label}</span>
        <label className="flex items-center gap-1 text-xs text-text-3">
          <Input
            type="number"
            min={1}
            max={120}
            defaultValue={s.expectedDays}
            disabled={!canManage}
            onBlur={(e) => {
              const days = Number(e.target.value);
              // A blank or out-of-range entry is not a change: put the saved value back.
              if (!Number.isInteger(days) || days < 1 || days > 120) {
                e.target.value = String(s.expectedDays);
                return;
              }
              if (days !== s.expectedDays) update.mutate({ expectedDays: days });
            }}
            className="h-7 w-14 text-right font-mono"
            aria-label={`${s.label} planned days`}
          />
          days
        </label>
      </div>
      <div className="mt-1.5 flex gap-4">
        <Checkbox
          label="Client sign-off"
          checked={s.requiresApproval}
          disabled={!canManage || update.isPending}
          onChange={(e) => update.mutate({ requiresApproval: e.target.checked })}
        />
        <Checkbox
          label="Skippable"
          checked={s.skippable}
          disabled={!canManage || update.isPending}
          onChange={(e) => update.mutate({ skippable: e.target.checked })}
        />
      </div>
    </li>
  );
}
