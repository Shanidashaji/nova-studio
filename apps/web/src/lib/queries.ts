/**
 * Server-state hooks (TanStack Query). One hook per API resource; every view reads through these.
 * Live updates arrive over SSE and invalidate active queries (see lib/live-events.ts).
 */
'use client';

import { useInfiniteQuery, useQuery, type QueryKey } from '@tanstack/react-query';
import type {
  ApprovalInboxView,
  ApprovalRuleView,
  DepartmentView,
  DocumentView,
  EmployeeView,
  ExpenseView,
  FinanceOverview,
  InvoiceDetail,
  InvoiceSummary,
  LeaveView,
  NotificationPreferenceView,
  PurchaseOrderSummary,
  PurchaseRequestView,
  RoleView,
  SessionView,
  StockItemView,
  StudioView,
  UserView,
  VendorView,
  ActivityView,
  AssetView,
  AssistantHistoryItem,
  ClientDetail,
  ClientView,
  FinanceSummary,
  LeadView,
  MemberDetail,
  MemberView,
  NotificationView,
  Page,
  ProjectDetail,
  ProjectListQuery,
  ProjectSummary,
  PulseView,
  ScheduleView,
  SearchResult,
  ShootView,
  TaskView,
  WorkflowTemplateView,
} from '@nova/shared';
import { api, qs } from './api';

export const keys = {
  pulse: ['pulse'] as const,
  projects: (q: Partial<ProjectListQuery>) => ['projects', q] as const,
  project: (id: string) => ['project', id] as const,
  task: (id: string) => ['task', id] as const,
  schedule: (from?: string, to?: string) => ['schedule', from, to] as const,
  shoot: (id: string) => ['shoot', id] as const,
  assets: ['assets'] as const,
  team: ['team'] as const,
  member: (id: string) => ['member', id] as const,
  clients: ['clients'] as const,
  client: (id: string) => ['client', id] as const,
  leads: ['leads'] as const,
  finance: ['finance'] as const,
  workflows: ['workflows'] as const,
  activity: (f: Record<string, string | undefined>) => ['activity', f] as const,
  notifications: ['notifications'] as const,
  search: (q: string) => ['search', q] as const,
  assistant: ['assistant', 'history'] as const,
  assistantStatus: ['assistant', 'status'] as const,
} satisfies Record<string, QueryKey | ((...args: never[]) => QueryKey)>;

const enabledId = (id: string | null | undefined) => typeof id === 'string' && id.length > 0;

export const usePulse = () =>
  useQuery({ queryKey: keys.pulse, queryFn: () => api<PulseView>('/workspace/pulse') });

export const useProjects = (q: Partial<ProjectListQuery> = {}) =>
  useQuery({
    queryKey: keys.projects(q),
    queryFn: () => api<ProjectSummary[]>(`/projects${qs(q)}`),
  });

export const useProject = (id: string | null) =>
  useQuery({
    queryKey: keys.project(id ?? ''),
    queryFn: () => api<ProjectDetail>(`/projects/${id}`),
    enabled: enabledId(id),
  });

export const useTask = (id: string | null) =>
  useQuery({
    queryKey: keys.task(id ?? ''),
    queryFn: () => api<TaskView>(`/tasks/${id}`),
    enabled: enabledId(id),
  });

export const useSchedule = (from?: string, to?: string) =>
  useQuery({
    queryKey: keys.schedule(from, to),
    queryFn: () => api<ScheduleView>(`/schedule${qs({ from, to })}`),
  });

export const useShoot = (id: string | null) =>
  useQuery({
    queryKey: keys.shoot(id ?? ''),
    queryFn: () => api<ShootView>(`/shoots/${id}`),
    enabled: enabledId(id),
  });

export const useAssets = () =>
  useQuery({ queryKey: keys.assets, queryFn: () => api<AssetView[]>('/assets') });

export const useTeam = () =>
  useQuery({ queryKey: keys.team, queryFn: () => api<MemberView[]>('/team') });

export const useMember = (id: string | null) =>
  useQuery({
    queryKey: keys.member(id ?? ''),
    queryFn: () => api<MemberDetail>(`/team/${id}`),
    enabled: enabledId(id),
  });

export const useClients = () =>
  useQuery({ queryKey: keys.clients, queryFn: () => api<ClientView[]>('/clients') });

export const useClient = (id: string | null) =>
  useQuery({
    queryKey: keys.client(id ?? ''),
    queryFn: () => api<ClientDetail>(`/clients/${id}`),
    enabled: enabledId(id),
  });

export const useLeads = () =>
  useQuery({ queryKey: keys.leads, queryFn: () => api<LeadView[]>('/leads') });

export const useFinance = (enabled = true) =>
  useQuery({
    queryKey: keys.finance,
    queryFn: () => api<FinanceSummary>('/finance/summary'),
    enabled,
  });

export const useWorkflows = () =>
  useQuery({ queryKey: keys.workflows, queryFn: () => api<WorkflowTemplateView[]>('/workflows') });

export const useNotifications = () =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<{ items: NotificationView[]; unread: number }>('/notifications'),
  });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: keys.search(q),
    queryFn: ({ signal }) => api<SearchResult[]>(`/search${qs({ q })}`, { signal }),
    enabled: q.trim().length > 0,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });

