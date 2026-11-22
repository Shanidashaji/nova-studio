/** Response shapes of the production-studio layer. Dates are ISO strings on the wire. */
import type {
  FinanceCategory,
  ShootStatus,
  StageKey,
  StudioLocation,
  TaskStatus,
} from '../constants/enums';
import type {
  AutomationMode,
  BreakdownSource,
  BudgetGroup,
  CreativeKind,
  FootageStatus,
  InternalReviewStatus,
  MessageChannel,
  MessageStatus,
  MessageTrigger,
  SceneSetting,
  SceneStatus,
  SceneTime,
  ScriptStatus,
  ShootLogKind,
  TalentBookingStatus,
  TalentKind,
} from '../constants/studio-enums';
import type { ReadinessItem, RecommendationReason } from '../domain/studio';
import type { MemberRef, ShootView, TaskView } from './views';

type ISO = string;
type ProjectRef = { id: string; code: string; title: string };

// ── Talent ────────────────────────────────────────────────────────────────────

export interface TalentView {
  id: string;
  name: string;
  kind: TalentKind;
  email: string | null;
  phone: string | null;
  agency: string | null;
  skills: string[];
  languages: string[];
  playingAgeMin: number | null;
  playingAgeMax: number | null;
  experienceYears: number;
  baseCity: string;
  willTravel: boolean;
  dayRate: number;
  portfolioUrl: string | null;
  notes: string | null;
  isActive: boolean;
  unavailable: { id: string; from: ISO; to: ISO; reason: string | null }[];
  /** Upcoming confirmed or held bookings. */
  upcoming: number;
  /** Completed bookings (shoot wrapped). */
  completed: number;
  /** Booked during the window asked for (when the list was filtered by dates). */
  busyInWindow?: boolean;
}

export interface TalentBookingView {
  id: string;
  character: string;
  status: TalentBookingStatus;
  fee: number | null;
  note: string | null;
  talent: { id: string; name: string; kind: TalentKind; phone: string | null };
  shoot: {
    id: string;
    title: string;
    startsAt: ISO;
    endsAt: ISO;
    status: ShootStatus;
    location: string;
  };
  project: ProjectRef & { clientName: string };
}

export interface TalentDetail extends TalentView {
  bookings: TalentBookingView[];
  projects: (ProjectRef & { clientName: string; characters: string[] })[];
}

// ── Recommendations ───────────────────────────────────────────────────────────

export interface Recommendation {
  id: string;
  name: string;
  subtitle: string;
  score: number;
  available: boolean;
  reasons: RecommendationReason[];
  blockers: string[];
  /** Day rate (artists) — withheld from roles that may not see costs. */
  dayRate?: number | null;
}

export interface RecommendationResult {
  method: 'RULE_BASED';
  explanation: string;
  need: { role: string; description: string | null; city: string; window: { from: ISO; to: ISO } };
  candidates: Recommendation[];
}

export interface CastingNeed {
  character: string;
  scenes: string[];
  booked: { bookingId: string; talentId: string; name: string; status: TalentBookingStatus }[];
}

// ── Creative documents and scenes ─────────────────────────────────────────────

export interface ScriptSummary {
  id: string;
  kind: CreativeKind;
  title: string;
  status: ScriptStatus;
  currentVersion: number;
  project: ProjectRef & { clientName: string };
  sceneCount: number;
  submittedAt: ISO | null;
  decidedAt: ISO | null;
  decidedBy: string | null;
  /** Days the script has been waiting in review (null when not in review). */
  waitingDays: number | null;
  updatedAt: ISO;
  createdBy: string;
}

export interface ScriptVersionView {
  id: string;
  number: number;
  changeNote: string | null;
  fileName: string | null;
  author: string;
  createdAt: ISO;
  words: number;
}

export interface ScriptDetail extends ScriptSummary {
  clientInstructions: string | null;
  notes: string | null;
  decisionNote: string | null;
  body: string;
  versions: ScriptVersionView[];
  scenes: SceneView[];
}

