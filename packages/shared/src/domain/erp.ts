/**
 * Pure business rules for the ERP expansion. Used by the API (authoritative) and by web forms
 * (previews), and unit-tested in erp.test.ts.
 */
import { DEFAULT_APPROVER_PERMISSION, type ApprovalSubject } from '../constants/erp-enums';
import { DAY_MS } from './time';

// ── Approval chains (ADR-0010) ────────────────────────────────────────────────

export interface ApprovalRuleInput {
  subject: ApprovalSubject;
  name: string;
  minAmount: number;
  stepOrder: number;
  permission: string;
  isActive: boolean;
}

export interface PlannedStep {
  order: number;
  label: string;
  permission: string;
}

/**
 * The approval steps a subject needs: every active rule for the subject whose threshold the amount
 * meets, ordered by step. Two rules on the same step keep the stricter (higher threshold) one.
 * With no matching rule, a single default step is required — nothing is ever auto-approved.
 */
export function planApprovalSteps(
  rules: readonly ApprovalRuleInput[],
  subject: ApprovalSubject,
  amount: number | null,
): PlannedStep[] {
  const value = amount ?? 0;
  const byStep = new Map<number, ApprovalRuleInput>();
  for (const r of rules) {
    if (!r.isActive || r.subject !== subject || value < r.minAmount) continue;
    const existing = byStep.get(r.stepOrder);
    if (!existing || r.minAmount > existing.minAmount) byStep.set(r.stepOrder, r);
  }
  const planned = [...byStep.values()]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((r, i) => ({ order: i + 1, label: r.name, permission: r.permission }));
  return planned.length > 0
    ? planned
    : [{ order: 1, label: 'Approval', permission: DEFAULT_APPROVER_PERMISSION[subject] }];
}

/** Why a user may not decide a step, or null when they may. */
export function cannotDecide(input: {
  stepPermission: string;
  stepStatus: string;
  userPermissions: readonly string[];
  userId: string;
  /** Everyone the request is for or from: who opened it and who owns the subject. */
  ownerIds: readonly (string | null | undefined)[];
  /** People who already decided an earlier step of the same request. */
  priorDeciderIds?: readonly (string | null | undefined)[];
}): string | null {
  if (input.stepStatus !== 'PENDING') return 'This step is not waiting for a decision.';
  if (input.ownerIds.includes(input.userId)) return 'You cannot approve your own request.';
  if (input.priorDeciderIds?.includes(input.userId))
    return 'Another approver must decide this step; you approved an earlier one.';
  if (!input.userPermissions.includes(input.stepPermission))
    return 'Your role cannot decide this step.';
  return null;
}

// ── Invoices & receivables (ADR-0011) ─────────────────────────────────────────

export interface LineInput {
  quantity: number;
  unitPrice: number;
}

