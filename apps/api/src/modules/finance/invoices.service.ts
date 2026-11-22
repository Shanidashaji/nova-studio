import { Injectable } from '@nestjs/common';
import {
  RecordNotFoundError,
  type Client,
  type FinanceCategory,
  type FinancialRecord,
  type Invoice,
  type InvoiceLine,
  type Milestone,
  type Payment,
  type PopulateOptions,
  type Project,
  type User,
} from '@nova/db';
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
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../activity/notifications.service';
import { iso, isoOrNull } from '../projects/project.mapper';

const summaryPayments: PopulateOptions = { path: 'payments', select: { invoiceId: 1, amount: 1 } };

const summaryPopulate: PopulateOptions[] = [
  { path: 'client', select: { name: 1, accentColor: 1 } },
  { path: 'project', select: { code: 1, title: 1 } },
  summaryPayments,
];

const detailPopulate: PopulateOptions[] = [
  ...summaryPopulate.filter((p) => p !== summaryPayments),
  { path: 'milestone', select: { title: 1 } },
  { path: 'createdBy', select: { name: 1 } },
  { path: 'lines', options: { sort: { order: 1 } } },
  {
    path: 'payments',
    options: { sort: { receivedOn: 1 } },
    populate: { path: 'recordedBy', select: { name: 1 } },
  },
];

type UserRef = Pick<User, '_id' | 'id' | 'name'>;

type SummaryRow = Invoice & {
  client: Pick<Client, '_id' | 'id' | 'name' | 'accentColor'>;
  project: Pick<Project, '_id' | 'id' | 'code' | 'title'> | null;
  payments: Pick<Payment, '_id' | 'id' | 'invoiceId' | 'amount'>[];
};

type DetailRow = Omit<SummaryRow, 'payments'> & {
  milestone: Pick<Milestone, '_id' | 'id' | 'title'> | null;
  createdBy: UserRef;
  lines: InvoiceLine[];
  payments: (Payment & { recordedBy: UserRef })[];
};

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
    client: { id: i.client.id, name: i.client.name, accentColor: i.client.accentColor },
    project: i.project ? { id: i.project.id, code: i.project.code, title: i.project.title } : null,
    issueDate: iso(i.issueDate),
    dueDate: iso(i.dueDate),
    total: i.total,
    paid,
    balance: i.status === 'VOID' ? 0 : Math.max(0, i.total - paid),
  };
}

/** Sum of `amount` over the matching documents (the former `aggregate({ _sum })`). */
async function sumAmount(
  model: { aggregate<R>(pipeline: object[]): PromiseLike<R[]> },
  match: Record<string, unknown>,
): Promise<number> {
  const [row] = await model.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return row?.total ?? 0;
}