export interface SceneView {
  id: string;
  projectId: string;
  scriptId: string | null;
  number: string;
  sortOrder: number;
  heading: string;
  description: string | null;
  setting: SceneSetting;
  timeOfDay: SceneTime;
  location: string | null;
  characters: string[];
  props: string[];
  wardrobe: string[];
  equipment: string[];
  requirements: string | null;
  estimatedMinutes: number;
  shoot: { id: string; title: string; startsAt: ISO } | null;
  shootDate: ISO | null;
  plannedStart: string | null;
  status: SceneStatus;
  notes: string | null;
  source: BreakdownSource;
  completedAt: ISO | null;
}

// ── Shoot day ─────────────────────────────────────────────────────────────────

export interface ShootLogView {
  id: string;
  kind: ShootLogKind;
  body: string;
  minutesLost: number;
  author: string;
  resolvedAt: ISO | null;
  createdAt: ISO;
}

export interface ShootWorkspaceView {
  shoot: ShootView;
  client: { id: string; name: string; contactName: string | null; contactPhone: string | null };
  productionManager: MemberRef | null;
  crewCallTime: string | null;
  callSheetNotes: string | null;
  callSheetPublishedAt: ISO | null;
  footageStatus: FootageStatus;
  wrapNotes: string | null;
  startedAt: ISO | null;
  wrappedAt: ISO | null;
  days: { key: string; day: number; of: number }[];
  talent: TalentBookingView[];
  scenes: SceneView[];
  checklist: {
    id: string;
    label: string;
    done: boolean;
    doneAt: ISO | null;
    doneBy: string | null;
  }[];
  log: ShootLogView[];
  readiness: { items: ReadinessItem[]; canConfirm: boolean; canStart: boolean; score: number };
  progress: {
    total: number;
    shot: number;
    dropped: number;
    minutesPlanned: number;
    minutesShot: number;
  };
  delayMinutes: number;
  openIssues: number;
}

export interface ShootDaySummary {
  id: string;
  title: string;
  status: ShootStatus;
  project: ProjectRef;
  location: string;
  city: StudioLocation;
  startsAt: ISO;
  endsAt: ISO;
  callTime: string | null;
  crewCallTime: string | null;
  day: { day: number; of: number };
  crew: number;
  talent: number;
  scenesToday: number;
  scenesShot: number;
  openIssues: number;
  delayMinutes: number;
  readinessScore: number;
  canStart: boolean;
}

export interface ShootDayView {
  date: string;
  shoots: ShootDaySummary[];
  /** Next shoot after `date`, for an empty day. */
  next: { id: string; title: string; startsAt: ISO } | null;
}

// ── Client communication ──────────────────────────────────────────────────────