/** Subtotal, tax and total in whole rupees. Tax rounds half up. */
export function invoiceTotals(lines: readonly LineInput[], taxPercent: number) {
  const subtotal = lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
  const tax = Math.round((subtotal * taxPercent) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export type StoredInvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';

/** Invoice status after payments change. Drafts and voided invoices keep their status. */
export function invoiceStatusAfterPayments(
  current: StoredInvoiceStatus,
  total: number,
  paid: number,
): StoredInvoiceStatus {
  if (current === 'DRAFT' || current === 'VOID') return current;
  if (paid <= 0) return 'SENT';
  return paid >= total ? 'PAID' : 'PARTIALLY_PAID';
}

/** Open invoices past their due date. Overdue is computed, never stored. */
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * The end of the due date as the studio sees it (midnight after the due day, India Standard Time,
 * which has no daylight saving). An invoice due today is not overdue until the day is over.
 */
export function endOfDueDay(due: Date | string): Date {
  const local = new Date(new Date(due).getTime() + IST_OFFSET_MS);
  const nextMidnightLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 1,
  );
  return new Date(nextMidnightLocal - IST_OFFSET_MS);
}

/** Whole days past the end of the due day (0 while it is still the due day or earlier). */
export function daysPastDue(due: Date | string, now: Date): number {
  const late = now.getTime() - endOfDueDay(due).getTime();
  return late >= 0 ? Math.floor(late / DAY_MS) + 1 : 0;
}

export function isInvoiceOverdue(
  inv: { status: StoredInvoiceStatus; dueDate: Date | string },
  now: Date,
): boolean {
  return (
    (inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID') && daysPastDue(inv.dueDate, now) > 0
  );
}

export const AGEING_BUCKETS = ['CURRENT', 'D1_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export const AGEING_LABELS: Record<AgeingBucket, string> = {
  CURRENT: 'Not yet due',
  D1_30: '1–30 days',
  D31_60: '31–60 days',
  D61_90: '61–90 days',
  D90_PLUS: '90+ days',
};

export function ageingBucket(dueDate: Date | string, now: Date): AgeingBucket {
  const late = daysPastDue(dueDate, now);
  if (late <= 0) return 'CURRENT';
  if (late <= 30) return 'D1_30';
  if (late <= 60) return 'D31_60';
  if (late <= 90) return 'D61_90';
  return 'D90_PLUS';
}

/** Outstanding receivables per ageing bucket. */
export function receivablesAgeing(
  invoices: readonly {
    status: StoredInvoiceStatus;
    dueDate: Date | string;
    total: number;
    paid: number;
  }[],
  now: Date,
): Record<AgeingBucket, number> {
  const out = Object.fromEntries(AGEING_BUCKETS.map((b) => [b, 0])) as Record<AgeingBucket, number>;
  for (const inv of invoices) {
    if (inv.status !== 'SENT' && inv.status !== 'PARTIALLY_PAID') continue;
    out[ageingBucket(inv.dueDate, now)] += Math.max(0, inv.total - inv.paid);
  }
  return out;
}

// ── Numbering ─────────────────────────────────────────────────────────────────

/** Next document number in a sequence, e.g. nextNumber('EXP-', 'EXP-0041') → 'EXP-0042'. */
export function nextNumber(prefix: string, last: string | null | undefined, width = 4): string {
  const n = last?.startsWith(prefix) ? Number.parseInt(last.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(n) ? n : 0) + 1).padStart(width, '0')}`;
}

// ── People ────────────────────────────────────────────────────────────────────

const dayStart = (d: Date | string) => {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};

/** Calendar days covered by a leave request, inclusive of both ends. */
export function leaveDays(start: Date | string, end: Date | string): number {
  return Math.floor((dayStart(end) - dayStart(start)) / DAY_MS) + 1;
}

/** True when a leave period [start, end] (whole days) touches the time range. */
export function leaveOverlaps(
  leave: { startDate: Date | string; endDate: Date | string },
  range: { startsAt: Date | string; endsAt: Date | string },
): boolean {
  const leaveFrom = dayStart(leave.startDate);
  const leaveTo = dayStart(leave.endDate) + DAY_MS;
  return (
    leaveFrom < new Date(range.endsAt).getTime() && new Date(range.startsAt).getTime() < leaveTo
  );
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export type StockLevel = 'OUT' | 'LOW' | 'OK';

export function stockLevel(onHand: number, reorderLevel: number): StockLevel {
  if (onHand <= 0) return 'OUT';
  if (onHand <= reorderLevel) return 'LOW';
  return 'OK';
}

/** Purchase-order status from the received quantities of its lines. */
export function orderStatusFromLines(
  lines: readonly { quantity: number; receivedQty: number }[],
): 'ISSUED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' {
  const received = lines.reduce((n, l) => n + l.receivedQty, 0);
  if (received === 0) return 'ISSUED';
  return lines.every((l) => l.receivedQty >= l.quantity) ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
}

// ── Projects ──────────────────────────────────────────────────────────────────

const RISK_SCORE = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;

/** Likelihood × impact on a 1–9 scale. */
export function riskScore(likelihood: keyof typeof RISK_SCORE, impact: keyof typeof RISK_SCORE) {
  return RISK_SCORE[likelihood] * RISK_SCORE[impact];
}
