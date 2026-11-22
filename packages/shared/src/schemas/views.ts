/**
 * Response shapes returned by the API ("views"). Dates are ISO strings on the wire.
 */
import type {
  ApprovalKind,
  ApprovalStatus,
  AssetCategory,
  AssetStatus,
  AssistantActionStatus,
  ClientStatus,
  DeliverableStatus,
  FeedbackStatus,
  FinanceCategory,
  FinanceKind,
  InteractionType,
  LeadSource,
  LeadStage,
  Priority,
  ProjectStatus,
  ProjectType,
  ShootStatus,
  StageKey,
  StageStatus,
  StudioLocation,
  TaskStatus,
  TransitionDirection,
} from '../constants/enums';
import type { HealthBand, HealthDeduction } from '../domain/health';
import type { UtilisationBand } from '../domain/schedule';
import type { TransitionBlocker } from '../domain/workflow';

type ISO = string;

export interface MemberRef {
  id: string;
  name: string;
  title: string;
  avatarUrl: string | null;
}

export interface ClientRef {
  id: string;
  name: string;
  accentColor: string | null;
}

export interface HealthView {
  score: number;
  band: HealthBand;
  deductions: HealthDeduction[];
}

// ── Pulse ─────────────────────────────────────────────────────────────────────

export interface StageMetric {
  key: StageKey;
  label: string;
  wip: number;
  blocked: number;
  atRisk: number;
  /** Average days projects spent in this stage over completed visits. */
  avgDwellDays: number | null;
  /** Stage exits per week over the last four weeks. */
  throughputPerWeek: number;
  expectedDays: number;
  isConstraint: boolean;
  projects: { id: string; code: string; title: string; band: HealthBand }[];
}

export type AttentionKind =
  | 'OVERDUE_PROJECT'
  | 'APPROVAL_WAITING'
  | 'CHANGES_REQUESTED'
  | 'BLOCKED_TASK'
  | 'OVERDUE_TASK'
  | 'BOOKING_CONFLICT'
  | 'CREW_OVERLOAD'
  | 'BUDGET_BURN'
  | 'STAGE_READY';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: 'critical' | 'warning' | 'info';
  score: number;
  title: string;
  /** Why NOVA surfaced this item — the rule and its numbers. */
  reason: string;
  entity: { type: 'project' | 'task' | 'deliverable' | 'asset' | 'member' | 'shoot'; id: string };
  project: { id: string; code: string; title: string } | null;
  action: { label: string; kind: 'open' | 'advance' | 'decide' | 'resolve-conflict' } | null;
}

export interface UpcomingItem {
  id: string;
  kind: 'shoot' | 'deadline' | 'delivery';
  title: string;
  at: ISO;
  endsAt?: ISO;
  project: { id: string; code: string; title: string };
  location?: string;
}

export interface PulseView {
  generatedAt: ISO;
  spine: StageMetric[];
  attention: AttentionItem[];
  upcoming: UpcomingItem[];
  totals: {
    activeProjects: number;
    atRisk: number;
    critical: number;
    pendingApprovals: number;
    blockedTasks: number;
    shootsThisWeek: number;
    onTimeRate: number;
  };
  pipelineValue: { open: number; weighted: number };
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  code: string;
  title: string;
  logline: string | null;
  type: ProjectType;
  status: ProjectStatus;
  priority: Priority;
  location: StudioLocation;
  coverImageUrl: string | null;
  client: ClientRef;
  stage: { id: string; key: StageKey; label: string; status: StageStatus } | null;
  startDate: ISO;
  dueDate: ISO;
  deliveredAt: ISO | null;
  progress: number;
  health: HealthView;
  budget: number;
  spent: number;
  team: MemberRef[];
  openTasks: number;
  blockedTasks: number;
  pendingApprovals: number;
  nextShoot: { id: string; title: string; startsAt: ISO } | null;
  aiAssisted: boolean;
}

export interface TaskView {
  id: string;
  projectId: string;
  projectStageId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: ISO | null;
  estimateHours: number | null;
  isStageBlocking: boolean;
  blockedReason: string | null;
  completedAt: ISO | null;
  assignee: MemberRef | null;
  dependsOn: string[];
  /** Parent task when this is a subtask. */
  parentId: string | null;
  updatedAt: ISO;
}

