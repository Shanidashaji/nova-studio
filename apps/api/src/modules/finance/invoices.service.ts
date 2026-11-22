import { Injectable } from '@nestjs/common';
import type { FinanceCategory, Prisma } from '@nova/db';
import {
  daysOverdue,
  invoiceStatusAfterPayments,
  invoiceTotals,
  isInvoiceOverdue,
  receivablesAgeing,
  type CreateInvoice,
  type FinanceOverview,
  type InvoiceDetail,
  type InvoiceListQuery,
  type InvoiceSummary,
  type RecordPayment,
  type SessionUser,
  type UpdateInvoice,
  type VoidInvoice,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { allocateNumber } from '../../common/numbering';
import { PrismaService, type Db } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../activity/notifications.service';
import { iso, isoOrNull } from '../projects/project.mapper';

const summaryInclude = {
  client: { select: { id: true, name: true, accentColor: true } },
  project: { select: { id: true, code: true, title: true } },
  payments: { select: { amount: true } },
} satisfies Prisma.InvoiceInclude;

const detailInclude = {
  ...summaryInclude,
  milestone: { select: { id: true, title: true } },
  createdBy: { select: { id: true, name: true } },
  lines: { orderBy: { order: 'asc' } },
  payments: {
    orderBy: { receivedOn: 'asc' },
    include: { recordedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.InvoiceInclude;

type SummaryRow = Prisma.InvoiceGetPayload<{ include: typeof summaryInclude }>;

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function toSummary(i: SummaryRow, now: Date): InvoiceSummary {
  const paid = i.payments.reduce((n, p) => n + p.amount, 0);
  const overdue = isInvoiceOverdue(i, now);
  return {
    id: i.id,
    number: i.number,
    status: i.status,
    overdue,
    daysOverdue: overdue ? daysOverdue(i.dueDate, now) : 0,
    client: i.client,
    project: i.project,
    issueDate: iso(i.issueDate),
    dueDate: iso(i.dueDate),
    total: i.total,
    paid,
    balance: i.status === 'VOID' ? 0 : Math.max(0, i.total - paid),
  };
}

/**
 * Invoices and payments (ADR-0011): totals are computed on the server, status follows payments,
 * "overdue" is derived from the due date, and every payment posts one ledger entry.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q: InvoiceListQuery): Promise<InvoiceSummary[]> {
    const now = new Date();
    const rows = await this.prisma.db.invoice.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.clientId ? { clientId: q.clientId } : {}),
        ...(q.projectId ? { projectId: q.projectId } : {}),
        ...(q.overdue ? { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: now } } : {}),
      },
      include: summaryInclude,
      orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
      take: 300,
    });
    return rows.map((r) => toSummary(r, now));
  }

  async get(id: string): Promise<InvoiceDetail> {
    const i = await this.prisma.db.invoice.findUnique({ where: { id }, include: detailInclude });
    if (!i) throw notFound('Invoice');
    return {
      ...toSummary(i, new Date()),
      taxPercent: i.taxPercent,
      subtotal: i.subtotal,
      tax: i.tax,
      notes: i.notes,
      sentAt: isoOrNull(i.sentAt),
      milestone: i.milestone,
      createdBy: i.createdBy,
      lines: i.lines.map((l) => ({
        id: l.id,
        order: l.order,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.amount,
      })),
      payments: i.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        receivedOn: iso(p.receivedOn),
        method: p.method,
        reference: p.reference,
        recordedBy: p.recordedBy,
      })),
    };
  }

  private async validateLinks(
    db: Db,
    input: { clientId: string; projectId?: string; milestoneId?: string },
  ) {
    const client = await db.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw unprocessable('INVALID_CLIENT', 'Choose an existing client.');
    if (input.projectId) {
      const p = await db.project.findUnique({ where: { id: input.projectId } });
      if (!p || p.clientId !== input.clientId) {
        throw unprocessable('INVALID_PROJECT', 'That project does not belong to this client.');
      }
    }
    if (input.milestoneId) {
      const m = await db.milestone.findUnique({ where: { id: input.milestoneId } });
      if (!m || m.projectId !== input.projectId) {
        throw unprocessable('INVALID_MILESTONE', 'That milestone does not belong to the project.');
      }
    }
    return client;
  }

  private lineRows(lines: CreateInvoice['lines']) {
    return lines.map((l, i) => ({ ...l, order: i + 1, amount: l.quantity * l.unitPrice }));
  }

  async create(input: CreateInvoice, user: SessionUser): Promise<InvoiceDetail> {
    const client = await this.validateLinks(this.prisma.db, input);
    const totals = invoiceTotals(input.lines, input.taxPercent);
    const id = await this.activity.transaction(async (tx, log) => {
      const number = await allocateNumber(tx, 'invoice');
      const inv = await tx.invoice.create({
        data: {
          number,
          clientId: input.clientId,
          projectId: input.projectId ?? null,
          milestoneId: input.milestoneId ?? null,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          taxPercent: input.taxPercent,
          notes: input.notes,
          ...totals,
          createdById: user.id,
          lines: { create: this.lineRows(input.lines) },
        },
      });
      await log({
        actorId: user.id,
        action: 'invoice.created',
        entityType: 'invoice',
        entityId: inv.id,
        projectId: inv.projectId,
        summary: `${user.name} drafted invoice ${number} for ${client.name} (${rupees(totals.total)})`,
      });
      return inv.id;
    });
    return this.get(id);
  }

  async update(id: string, input: UpdateInvoice, user: SessionUser): Promise<InvoiceDetail> {
    const inv = await this.prisma.db.invoice.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!inv) throw notFound('Invoice');
    if (inv.status !== 'DRAFT') {
      throw conflict(
        'INVOICE_LOCKED',
        'Only draft invoices can be edited. Void and re-issue instead.',
      );
    }
    const merged = {
      clientId: input.clientId ?? inv.clientId,
      projectId: input.projectId === undefined ? (inv.projectId ?? undefined) : input.projectId,
      milestoneId:
        input.milestoneId === undefined ? (inv.milestoneId ?? undefined) : input.milestoneId,
    };
    await this.validateLinks(this.prisma.db, merged);
    const issueDate = input.issueDate ?? inv.issueDate;
    const dueDate = input.dueDate ?? inv.dueDate;
    if (dueDate < issueDate) {
      throw unprocessable('INVALID_DATES', 'The due date cannot be before the issue date.');
    }
    const taxPercent = input.taxPercent ?? inv.taxPercent;
    const lines = input.lines ?? inv.lines;
    const totals = invoiceTotals(lines, taxPercent);
    await this.activity.transaction(async (tx, log) => {
      // Re-check under a row lock: the invoice may have been sent since it was read.
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.invoice.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (current.status !== 'DRAFT') {
        throw conflict(
          'INVOICE_LOCKED',
          'Only draft invoices can be edited. Void and re-issue instead.',
        );
      }
      if (input.lines) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceLine.createMany({
          data: this.lineRows(input.lines).map((l) => ({ ...l, invoiceId: id })),
        });
      }
      await tx.invoice.update({
        where: { id },
        data: {
          clientId: merged.clientId,
          projectId: merged.projectId ?? null,
          milestoneId: merged.milestoneId ?? null,
          issueDate,
          dueDate,
          taxPercent,
          notes: input.notes ?? inv.notes,
          ...totals,
        },
      });
      await log({
        actorId: user.id,
        action: 'invoice.updated',
        entityType: 'invoice',
        entityId: id,
        projectId: merged.projectId ?? null,
        summary: `${user.name} edited draft invoice ${inv.number} (${rupees(totals.total)})`,
      });
    });
    return this.get(id);
  }

  async send(id: string, user: SessionUser): Promise<InvoiceDetail> {
    const inv = await this.prisma.db.invoice.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!inv) throw notFound('Invoice');
    if (inv.status !== 'DRAFT')
      throw conflict('INVOICE_NOT_DRAFT', 'This invoice was already sent.');
    if (inv.total <= 0) {
      throw unprocessable('ZERO_TOTAL', 'An invoice must have a total above ₹0 before it is sent.');
    }
    await this.activity.transaction(async (tx, log) => {
      // Guarded transition: a concurrent send or void cannot both succeed.
      const { count } = await tx.invoice.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'SENT', sentAt: new Date() },
      });
      if (count === 0) throw conflict('INVOICE_NOT_DRAFT', 'This invoice was already sent.');
      await log({
        actorId: user.id,
        action: 'invoice.sent',
        entityType: 'invoice',
        entityId: id,
        projectId: inv.projectId,
        summary: `${user.name} marked invoice ${inv.number} as sent to ${inv.client.name}`,
      });
    });
    return this.get(id);
  }

  /** Category of the ledger entry a payment posts: advance, milestone or final, by milestone order. */
  private async incomeCategory(tx: Db, milestoneId: string | null): Promise<FinanceCategory> {
    if (!milestoneId) return 'MILESTONE';
    const m = await tx.milestone.findUniqueOrThrow({ where: { id: milestoneId } });
    const all = await tx.milestone.findMany({
      where: { projectId: m.projectId },
      orderBy: { dueDate: 'asc' },
      select: { id: true },
    });
    if (all[0]?.id === m.id) return 'ADVANCE';
    if (all.at(-1)?.id === m.id) return 'FINAL_PAYMENT';
    return 'MILESTONE';
  }

  async recordPayment(id: string, input: RecordPayment, user: SessionUser): Promise<InvoiceDetail> {
    await this.activity.transaction(async (tx, log) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
      const inv = await tx.invoice.findUnique({
        where: { id },
        include: { payments: true, client: true },
      });
      if (!inv) throw notFound('Invoice');
      if (inv.status !== 'SENT' && inv.status !== 'PARTIALLY_PAID') {
        throw conflict('INVOICE_NOT_OPEN', 'Payments can only be recorded against sent invoices.');
      }
      const paid = inv.payments.reduce((n, p) => n + p.amount, 0);
      const balance = inv.total - paid;
      if (input.amount > balance) {
        throw unprocessable(
          'OVERPAYMENT',
          `The balance is ${rupees(balance)}; record at most that amount.`,
        );
      }
      const payment = await tx.payment.create({
        data: { ...input, invoiceId: id, recordedById: user.id },
      });
      await tx.financialRecord.create({
        data: {
          kind: 'INCOME',
          category: await this.incomeCategory(tx, inv.milestoneId),
          amount: input.amount,
          occurredOn: input.receivedOn,
          projectId: inv.projectId,
          paymentId: payment.id,
          note: `Payment for ${inv.number}`,
        },
      });
      const status = invoiceStatusAfterPayments(inv.status, inv.total, paid + input.amount);
      await tx.invoice.update({ where: { id }, data: { status } });
      await this.notifications.notifyUsers(tx, [inv.createdById], {
        kind: 'finance.payment',
        title:
          status === 'PAID' ? `Invoice ${inv.number} paid in full` : `Payment on ${inv.number}`,
        body: `${inv.client.name} — ${rupees(input.amount)}`,
        entityType: 'invoice',
        entityId: id,
      });
      await log({
        actorId: user.id,
        action: 'invoice.payment',
        entityType: 'invoice',
        entityId: id,
        projectId: inv.projectId,
        summary: `${user.name} recorded ${rupees(input.amount)} from ${inv.client.name} on ${inv.number}${status === 'PAID' ? ' — paid in full' : ''}`,
      });
    });
    return this.get(id);
  }

  async void(id: string, input: VoidInvoice, user: SessionUser): Promise<InvoiceDetail> {
    const inv = await this.prisma.db.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'VOID') throw conflict('INVOICE_VOID', 'This invoice is already void.');
    if (inv.payments.length > 0) {
      throw conflict('INVOICE_HAS_PAYMENTS', 'An invoice with recorded payments cannot be voided.');
    }
    await this.activity.transaction(async (tx, log) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
      const fresh = await tx.invoice.findUniqueOrThrow({
        where: { id },
        include: { _count: { select: { payments: true } } },
      });
      if (fresh.status === 'VOID') throw conflict('INVOICE_VOID', 'This invoice is already void.');
      if (fresh._count.payments > 0) {
        throw conflict(
          'INVOICE_HAS_PAYMENTS',
          'An invoice with recorded payments cannot be voided.',
        );
      }
      await tx.invoice.update({
        where: { id },
        data: {
          status: 'VOID',
          notes: [inv.notes, `Voided: ${input.reason}`].filter(Boolean).join('\n'),
        },
      });
      await log({
        actorId: user.id,
        action: 'invoice.voided',
        entityType: 'invoice',
        entityId: id,
        projectId: inv.projectId,
        summary: `${user.name} voided invoice ${inv.number}: ${input.reason}`,
      });
    });
    return this.get(id);
  }

  // ── Overview ──────────────────────────────────────────────────────────────

  async overview(): Promise<FinanceOverview> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [invoices, expenses, projects, monthIncome, monthPaidExpenses] = await Promise.all([
      this.prisma.db.invoice.findMany({ include: summaryInclude }),
      this.prisma.db.expense.findMany({ select: { status: true, amount: true, projectId: true } }),
      this.prisma.db.project.findMany({
        where: { status: { in: ['ACTIVE', 'ON_HOLD'] } },
        select: {
          id: true,
          code: true,
          title: true,
          budget: true,
          finances: { select: { kind: true, amount: true } },
          invoices: { where: { status: { not: 'VOID' } }, select: { total: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.db.financialRecord.aggregate({
        where: { kind: 'INCOME', paymentId: { not: null }, occurredOn: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.db.expense.aggregate({
        where: { status: 'PAID', paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);
    const summaries = invoices.map((i) => toSummary(i, now));
    const open = summaries.filter((s) => s.status === 'SENT' || s.status === 'PARTIALLY_PAID');
    const committed = new Map<string, number>();
    for (const e of expenses) {
      if (e.projectId && (e.status === 'SUBMITTED' || e.status === 'APPROVED')) {
        committed.set(e.projectId, (committed.get(e.projectId) ?? 0) + e.amount);
      }
    }
    return {
      isDemo: true,
      receivables: {
        outstanding: open.reduce((n, s) => n + s.balance, 0),
        overdue: open.filter((s) => s.overdue).reduce((n, s) => n + s.balance, 0),
        ageing: receivablesAgeing(
          open.map((s) => ({ status: s.status, dueDate: s.dueDate, total: s.total, paid: s.paid })),
          now,
        ),
      },
      expenses: {
        awaitingApproval: expenses
          .filter((e) => e.status === 'SUBMITTED')
          .reduce((n, e) => n + e.amount, 0),
        awaitingApprovalCount: expenses.filter((e) => e.status === 'SUBMITTED').length,
        approvedUnpaid: expenses
          .filter((e) => e.status === 'APPROVED')
          .reduce((n, e) => n + e.amount, 0),
        paidThisMonth: monthPaidExpenses._sum.amount ?? 0,
      },
      invoicedThisMonth: summaries
        .filter(
          (s) => s.status !== 'DRAFT' && s.status !== 'VOID' && new Date(s.issueDate) >= monthStart,
        )
        .reduce((n, s) => n + s.total, 0),
      collectedThisMonth: monthIncome._sum.amount ?? 0,
      budgetVsActual: projects.map((p) => {
        const actual = p.finances
          .filter((f) => f.kind === 'EXPENSE')
          .reduce((n, f) => n + f.amount, 0);
        const collected = p.finances
          .filter((f) => f.kind === 'INCOME')
          .reduce((n, f) => n + f.amount, 0);
        return {
          project: { id: p.id, code: p.code, title: p.title },
          budget: p.budget,
          actual,
          committed: committed.get(p.id) ?? 0,
          invoiced: p.invoices.reduce((n, i) => n + i.total, 0),
          collected,
        };
      }),
    };
  }
}
