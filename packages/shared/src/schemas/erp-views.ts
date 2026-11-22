/** Response shapes for the ERP expansion. Dates are ISO strings on the wire. */
import type {
  AssetCategory,
  AssetStatus,
  FinanceCategory,
  StudioLocation,
} from '../constants/enums';
import type {
  ApprovalRequestStatus,
  ApprovalStepStatus,
  ApprovalSubject,
  AssetCondition,
  AttendanceStatus,
  DocumentCategory,
  EmploymentType,
  ExpenseStatus,
  InvoiceStatus,
  LeaveStatus,
  LeaveType,
  MaintenanceKind,
  NotificationCategory,
  PaymentMethod,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  RiskLevel,
  RiskStatus,
  StockCategory,
  StockMovementType,
  StudioBookingStatus,
  VendorCategory,
} from '../constants/erp-enums';
import type { AgeingBucket, StockLevel } from '../domain/erp';
import type { Permission } from './auth';

type ISO = string;
type Ref = { id: string; name: string };
type ProjectRef = { id: string; code: string; title: string };

// ── Administration ────────────────────────────────────────────────────────────

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** SUPER_ADMIN: permissions cannot be edited. */
  locked: boolean;
  permissions: Permission[];
  userCount: number;
}

export interface UserView {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: ISO | null;
  createdAt: ISO;
  role: { id: string; key: string; name: string };
  teamMember: { id: string; title: string } | null;
  activeSessions: number;
}

export interface SessionView {
  id: string;
  current: boolean;
  createdAt: ISO;
  lastSeenAt: ISO;
  expiresAt: ISO;
  ip: string | null;
  userAgent: string | null;
}

export interface ApprovalRuleView {
  id: string;
  subject: ApprovalSubject;
  name: string;
  minAmount: number;
  stepOrder: number;
  permission: string;
  isActive: boolean;
}

