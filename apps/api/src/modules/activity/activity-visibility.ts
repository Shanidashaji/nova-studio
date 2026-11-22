import type { Permission } from '@nova/shared';

/**
 * Who may read an audit row, by the kind of record it describes. A row's summary repeats facts
 * from that record (amounts, names, leave dates), so it is as sensitive as the record itself:
 * the audit trail, the live event stream and the assistant all apply this one rule.
 *
 * A user sees a row when they hold `audit:read` or any permission listed for its entity type.
 * Entity types that are not listed are visible to everyone who can open the workspace.
 */
const RESTRICTED: Readonly<Record<string, readonly Permission[]>> = {
  // Security records.
  auth: [],
  user: [],
  role: [],
  // Finance.
  finance: ['finance:read'],
  invoice: ['finance:read'],
  expense: ['finance:read'],
  vendor: ['finance:read', 'vendor:write'],
  purchase_request: [
    'procurement:request',
    'procurement:approve',
    'procurement:order',
    'finance:read',
  ],
  purchase_order: [
    'procurement:request',
    'procurement:approve',
    'procurement:order',
    'finance:read',
  ],
  // Approval requests carry the title of what is being approved (expense, purchase, leave).
  approval_request: ['expense:approve', 'procurement:approve', 'leave:approve', 'finance:read'],
  // People.
  employee: ['hr:read'],
  leave: ['hr:read', 'leave:approve'],
  attendance: ['hr:read', 'attendance:write'],
  // Documents: titles of confidential documents appear in the summary.
  document: ['document:confidential'],
};

/** Entity types whose audit rows this user must not see. */
export function hiddenEntityTypes(permissions: readonly Permission[]): string[] {
  if (permissions.includes('audit:read')) return [];
  return Object.entries(RESTRICTED)
    .filter(([, anyOf]) => !anyOf.some((p) => permissions.includes(p)))
    .map(([type]) => type);
}

export function canSeeActivity(permissions: readonly Permission[], entityType: string): boolean {
  if (permissions.includes('audit:read')) return true;
  const anyOf = RESTRICTED[entityType];
  return !anyOf || anyOf.some((p) => permissions.includes(p));
}
