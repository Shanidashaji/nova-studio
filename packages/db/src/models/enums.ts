// Generated once from the former Prisma schema; now maintained by hand.
// Enum values mirror packages/shared/src/constants/enums.ts.

export const StudioLocation = {
  KOZHIKODE: 'KOZHIKODE',
  CHENNAI: 'CHENNAI',
} as const;
export type StudioLocation = (typeof StudioLocation)[keyof typeof StudioLocation];

export const ClientStatus = {
  LEAD: 'LEAD',
  ACTIVE: 'ACTIVE',
  DORMANT: 'DORMANT',
} as const;
export type ClientStatus = (typeof ClientStatus)[keyof typeof ClientStatus];

export const InteractionType = {
  CALL: 'CALL',
  EMAIL: 'EMAIL',
  MEETING: 'MEETING',
  WHATSAPP: 'WHATSAPP',
  FEEDBACK: 'FEEDBACK',
} as const;
export type InteractionType = (typeof InteractionType)[keyof typeof InteractionType];

export const LeadStage = {
  INQUIRY: 'INQUIRY',
  DISCOVERY: 'DISCOVERY',
  PROPOSAL: 'PROPOSAL',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage];

export const LeadSource = {
  WEBSITE: 'WEBSITE',
  WHATSAPP: 'WHATSAPP',
  REFERRAL: 'REFERRAL',
  INSTAGRAM: 'INSTAGRAM',
  LINKEDIN: 'LINKEDIN',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const StageKey = {
  BRIEF: 'BRIEF',
  PRE_PRODUCTION: 'PRE_PRODUCTION',
  SHOOT: 'SHOOT',
  EDIT: 'EDIT',
  REVIEW: 'REVIEW',
  DELIVERY: 'DELIVERY',
} as const;
export type StageKey = (typeof StageKey)[keyof typeof StageKey];

export const ProjectType = {
  PRODUCT_VIDEO: 'PRODUCT_VIDEO',
  BRAND_FILM: 'BRAND_FILM',
  STORYTELLING_AD: 'STORYTELLING_AD',
  CORPORATE_VIDEO: 'CORPORATE_VIDEO',
  SOCIAL_REEL: 'SOCIAL_REEL',
  PRODUCT_DEMO: 'PRODUCT_DEMO',
  EXPLAINER: 'EXPLAINER',
  EVENT_COVERAGE: 'EVENT_COVERAGE',
  AERIAL: 'AERIAL',
  MOTION_GRAPHICS: 'MOTION_GRAPHICS',
  REAL_ESTATE: 'REAL_ESTATE',
  CAMPAIGN: 'CAMPAIGN',
  STUDIO_GREEN_SCREEN: 'STUDIO_GREEN_SCREEN',
  PODCAST: 'PODCAST',
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

export const ProjectStatus = {
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const StageStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE',
  SKIPPED: 'SKIPPED',
} as const;
export type StageStatus = (typeof StageStatus)[keyof typeof StageStatus];

export const TransitionDirection = {
  FORWARD: 'FORWARD',
  BACKWARD: 'BACKWARD',
} as const;
export type TransitionDirection = (typeof TransitionDirection)[keyof typeof TransitionDirection];

export const ActivitySource = {
  UI: 'UI',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
} as const;
export type ActivitySource = (typeof ActivitySource)[keyof typeof ActivitySource];

export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  IN_REVIEW: 'IN_REVIEW',
  DONE: 'DONE',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const DeliverableStatus = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  DELIVERED: 'DELIVERED',
} as const;
export type DeliverableStatus = (typeof DeliverableStatus)[keyof typeof DeliverableStatus];

export const FeedbackStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
} as const;
export type FeedbackStatus = (typeof FeedbackStatus)[keyof typeof FeedbackStatus];

export const ApprovalKind = {
  INTERNAL: 'INTERNAL',
  CLIENT: 'CLIENT',
} as const;
export type ApprovalKind = (typeof ApprovalKind)[keyof typeof ApprovalKind];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const ShootStatus = {
  PLANNED: 'PLANNED',
  CONFIRMED: 'CONFIRMED',
  WRAPPED: 'WRAPPED',
  CANCELLED: 'CANCELLED',
} as const;
export type ShootStatus = (typeof ShootStatus)[keyof typeof ShootStatus];

export const AssetCategory = {
  CAMERA: 'CAMERA',
  LENS: 'LENS',
  LIGHTING: 'LIGHTING',
  AUDIO: 'AUDIO',
  GRIP: 'GRIP',
  DRONE: 'DRONE',
  STORAGE: 'STORAGE',
  COMPUTE: 'COMPUTE',
} as const;
export type AssetCategory = (typeof AssetCategory)[keyof typeof AssetCategory];

export const AssetStatus = {
  AVAILABLE: 'AVAILABLE',
  MAINTENANCE: 'MAINTENANCE',
  RETIRED: 'RETIRED',
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const AssetCondition = {
  EXCELLENT: 'EXCELLENT',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  NEEDS_REPAIR: 'NEEDS_REPAIR',
} as const;
export type AssetCondition = (typeof AssetCondition)[keyof typeof AssetCondition];

export const MaintenanceKind = {
  SERVICE: 'SERVICE',
  REPAIR: 'REPAIR',
  INSPECTION: 'INSPECTION',
  CALIBRATION: 'CALIBRATION',
} as const;
export type MaintenanceKind = (typeof MaintenanceKind)[keyof typeof MaintenanceKind];

export const FinanceKind = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
} as const;
export type FinanceKind = (typeof FinanceKind)[keyof typeof FinanceKind];