export interface MessageView {
  id: string;
  trigger: MessageTrigger;
  channel: MessageChannel;
  status: MessageStatus;
  client: { id: string; name: string };
  project: ProjectRef | null;
  shoot: { id: string; title: string } | null;
  recipientName: string;
  recipientAddress: string | null;
  subject: string;
  body: string;
  /** Placeholders still unfilled (`[reviewLink]`): the message cannot be sent until fixed. */
  unfilled: string[];
  scheduledFor: ISO | null;
  sentAt: ISO | null;
  statusNote: string | null;
  provider: string | null;
  automated: boolean;
  createdBy: string | null;
  reviewedBy: string | null;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface MessageTemplateView {
  id: string;
  trigger: MessageTrigger;
  name: string;
  event: string;
  channel: MessageChannel;
  subject: string;
  body: string;
  mode: AutomationMode;
  offsetHours: number;
  timeBased: boolean;
  updatedAt: ISO;
}

export interface MessagePreview {
  subject: string;
  body: string;
  missing: string[];
  recipient: { name: string; address: string | null; channel: MessageChannel } | null;
}

export interface CommunicationsOverview {
  messages: MessageView[];
  counts: Record<MessageStatus, number>;
  delivery: {
    email: { provider: 'resend' | 'simulated'; ready: boolean; note: string };
    whatsapp: { provider: 'simulated'; ready: false; note: string };
  };
}

// ── Budget ────────────────────────────────────────────────────────────────────

export interface BudgetLineView {
  id: string;
  group: BudgetGroup;
  label: string;
  estimated: number;
  note: string | null;
}

export interface BudgetGroupView {
  group: BudgetGroup;
  estimated: number;
  /** Paid (posted to the ledger). */
  paid: number;
  /** Approved but not yet paid. */
  approved: number;
  /** Paid + approved. */
  actual: number;
  /** Artist fees booked for upcoming shoots, not yet expensed. */
  committed: number;
  variance: number;
  utilisation: number;
  band: 'NONE' | 'UNDER' | 'NEAR' | 'OVER';
  lines: BudgetLineView[];
}

export interface ProjectBudgetView {
  project: ProjectRef & { clientName: string };
  /** Contract value of the project. */
  contractValue: number;
  estimated: number;
  actual: number;
  paid: number;
  approved: number;
  committed: number;
  pendingApproval: number;
  variance: number;
  utilisation: number;
  /** Contract value minus actual cost. */
  margin: number;
  groups: BudgetGroupView[];
  expenses: {
    id: string;
    number: string;
    title: string;
    category: FinanceCategory;
    group: BudgetGroup;
    amount: number;
    status: string;
    incurredOn: ISO;
  }[];
  /** Every figure here comes from records in NOVA; the seed's records are demo data. */
  dataNote: string;
}

// ── Post-production ───────────────────────────────────────────────────────────

export interface PostProductionItem {
  deliverableId: string;
  name: string;
  project: ProjectRef & { clientName: string; stage: StageKey | null };
  status: string;
  version: number;
  dueDate: ISO | null;
  editor: MemberRef | null;
  editProgress: number;
  internalReview: InternalReviewStatus;
  internalReviewNote: string | null;
  clientApproval: {
    id: string;
    status: string;
    requestedAt: ISO;
    dueAt: ISO | null;
    overdue: boolean;
  } | null;
  /** Review state in one word for the board. */
  reviewState:
    | 'EDITING'
    | 'INTERNAL_REVIEW'
    | 'PENDING_CLIENT'
    | 'OVERDUE'
    | 'REVISION_REQUESTED'
    | 'APPROVED'
    | 'DELIVERED';
  feedback: { client: number; internal: number; open: number };
  rounds: number;
  roundsBeyondScope: number;
  footage: { shootId: string; title: string; status: FootageStatus }[];
}

export interface PostProductionView {
  items: PostProductionItem[];
  editors: (MemberRef & { assigned: number })[];
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export interface TaskBoardItem extends TaskView {
  project: ProjectRef;
  overdue: boolean;
  /** Blocked by status or by an unfinished dependency. */
  blocked: boolean;
  blockers: { id: string; title: string; status: TaskStatus }[];
  shoot: { id: string; title: string } | null;
}

export interface TaskBoardView {
  items: TaskBoardItem[];
  counts: { open: number; overdue: number; blocked: number; done: number };
}

// ── Capacity ──────────────────────────────────────────────────────────────────

export interface CapacityDay {
  date: string;
  shoots: { id: string; title: string; projectCode: string; status: ShootStatus }[];
  crewBooked: number;
  talentBooked: number;
  equipmentBooked: number;
  studiosBooked: number;
  /** Shoots that can run the same day, from the people and kit available. */
  shootCapacity: number;
  load: number;
}

export interface CapacityView {
  from: ISO;
  days: CapacityDay[];
  totals: {
    crew: number;
    talent: number;
    equipment: number;
    equipmentInMaintenance: number;
    studios: number;
    directors: number;
    cameraOperators: number;
    cameraBodies: number;
  };
  /** Max shoots the studio can run at once, with the limiting resource. */
  shootCapacity: { value: number; limitedBy: string };
  peakConcurrent: { date: string | null; count: number };
  overlaps: { a: { id: string; title: string }; b: { id: string; title: string }; date: string }[];
  conflicts: number;
  workload: { weekStart: ISO; hours: number; capacity: number; ratio: number }[];
  crew: {
    member: MemberRef;
    shootDays: number;
    utilisation: number;
    band: 'AVAILABLE' | 'BALANCED' | 'STRETCHED' | 'OVERLOADED';
  }[];
  talent: { id: string; name: string; kind: TalentKind; bookedDays: number }[];
  verdict: {
    canTakeMore: boolean;
    headline: string;
    reasons: string[];
    /** First 5-day window with room for another shoot. */
    nextOpening: string | null;
  };
}

// ── Command centre ────────────────────────────────────────────────────────────

export interface AttentionAction {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  /** Where to act: a lens, or a record to inspect. */
  target:
    | { kind: 'lens'; lens: string }
    | { kind: 'inspect'; type: string; id: string }
    | { kind: 'shoot-day'; shootId: string };
}

export interface CommandCenterView {
  generatedAt: ISO;
  today: ShootDaySummary[];
  upcoming: (ShootDaySummary & { daysAway: number })[];
  simultaneous: { date: string; shoots: { id: string; title: string }[] }[];
  availability: {
    crewTotal: number;
    crewOnShoots: number;
    crewOnLeave: number;
    talentBooked: number;
    equipmentTotal: number;
    equipmentOut: number;
    equipmentMaintenance: number;
    studiosBooked: number;
    studiosTotal: number;
  };
  counts: {
    activeProjects: number;
    overdueTasks: number;
    blockedTasks: number;
    pendingClientApprovals: number;
    overdueReviews: number;
    pendingScriptApprovals: number;
    revisionRequests: number;
    messagesAwaitingReview: number;
    openShootIssues: number;
    projectsAtRisk: number;
    deadlinesThisWeek: number;
  };
  byStage: { key: StageKey; label: string; count: number }[];
  attention: AttentionAction[];
  deadlines: {
    id: string;
    code: string;
    title: string;
    dueDate: ISO;
    daysLeft: number;
    progress: number;
  }[];
  activityToday: { id: string; summary: string; createdAt: ISO; actor: string | null }[];
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface ReportsView {
  generatedAt: ISO;
  dataNote: string;
  projects: {
    active: number;
    delivered: number;
    deliveredOnTime: number;
    onTimeRate: number | null;
    delayed: { id: string; code: string; title: string; daysLate: number; stage: string | null }[];
    byStage: { key: StageKey; label: string; count: number }[];
    upcomingDeliveries: {
      id: string;
      code: string;
      title: string;
      dueDate: ISO;
      progress: number;
    }[];
    performance: {
      id: string;
      code: string;
      title: string;
      client: string;
      progress: number;
      health: number;
      dueDate: ISO;
      status: string;
    }[];
  };
  shoots: {
    weeks: { weekStart: ISO; shootDays: number; shoots: number }[];
    total: number;
    wrapped: number;
    delayMinutes: number;
    issues: number;
  };
  crew: {
    id: string;
    name: string;
    title: string;
    shootDays: number;
    openTasks: number;
    utilisation: number;
  }[];
  talent: { id: string; name: string; kind: TalentKind; bookings: number; shootDays: number }[];
  budget:
    | {
        id: string;
        code: string;
        title: string;
        estimated: number;
        actual: number;
        variance: number;
        utilisation: number;
      }[]
    | null;
  revisions: {
    deliverables: number;
    rounds: number;
    averageRounds: number;
    beyondScope: number;
    clientFeedback: number;
    internalFeedback: number;
  };
  clients: {
    id: string;
    name: string;
    activeProjects: number;
    completedProjects: number;
    interactions90d: number;
    messages90d: number;
    lastContact: ISO | null;
  }[];
}

export interface ProjectReadinessView {
  project: ProjectRef & { stage: StageKey | null; clientName: string };
  items: {
    key: string;
    label: string;
    status: 'done' | 'missing' | 'warning' | 'na';
    detail: string;
    /** Where it is fixed. */
    target: AttentionAction['target'] | null;
  }[];
  score: number;
  shoots: {
    id: string;
    title: string;
    startsAt: ISO;
    status: ShootStatus;
    readinessScore: number;
    canConfirm: boolean;
  }[];
}
