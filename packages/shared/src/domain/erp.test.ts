import { describe, expect, it } from 'vitest';
import {
  ageingBucket,
  cannotDecide,
  endOfDueDay,
  invoiceStatusAfterPayments,
  invoiceTotals,
  isInvoiceOverdue,
  leaveDays,
  leaveOverlaps,
  nextNumber,
  orderStatusFromLines,
  planApprovalSteps,
  receivablesAgeing,
  riskScore,
  stockLevel,
  type ApprovalRuleInput,
} from './erp';

const rule = (r: Partial<ApprovalRuleInput>): ApprovalRuleInput => ({
  subject: 'EXPENSE',
  name: 'Manager',
  minAmount: 0,
  stepOrder: 1,
  permission: 'expense:approve',
  isActive: true,
  ...r,
});

describe('planApprovalSteps', () => {
  const rules = [
    rule({ name: 'Production manager', stepOrder: 1 }),
    rule({ name: 'Finance', stepOrder: 2, minAmount: 50_000, permission: 'finance:write' }),
    rule({ subject: 'LEAVE', name: 'HR', permission: 'leave:approve' }),
  ];

  it('adds steps whose threshold the amount meets, in order', () => {
    expect(planApprovalSteps(rules, 'EXPENSE', 12_000).map((s) => s.label)).toEqual([
      'Production manager',
    ]);
    expect(planApprovalSteps(rules, 'EXPENSE', 80_000)).toEqual([
      { order: 1, label: 'Production manager', permission: 'expense:approve' },
      { order: 2, label: 'Finance', permission: 'finance:write' },
    ]);
  });

  it('falls back to one default step when no rule matches', () => {
    expect(planApprovalSteps([], 'PURCHASE_REQUEST', 1000)).toEqual([
      { order: 1, label: 'Approval', permission: 'procurement:approve' },
    ]);
  });

  it('ignores inactive rules and keeps the stricter rule on a shared step', () => {
    const steps = planApprovalSteps(
      [
        rule({ name: 'Any manager', stepOrder: 1 }),
        rule({ name: 'Senior', stepOrder: 1, minAmount: 10_000, permission: 'finance:write' }),
        rule({ name: 'Off', stepOrder: 2, isActive: false }),
      ],
      'EXPENSE',
      20_000,
    );
    expect(steps).toEqual([{ order: 1, label: 'Senior', permission: 'finance:write' }]);
  });
});

describe('cannotDecide', () => {
  const base = {
    stepPermission: 'expense:approve',
    stepStatus: 'PENDING',
    userPermissions: ['expense:approve'],
    userId: 'u2',
    ownerIds: ['u1'],
  };
  it('allows an eligible approver', () => expect(cannotDecide(base)).toBeNull());
  it('blocks self-approval', () =>
    expect(cannotDecide({ ...base, userId: 'u1' })).toMatch(/own request/));
  it('blocks the owner of the subject even when someone else opened it', () =>
    expect(cannotDecide({ ...base, ownerIds: ['u9', 'u2'] })).toMatch(/own request/));
  it('blocks one person from deciding consecutive steps', () =>
    expect(cannotDecide({ ...base, priorDeciderIds: ['u2'] })).toMatch(/earlier one/));
  it('blocks a missing permission', () =>
    expect(cannotDecide({ ...base, userPermissions: [] })).toMatch(/role/));
  it('blocks a step that is not pending', () =>
    expect(cannotDecide({ ...base, stepStatus: 'WAITING' })).toMatch(/not waiting/));
});

