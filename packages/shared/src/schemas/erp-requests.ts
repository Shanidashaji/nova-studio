/** Request schemas for the ERP expansion. Validated by the API and reused by web forms. */
import { z } from 'zod';
import { FinanceCategory, Priority, ProjectType, StudioLocation } from '../constants/enums';
import {
  ApprovalSubject,
  AssetCondition,
  AttendanceStatus,
  DocumentCategory,
  EmploymentType,
  ExpenseStatus,
  InvoiceStatus,
  LeaveType,
  MaintenanceKind,
  NotificationCategory,
  PaymentMethod,
  PurchaseRequestStatus,
  RiskLevel,
  RiskStatus,
  StockCategory,
  StudioBookingStatus,
  VendorCategory,
} from '../constants/erp-enums';
import { Permission, RoleKey } from './auth';
import { Id, date, optionalText, rupees, text } from './common';

const email = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.trim().toLowerCase());
const optionalEmail = z
  .email('Enter a valid email address')
  .max(254)
  .optional()
  .or(z.literal('').transform(() => undefined));
const optionalId = Id.optional().or(z.literal('').transform(() => undefined));
const optionalDate = date.optional().or(z.literal('').transform(() => undefined));
const quantity = z.coerce.number().int().min(1).max(100_000);
/** Query-string boolean: only "true" is true (z.coerce.boolean would treat "false" as true). */
const queryBool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();
/** Upper bound for any document total (whole rupees); keeps sums inside a 32-bit column. */
const MAX_TOTAL = 1_000_000_000;
/** Passwords: 12+ characters (NIST SP 800-63B favours length over composition rules). */
export const NewPassword = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(256, 'Use at most 256 characters');

// ── Administration (ADR-0009) ─────────────────────────────────────────────────

export const CreateUser = z.object({
  email,
  name: text(120),
  roleId: Id,
  password: NewPassword,
});
export type CreateUser = z.infer<typeof CreateUser>;

export const UpdateUser = z
  .object({ name: text(120), roleId: Id, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');
export type UpdateUser = z.infer<typeof UpdateUser>;

export const ResetPassword = z.object({ password: NewPassword });
export type ResetPassword = z.infer<typeof ResetPassword>;

export const ChangeOwnPassword = z
  .object({ currentPassword: z.string().min(1).max(256), newPassword: NewPassword })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Choose a password you have not used here.',
    path: ['newPassword'],
  });
export type ChangeOwnPassword = z.infer<typeof ChangeOwnPassword>;

export const CreateRole = z.object({
  key: RoleKey,
  name: text(60),
  description: optionalText(200),
  permissions: z.array(Permission).max(100).default([]),
});
export type CreateRole = z.infer<typeof CreateRole>;

export const UpdateRole = z
  .object({
    name: text(60),
    description: optionalText(200),
    permissions: z.array(Permission).max(100),
  })
  .partial();
export type UpdateRole = z.infer<typeof UpdateRole>;

export const UpsertApprovalRule = z.object({
  subject: ApprovalSubject,
  name: text(60),
  minAmount: rupees(),
  stepOrder: z.coerce.number().int().min(1).max(5),
  permission: Permission,
  isActive: z.boolean().default(true),
});
export type UpsertApprovalRule = z.infer<typeof UpsertApprovalRule>;

