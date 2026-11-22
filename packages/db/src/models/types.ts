// Generated once from the former Prisma schema; now maintained by hand.
import type {
  StudioLocation,
  ClientStatus,
  InteractionType,
  LeadStage,
  LeadSource,
  StageKey,
  ProjectType,
  ProjectStatus,
  Priority,
  StageStatus,
  TransitionDirection,
  ActivitySource,
  TaskStatus,
  DeliverableStatus,
  FeedbackStatus,
  ApprovalKind,
  ApprovalStatus,
  ShootStatus,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  MaintenanceKind,
  FinanceKind,
  FinanceCategory,
  AssistantRole,
  AssistantActionStatus,
  RiskLevel,
  RiskStatus,
  EmploymentType,
  LeaveType,
  LeaveStatus,
  AttendanceStatus,
  VendorCategory,
  ApprovalSubject,
  ApprovalRequestStatus,
  ApprovalStepStatus,
  ExpenseStatus,
  InvoiceStatus,
  PaymentMethod,
  PurchaseRequestStatus,
  PurchaseOrderStatus,
  StockCategory,
  StockMovementType,
  StudioBookingStatus,
  DocumentCategory,
  TalentKind,
  TalentBookingStatus,
  CreativeKind,
  ScriptStatus,
  SceneStatus,
  SceneSetting,
  SceneTime,
  BreakdownSource,
  ShootLogKind,
  FootageStatus,
  InternalReviewStatus,
  FeedbackSource,
  MessageChannel,
  MessageStatus,
  MessageTrigger,
  AutomationMode,
  BudgetGroup,
} from './enums';

/** Free-form JSON column. Mongoose cannot type a recursive JSON union, so readers narrow it. */
export type JsonValue = unknown;

/** Common shape of every document: `_id` is the stored key, `id` mirrors it on every read. */
export interface BaseDoc {
  _id: string;
  id: string;
}