export interface NotificationPreferenceView {
  kind: NotificationCategory;
  label: string;
  inApp: boolean;
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export interface ApprovalStepView {
  id: string;
  order: number;
  label: string;
  permission: string;
  status: ApprovalStepStatus;
  decider: Ref | null;
  reason: string | null;
  decidedAt: ISO | null;
}

export interface ApprovalRequestView {
  id: string;
  subject: ApprovalSubject;
  /** Id of the expense, purchase request or leave request. */
  subjectId: string;
  status: ApprovalRequestStatus;
  title: string;
  amount: number | null;
  currentStep: number;
  requestedBy: Ref;
  project: ProjectRef | null;
  createdAt: ISO;
  decidedAt: ISO | null;
  steps: ApprovalStepView[];
  /** True when the signed-in user may decide the current step. */
  canDecide: boolean;
  /** Why the signed-in user cannot decide, when relevant. */
  blockedReason: string | null;
}

export interface ApprovalInboxView {
  requests: ApprovalRequestView[];
  /** Deliverable/stage approvals that record a client or internal sign-off (not ADR-0010). */
  signOffs: {
    id: string;
    kind: 'INTERNAL' | 'CLIENT';
    title: string;
    requestedAt: ISO;
    project: ProjectRef;
    deliverableId: string | null;
  }[];
  counts: { waitingOnMe: number; myOpenRequests: number };
}

// ── Vendors ───────────────────────────────────────────────────────────────────

export interface VendorView {
  id: string;
  name: string;
  category: VendorCategory;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  isActive: boolean;
  /** Approved + paid expenses with this vendor. */
  totalSpend: number;
  openOrders: number;
}

export interface VendorDetail extends VendorView {
  expenses: ExpenseView[];
  orders: PurchaseOrderSummary[];
  quotes: {
    id: string;
    amount: number;
    request: { id: string; number: string; title: string };
    isSelected: boolean;
    createdAt: ISO;
  }[];
}

// ── Finance ───────────────────────────────────────────────────────────────────

export interface ExpenseView {
  id: string;
  number: string;
  title: string;
  category: FinanceCategory;
  amount: number;
  incurredOn: ISO;
  status: ExpenseStatus;
  notes: string | null;
  project: ProjectRef | null;
  vendor: Ref | null;
  purchaseOrder: { id: string; number: string } | null;
  submittedBy: Ref;
  paidAt: ISO | null;
  approval: {
    id: string;
    status: ApprovalRequestStatus;
    currentStep: number;
    steps: number;
  } | null;
  createdAt: ISO;
}

export interface InvoiceSummary {
  id: string;
  number: string;
  status: InvoiceStatus;
  /** Computed: open and past due (ADR-0011). */
  overdue: boolean;
  daysOverdue: number;
  client: { id: string; name: string; accentColor: string | null };
  project: ProjectRef | null;
  issueDate: ISO;
  dueDate: ISO;
  total: number;
  paid: number;
  balance: number;
}

export interface InvoiceDetail extends InvoiceSummary {
  taxPercent: number;
  subtotal: number;
  tax: number;
  notes: string | null;
  sentAt: ISO | null;
  milestone: { id: string; title: string } | null;
  createdBy: Ref;
  lines: {
    id: string;
    order: number;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
  payments: {
    id: string;
    amount: number;
    receivedOn: ISO;
    method: PaymentMethod;
    reference: string | null;
    recordedBy: Ref;
  }[];
}

export interface FinanceOverview {
  isDemo: true;
  receivables: {
    outstanding: number;
    overdue: number;
    ageing: Record<AgeingBucket, number>;
  };
  expenses: {
    awaitingApproval: number;
    awaitingApprovalCount: number;
    approvedUnpaid: number;
    paidThisMonth: number;
  };
  invoicedThisMonth: number;
  collectedThisMonth: number;
  budgetVsActual: {
    project: ProjectRef;
    budget: number;
    actual: number;
    committed: number;
    invoiced: number;
    collected: number;
  }[];
}

// ── Procurement ───────────────────────────────────────────────────────────────

export interface PurchaseRequestView {
  id: string;
  number: string;
  title: string;
  justification: string | null;
  status: PurchaseRequestStatus;
  estimatedTotal: number;
  neededBy: ISO | null;
  project: ProjectRef | null;
  requestedBy: Ref;
  createdAt: ISO;
  items: {
    id: string;
    description: string;
    quantity: number;
    estimatedUnitCost: number;
    stockItem: { id: string; sku: string; name: string } | null;
  }[];
  quotes: {
    id: string;
    vendor: Ref;
    amount: number;
    validUntil: ISO | null;
    notes: string | null;
    isSelected: boolean;
  }[];
  order: { id: string; number: string; status: PurchaseOrderStatus } | null;
  approval: ApprovalRequestView | null;
}

export interface PurchaseOrderSummary {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  vendor: Ref;
  issuedOn: ISO;
  expectedOn: ISO | null;
  total: number;
  request: { id: string; number: string; title: string } | null;
}

export interface PurchaseOrderDetail extends PurchaseOrderSummary {
  notes: string | null;
  createdBy: Ref;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitCost: number;
    receivedQty: number;
    stockItem: { id: string; sku: string; name: string } | null;
  }[];
  bill: { id: string; number: string; status: ExpenseStatus } | null;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface StockItemView {
  id: string;
  sku: string;
  name: string;
  category: StockCategory;
  unit: string;
  onHand: number;
  reorderLevel: number;
  level: StockLevel;
  location: StudioLocation;
  unitCost: number;
  notes: string | null;
  /** Quantity on open purchase orders not yet received. */
  onOrder: number;
}

export interface StockMovementView {
  id: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  project: ProjectRef | null;
  purchaseOrder: { id: string; number: string } | null;
  note: string | null;
  actor: Ref | null;
  createdAt: ISO;
}

export interface StockItemDetail extends StockItemView {
  movements: StockMovementView[];
}

export interface AssetDetail {
  id: string;
  name: string;
  category: AssetCategory;
  serialTag: string;
  homeLocation: StudioLocation;
  status: AssetStatus;
  condition: AssetCondition;
  dailyRate: number;
  purchasedOn: ISO | null;
  purchaseCost: number | null;
  notes: string | null;
  custodian: Ref | null;
  maintenance: {
    id: string;
    kind: MaintenanceKind;
    description: string;
    cost: number | null;
    vendor: Ref | null;
    startedOn: ISO;
    completedOn: ISO | null;
  }[];
  bookings: {
    id: string;
    startsAt: ISO;
    endsAt: ISO;
    shoot: { id: string; title: string } | null;
    project: ProjectRef | null;
  }[];
}

// ── HR ────────────────────────────────────────────────────────────────────────

export interface DepartmentView {
  id: string;
  name: string;
  description: string | null;
  lead: Ref | null;
  members: { id: string; name: string; title: string }[];
}

export interface EmployeeView {
  id: string;
  name: string;
  title: string;
  email: string | null;
  baseLocation: StudioLocation;
  department: Ref | null;
  employmentType: EmploymentType;
  joinedOn: ISO | null;
  weeklyCapacityHours: number;
  isActive: boolean;
  /** Today's attendance, if recorded. */
  today: AttendanceStatus | null;
  /** Approved leave covering today. */
  onLeaveToday: boolean;
  leaveTakenThisYear: number;
  /** Present only for users with `hr:read`. */
  record?: {
    employeeCode: string;
    phone: string | null;
    emergencyContact: string | null;
    address: string | null;
    notes: string | null;
  } | null;
}

export interface LeaveView {
  id: string;
  member: Ref;
  type: LeaveType;
  startDate: ISO;
  endDate: ISO;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  createdAt: ISO;
  approval: { id: string; status: ApprovalRequestStatus } | null;
  /** Shoots the member is called for during the leave. */
  clashes: { shootId: string; title: string; startsAt: ISO }[];
}

export interface AttendanceView {
  from: ISO;
  to: ISO;
  members: { id: string; name: string }[];
  records: {
    id: string;
    memberId: string;
    date: ISO;
    status: AttendanceStatus;
    checkIn: ISO | null;
    checkOut: ISO | null;
    note: string | null;
  }[];
}

// ── Studios ───────────────────────────────────────────────────────────────────

export interface StudioView {
  id: string;
  name: string;
  location: StudioLocation;
  kind: string;
  capacity: number | null;
  hourlyRate: number;
  features: string[];
  isActive: boolean;
  bookings: StudioBookingView[];
  /** Booked hours this week / available hours (08:00–22:00, 7 days). */
  utilisation: number;
}

export interface StudioBookingView {
  id: string;
  studio: { id: string; name: string };
  title: string;
  status: StudioBookingStatus;
  startsAt: ISO;
  endsAt: ISO;
  notes: string | null;
  project: ProjectRef | null;
  shoot: { id: string; title: string } | null;
  bookedBy: Ref | null;
}

// ── Documents ─────────────────────────────────────────────────────────────────

export interface DocumentVersionView {
  version: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  note: string | null;
  uploadedBy: Ref;
  createdAt: ISO;
}

export interface DocumentView {
  id: string;
  title: string;
  category: DocumentCategory;
  description: string | null;
  confidential: boolean;
  currentVersion: number;
  latest: DocumentVersionView | null;
  links: {
    project: ProjectRef | null;
    client: Ref | null;
    lead: { id: string; title: string } | null;
    vendor: Ref | null;
    member: Ref | null;
    invoice: { id: string; number: string } | null;
    expense: { id: string; number: string } | null;
    purchaseOrder: { id: string; number: string } | null;
  };
  createdBy: Ref;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface DocumentDetail extends DocumentView {
  versions: DocumentVersionView[];
}

// ── CRM & projects ────────────────────────────────────────────────────────────

export interface ContactView {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface MilestoneView {
  id: string;
  title: string;
  dueDate: ISO;
  completedAt: ISO | null;
  billingAmount: number | null;
  invoiced: boolean;
}

export interface RiskView {
  id: string;
  title: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  score: number;
  mitigation: string | null;
  status: RiskStatus;
  owner: Ref | null;
  updatedAt: ISO;
}