export const NotificationPreferences = z.object({
  preferences: z.array(z.object({ kind: NotificationCategory, inApp: z.boolean() })).max(20),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferences>;

// ── Approvals (ADR-0010) ──────────────────────────────────────────────────────

export const ApprovalInboxQuery = z.object({
  scope: z.enum(['waiting', 'requested', 'all']).default('waiting'),
  subject: ApprovalSubject.optional(),
});
export type ApprovalInboxQuery = z.infer<typeof ApprovalInboxQuery>;

export const DecideApproval = z
  .object({ decision: z.enum(['APPROVE', 'REJECT']), reason: optionalText(500) })
  .refine((v) => v.decision === 'APPROVE' || !!v.reason, {
    message: 'Give a reason so the requester knows what to change.',
    path: ['reason'],
  });
export type DecideApproval = z.infer<typeof DecideApproval>;

// ── Vendors ───────────────────────────────────────────────────────────────────

export const CreateVendor = z.object({
  name: text(120),
  category: VendorCategory,
  contactName: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  city: optionalText(80),
  notes: optionalText(1000),
});
export type CreateVendor = z.infer<typeof CreateVendor>;

export const UpdateVendor = CreateVendor.partial().extend({ isActive: z.boolean().optional() });
export type UpdateVendor = z.infer<typeof UpdateVendor>;

// ── Expenses ──────────────────────────────────────────────────────────────────

export const CreateExpense = z.object({
  title: text(120),
  category: FinanceCategory,
  amount: rupees(1),
  incurredOn: date,
  projectId: optionalId,
  vendorId: optionalId,
  notes: optionalText(1000),
  /** Submit for approval immediately instead of saving a draft. */
  submit: z.boolean().default(true),
});
export type CreateExpense = z.infer<typeof CreateExpense>;

export const UpdateExpense = CreateExpense.omit({ submit: true }).partial();
export type UpdateExpense = z.infer<typeof UpdateExpense>;

export const ExpenseListQuery = z.object({
  status: ExpenseStatus.optional(),
  projectId: Id.optional(),
  mine: queryBool,
});
export type ExpenseListQuery = z.infer<typeof ExpenseListQuery>;

// ── Invoices & payments (ADR-0011) ────────────────────────────────────────────

export const InvoiceLineInput = z.object({
  description: text(200),
  quantity,
  unitPrice: rupees(),
});
export type InvoiceLineInput = z.infer<typeof InvoiceLineInput>;

const taxPercent = z.coerce.number().int().min(0).max(40);
const invoiceLines = z
  .array(InvoiceLineInput)
  .min(1, 'Add at least one line')
  .max(50)
  .refine((lines) => lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0) <= MAX_TOTAL, {
    message: 'The invoice total is too large.',
  });

/** No defaults here: a partial update must not silently reset an absent field. */
const invoiceFields = z.object({
  clientId: Id,
  projectId: optionalId,
  milestoneId: optionalId,
  issueDate: date,
  dueDate: date,
  taxPercent,
  notes: optionalText(1000),
  lines: invoiceLines,
});

export const CreateInvoice = invoiceFields
  .extend({ taxPercent: taxPercent.default(0) })
  .refine((v) => v.dueDate >= v.issueDate, {
    message: 'The due date cannot be before the issue date.',
    path: ['dueDate'],
  });
export type CreateInvoice = z.infer<typeof CreateInvoice>;

export const UpdateInvoice = invoiceFields.partial();
export type UpdateInvoice = z.infer<typeof UpdateInvoice>;

export const InvoiceListQuery = z.object({
  status: InvoiceStatus.optional(),
  clientId: Id.optional(),
  projectId: Id.optional(),
  overdue: queryBool,
});
export type InvoiceListQuery = z.infer<typeof InvoiceListQuery>;

export const RecordPayment = z.object({
  amount: rupees(1),
  receivedOn: date,
  method: PaymentMethod,
  reference: optionalText(80),
});
export type RecordPayment = z.infer<typeof RecordPayment>;

export const VoidInvoice = z.object({ reason: text(300) });
export type VoidInvoice = z.infer<typeof VoidInvoice>;

// ── Procurement ───────────────────────────────────────────────────────────────

export const PurchaseItemInput = z.object({
  description: text(200),
  quantity,
  estimatedUnitCost: rupees(1),
  stockItemId: optionalId,
});

export const CreatePurchaseRequest = z.object({
  title: text(120),
  justification: optionalText(1000),
  projectId: optionalId,
  neededBy: optionalDate,
  items: z
    .array(PurchaseItemInput)
    .min(1, 'Add at least one item')
    .max(30)
    .refine(
      (items) => items.reduce((n, i) => n + i.quantity * i.estimatedUnitCost, 0) <= MAX_TOTAL,
      {
        message: 'The request total is too large.',
      },
    ),
  submit: z.boolean().default(true),
});
export type CreatePurchaseRequest = z.infer<typeof CreatePurchaseRequest>;

export const PurchaseRequestListQuery = z.object({ status: PurchaseRequestStatus.optional() });
export type PurchaseRequestListQuery = z.infer<typeof PurchaseRequestListQuery>;

export const AddQuote = z.object({
  vendorId: Id,
  amount: rupees(1),
  validUntil: optionalDate,
  notes: optionalText(500),
});
export type AddQuote = z.infer<typeof AddQuote>;

export const CreatePurchaseOrder = z.object({
  requestId: Id,
  /** Defaults to the vendor of the selected quotation. */
  vendorId: optionalId,
  expectedOn: optionalDate,
  notes: optionalText(500),
});
export type CreatePurchaseOrder = z.infer<typeof CreatePurchaseOrder>;

export const ReceiveOrder = z.object({
  lines: z
    .array(z.object({ lineId: Id, quantity: z.coerce.number().int().min(0).max(100_000) }))
    .min(1)
    .max(50),
  /** Raise the vendor bill as an expense once everything has arrived. */
  createBill: z.boolean().default(true),
});
export type ReceiveOrder = z.infer<typeof ReceiveOrder>;

// ── Inventory ─────────────────────────────────────────────────────────────────

export const CreateStockItem = z.object({
  sku: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{3,30}$/, 'Use capitals, digits and dashes'),
  name: text(120),
  category: StockCategory,
  unit: text(20),
  onHand: z.coerce.number().int().min(0).max(100_000).default(0),
  reorderLevel: z.coerce.number().int().min(0).max(100_000),
  location: StudioLocation,
  unitCost: rupees(),
  notes: optionalText(500),
});
export type CreateStockItem = z.infer<typeof CreateStockItem>;