export interface User extends BaseDoc {
  email: string;
  passwordHash: string;
  name: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  roleId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of User, available through `.populate()`. */
export interface UserRelations {
  role: Role;
  sessions: Session[];
  teamMember: TeamMember | null;
  activities: ActivityLog[];
  notifications: Notification[];
  assistantMessages: AssistantInteraction[];
  stageTransitions: StageTransition[];
  interactionsLogged: ClientInteraction[];
  notificationPrefs: NotificationPreference[];
  approvalsRequested: ApprovalRequest[];
  approvalDecisions: ApprovalStep[];
  expensesSubmitted: Expense[];
  invoicesCreated: Invoice[];
  paymentsRecorded: Payment[];
  purchaseRequests: PurchaseRequest[];
  purchaseOrders: PurchaseOrder[];
  stockMovements: StockMovement[];
  studioBookings: StudioBooking[];
  documentsCreated: Document[];
  documentVersions: DocumentVersion[];
  leadsOwned: Lead[];
}

export interface Session extends BaseDoc {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/** Relations of Session, available through `.populate()`. */
export interface SessionRelations {
  user: User;
}

export interface Role extends BaseDoc {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
}

/** Relations of Role, available through `.populate()`. */
export interface RoleRelations {
  users: User[];
  permissions: RolePermission[];
}

export interface Permission extends BaseDoc {
  key: string;
}

/** Relations of Permission, available through `.populate()`. */
export interface PermissionRelations {
  roles: RolePermission[];
}

export interface RolePermission extends BaseDoc {
  roleId: string;
  permissionId: string;
}

/** Relations of RolePermission, available through `.populate()`. */
export interface RolePermissionRelations {
  role: Role;
  permission: Permission;
}

export interface TeamMember extends BaseDoc {
  name: string;
  title: string;
  skills: string[];
  baseLocation: StudioLocation;
  weeklyCapacityHours: number;
  avatarUrl: string | null;
  email: string | null;
  isActive: boolean;
  userId: string | null;
  departmentId: string | null;
  employmentType: EmploymentType;
  joinedOn: Date | null;
  createdAt: Date;
}

/** Relations of TeamMember, available through `.populate()`. */
export interface TeamMemberRelations {
  user: User | null;
  department: Department | null;
  tasks: Task[];
  projectRoles: ProjectMember[];
  crewCalls: CrewCall[];
  stagesOwned: ProjectStage[];
  record: EmployeeRecord | null;
  leaveRequests: LeaveRequest[];
  attendance: AttendanceRecord[];
  departmentsLed: Department[];
  assetsInCustody: Asset[];
  risksOwned: ProjectRisk[];
  documents: Document[];
}

export interface ProjectMember extends BaseDoc {
  projectId: string;
  teamMemberId: string;
  role: string;
}

/** Relations of ProjectMember, available through `.populate()`. */
export interface ProjectMemberRelations {
  project: Project;
  teamMember: TeamMember;
}

export interface Client extends BaseDoc {
  name: string;
  industry: string;
  city: string;
  status: ClientStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  accentColor: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Client, available through `.populate()`. */
export interface ClientRelations {
  projects: Project[];
  interactions: ClientInteraction[];
  leads: Lead[];
  contacts: ClientContact[];
  invoices: Invoice[];
  documents: Document[];
}

export interface ClientContact extends BaseDoc {
  clientId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  createdAt: Date;
}

/** Relations of ClientContact, available through `.populate()`. */
export interface ClientContactRelations {
  client: Client;
}

export interface ClientInteraction extends BaseDoc {
  clientId: string;
  projectId: string | null;
  type: InteractionType;
  summary: string;
  occurredAt: Date;
  loggedById: string | null;
  createdAt: Date;
}

/** Relations of ClientInteraction, available through `.populate()`. */
export interface ClientInteractionRelations {
  client: Client;
  project: Project | null;
  loggedBy: User | null;
}

export interface Lead extends BaseDoc {
  title: string;
  clientId: string | null;
  prospectName: string | null;
  projectType: ProjectType;
  estimatedValue: number;
  stage: LeadStage;
  source: LeadSource;
  expectedCloseDate: Date | null;
  notes: string | null;
  convertedProjectId: string | null;
  ownerId: string | null;
  nextFollowUpAt: Date | null;
  lostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Lead, available through `.populate()`. */
export interface LeadRelations {
  client: Client | null;
  convertedProject: Project | null;
  owner: User | null;
  documents: Document[];
}

export interface WorkflowTemplate extends BaseDoc {
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of WorkflowTemplate, available through `.populate()`. */
export interface WorkflowTemplateRelations {
  stages: StageDefinition[];
  projects: Project[];
}

export interface StageDefinition extends BaseDoc {
  templateId: string;
  key: StageKey;
  label: string;
  order: number;
  expectedDays: number;
  requiresApproval: boolean;
  skippable: boolean;
  exitCriteria: string[];
}

/** Relations of StageDefinition, available through `.populate()`. */
export interface StageDefinitionRelations {
  template: WorkflowTemplate;
  projectStages: ProjectStage[];
}

export interface Project extends BaseDoc {
  code: string;
  title: string;
  logline: string | null;
  clientId: string;
  type: ProjectType;
  workflowTemplateId: string;
  status: ProjectStatus;
  priority: Priority;
  location: StudioLocation;
  startDate: Date;
  dueDate: Date;
  deliveredAt: Date | null;
  budget: number;
  includedRevisions: number;
  coverImageUrl: string | null;
  aiAssisted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Project, available through `.populate()`. */
export interface ProjectRelations {
  client: Client;
  workflowTemplate: WorkflowTemplate;
  stages: ProjectStage[];
  transitions: StageTransition[];
  tasks: Task[];
  members: ProjectMember[];
  deliverables: Deliverable[];
  shoots: Shoot[];
  finances: FinancialRecord[];
  interactions: ClientInteraction[];
  bookings: AssetBooking[];
  lead: Lead | null;
  milestones: Milestone[];
  risks: ProjectRisk[];
  expenses: Expense[];
  invoices: Invoice[];
  purchaseRequests: PurchaseRequest[];
  stockMovements: StockMovement[];
  studioBookings: StudioBooking[];
  documents: Document[];
  approvalRequests: ApprovalRequest[];
}

export interface ProjectStage extends BaseDoc {
  projectId: string;
  stageDefinitionId: string;
  status: StageStatus;
  ownerId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** Relations of ProjectStage, available through `.populate()`. */
export interface ProjectStageRelations {
  project: Project;
  stageDefinition: StageDefinition;
  owner: TeamMember | null;
  tasks: Task[];
  approvals: Approval[];
  transitionsFrom: StageTransition[];
  transitionsTo: StageTransition[];
}

export interface StageTransition extends BaseDoc {
  projectId: string;
  fromStageId: string | null;
  toStageId: string | null;
  direction: TransitionDirection;
  reason: string | null;
  actorId: string | null;
  source: ActivitySource;
  createdAt: Date;
}

/** Relations of StageTransition, available through `.populate()`. */
export interface StageTransitionRelations {
  project: Project;
  fromStage: ProjectStage | null;
  toStage: ProjectStage | null;
  actor: User | null;
}

export interface Task extends BaseDoc {
  projectId: string;
  projectStageId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: Date | null;
  estimateHours: number | null;
  isStageBlocking: boolean;
  blockedReason: string | null;
  completedAt: Date | null;
  parentId: string | null;
  shootId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Task, available through `.populate()`. */
export interface TaskRelations {
  project: Project;
  projectStage: ProjectStage | null;
  assignee: TeamMember | null;
  parent: Task | null;
  subtasks: Task[];
  dependsOn: TaskDependency[];
  dependents: TaskDependency[];
}

export interface TaskDependency extends BaseDoc {
  taskId: string;
  dependsOnId: string;
  createdAt: Date;
}

/** Relations of TaskDependency, available through `.populate()`. */
export interface TaskDependencyRelations {
  task: Task;
  dependsOn: Task;
}

export interface Deliverable extends BaseDoc {
  projectId: string;
  name: string;
  format: string;
  aspectRatio: string;
  durationSec: number | null;
  status: DeliverableStatus;
  currentVersion: number;
  dueDate: Date | null;
  previewImageUrl: string | null;
  /** Editor responsible for the cut (post-production). */
  editorId: string | null;
  /** Editing progress, 0-100, reported by the editor. */
  editProgress: number;
  internalReviewStatus: InternalReviewStatus;
  internalReviewNote: string | null;
  internalReviewedAt: Date | null;
  internalReviewedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Deliverable, available through `.populate()`. */
export interface DeliverableRelations {
  project: Project;
  rounds: RevisionRound[];
  approvals: Approval[];
}

export interface RevisionRound extends BaseDoc {
  deliverableId: string;
  number: number;
  sentAt: Date;
  closedAt: Date | null;
  includedInScope: boolean;
}

/** Relations of RevisionRound, available through `.populate()`. */
export interface RevisionRoundRelations {
  deliverable: Deliverable;
  feedback: FeedbackItem[];
}

export interface FeedbackItem extends BaseDoc {
  revisionRoundId: string;
  timecode: string | null;
  body: string;
  author: string;
  status: FeedbackStatus;
  /** Who gave the note: the client, or the studio's own internal review. */
  source: FeedbackSource;
  createdAt: Date;
}

/** Relations of FeedbackItem, available through `.populate()`. */
export interface FeedbackItemRelations {
  revisionRound: RevisionRound;
}

export interface Approval extends BaseDoc {
  kind: ApprovalKind;
  status: ApprovalStatus;
  deliverableId: string | null;
  projectStageId: string | null;
  title: string;
  requestedAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
  note: string | null;
  /** Review deadline; a pending approval past it is overdue. */
  dueAt: Date | null;
}

/** Relations of Approval, available through `.populate()`. */
export interface ApprovalRelations {
  deliverable: Deliverable | null;
  projectStage: ProjectStage | null;
}

export interface Shoot extends BaseDoc {
  projectId: string;
  title: string;
  location: string;
  city: StudioLocation;
  startsAt: Date;
  endsAt: Date;
  callTime: string | null;
  status: ShootStatus;
  notes: string | null;
  /** Production manager running the shoot (a team member). */
  productionManagerId: string | null;
  /** Crew call (talent call is `callTime`). */
  crewCallTime: string | null;
  /** Call-sheet notes: parking, safety, nearest hospital, weather plan. */
  callSheetNotes: string | null;
  callSheetPublishedAt: Date | null;
  checklist: ShootChecklistItem[];
  footageStatus: FootageStatus;
  wrapNotes: string | null;
  startedAt: Date | null;
  wrappedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShootChecklistItem {
  _id: string;
  id: string;
  label: string;
  done: boolean;
  doneAt: Date | null;
  doneBy: string | null;
}

/** Relations of Shoot, available through `.populate()`. */
export interface ShootRelations {
  project: Project;
  crew: CrewCall[];
  bookings: AssetBooking[];
  studioBookings: StudioBooking[];
  talent: TalentBooking[];
  scenes: Scene[];
  log: ShootLogEntry[];
  productionManager: TeamMember | null;
}

export interface CrewCall extends BaseDoc {
  shootId: string;
  teamMemberId: string;
  role: string;
}

/** Relations of CrewCall, available through `.populate()`. */
export interface CrewCallRelations {
  shoot: Shoot;
  teamMember: TeamMember;
}

export interface Asset extends BaseDoc {
  name: string;
  category: AssetCategory;
  serialTag: string;
  homeLocation: StudioLocation;
  status: AssetStatus;
  dailyRate: number;
  notes: string | null;
  condition: AssetCondition;
  purchasedOn: Date | null;
  purchaseCost: number | null;
  custodianId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Asset, available through `.populate()`. */
export interface AssetRelations {
  custodian: TeamMember | null;
  bookings: AssetBooking[];
  maintenance: AssetMaintenance[];
}

export interface AssetMaintenance extends BaseDoc {
  assetId: string;
  kind: MaintenanceKind;
  description: string;
  cost: number | null;
  vendorId: string | null;
  startedOn: Date;
  completedOn: Date | null;
  createdAt: Date;
}

/** Relations of AssetMaintenance, available through `.populate()`. */
export interface AssetMaintenanceRelations {
  asset: Asset;
  vendor: Vendor | null;
}

export interface AssetBooking extends BaseDoc {
  assetId: string;
  shootId: string | null;
  projectId: string | null;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
  createdAt: Date;
}

/** Relations of AssetBooking, available through `.populate()`. */
export interface AssetBookingRelations {
  asset: Asset;
  shoot: Shoot | null;
  project: Project | null;
}

export interface FinancialRecord extends BaseDoc {
  projectId: string | null;
  kind: FinanceKind;
  category: FinanceCategory;
  amount: number;
  occurredOn: Date;
  note: string | null;
  isDemo: boolean;
  paymentId: string | null;
  expenseId: string | null;
  createdAt: Date;
}

/** Relations of FinancialRecord, available through `.populate()`. */
export interface FinancialRecordRelations {
  project: Project | null;
  payment: Payment | null;
  expense: Expense | null;
}

export interface ActivityLog extends BaseDoc {
  actorId: string | null;
  source: ActivitySource;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  summary: string;
  metadata: JsonValue;
  createdAt: Date;
}

/** Relations of ActivityLog, available through `.populate()`. */
export interface ActivityLogRelations {
  actor: User | null;
}

export interface Notification extends BaseDoc {
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  /** Set when the underlying problem has been dealt with. */
  resolvedAt: Date | null;
  /** Generated alerts carry a key so the same alert is not raised twice. */
  dedupeKey: string | null;
  createdAt: Date;
}

/** Relations of Notification, available through `.populate()`. */
export interface NotificationRelations {
  user: User;
}

export interface AssistantInteraction extends BaseDoc {
  userId: string;
  role: AssistantRole;
  content: string;
  focusContext: JsonValue;
  references: JsonValue;
  provider: string;
  language: string | null;
  languageSource: string | null;
  createdAt: Date;
}

/** Relations of AssistantInteraction, available through `.populate()`. */
export interface AssistantInteractionRelations {
  user: User;
  actions: AssistantAction[];
}

export interface AssistantAction extends BaseDoc {
  interactionId: string;
  kind: string;
  payload: JsonValue;
  preview: JsonValue;
  targetVersion: string | null;
  status: AssistantActionStatus;
  error: string | null;
  resultEntityId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

/** Relations of AssistantAction, available through `.populate()`. */
export interface AssistantActionRelations {
  interaction: AssistantInteraction;
}

export interface NotificationPreference extends BaseDoc {
  userId: string;
  kind: string;
  inApp: boolean;
}

/** Relations of NotificationPreference, available through `.populate()`. */
export interface NotificationPreferenceRelations {
  user: User;
}

export interface Milestone extends BaseDoc {
  projectId: string;
  title: string;
  dueDate: Date;
  completedAt: Date | null;
  billingAmount: number | null;
  createdAt: Date;
}

/** Relations of Milestone, available through `.populate()`. */
export interface MilestoneRelations {
  project: Project;
  invoices: Invoice[];
}

export interface ProjectRisk extends BaseDoc {
  projectId: string;
  title: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  mitigation: string | null;
  status: RiskStatus;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of ProjectRisk, available through `.populate()`. */
export interface ProjectRiskRelations {
  project: Project;
  owner: TeamMember | null;
}

export interface Department extends BaseDoc {
  name: string;
  description: string | null;
  leadId: string | null;
  createdAt: Date;
}

/** Relations of Department, available through `.populate()`. */
export interface DepartmentRelations {
  lead: TeamMember | null;
  members: TeamMember[];
}

/** Restricted HR details. Readable only with `hr:read`. No salary or bank data is stored. */
export interface EmployeeRecord extends BaseDoc {
  teamMemberId: string;
  employeeCode: string;
  phone: string | null;
  emergencyContact: string | null;
  address: string | null;
  notes: string | null;
  updatedAt: Date;
}

/** Relations of EmployeeRecord, available through `.populate()`. */
export interface EmployeeRecordRelations {
  teamMember: TeamMember;
}

export interface LeaveRequest extends BaseDoc {
  teamMemberId: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  status: LeaveStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of LeaveRequest, available through `.populate()`. */
export interface LeaveRequestRelations {
  teamMember: TeamMember;
  approvalRequests: ApprovalRequest[];
}

export interface AttendanceRecord extends BaseDoc {
  teamMemberId: string;
  date: Date;
  status: AttendanceStatus;
  checkIn: Date | null;
  checkOut: Date | null;
  note: string | null;
  createdAt: Date;
}

/** Relations of AttendanceRecord, available through `.populate()`. */
export interface AttendanceRecordRelations {
  teamMember: TeamMember;
}

export interface Vendor extends BaseDoc {
  name: string;
  category: VendorCategory;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Vendor, available through `.populate()`. */
export interface VendorRelations {
  expenses: Expense[];
  quotes: VendorQuote[];
  purchaseOrders: PurchaseOrder[];
  maintenance: AssetMaintenance[];
  documents: Document[];
}

export interface ApprovalRule extends BaseDoc {
  subject: ApprovalSubject;
  name: string;
  minAmount: number;
  stepOrder: number;
  permission: string;
  isActive: boolean;
  createdAt: Date;
}

/** Relations of ApprovalRule, available through `.populate()`. */
// ApprovalRule has no relations.
export type ApprovalRuleRelations = Record<string, never>;

/** Exactly one subject foreign key is set (collection validator, see validators.ts). */
export interface ApprovalRequest extends BaseDoc {
  subject: ApprovalSubject;
  status: ApprovalRequestStatus;
  title: string;
  amount: number | null;
  currentStep: number;
  requestedById: string;
  projectId: string | null;
  expenseId: string | null;
  purchaseRequestId: string | null;
  leaveRequestId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

/** Relations of ApprovalRequest, available through `.populate()`. */
export interface ApprovalRequestRelations {
  requestedBy: User;
  project: Project | null;
  expense: Expense | null;
  purchaseRequest: PurchaseRequest | null;
  leaveRequest: LeaveRequest | null;
  steps: ApprovalStep[];
}

export interface ApprovalStep extends BaseDoc {
  requestId: string;
  order: number;
  label: string;
  permission: string;
  status: ApprovalStepStatus;
  deciderId: string | null;
  reason: string | null;
  decidedAt: Date | null;
}

/** Relations of ApprovalStep, available through `.populate()`. */
export interface ApprovalStepRelations {
  request: ApprovalRequest;
  decider: User | null;
}

export interface Expense extends BaseDoc {
  number: string;
  title: string;
  category: FinanceCategory;
  amount: number;
  incurredOn: Date;
  projectId: string | null;
  vendorId: string | null;
  purchaseOrderId: string | null;
  submittedById: string;
  status: ExpenseStatus;
  notes: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Expense, available through `.populate()`. */
export interface ExpenseRelations {
  project: Project | null;
  vendor: Vendor | null;
  purchaseOrder: PurchaseOrder | null;
  submittedBy: User;
  ledger: FinancialRecord | null;
  approvals: ApprovalRequest[];
  documents: Document[];
}

export interface Invoice extends BaseDoc {
  number: string;
  clientId: string;
  projectId: string | null;
  milestoneId: string | null;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  taxPercent: number;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  sentAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Invoice, available through `.populate()`. */
export interface InvoiceRelations {
  client: Client;
  project: Project | null;
  milestone: Milestone | null;
  createdBy: User;
  lines: InvoiceLine[];
  payments: Payment[];
  documents: Document[];
}

export interface InvoiceLine extends BaseDoc {
  invoiceId: string;
  order: number;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** Relations of InvoiceLine, available through `.populate()`. */
export interface InvoiceLineRelations {
  invoice: Invoice;
}

export interface Payment extends BaseDoc {
  invoiceId: string;
  amount: number;
  receivedOn: Date;
  method: PaymentMethod;
  reference: string | null;
  recordedById: string;
  createdAt: Date;
}

/** Relations of Payment, available through `.populate()`. */
export interface PaymentRelations {
  invoice: Invoice;
  recordedBy: User;
  ledger: FinancialRecord | null;
}

export interface PurchaseRequest extends BaseDoc {
  number: string;
  title: string;
  justification: string | null;
  projectId: string | null;
  requestedById: string;
  neededBy: Date | null;
  status: PurchaseRequestStatus;
  estimatedTotal: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of PurchaseRequest, available through `.populate()`. */
export interface PurchaseRequestRelations {
  project: Project | null;
  requestedBy: User;
  items: PurchaseRequestItem[];
  quotes: VendorQuote[];
  order: PurchaseOrder | null;
  approvals: ApprovalRequest[];
}

export interface PurchaseRequestItem extends BaseDoc {
  requestId: string;
  description: string;
  quantity: number;
  estimatedUnitCost: number;
  stockItemId: string | null;
}

/** Relations of PurchaseRequestItem, available through `.populate()`. */
export interface PurchaseRequestItemRelations {
  request: PurchaseRequest;
  stockItem: StockItem | null;
}

export interface VendorQuote extends BaseDoc {
  requestId: string;
  vendorId: string;
  amount: number;
  validUntil: Date | null;
  notes: string | null;
  isSelected: boolean;
  createdAt: Date;
}

/** Relations of VendorQuote, available through `.populate()`. */
export interface VendorQuoteRelations {
  request: PurchaseRequest;
  vendor: Vendor;
}

export interface PurchaseOrder extends BaseDoc {
  number: string;
  requestId: string | null;
  vendorId: string;
  status: PurchaseOrderStatus;
  issuedOn: Date;
  expectedOn: Date | null;
  total: number;
  notes: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of PurchaseOrder, available through `.populate()`. */
export interface PurchaseOrderRelations {
  request: PurchaseRequest | null;
  vendor: Vendor;
  createdBy: User;
  lines: PurchaseOrderLine[];
  bill: Expense | null;
  documents: Document[];
}

export interface PurchaseOrderLine extends BaseDoc {
  orderId: string;
  description: string;
  quantity: number;
  unitCost: number;
  receivedQty: number;
  stockItemId: string | null;
}

/** Relations of PurchaseOrderLine, available through `.populate()`. */
export interface PurchaseOrderLineRelations {
  order: PurchaseOrder;
  stockItem: StockItem | null;
  movements: StockMovement[];
}

export interface StockItem extends BaseDoc {
  sku: string;
  name: string;
  category: StockCategory;
  unit: string;
  onHand: number;
  reorderLevel: number;
  location: StudioLocation;
  unitCost: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of StockItem, available through `.populate()`. */
export interface StockItemRelations {
  movements: StockMovement[];
  requestItems: PurchaseRequestItem[];
  orderLines: PurchaseOrderLine[];
}

export interface StockMovement extends BaseDoc {
  stockItemId: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  projectId: string | null;
  purchaseOrderLineId: string | null;
  note: string | null;
  actorId: string | null;
  createdAt: Date;
}

/** Relations of StockMovement, available through `.populate()`. */
export interface StockMovementRelations {
  stockItem: StockItem;
  project: Project | null;
  purchaseOrderLine: PurchaseOrderLine | null;
  actor: User | null;
}

export interface Studio extends BaseDoc {
  name: string;
  location: StudioLocation;
  kind: string;
  capacity: number | null;
  hourlyRate: number;
  features: string[];
  isActive: boolean;
  createdAt: Date;
}

/** Relations of Studio, available through `.populate()`. */
export interface StudioRelations {
  bookings: StudioBooking[];
}

export interface StudioBooking extends BaseDoc {
  studioId: string;
  title: string;
  projectId: string | null;
  shootId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: StudioBookingStatus;
  notes: string | null;
  bookedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of StudioBooking, available through `.populate()`. */
export interface StudioBookingRelations {
  studio: Studio;
  project: Project | null;
  shoot: Shoot | null;
  bookedBy: User | null;
}

export interface Document extends BaseDoc {
  title: string;
  category: DocumentCategory;
  description: string | null;
  confidential: boolean;
  currentVersion: number;
  projectId: string | null;
  clientId: string | null;
  leadId: string | null;
  vendorId: string | null;
  teamMemberId: string | null;
  invoiceId: string | null;
  expenseId: string | null;
  purchaseOrderId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Document, available through `.populate()`. */
export interface DocumentRelations {
  project: Project | null;
  client: Client | null;
  lead: Lead | null;
  vendor: Vendor | null;
  teamMember: TeamMember | null;
  invoice: Invoice | null;
  expense: Expense | null;
  purchaseOrder: PurchaseOrder | null;
  createdBy: User;
  versions: DocumentVersion[];
}

export interface DocumentVersion extends BaseDoc {
  documentId: string;
  version: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  note: string | null;
  uploadedById: string;
  createdAt: Date;
}

/** Relations of DocumentVersion, available through `.populate()`. */
export interface DocumentVersionRelations {
  document: Document;
  uploadedBy: User;
}

// ── Production studio layer ──────────────────────────────────────────────────

export interface TalentUnavailability {
  _id: string;
  id: string;
  from: Date;
  to: Date;
  reason: string | null;
}

/** An external artist (actor, model, voice artist…), as opposed to a TeamMember on staff. */
export interface Talent extends BaseDoc {
  name: string;
  kind: TalentKind;
  email: string | null;
  phone: string | null;
  agency: string | null;
  skills: string[];
  languages: string[];
  /** Playable age range, when it matters for casting. */
  playingAgeMin: number | null;
  playingAgeMax: number | null;
  experienceYears: number;
  baseCity: string;
  willTravel: boolean;
  dayRate: number;
  portfolioUrl: string | null;
  notes: string | null;
  isActive: boolean;
  unavailable: TalentUnavailability[];
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Talent, available through `.populate()`. */
export interface TalentRelations {
  bookings: TalentBooking[];
}

export interface TalentBooking extends BaseDoc {
  talentId: string;
  shootId: string;
  /** Character or part, e.g. "Mother", "Hand model". */
  character: string;
  status: TalentBookingStatus;
  fee: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of TalentBooking, available through `.populate()`. */
export interface TalentBookingRelations {
  talent: Talent;
  shoot: Shoot;
}

/** A creative document of a project (brief, concept, script, storyboard, shot list). */
export interface Script extends BaseDoc {
  projectId: string;
  kind: CreativeKind;
  title: string;
  status: ScriptStatus;
  currentVersion: number;
  clientInstructions: string | null;
  notes: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  decisionNote: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Script, available through `.populate()`. */
export interface ScriptRelations {
  project: Project;
  versions: ScriptVersion[];
  scenes: Scene[];
  createdBy: User;
}

export interface ScriptVersion extends BaseDoc {
  scriptId: string;
  number: number;
  body: string;
  changeNote: string | null;
  /** Name of the uploaded file the text came from, when it was uploaded. */
  fileName: string | null;
  authorId: string;
  createdAt: Date;
}

/** Relations of ScriptVersion, available through `.populate()`. */
export interface ScriptVersionRelations {
  script: Script;
  author: User;
}

/** One scene of the breakdown: what must be in front of the camera, and where. */
export interface Scene extends BaseDoc {
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
  shootId: string | null;
  /** Calendar day of the (possibly multi-day) shoot this scene is planned for. */
  shootDate: Date | null;
  /** Planned start on the shoot day, HH:MM. */
  plannedStart: string | null;
  status: SceneStatus;
  notes: string | null;
  source: BreakdownSource;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of Scene, available through `.populate()`. */
export interface SceneRelations {
  project: Project;
  script: Script | null;
  shoot: Shoot | null;
}

export interface ShootLogEntry extends BaseDoc {
  shootId: string;
  kind: ShootLogKind;
  body: string;
  minutesLost: number;
  authorId: string;
  resolvedAt: Date | null;
  createdAt: Date;
}

/** Relations of ShootLogEntry, available through `.populate()`. */
export interface ShootLogEntryRelations {
  shoot: Shoot;
  author: User;
}

export interface MessageTemplate extends BaseDoc {
  trigger: MessageTrigger;
  name: string;
  channel: MessageChannel;
  subject: string;
  body: string;
  mode: AutomationMode;
  /** For time-based triggers: hours relative to the event (negative = before it). */
  offsetHours: number;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientMessage extends BaseDoc {
  clientId: string;
  projectId: string | null;
  shootId: string | null;
  templateId: string | null;
  trigger: MessageTrigger;
  channel: MessageChannel;
  recipientName: string;
  recipientAddress: string | null;
  subject: string;
  body: string;
  status: MessageStatus;
  /** When a queued message is due to go out. */
  scheduledFor: Date | null;
  sentAt: Date | null;
  /** Provider response, simulation notice or failure reason. */
  statusNote: string | null;
  provider: string | null;
  /** Prevents the same automation from preparing the same message twice. */
  dedupeKey: string | null;
  /** Shoot start the message was written for (detects later schedule changes). */
  scheduleStamp: Date | null;
  createdById: string | null;
  reviewedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of ClientMessage, available through `.populate()`. */
export interface ClientMessageRelations {
  client: Client;
  project: Project | null;
  shoot: Shoot | null;
  template: MessageTemplate | null;
}

export interface BudgetLine extends BaseDoc {
  projectId: string;
  group: BudgetGroup;
  label: string;
  estimated: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Relations of BudgetLine, available through `.populate()`. */
export interface BudgetLineRelations {
  project: Project;
}