export const FinanceCategory = {
  ADVANCE: 'ADVANCE',
  MILESTONE: 'MILESTONE',
  FINAL_PAYMENT: 'FINAL_PAYMENT',
  CREW: 'CREW',
  EQUIPMENT_RENTAL: 'EQUIPMENT_RENTAL',
  LOCATION: 'LOCATION',
  TRAVEL: 'TRAVEL',
  SOFTWARE: 'SOFTWARE',
  MARKETING: 'MARKETING',
  OVERHEAD: 'OVERHEAD',
  CONSUMABLES: 'CONSUMABLES',
  POST_PRODUCTION: 'POST_PRODUCTION',
  MAINTENANCE: 'MAINTENANCE',
} as const;
export type FinanceCategory = (typeof FinanceCategory)[keyof typeof FinanceCategory];

export const AssistantRole = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
} as const;
export type AssistantRole = (typeof AssistantRole)[keyof typeof AssistantRole];

export const AssistantActionStatus = {
  PROPOSED: 'PROPOSED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  STALE: 'STALE',
} as const;
export type AssistantActionStatus =
  (typeof AssistantActionStatus)[keyof typeof AssistantActionStatus];

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const RiskStatus = {
  OPEN: 'OPEN',
  MITIGATED: 'MITIGATED',
  CLOSED: 'CLOSED',
} as const;
export type RiskStatus = (typeof RiskStatus)[keyof typeof RiskStatus];

export const EmploymentType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  FREELANCE: 'FREELANCE',
  INTERN: 'INTERN',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

export const LeaveType = {
  ANNUAL: 'ANNUAL',
  SICK: 'SICK',
  CASUAL: 'CASUAL',
  UNPAID: 'UNPAID',
  COMP_OFF: 'COMP_OFF',
} as const;
export type LeaveType = (typeof LeaveType)[keyof typeof LeaveType];

export const LeaveStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type LeaveStatus = (typeof LeaveStatus)[keyof typeof LeaveStatus];

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  REMOTE: 'REMOTE',
  ON_SHOOT: 'ON_SHOOT',
  HALF_DAY: 'HALF_DAY',
  ABSENT: 'ABSENT',
  ON_LEAVE: 'ON_LEAVE',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const VendorCategory = {
  EQUIPMENT_RENTAL: 'EQUIPMENT_RENTAL',
  FREELANCE_CREW: 'FREELANCE_CREW',
  LOCATION: 'LOCATION',
  CATERING: 'CATERING',
  TRANSPORT: 'TRANSPORT',
  POST_PRODUCTION: 'POST_PRODUCTION',
  SOFTWARE: 'SOFTWARE',
  SUPPLIES: 'SUPPLIES',
  OTHER: 'OTHER',
} as const;
export type VendorCategory = (typeof VendorCategory)[keyof typeof VendorCategory];

export const ApprovalSubject = {
  EXPENSE: 'EXPENSE',
  PURCHASE_REQUEST: 'PURCHASE_REQUEST',
  LEAVE: 'LEAVE',
} as const;
export type ApprovalSubject = (typeof ApprovalSubject)[keyof typeof ApprovalSubject];

export const ApprovalRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type ApprovalRequestStatus =
  (typeof ApprovalRequestStatus)[keyof typeof ApprovalRequestStatus];

export const ApprovalStepStatus = {
  WAITING: 'WAITING',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SKIPPED: 'SKIPPED',
} as const;
export type ApprovalStepStatus = (typeof ApprovalStepStatus)[keyof typeof ApprovalStepStatus];

export const ExpenseStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAID: 'PAID',
} as const;
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentMethod = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  UPI: 'UPI',
  CARD: 'CARD',
  CHEQUE: 'CHEQUE',
  CASH: 'CASH',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PurchaseRequestStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ORDERED: 'ORDERED',
  CANCELLED: 'CANCELLED',
} as const;
export type PurchaseRequestStatus =
  (typeof PurchaseRequestStatus)[keyof typeof PurchaseRequestStatus];

export const PurchaseOrderStatus = {
  ISSUED: 'ISSUED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type PurchaseOrderStatus = (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const StockCategory = {
  MEDIA: 'MEDIA',
  BATTERIES: 'BATTERIES',
  LIGHTING_SUPPLIES: 'LIGHTING_SUPPLIES',
  GRIP_SUPPLIES: 'GRIP_SUPPLIES',
  CABLES: 'CABLES',
  CLEANING: 'CLEANING',
  PROPS: 'PROPS',
  OFFICE: 'OFFICE',
} as const;
export type StockCategory = (typeof StockCategory)[keyof typeof StockCategory];

export const StockMovementType = {
  RECEIVED: 'RECEIVED',
  ISSUED: 'ISSUED',
  RETURNED: 'RETURNED',
  ADJUSTED: 'ADJUSTED',
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

export const StudioBookingStatus = {
  TENTATIVE: 'TENTATIVE',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;
export type StudioBookingStatus = (typeof StudioBookingStatus)[keyof typeof StudioBookingStatus];

export const DocumentCategory = {
  CONTRACT: 'CONTRACT',
  PROPOSAL: 'PROPOSAL',
  BRIEF: 'BRIEF',
  SCRIPT: 'SCRIPT',
  STORYBOARD: 'STORYBOARD',
  INVOICE: 'INVOICE',
  PURCHASE: 'PURCHASE',
  RECEIPT: 'RECEIPT',
  HR: 'HR',
  DELIVERY: 'DELIVERY',
  OTHER: 'OTHER',
} as const;
export type DocumentCategory = (typeof DocumentCategory)[keyof typeof DocumentCategory];