export const UpdateStockItem = CreateStockItem.omit({ sku: true, onHand: true }).partial();
export type UpdateStockItem = z.infer<typeof UpdateStockItem>;

export const StockMovementRequest = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ISSUED'),
    quantity,
    projectId: optionalId,
    note: optionalText(300),
  }),
  z.object({
    type: z.literal('RETURNED'),
    quantity,
    projectId: optionalId,
    note: optionalText(300),
  }),
  z.object({
    type: z.literal('ADJUSTED'),
    countedOnHand: z.coerce.number().int().min(0).max(100_000),
    note: text(300),
  }),
]);
export type StockMovementRequest = z.infer<typeof StockMovementRequest>;

export const UpdateAssetDetails = z
  .object({
    condition: AssetCondition,
    custodianId: Id.nullable(),
    notes: optionalText(300),
  })
  .partial();
export type UpdateAssetDetails = z.infer<typeof UpdateAssetDetails>;

export const LogMaintenance = z
  .object({
    kind: MaintenanceKind,
    description: text(300),
    cost: rupees().optional(),
    vendorId: optionalId,
    startedOn: date,
    completedOn: optionalDate,
    /** Mark the asset unavailable while the work is open. */
    takeOutOfService: z.boolean().default(false),
  })
  .refine((v) => !v.completedOn || v.completedOn >= v.startedOn, {
    message: 'Completion cannot be before the start.',
    path: ['completedOn'],
  });
export type LogMaintenance = z.infer<typeof LogMaintenance>;

// ── HR ────────────────────────────────────────────────────────────────────────

export const UpsertDepartment = z.object({
  name: text(60),
  description: optionalText(300),
  leadId: Id.nullable().optional(),
});
export type UpsertDepartment = z.infer<typeof UpsertDepartment>;

export const UpdateEmployment = z
  .object({
    title: text(80),
    departmentId: Id.nullable(),
    employmentType: EmploymentType,
    joinedOn: date.nullable(),
    weeklyCapacityHours: z.coerce.number().int().min(0).max(80),
  })
  .partial();
export type UpdateEmployment = z.infer<typeof UpdateEmployment>;

export const UpsertEmployeeRecord = z.object({
  phone: optionalText(40),
  emergencyContact: optionalText(160),
  address: optionalText(300),
  notes: optionalText(1000),
});
export type UpsertEmployeeRecord = z.infer<typeof UpsertEmployeeRecord>;

export const CreateLeave = z
  .object({
    /** Defaults to the requester's own team profile. */
    teamMemberId: optionalId,
    type: LeaveType,
    startDate: date,
    endDate: date,
    reason: optionalText(500),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'The leave cannot end before it starts.',
    path: ['endDate'],
  })
  .refine((v) => v.endDate.getTime() - v.startDate.getTime() <= 59 * 86_400_000, {
    message: 'Request at most 60 days at a time.',
    path: ['endDate'],
  });
export type CreateLeave = z.infer<typeof CreateLeave>;

export const RecordAttendance = z
  .object({
    teamMemberId: optionalId,
    date,
    status: AttendanceStatus,
    checkIn: optionalDate,
    checkOut: optionalDate,
    note: optionalText(300),
  })
  .refine((v) => !v.checkIn || !v.checkOut || v.checkOut > v.checkIn, {
    message: 'Check-out must be after check-in.',
    path: ['checkOut'],
  });
export type RecordAttendance = z.infer<typeof RecordAttendance>;