export interface FeedbackView {
  id: string;
  timecode: string | null;
  body: string;
  author: string;
  status: FeedbackStatus;
  createdAt: ISO;
}

export interface DeliverableView {
  id: string;
  name: string;
  format: string;
  aspectRatio: string;
  durationSec: number | null;
  status: DeliverableStatus;
  currentVersion: number;
  dueDate: ISO | null;
  previewImageUrl: string | null;
  rounds: {
    id: string;
    number: number;
    sentAt: ISO;
    closedAt: ISO | null;
    includedInScope: boolean;
    feedback: FeedbackView[];
  }[];
  approvals: ApprovalView[];
}

export interface ApprovalView {
  id: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  title: string;
  requestedAt: ISO;
  decidedAt: ISO | null;
  decidedBy: string | null;
  note: string | null;
  deliverableId: string | null;
  projectStageId: string | null;
}

export interface ProjectStageView {
  id: string;
  key: StageKey;
  label: string;
  order: number;
  status: StageStatus;
  expectedDays: number;
  requiresApproval: boolean;
  skippable: boolean;
  approved: boolean;
  exitCriteria: string[];
  owner: MemberRef | null;
  startedAt: ISO | null;
  completedAt: ISO | null;
}

export interface TransitionView {
  id: string;
  from: string | null;
  to: string | null;
  direction: TransitionDirection;
  reason: string | null;
  actor: string | null;
  source: string;
  createdAt: ISO;
}

export interface ShootView {
  id: string;
  projectId: string;
  project: { id: string; code: string; title: string; coverImageUrl: string | null };
  title: string;
  location: string;
  city: StudioLocation;
  startsAt: ISO;
  endsAt: ISO;
  callTime: string | null;
  status: ShootStatus;
  notes: string | null;
  crew: { id: string; role: string; member: MemberRef }[];
  bookings: { id: string; asset: { id: string; name: string; category: AssetCategory } }[];
  conflicts: { bookingId: string | null; crewCallId: string | null; with: string }[];
}

export interface ProjectDetail extends ProjectSummary {
  workflow: { id: string; name: string };
  includedRevisions: number;
  stages: ProjectStageView[];
  tasks: TaskView[];
  deliverables: DeliverableView[];
  approvals: ApprovalView[];
  shoots: ShootView[];
  members: (MemberRef & { role: string })[];
  transitions: TransitionView[];
  finance: {
    income: number;
    expenses: number;
    byCategory: { category: FinanceCategory; amount: number }[];
  };
  /** Pre-computed so the UI can explain why "Advance" is unavailable. */
  advance:
    | { ok: true; to: { id: string; label: string } | null }
    | { ok: false; blockers: TransitionBlocker[] };
  projection: { projectedDelivery: ISO; daysLate: number };
}

// ── Schedule & resources ──────────────────────────────────────────────────────

export interface AssetView {
  id: string;
  name: string;
  category: AssetCategory;
  serialTag: string;
  homeLocation: StudioLocation;
  status: AssetStatus;
  dailyRate: number;
  notes: string | null;
  bookings: {
    id: string;
    startsAt: ISO;
    endsAt: ISO;
    shoot: { id: string; title: string } | null;
    project: { id: string; code: string; title: string } | null;
    conflict: boolean;
  }[];
}

export interface ScheduleView {
  from: ISO;
  to: ISO;
  shoots: ShootView[];
  assets: AssetView[];
  conflicts: {
    resourceType: 'asset' | 'member';
    resourceId: string;
    resourceName: string;
    bookingIds: [string, string];
    at: ISO;
  }[];
}

// ── People ────────────────────────────────────────────────────────────────────

export interface WorkloadWeek {
  weekStart: ISO;
  hours: number;
  capacity: number;
  ratio: number;
  band: UtilisationBand;
}