export const useActivity = (
  filters: { projectId?: string; entityType?: string; entityId?: string; source?: string } = {},
) =>
  useInfiniteQuery({
    queryKey: keys.activity(filters),
    queryFn: ({ pageParam }) =>
      api<Page<ActivityView>>(`/activity${qs({ ...filters, cursor: pageParam, limit: 30 })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useAssistantHistory = (enabled = true) =>
  // Loaded once; the panel appends this session's turns locally.
  useQuery({
    queryKey: keys.assistant,
    queryFn: () => api<AssistantHistoryItem[]>('/assistant/history'),
    staleTime: Infinity,
    enabled,
  });

export const useAssistantStatus = () =>
  useQuery({
    queryKey: keys.assistantStatus,
    queryFn: () => api<{ provider: 'demo' | 'claude'; model: string | null }>('/assistant/status'),
    staleTime: Infinity,
  });

// ── ERP expansion ─────────────────────────────────────────────────────────────

export const erpKeys = {
  approvals: (q: Record<string, string | undefined>) => ['approvals', q] as const,
  finance: ['finance', 'overview'] as const,
  invoices: (q: Record<string, string | undefined>) => ['invoices', q] as const,
  expenses: (q: Record<string, string | undefined>) => ['expenses', q] as const,
  vendors: ['vendors'] as const,
  purchaseRequests: ['purchase-requests'] as const,
  purchaseOrders: ['purchase-orders'] as const,
  stock: ['stock'] as const,
  documents: (q: Record<string, string | undefined>) => ['documents', q] as const,
  adminUsers: ['admin', 'users'] as const,
  adminRoles: ['admin', 'roles'] as const,
  adminRules: ['admin', 'rules'] as const,
  mySessions: ['me', 'sessions'] as const,
  preferences: ['me', 'preferences'] as const,
  employees: ['hr', 'employees'] as const,
  leave: ['hr', 'leave'] as const,
  studios: ['studios'] as const,
  departments: ['hr', 'departments'] as const,
};

export const useApprovals = (q: { scope?: string; subject?: string } = {}) =>
  useQuery({
    queryKey: erpKeys.approvals(q),
    queryFn: () => api<ApprovalInboxView>(`/approval-requests${qs(q)}`),
  });

export const useFinanceOverview = (enabled = true) =>
  useQuery({
    queryKey: erpKeys.finance,
    queryFn: () => api<FinanceOverview>('/finance/overview'),
    enabled,
  });

export const useInvoices = (q: Record<string, string | undefined> = {}, enabled = true) =>
  useQuery({
    queryKey: erpKeys.invoices(q),
    queryFn: () => api<InvoiceSummary[]>(`/invoices${qs(q)}`),
    enabled,
  });

export const useInvoice = (id: string | null) =>
  useQuery({
    queryKey: ['invoice', id ?? ''],
    queryFn: () => api<InvoiceDetail>(`/invoices/${id}`),
    enabled: enabledId(id),
  });

export const useExpenses = (q: Record<string, string | undefined> = {}) =>
  useQuery({
    queryKey: erpKeys.expenses(q),
    queryFn: () => api<ExpenseView[]>(`/expenses${qs(q)}`),
  });

export const useVendors = () =>
  useQuery({ queryKey: erpKeys.vendors, queryFn: () => api<VendorView[]>('/vendors') });

export const usePurchaseRequests = () =>
  useQuery({
    queryKey: erpKeys.purchaseRequests,
    queryFn: () => api<PurchaseRequestView[]>('/purchase-requests'),
  });

export const usePurchaseOrders = () =>
  useQuery({
    queryKey: erpKeys.purchaseOrders,
    queryFn: () => api<PurchaseOrderSummary[]>('/purchase-orders'),
  });

export const useStock = () =>
  useQuery({ queryKey: erpKeys.stock, queryFn: () => api<StockItemView[]>('/stock') });

export const useDocuments = (q: Record<string, string | undefined> = {}) =>
  useQuery({
    queryKey: erpKeys.documents(q),
    queryFn: () => api<DocumentView[]>(`/documents${qs(q)}`),
  });

export const useAdminUsers = (enabled = true) =>
  useQuery({
    queryKey: erpKeys.adminUsers,
    queryFn: () => api<UserView[]>('/admin/users'),
    enabled,
  });

export const useAdminRoles = (enabled = true) =>
  useQuery({
    queryKey: erpKeys.adminRoles,
    queryFn: () => api<RoleView[]>('/admin/roles'),
    enabled,
  });

export const useApprovalRules = (enabled = true) =>
  useQuery({
    queryKey: erpKeys.adminRules,
    queryFn: () => api<ApprovalRuleView[]>('/admin/approval-rules'),
    enabled,
  });

export const useMySessions = () =>
  useQuery({ queryKey: erpKeys.mySessions, queryFn: () => api<SessionView[]>('/me/sessions') });

export const usePreferences = () =>
  useQuery({
    queryKey: erpKeys.preferences,
    queryFn: () => api<NotificationPreferenceView[]>('/me/notification-preferences'),
  });

export const useEmployees = () =>
  useQuery({ queryKey: erpKeys.employees, queryFn: () => api<EmployeeView[]>('/hr/employees') });

export const useLeave = () =>
  useQuery({ queryKey: erpKeys.leave, queryFn: () => api<LeaveView[]>('/hr/leave') });

export const useStudios = () =>
  useQuery({ queryKey: erpKeys.studios, queryFn: () => api<StudioView[]>('/studios') });

export const useDepartments = () =>
  useQuery({
    queryKey: erpKeys.departments,
    queryFn: () => api<DepartmentView[]>('/hr/departments'),
  });