describe('invoices', () => {
  it('computes totals with rounded tax', () => {
    expect(
      invoiceTotals(
        [
          { quantity: 1, unitPrice: 100_000 },
          { quantity: 3, unitPrice: 15_333 },
        ],
        18,
      ),
    ).toEqual({ subtotal: 145_999, tax: 26_280, total: 172_279 });
  });

  it('derives status from payments', () => {
    expect(invoiceStatusAfterPayments('SENT', 1000, 0)).toBe('SENT');
    expect(invoiceStatusAfterPayments('SENT', 1000, 400)).toBe('PARTIALLY_PAID');
    expect(invoiceStatusAfterPayments('PARTIALLY_PAID', 1000, 1000)).toBe('PAID');
    expect(invoiceStatusAfterPayments('DRAFT', 1000, 0)).toBe('DRAFT');
    expect(invoiceStatusAfterPayments('VOID', 1000, 1000)).toBe('VOID');
  });

  it('computes overdue and ageing from the due date', () => {
    const now = new Date('2026-06-30T12:00:00Z');
    expect(isInvoiceOverdue({ status: 'SENT', dueDate: '2026-06-01T00:00:00Z' }, now)).toBe(true);
    expect(isInvoiceOverdue({ status: 'PAID', dueDate: '2026-06-01T00:00:00Z' }, now)).toBe(false);
    expect(ageingBucket('2026-07-10T00:00:00Z', now)).toBe('CURRENT');
    expect(ageingBucket('2026-06-20T00:00:00Z', now)).toBe('D1_30');
    expect(ageingBucket('2026-03-01T00:00:00Z', now)).toBe('D90_PLUS');
    const ageing = receivablesAgeing(
      [
        { status: 'SENT', dueDate: '2026-06-20T00:00:00Z', total: 1000, paid: 0 },
        { status: 'PARTIALLY_PAID', dueDate: '2026-05-15T00:00:00Z', total: 1000, paid: 600 },
        { status: 'PAID', dueDate: '2026-05-15T00:00:00Z', total: 1000, paid: 1000 },
      ],
      now,
    );
    expect(ageing).toMatchObject({ D1_30: 1000, D31_60: 400, CURRENT: 0 });
  });

  it('is not overdue until the due day has ended in India', () => {
    // Due 22 Jun (IST). 23:00 IST on the due day is 17:30 UTC.
    const due = '2026-06-21T18:30:00Z'; // 22 Jun 00:00 IST
    expect(
      isInvoiceOverdue({ status: 'SENT', dueDate: due }, new Date('2026-06-22T17:30:00Z')),
    ).toBe(false);
    expect(
      isInvoiceOverdue({ status: 'SENT', dueDate: due }, new Date('2026-06-22T18:31:00Z')),
    ).toBe(true);
    expect(endOfDueDay(due).toISOString()).toBe('2026-06-22T18:30:00.000Z');
  });

  it('numbers documents sequentially', () => {
    expect(nextNumber('EXP-', 'EXP-0041')).toBe('EXP-0042');
    expect(nextNumber('EXP-', null)).toBe('EXP-0001');
    expect(nextNumber('NM-INV-2026-', 'NM-INV-2026-009', 3)).toBe('NM-INV-2026-010');
  });
});

describe('people and stock', () => {
  it('counts leave days inclusively', () => {
    expect(leaveDays('2026-07-01', '2026-07-01')).toBe(1);
    expect(leaveDays('2026-07-01', '2026-07-05')).toBe(5);
  });

  it('detects leave overlapping a shoot', () => {
    const leave = { startDate: '2026-07-03', endDate: '2026-07-04' };
    expect(
      leaveOverlaps(leave, { startsAt: '2026-07-04T06:00:00Z', endsAt: '2026-07-04T18:00:00Z' }),
    ).toBe(true);
    expect(
      leaveOverlaps(leave, { startsAt: '2026-07-05T06:00:00Z', endsAt: '2026-07-05T18:00:00Z' }),
    ).toBe(false);
  });

  it('classifies stock levels and purchase-order receipt', () => {
    expect(stockLevel(0, 5)).toBe('OUT');
    expect(stockLevel(5, 5)).toBe('LOW');
    expect(stockLevel(6, 5)).toBe('OK');
    expect(orderStatusFromLines([{ quantity: 4, receivedQty: 0 }])).toBe('ISSUED');
    expect(
      orderStatusFromLines([
        { quantity: 4, receivedQty: 4 },
        { quantity: 2, receivedQty: 1 },
      ]),
    ).toBe('PARTIALLY_RECEIVED');
    expect(orderStatusFromLines([{ quantity: 4, receivedQty: 4 }])).toBe('RECEIVED');
  });

  it('scores risks', () => {
    expect(riskScore('HIGH', 'HIGH')).toBe(9);
    expect(riskScore('LOW', 'MEDIUM')).toBe(2);
  });
});
