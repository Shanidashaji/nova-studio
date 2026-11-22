import { z } from 'zod';

export const LoginRequest = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required').max(256),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/**
 * Permission vocabulary checked by the API's PermissionsGuard (ADR-0009). Permissions are code;
 * which role holds which permission is data, editable in Settings.
 */
export const PERMISSIONS = [
  // Workspace & production
  'workspace:read',
  'project:write',
  'workflow:transition',
  'workflow:manage',
  'task:write',
  'approval:decide',
  'schedule:write',
  'studio:write',
  'asset:write',
  // CRM
  'client:write',
  'sales:write',
  // Finance
  'finance:read',
  'finance:write',
  'invoice:write',
  'expense:submit',
  'expense:approve',
  'vendor:write',
  // Procurement & inventory
  'procurement:request',
  'procurement:approve',
  'procurement:order',
  'inventory:write',
  // People
  'hr:read',
  'hr:write',
  'leave:approve',
  'attendance:write',
  // Documents
  'document:read',
  'document:write',
  'document:confidential',
  // AI
  'assistant:use',
  // Administration
  'user:manage',
  'role:manage',
  'audit:read',
] as const;
export const Permission = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof Permission>;

/** Human labels and groups for the permission matrix in Settings. */
export const PERMISSION_GROUPS: { group: string; items: { key: Permission; label: string }[] }[] = [
  {
    group: 'Production',
    items: [
      { key: 'workspace:read', label: 'View the workspace' },
      { key: 'project:write', label: 'Create and edit projects' },
      { key: 'workflow:transition', label: 'Move projects between stages' },
      { key: 'workflow:manage', label: 'Edit workflow templates' },
      { key: 'task:write', label: 'Create and edit tasks' },
      { key: 'approval:decide', label: 'Record deliverable and stage approvals' },
      { key: 'schedule:write', label: 'Schedule shoots and crew' },
      { key: 'studio:write', label: 'Book studios' },
      { key: 'asset:write', label: 'Manage equipment' },
    ],
  },
  {
    group: 'Clients & sales',
    items: [
      { key: 'client:write', label: 'Manage clients and contacts' },
      { key: 'sales:write', label: 'Manage leads and conversions' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { key: 'finance:read', label: 'View financial figures' },
      { key: 'finance:write', label: 'Record payments and ledger entries' },
      { key: 'invoice:write', label: 'Create and send invoices' },
      { key: 'expense:submit', label: 'Submit expenses' },
      { key: 'expense:approve', label: 'Approve expenses' },
      { key: 'vendor:write', label: 'Manage vendors' },
    ],
  },
  {
    group: 'Procurement & inventory',
    items: [
      { key: 'procurement:request', label: 'Raise purchase requests' },
      { key: 'procurement:approve', label: 'Approve purchase requests' },
      { key: 'procurement:order', label: 'Issue and receive purchase orders' },
      { key: 'inventory:write', label: 'Adjust stock' },
    ],
  },
  {
    group: 'People',
    items: [
      { key: 'hr:read', label: 'View restricted employee records' },
      { key: 'hr:write', label: 'Edit employee records and departments' },
      { key: 'leave:approve', label: 'Approve leave' },
      { key: 'attendance:write', label: 'Record attendance for others' },
    ],
  },
  {
    group: 'Documents',
    items: [
      { key: 'document:read', label: 'View documents' },
      { key: 'document:write', label: 'Upload documents' },
      { key: 'document:confidential', label: 'Access confidential documents' },
    ],
  },
  {
    group: 'AI & administration',
    items: [
      { key: 'assistant:use', label: 'Use NOVA AI' },
      { key: 'user:manage', label: 'Manage users' },
      { key: 'role:manage', label: 'Manage roles and approval rules' },
      { key: 'audit:read', label: 'View the audit trail' },
    ],
  },
];

/** Role keys are data (ADR-0009); these are the roles the seed creates. */
export const RoleKey = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use capitals, digits and underscores (e.g. COLORIST)');
export type RoleKey = string;

/** The one role whose permissions cannot be edited and which cannot be deleted. */
export const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

const all = PERMISSIONS;
const except = (...omit: Permission[]) => all.filter((p) => !omit.includes(p));

export interface SeedRole {
  key: RoleKey;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

/** Initial roles written by the seed. After seeding, roles are edited in Settings. */
export const SEED_ROLES: readonly SeedRole[] = [
  {
    key: SUPER_ADMIN_ROLE,
    name: 'Super Admin',
    description: 'Every permission. System role: cannot be edited or deleted.',
    permissions: all,
  },
  {
    key: 'ADMIN',
    name: 'Admin',
    description: 'Runs the workspace and its users; cannot change roles.',
    permissions: except('role:manage'),
  },
  {
    key: 'PRODUCTION_MANAGER',
    name: 'Production Manager',
    description: 'Owns the production pipeline, schedules, equipment and production spend.',
    permissions: [
      'workspace:read',
      'project:write',
      'workflow:transition',
      'workflow:manage',
      'task:write',
      'approval:decide',
      'schedule:write',
      'studio:write',
      'asset:write',
      'client:write',
      'sales:write',
      'finance:read',
      'expense:submit',
      'expense:approve',
      'vendor:write',
      'procurement:request',
      'procurement:approve',
      'inventory:write',
      'leave:approve',
      'document:read',
      'document:write',
      'assistant:use',
      'audit:read',
    ],
  },
  {
    key: 'PROJECT_MANAGER',
    name: 'Project Manager',
    description: 'Runs individual projects: tasks, schedules, clients and documents.',
    permissions: [
      'workspace:read',
      'project:write',
      'workflow:transition',
      'task:write',
      'approval:decide',
      'schedule:write',
      'studio:write',
      'client:write',
      'sales:write',
      'expense:submit',
      'procurement:request',
      'document:read',
      'document:write',
      'assistant:use',
    ],
  },
  {
    key: 'FINANCE',
    name: 'Finance',
    description: 'Invoices, payments, expense approval, vendors and purchase orders.',
    permissions: [
      'workspace:read',
      'finance:read',
      'finance:write',
      'invoice:write',
      'expense:submit',
      'expense:approve',
      'vendor:write',
      'procurement:approve',
      'procurement:order',
      'document:read',
      'document:write',
      'document:confidential',
      'assistant:use',
      'audit:read',
    ],
  },
  {
    key: 'HR',
    name: 'HR',
    description: 'Employee records, departments, attendance and leave.',
    permissions: [
      'workspace:read',
      'hr:read',
      'hr:write',
      'leave:approve',
      'attendance:write',
      'expense:submit',
      'document:read',
      'document:write',
      'document:confidential',
      'assistant:use',
    ],
  },
  {
    key: 'CREATIVE',
    name: 'Creative Team',
    description: 'Directors, DOPs, editors and designers: tasks, stage moves, requests.',
    permissions: [
      'workspace:read',
      'workflow:transition',
      'task:write',
      'expense:submit',
      'procurement:request',
      'document:read',
      'document:write',
      'assistant:use',
    ],
  },
  {
    key: 'EMPLOYEE',
    name: 'Employee',
    description: 'Basic access: view work, submit expenses and requests.',
    permissions: ['workspace:read', 'expense:submit', 'procurement:request', 'document:read'],
  },
  {
    key: 'VIEWER',
    name: 'Guest (read-only)',
    description: 'Read-only access for demonstrations and reviewers.',
    permissions: ['workspace:read', 'finance:read', 'document:read'],
  },
];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: { key: RoleKey; name: string };
  permissions: Permission[];
}
