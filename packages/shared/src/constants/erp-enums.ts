/**
 * Enumerations for the ERP expansion (finance, procurement, inventory, HR, studios, documents,
 * approvals). Each list mirrors the Prisma enum of the same name.
 */
import { z } from 'zod';

const labels = <const T extends readonly string[]>(_values: T, map: Record<T[number], string>) =>
  map;

// ── Approvals (ADR-0010) ──────────────────────────────────────────────────────

export const APPROVAL_SUBJECTS = ['EXPENSE', 'PURCHASE_REQUEST', 'LEAVE'] as const;
export const ApprovalSubject = z.enum(APPROVAL_SUBJECTS);
export type ApprovalSubject = z.infer<typeof ApprovalSubject>;
export const APPROVAL_SUBJECT_LABELS = labels(APPROVAL_SUBJECTS, {
  EXPENSE: 'Expense',
  PURCHASE_REQUEST: 'Purchase request',
  LEAVE: 'Leave',
});
/** Permission an approver needs when no rule matches a subject. */
export const DEFAULT_APPROVER_PERMISSION = {
  EXPENSE: 'expense:approve',
  PURCHASE_REQUEST: 'procurement:approve',
  LEAVE: 'leave:approve',
} as const satisfies Record<ApprovalSubject, string>;

export const APPROVAL_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export const ApprovalRequestStatus = z.enum(APPROVAL_REQUEST_STATUSES);
export type ApprovalRequestStatus = z.infer<typeof ApprovalRequestStatus>;

export const APPROVAL_STEP_STATUSES = [
  'WAITING',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SKIPPED',
] as const;
export const ApprovalStepStatus = z.enum(APPROVAL_STEP_STATUSES);
export type ApprovalStepStatus = z.infer<typeof ApprovalStepStatus>;

// ── Finance ───────────────────────────────────────────────────────────────────

export const EXPENSE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'] as const;
export const ExpenseStatus = z.enum(EXPENSE_STATUSES);
export type ExpenseStatus = z.infer<typeof ExpenseStatus>;

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const;
export const InvoiceStatus = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const PAYMENT_METHODS = ['BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'CASH'] as const;
export const PaymentMethod = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof PaymentMethod>;
export const PAYMENT_METHOD_LABELS = labels(PAYMENT_METHODS, {
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CARD: 'Card',
  CHEQUE: 'Cheque',
  CASH: 'Cash',
});

export const VENDOR_CATEGORIES = [
  'EQUIPMENT_RENTAL',
  'FREELANCE_CREW',
  'LOCATION',
  'CATERING',
  'TRANSPORT',
  'POST_PRODUCTION',
  'SOFTWARE',
  'SUPPLIES',
  'OTHER',
] as const;
export const VendorCategory = z.enum(VENDOR_CATEGORIES);
export type VendorCategory = z.infer<typeof VendorCategory>;

// ── Procurement & inventory ───────────────────────────────────────────────────

export const PURCHASE_REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ORDERED',
  'CANCELLED',
] as const;
export const PurchaseRequestStatus = z.enum(PURCHASE_REQUEST_STATUSES);
export type PurchaseRequestStatus = z.infer<typeof PurchaseRequestStatus>;

export const PURCHASE_ORDER_STATUSES = [
  'ISSUED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export const PurchaseOrderStatus = z.enum(PURCHASE_ORDER_STATUSES);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus>;

export const STOCK_CATEGORIES = [
  'MEDIA',
  'BATTERIES',
  'LIGHTING_SUPPLIES',
  'GRIP_SUPPLIES',
  'CABLES',
  'CLEANING',
  'PROPS',
  'OFFICE',
] as const;
export const StockCategory = z.enum(STOCK_CATEGORIES);
export type StockCategory = z.infer<typeof StockCategory>;

export const STOCK_MOVEMENT_TYPES = ['RECEIVED', 'ISSUED', 'RETURNED', 'ADJUSTED'] as const;
export const StockMovementType = z.enum(STOCK_MOVEMENT_TYPES);
export type StockMovementType = z.infer<typeof StockMovementType>;

export const ASSET_CONDITIONS = ['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR'] as const;
export const AssetCondition = z.enum(ASSET_CONDITIONS);
export type AssetCondition = z.infer<typeof AssetCondition>;

export const MAINTENANCE_KINDS = ['SERVICE', 'REPAIR', 'INSPECTION', 'CALIBRATION'] as const;
export const MaintenanceKind = z.enum(MAINTENANCE_KINDS);
export type MaintenanceKind = z.infer<typeof MaintenanceKind>;

// ── People ────────────────────────────────────────────────────────────────────

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'FREELANCE', 'INTERN'] as const;
export const EmploymentType = z.enum(EMPLOYMENT_TYPES);
export type EmploymentType = z.infer<typeof EmploymentType>;

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'COMP_OFF'] as const;
export const LeaveType = z.enum(LEAVE_TYPES);
export type LeaveType = z.infer<typeof LeaveType>;

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export const LeaveStatus = z.enum(LEAVE_STATUSES);
export type LeaveStatus = z.infer<typeof LeaveStatus>;

export const ATTENDANCE_STATUSES = [
  'PRESENT',
  'REMOTE',
  'ON_SHOOT',
  'HALF_DAY',
  'ABSENT',
  'ON_LEAVE',
] as const;
export const AttendanceStatus = z.enum(ATTENDANCE_STATUSES);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

// ── Studios ───────────────────────────────────────────────────────────────────

export const STUDIO_BOOKING_STATUSES = ['TENTATIVE', 'CONFIRMED', 'CANCELLED'] as const;
export const StudioBookingStatus = z.enum(STUDIO_BOOKING_STATUSES);
export type StudioBookingStatus = z.infer<typeof StudioBookingStatus>;

// ── Documents (ADR-0012) ──────────────────────────────────────────────────────

export const DOCUMENT_CATEGORIES = [
  'CONTRACT',
  'PROPOSAL',
  'BRIEF',
  'SCRIPT',
  'STORYBOARD',
  'INVOICE',
  'PURCHASE',
  'RECEIPT',
  'HR',
  'DELIVERY',
  'OTHER',
] as const;
export const DocumentCategory = z.enum(DOCUMENT_CATEGORIES);
export type DocumentCategory = z.infer<typeof DocumentCategory>;

/** Allowed upload types (ADR-0012). The API also checks each file's leading bytes. */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

// ── Projects ──────────────────────────────────────────────────────────────────

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const RiskLevel = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const RISK_STATUSES = ['OPEN', 'MITIGATED', 'CLOSED'] as const;
export const RiskStatus = z.enum(RISK_STATUSES);
export type RiskStatus = z.infer<typeof RiskStatus>;

// ── Notifications ─────────────────────────────────────────────────────────────

/** Notification categories a user can switch off (kind prefix before the first dot). */
export const NOTIFICATION_CATEGORIES = [
  'approval',
  'task',
  'project',
  'booking',
  'finance',
  'stock',
  'leave',
  'lead',
] as const;
export const NotificationCategory = z.enum(NOTIFICATION_CATEGORIES);
export type NotificationCategory = z.infer<typeof NotificationCategory>;
export const NOTIFICATION_CATEGORY_LABELS = labels(NOTIFICATION_CATEGORIES, {
  approval: 'Approvals waiting on me and decisions on my requests',
  task: 'Task assignments and blockers',
  project: 'Project deadlines and stage changes',
  booking: 'Scheduling and equipment conflicts',
  finance: 'Invoices and payments',
  stock: 'Low stock',
  leave: 'Leave and attendance',
  lead: 'Sales pipeline updates',
});
