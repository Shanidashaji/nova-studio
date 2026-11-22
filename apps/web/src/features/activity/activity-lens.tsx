'use client';

import type { Permission } from '@nova/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/misc';
import { Panel, PanelState } from '@/components/ui/panel';
import { useFocusFilter } from '@/features/shell/use-focus';
import { useUser } from '@/features/shell/user-context';
import { useActivity } from '@/lib/queries';
import { ActivityItem } from './activity-item';

/**
 * Areas of the audit trail, by the entity type the API records. `anyOf` mirrors the API's
 * visibility rule (apps/api activity-visibility.ts): an area the user cannot read is not offered,
 * because it would only ever be empty. `audit:read` sees every area.
 */
const AREAS: { value: string; label: string; anyOf?: Permission[] }[] = [
  { value: '', label: 'Everything' },
  { value: 'project', label: 'Projects & workflow' },
  { value: 'task', label: 'Tasks' },
  { value: 'deliverable', label: 'Deliverables & approvals' },
  { value: 'milestone', label: 'Milestones' },
  { value: 'risk', label: 'Risks' },
  { value: 'shoot', label: 'Shoots' },
  { value: 'studio_booking', label: 'Studio bookings' },
  { value: 'asset', label: 'Equipment' },
  { value: 'stock', label: 'Stock' },
  { value: 'member', label: 'Crew' },
  { value: 'client', label: 'Clients' },
  { value: 'lead', label: 'Sales' },
  { value: 'invoice', label: 'Invoices', anyOf: ['finance:read'] },
  { value: 'expense', label: 'Expenses', anyOf: ['finance:read'] },
  { value: 'finance', label: 'Ledger entries', anyOf: ['finance:read'] },
  { value: 'vendor', label: 'Vendors', anyOf: ['finance:read', 'vendor:write'] },
  {
    value: 'purchase_request',
    label: 'Purchase requests',
    anyOf: ['procurement:request', 'procurement:approve', 'procurement:order', 'finance:read'],
  },
  {
    value: 'purchase_order',
    label: 'Purchase orders',
    anyOf: ['procurement:request', 'procurement:approve', 'procurement:order', 'finance:read'],
  },
  {
    value: 'approval_request',
    label: 'Approval requests',
    anyOf: ['expense:approve', 'procurement:approve', 'leave:approve', 'finance:read'],
  },
  { value: 'document', label: 'Documents', anyOf: ['document:confidential'] },
  { value: 'leave', label: 'Leave', anyOf: ['hr:read', 'leave:approve'] },
  { value: 'attendance', label: 'Attendance', anyOf: ['hr:read', 'attendance:write'] },
  { value: 'employee', label: 'Employee records', anyOf: ['hr:read'] },
  { value: 'department', label: 'Departments' },
  { value: 'workflow', label: 'Workflow templates' },
  { value: 'user', label: 'Users', anyOf: [] },
  { value: 'role', label: 'Roles & permissions', anyOf: [] },
  { value: 'auth', label: 'Sign-ins', anyOf: [] },
];

/** The append-only audit trail. Every change made in NOVA, by person, assistant or system. */
export function ActivityLens() {
  const { focus, matchesProjectId } = useFocusFilter();
  const { permissions } = useUser();
  const [entityType, setEntityType] = useState('');
  const [source, setSource] = useState<'ALL' | 'UI' | 'ASSISTANT' | 'SYSTEM'>('ALL');
  const projectId = focus?.type === 'project' ? focus.id : undefined;
  const q = useActivity({
    entityType: entityType || undefined,
    source: source === 'ALL' ? undefined : source,
    projectId,
  });
  const auditor = permissions.includes('audit:read');
  const areas = AREAS.filter(
    (a) => auditor || !a.anyOf || a.anyOf.some((p) => permissions.includes(p)),
  );
  // A stage, client or person focus narrows the loaded pages; a project focus is asked of the API.
  const narrowed = !!focus && focus.type !== 'project';
  const items = (q.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (a) => !narrowed || matchesProjectId(a.projectId),
  );
  const loadOlder = q.hasNextPage ? (
    <Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
      Load older activity
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="w-auto"
          aria-label="Filter by area"
        >
          {areas.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
        <Segmented
          label="Source"
          value={source}
          onChange={setSource}
          options={[
            { value: 'ALL', label: 'All sources' },
            { value: 'UI', label: 'People' },
            { value: 'ASSISTANT', label: 'NOVA' },
            { value: 'SYSTEM', label: 'System' },
          ]}
        />
      </div>
      <Panel eyebrow="Append-only audit trail" title="Activity">
        <PanelState
          query={q}
          isEmpty={items.length === 0 && !q.hasNextPage}
          empty={{ title: 'Nothing recorded.', body: 'No activity matches these filters.' }}
        >
          {items.length > 0 ? (
            <ol>
              {items.map((a) => (
                <ActivityItem key={a.id} activity={a} />
              ))}
            </ol>
          ) : (
            // The focus filters what has been loaded so far; older pages may still match.
            <p className="py-6 text-center text-sm text-text-3">
              Nothing in the most recent activity matches {focus?.label ?? 'this focus'}.
            </p>
          )}
          {loadOlder ? <div className="pt-3">{loadOlder}</div> : null}
        </PanelState>
      </Panel>
    </div>
  );
}