export const AttendanceQuery = z.object({ from: date.optional(), to: date.optional() });
export type AttendanceQuery = z.infer<typeof AttendanceQuery>;

// ── Studios ───────────────────────────────────────────────────────────────────

export const CreateStudioBooking = z
  .object({
    studioId: Id,
    title: text(120),
    projectId: optionalId,
    shootId: optionalId,
    startsAt: date,
    endsAt: date,
    status: StudioBookingStatus.exclude(['CANCELLED']).default('CONFIRMED'),
    notes: optionalText(500),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'The booking must end after it starts.',
    path: ['endsAt'],
  })
  .refine((v) => v.endsAt.getTime() - v.startsAt.getTime() <= 72 * 3_600_000, {
    message: 'Book at most 72 hours at a time.',
    path: ['endsAt'],
  });
export type CreateStudioBooking = z.infer<typeof CreateStudioBooking>;

export const UpdateStudioBooking = z
  .object({
    status: StudioBookingStatus,
    startsAt: date,
    endsAt: date,
    notes: optionalText(500),
  })
  .partial();
export type UpdateStudioBooking = z.infer<typeof UpdateStudioBooking>;

// ── Documents (ADR-0012) ──────────────────────────────────────────────────────

/** Multipart form fields sent with an upload (all strings on the wire). */
export const CreateDocument = z.object({
  title: text(160),
  category: DocumentCategory,
  description: optionalText(1000),
  confidential: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(false),
  projectId: optionalId,
  clientId: optionalId,
  leadId: optionalId,
  vendorId: optionalId,
  teamMemberId: optionalId,
  invoiceId: optionalId,
  expenseId: optionalId,
  purchaseOrderId: optionalId,
  note: optionalText(300),
});
export type CreateDocument = z.infer<typeof CreateDocument>;

export const NewDocumentVersion = z.object({ note: optionalText(300) });
export type NewDocumentVersion = z.infer<typeof NewDocumentVersion>;

export const DocumentListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: DocumentCategory.optional(),
  projectId: Id.optional(),
  clientId: Id.optional(),
  leadId: Id.optional(),
  vendorId: Id.optional(),
  teamMemberId: Id.optional(),
  invoiceId: Id.optional(),
  expenseId: Id.optional(),
  purchaseOrderId: Id.optional(),
});
export type DocumentListQuery = z.infer<typeof DocumentListQuery>;

// ── CRM ───────────────────────────────────────────────────────────────────────

export const CreateContact = z.object({
  name: text(120),
  role: optionalText(80),
  email: optionalEmail,
  phone: optionalText(40),
  isPrimary: z.boolean().default(false),
});
export type CreateContact = z.infer<typeof CreateContact>;

export const UpdateLeadOwnership = z
  .object({
    ownerId: Id.nullable(),
    nextFollowUpAt: date.nullable(),
    lostReason: optionalText(300),
  })
  .partial();
export type UpdateLeadOwnership = z.infer<typeof UpdateLeadOwnership>;

/** Converts a won lead into a project (and a client, for a prospect). */
export const ConvertLead = z
  .object({
    /** Required when the lead is a prospect with no client yet. */
    newClient: z
      .object({ industry: text(80), city: text(80), contactEmail: optionalEmail })
      .optional(),
    title: text(120),
    type: ProjectType,
    workflowTemplateId: Id,
    priority: Priority.default('MEDIUM'),
    location: StudioLocation,
    startDate: date,
    dueDate: date,
    budget: rupees(),
  })
  .refine((v) => v.dueDate > v.startDate, {
    message: 'The due date must be after the start date.',
    path: ['dueDate'],
  });
export type ConvertLead = z.infer<typeof ConvertLead>;

// ── Projects ──────────────────────────────────────────────────────────────────

export const CreateMilestone = z.object({
  title: text(120),
  dueDate: date,
  billingAmount: rupees().optional(),
});
export type CreateMilestone = z.infer<typeof CreateMilestone>;

export const UpdateMilestone = z
  .object({ title: text(120), dueDate: date, completed: z.boolean() })
  .partial();
export type UpdateMilestone = z.infer<typeof UpdateMilestone>;

export const UpsertRisk = z.object({
  title: text(160),
  likelihood: RiskLevel,
  impact: RiskLevel,
  mitigation: optionalText(500),
  status: RiskStatus.default('OPEN'),
  ownerId: optionalId,
});
export type UpsertRisk = z.infer<typeof UpsertRisk>;