export interface MemberView extends MemberRef {
  email: string | null;
  skills: string[];
  baseLocation: StudioLocation;
  weeklyCapacityHours: number;
  openTasks: number;
  overdueTasks: number;
  projects: { id: string; code: string; title: string; role: string }[];
  weeks: WorkloadWeek[];
  upcomingShoots: { id: string; title: string; startsAt: ISO; role: string }[];
}

export interface MemberDetail extends MemberView {
  tasks: (TaskView & { project: { id: string; code: string; title: string } })[];
}

// ── Clients & sales ───────────────────────────────────────────────────────────

export interface ClientView extends ClientRef {
  industry: string;
  city: string;
  status: ClientStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  activeProjects: number;
  lifetimeValue: number;
  pendingApprovals: number;
  lastInteractionAt: ISO | null;
}

export interface InteractionView {
  id: string;
  type: InteractionType;
  summary: string;
  occurredAt: ISO;
  project: { id: string; code: string; title: string } | null;
  loggedBy: string | null;
}

export interface ClientDetail extends ClientView {
  notes: string | null;
  projects: ProjectSummary[];
  interactions: InteractionView[];
  leads: LeadView[];
}

export interface LeadView {
  id: string;
  title: string;
  client: ClientRef | null;
  prospectName: string | null;
  projectType: ProjectType;
  estimatedValue: number;
  stage: LeadStage;
  source: LeadSource;
  expectedCloseDate: ISO | null;
  notes: string | null;
  convertedProject: { id: string; code: string; title: string } | null;
  updatedAt: ISO;
}

// ── Finance (demo) ────────────────────────────────────────────────────────────

export interface FinanceSummary {
  isDemo: true;
  months: { month: string; income: number; expenses: number }[];
  totals: { income: number; expenses: number; margin: number };
  byCategory: { category: FinanceCategory; kind: FinanceKind; amount: number }[];
  projects: {
    id: string;
    code: string;
    title: string;
    client: ClientRef;
    budget: number;
    spent: number;
    invoiced: number;
    progress: number;
    burnVsProgress: number;
  }[];
}

// ── Workflow templates ────────────────────────────────────────────────────────

export interface WorkflowTemplateView {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  projectCount: number;
  stages: {
    id: string;
    key: StageKey;
    label: string;
    order: number;
    expectedDays: number;
    requiresApproval: boolean;
    skippable: boolean;
    exitCriteria: string[];
  }[];
}

// ── Activity, notifications, search ───────────────────────────────────────────

export interface ActivityView {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  summary: string;
  source: 'UI' | 'ASSISTANT' | 'SYSTEM';
  actor: { id: string; name: string } | null;
  createdAt: ISO;
}

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: ISO | null;
  createdAt: ISO;
}

export interface SearchResult {
  type: 'project' | 'task' | 'client' | 'member' | 'asset' | 'shoot' | 'lead';
  id: string;
  title: string;
  subtitle: string;
  /** For results that open inside a project (tasks). */
  projectId?: string;
}

// ── Assistant ─────────────────────────────────────────────────────────────────

export interface AssistantReference {
  type: SearchResult['type'];
  id: string;
  label: string;
}

export interface AssistantProposal {
  id: string;
  kind: string;
  title: string;
  /** Human-readable change list shown before confirmation. */
  changes: { field: string; from: string | null; to: string }[];
  status: AssistantActionStatus;
  error: string | null;
  resultEntity: AssistantReference | null;
}

/** The language a message was written in (BCP-47), and how NOVA knows it. */
export interface AssistantLanguage {
  code: string;
  /** `model`: declared by the AI provider; `detected`: inferred from the text's script/words. */
  source: 'model' | 'detected';
}

export interface AssistantReply {
  id: string;
  provider: 'demo' | 'claude';
  content: string;
  language: AssistantLanguage | null;
  /** Language detected in the user's message, when NOVA could tell. */
  userLanguage: AssistantLanguage | null;
  references: AssistantReference[];
  proposals: AssistantProposal[];
  suggestions: string[];
  createdAt: ISO;
}

export interface AssistantHistoryItem {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  language: AssistantLanguage | null;
  references: AssistantReference[];
  proposals: AssistantProposal[];
  createdAt: ISO;
}