/**
 * Invoices and payments (ADR-0011): totals are computed on the server, status follows payments,
 * "overdue" is derived from the due date, and every payment posts one ledger entry.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q: InvoiceListQuery): Promise<InvoiceSummary[]> {
    const now = new Date();
    const rows = await this.database.models.Invoice.find({
      ...(q.status ? { status: q.status } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.overdue ? { status: { $in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { $lt: now } } : {}),
    })
      .populate(summaryPopulate)
      .sort({ issueDate: -1, number: -1 })
      .limit(300)
      .lean<SummaryRow[]>();
    return rows.map((r) => toSummary(r, now));
  }

  async get(id: string): Promise<InvoiceDetail> {
    const i = await this.database.models.Invoice.findById(id)
      .populate(detailPopulate)
      .lean<DetailRow>();
    if (!i) throw notFound('Invoice');
    return {
      ...toSummary(i, new Date()),
      taxPercent: i.taxPercent,
      subtotal: i.subtotal,
      tax: i.tax,
      notes: i.notes,
      sentAt: isoOrNull(i.sentAt),
      milestone: i.milestone ? { id: i.milestone.id, title: i.milestone.title } : null,
      createdBy: { id: i.createdBy.id, name: i.createdBy.name },
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
        recordedBy: { id: p.recordedBy.id, name: p.recordedBy.name },
      })),
    };
  }

  private async validateLinks(input: {
    clientId: string;
    projectId?: string;
    milestoneId?: string;
  }) {
    const { Client: Clients, Project: Projects, Milestone: Milestones } = this.database.models;
    const client = await Clients.findById(input.clientId).lean<Client>();
    if (!client) throw unprocessable('INVALID_CLIENT', 'Choose an existing client.');
    if (input.projectId) {
      const p = await Projects.findById(input.projectId, { clientId: 1 }).lean();
      if (!p || p.clientId !== input.clientId) {
        throw unprocessable('INVALID_PROJECT', 'That project does not belong to this client.');
      }
    }
    if (input.milestoneId) {
      const m = await Milestones.findById(input.milestoneId, { projectId: 1 }).lean();
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
    const client = await this.validateLinks(input);
    const totals = invoiceTotals(input.lines, input.taxPercent);
    const id = await this.activity.transaction(async (log) => {
      const { Invoice: Invoices, InvoiceLine: Lines } = this.database.models;
      const number = await allocateNumber(this.database, 'invoice');
      const inv = (
        await Invoices.create({
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
        })
      ).toObject<Invoice>();
      await Lines.insertMany(this.lineRows(input.lines).map((l) => ({ ...l, invoiceId: inv.id })));
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
    const inv = await this.database.models.Invoice.findById(id)
      .populate({ path: 'lines' })
      .lean<Invoice & { lines: InvoiceLine[] }>();
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
    await this.validateLinks(merged);
    const issueDate = input.issueDate ?? inv.issueDate;
    const dueDate = input.dueDate ?? inv.dueDate;
    if (dueDate < issueDate) {
      throw unprocessable('INVALID_DATES', 'The due date cannot be before the issue date.');
    }
    const taxPercent = input.taxPercent ?? inv.taxPercent;
    const lines = input.lines ?? inv.lines;
    const totals = invoiceTotals(lines, taxPercent);
    await this.activity.transaction(async (log) => {
      const { Invoice: Invoices, InvoiceLine: Lines } = this.database.models;
      // Re-check under a lock: the invoice may have been sent since it was read.
      await this.database.lock('Invoice', id);
      const current = await Invoices.findById(id, { status: 1 }).lean();
      if (!current) throw new RecordNotFoundError('Invoice');
      if (current.status !== 'DRAFT') {
        throw conflict(
          'INVOICE_LOCKED',
          'Only draft invoices can be edited. Void and re-issue instead.',
        );
      }
      if (input.lines) {
        await Lines.deleteMany({ invoiceId: id });
        await Lines.insertMany(this.lineRows(input.lines).map((l) => ({ ...l, invoiceId: id })));
      }
      await Invoices.updateOne(
        { _id: id },
        {
          $set: {
            clientId: merged.clientId,
            projectId: merged.projectId ?? null,
            milestoneId: merged.milestoneId ?? null,
            issueDate,
            dueDate,
            taxPercent,
            notes: input.notes ?? inv.notes,
            ...totals,
          },
        },
      );
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
    const inv = await this.database.models.Invoice.findById(id)
      .populate({ path: 'client', select: { name: 1 } })
      .lean<Invoice & { client: Pick<Client, '_id' | 'id' | 'name'> }>();
    if (!inv) throw notFound('Invoice');
    if (inv.status !== 'DRAFT')
      throw conflict('INVOICE_NOT_DRAFT', 'This invoice was already sent.');
    if (inv.total <= 0) {
      throw unprocessable('ZERO_TOTAL', 'An invoice must have a total above ₹0 before it is sent.');
    }
    await this.activity.transaction(async (log) => {
      // Guarded transition: a concurrent send or void cannot both succeed.
      const { matchedCount } = await this.database.models.Invoice.updateMany(
        { _id: id, status: 'DRAFT' },
        { $set: { status: 'SENT', sentAt: new Date() } },
      );
      if (matchedCount === 0) throw conflict('INVOICE_NOT_DRAFT', 'This invoice was already sent.');
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
  private async incomeCategory(milestoneId: string | null): Promise<FinanceCategory> {
    if (!milestoneId) return 'MILESTONE';
    const { Milestone: Milestones } = this.database.models;
    const m = await Milestones.findById(milestoneId, { projectId: 1 }).lean();
    if (!m) throw new RecordNotFoundError('Milestone');
    const all = await Milestones.find({ projectId: m.projectId }, { _id: 1 })
      .sort({ dueDate: 1 })
      .lean();
    if (all[0]?._id === m._id) return 'ADVANCE';
    if (all.at(-1)?._id === m._id) return 'FINAL_PAYMENT';
    return 'MILESTONE';
  }

  async recordPayment(id: string, input: RecordPayment, user: SessionUser): Promise<InvoiceDetail> {
    await this.activity.transaction(async (log) => {
      const { Invoice: Invoices, Payment: Payments, FinancialRecord } = this.database.models;
      await this.database.lock('Invoice', id);
      const inv = await Invoices.findById(id)
        .populate([
          { path: 'payments', select: { invoiceId: 1, amount: 1 } },
          { path: 'client', select: { name: 1 } },
        ])
        .lean<
          Invoice & {
            payments: Pick<Payment, '_id' | 'id' | 'invoiceId' | 'amount'>[];
            client: Pick<Client, '_id' | 'id' | 'name'>;
          }
        >();
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
      const payment = await Payments.create({ ...input, invoiceId: id, recordedById: user.id });
      // Ledger row in the same transaction as the payment; the unique paymentId index allows one.
      await FinancialRecord.create({
        kind: 'INCOME',
        category: await this.incomeCategory(inv.milestoneId),
        amount: input.amount,
        occurredOn: input.receivedOn,
        projectId: inv.projectId,
        paymentId: payment._id,
        note: `Payment for ${inv.number}`,
      } satisfies Partial<FinancialRecord>);
      const status = invoiceStatusAfterPayments(inv.status, inv.total, paid + input.amount);
      await Invoices.updateOne({ _id: id }, { $set: { status } });
      await this.notifications.notifyUsers([inv.createdById], {
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
    const { Invoice: Invoices, Payment: Payments } = this.database.models;
    const inv = await Invoices.findById(id).lean<Invoice>();
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'VOID') throw conflict('INVOICE_VOID', 'This invoice is already void.');
    if ((await Payments.countDocuments({ invoiceId: id })) > 0) {
      throw conflict('INVOICE_HAS_PAYMENTS', 'An invoice with recorded payments cannot be voided.');
    }
    await this.activity.transaction(async (log) => {
      await this.database.lock('Invoice', id);
      const fresh = await Invoices.findById(id, { status: 1 }).lean();
      if (!fresh) throw new RecordNotFoundError('Invoice');
      if (fresh.status === 'VOID') throw conflict('INVOICE_VOID', 'This invoice is already void.');
      if ((await Payments.countDocuments({ invoiceId: id })) > 0) {
        throw conflict(
          'INVOICE_HAS_PAYMENTS',
          'An invoice with recorded payments cannot be voided.',
        );
      }
      await Invoices.updateOne(
        { _id: id },
        {
          $set: {
            status: 'VOID',
            notes: [inv.notes, `Voided: ${input.reason}`].filter(Boolean).join('\n'),
          },
        },
      );
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
    const {
      Invoice: Invoices,
      Expense: Expenses,
      Project: Projects,
      FinancialRecord,
    } = this.database.models;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [invoices, expenses, projects, monthIncome, monthPaidExpenses] = await Promise.all([
      Invoices.find().populate(summaryPopulate).lean<SummaryRow[]>(),
      Expenses.find({}, { status: 1, amount: 1, projectId: 1 }).lean(),
      Projects.find({ status: { $in: ['ACTIVE', 'ON_HOLD'] } }, { code: 1, title: 1, budget: 1 })
        .populate([
          { path: 'finances', select: { projectId: 1, kind: 1, amount: 1 } },
          {
            path: 'invoices',
            match: { status: { $ne: 'VOID' } },
            select: { projectId: 1, total: 1 },
          },
        ])
        .sort({ dueDate: 1 })
        .lean<
          (Pick<Project, '_id' | 'id' | 'code' | 'title' | 'budget'> & {
            finances: Pick<FinancialRecord, 'kind' | 'amount'>[];
            invoices: Pick<Invoice, 'total'>[];
          })[]
        >(),
      // Aggregation does not cast: `monthStart` is already a Date.
      sumAmount(FinancialRecord, {
        kind: 'INCOME',
        paymentId: { $ne: null },
        occurredOn: { $gte: monthStart },
      }),
      sumAmount(Expenses, { status: 'PAID', paidAt: { $gte: monthStart } }),
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
        paidThisMonth: monthPaidExpenses,
      },
      invoicedThisMonth: summaries
        .filter(
          (s) => s.status !== 'DRAFT' && s.status !== 'VOID' && new Date(s.issueDate) >= monthStart,
        )
        .reduce((n, s) => n + s.total, 0),
      collectedThisMonth: monthIncome,
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
