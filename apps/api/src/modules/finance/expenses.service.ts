import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@nova/db';
import type {
  CreateExpense,
  ExpenseStatus,
  ExpenseListQuery,
  ExpenseView,
  SessionUser,
  UpdateExpense,
} from '@nova/shared';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { allocateNumber } from '../../common/numbering';
import { PrismaService, type Db } from '../../database/prisma.service';
import { ActivityService, type ActivityInput } from '../activity/activity.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { iso, isoOrNull } from '../projects/project.mapper';

export const expenseInclude = {
  project: { select: { id: true, code: true, title: true } },
  vendor: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true, number: true } },
  submittedBy: { select: { id: true, name: true } },
  approvals: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, status: true, currentStep: true, _count: { select: { steps: true } } },
  },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

export const toExpense = (e: ExpenseRow): ExpenseView => {
  const a = e.approvals[0];
  return {
    id: e.id,
    number: e.number,
    title: e.title,
    category: e.category,
    amount: e.amount,
    incurredOn: iso(e.incurredOn),
    status: e.status,
    notes: e.notes,
    project: e.project,
    vendor: e.vendor,
    purchaseOrder: e.purchaseOrder,
    submittedBy: e.submittedBy,
    paidAt: isoOrNull(e.paidAt),
    approval: a
      ? { id: a.id, status: a.status, currentStep: a.currentStep, steps: a._count.steps }
      : null,
    createdAt: iso(e.createdAt),
  };
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * Expenses: draft → submitted (approval chain, ADR-0010) → approved → paid. Paying posts the
 * ledger entry (ADR-0011). Users without `finance:read` see only their own claims.
 */
@Injectable()
export class ExpensesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
  ) {}

  onModuleInit() {
    this.approvals.register('EXPENSE', {
      onApproved: async (tx, r) => {
        // Guarded: only an expense still awaiting approval moves on.
        await tx.expense.updateMany({
          where: { id: r.expenseId!, status: 'SUBMITTED' },
          data: { status: 'APPROVED' },
        });
      },
      onRejected: async (tx, r) => {
        await tx.expense.updateMany({
          where: { id: r.expenseId!, status: 'SUBMITTED' },
          data: { status: 'REJECTED' },
        });
      },
    });
  }

  private scope(user: SessionUser): Prisma.ExpenseWhereInput {
    return user.permissions.includes('finance:read') ? {} : { submittedById: user.id };
  }

  async list(q: ExpenseListQuery, user: SessionUser): Promise<ExpenseView[]> {
    const rows = await this.prisma.db.expense.findMany({
      where: {
        ...this.scope(user),
        ...(q.status ? { status: q.status } : {}),
        ...(q.projectId ? { projectId: q.projectId } : {}),
        ...(q.mine ? { submittedById: user.id } : {}),
      },
      include: expenseInclude,
      orderBy: [{ incurredOn: 'desc' }, { number: 'desc' }],
      take: 200,
    });
    return rows.map(toExpense);
  }

  async get(id: string, user: SessionUser): Promise<ExpenseView> {
    const e = await this.prisma.db.expense.findFirst({
      where: { id, ...this.scope(user) },
      include: expenseInclude,
    });
    if (!e) throw notFound('Expense');
    return toExpense(e);
  }

  private async validateLinks(input: { projectId?: string; vendorId?: string }) {
    if (
      input.projectId &&
      !(await this.prisma.db.project.findUnique({ where: { id: input.projectId } }))
    ) {
      throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    }
    if (input.vendorId) {
      const v = await this.prisma.db.vendor.findUnique({ where: { id: input.vendorId } });
      if (!v?.isActive) throw unprocessable('INVALID_VENDOR', 'Choose an active vendor.');
    }
  }

  private openApproval(
    tx: Db,
    log: (i: ActivityInput) => Promise<void>,
    e: { id: string; number: string; title: string; amount: number; projectId: string | null },
    user: SessionUser,
  ) {
    return this.approvals.open(tx, log, {
      subject: 'EXPENSE',
      title: `${e.number} · ${e.title}`,
      amount: e.amount,
      requester: user,
      projectId: e.projectId,
      link: { expenseId: e.id },
    });
  }

  async create(input: CreateExpense, user: SessionUser): Promise<ExpenseView> {
    await this.validateLinks(input);
    const { submit, ...data } = input;
    const expense = await this.activity.transaction(async (tx, log) => {
      const number = await allocateNumber(tx, 'expense');
      const e = await tx.expense.create({
        data: { ...data, number, submittedById: user.id, status: submit ? 'SUBMITTED' : 'DRAFT' },
      });
      await log({
        actorId: user.id,
        action: 'expense.created',
        entityType: 'expense',
        entityId: e.id,
        projectId: e.projectId,
        summary: `${user.name} ${submit ? 'submitted' : 'drafted'} expense ${number} — ${e.title} (${rupees(e.amount)})`,
      });
      if (submit) await this.openApproval(tx, log, e, user);
      return e;
    });
    return this.get(expense.id, user);
  }

  /**
   * Locks the expense row and checks ownership and state inside the caller's transaction, so two
   * concurrent requests cannot both pass the check (e.g. a submit racing a delete).
   */
  private async lockOwn(
    tx: Db,
    id: string,
    user: SessionUser,
    allowed: readonly ExpenseStatus[],
    code: string,
    message: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} FOR UPDATE`;
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e) throw notFound('Expense');
    const isFinance = user.permissions.includes('finance:write');
    if (e.submittedById !== user.id && !isFinance) {
      throw forbidden('Only the person who submitted this expense can change it.');
    }
    // A vendor bill comes from a received purchase order; only finance may change it.
    if (e.purchaseOrderId && !isFinance) {
      throw forbidden('Vendor bills raised from purchase orders are managed by finance.');
    }
    if (!allowed.includes(e.status)) throw conflict(code, message);
    return e;
  }

  async update(id: string, input: UpdateExpense, user: SessionUser): Promise<ExpenseView> {
    await this.validateLinks(input);
    await this.activity.transaction(async (tx, log) => {
      const e = await this.lockOwn(
        tx,
        id,
        user,
        ['DRAFT', 'REJECTED'],
        'EXPENSE_LOCKED',
        'Only draft or rejected expenses can be edited.',
      );
      await tx.expense.update({ where: { id }, data: { ...input, status: 'DRAFT' } });
      await log({
        actorId: user.id,
        action: 'expense.updated',
        entityType: 'expense',
        entityId: id,
        projectId: input.projectId ?? e.projectId,
        summary: `${user.name} edited expense ${e.number}`,
      });
    });
    return this.get(id, user);
  }

  async submit(id: string, user: SessionUser): Promise<ExpenseView> {
    await this.activity.transaction(async (tx, log) => {
      await this.lockOwn(
        tx,
        id,
        user,
        ['DRAFT', 'REJECTED'],
        'EXPENSE_NOT_DRAFT',
        'This expense has already been submitted.',
      );
      const updated = await tx.expense.update({ where: { id }, data: { status: 'SUBMITTED' } });
      await this.openApproval(tx, log, updated, user);
    });
    return this.get(id, user);
  }

  async withdraw(id: string, user: SessionUser): Promise<ExpenseView> {
    await this.activity.transaction(async (tx, log) => {
      const e = await this.lockOwn(
        tx,
        id,
        user,
        ['SUBMITTED'],
        'EXPENSE_NOT_SUBMITTED',
        'Only an expense awaiting approval can be withdrawn.',
      );
      await this.approvals.cancelOpen(tx, { expenseId: id });
      await tx.expense.update({ where: { id }, data: { status: 'DRAFT' } });
      await log({
        actorId: user.id,
        action: 'expense.withdrawn',
        entityType: 'expense',
        entityId: id,
        projectId: e.projectId,
        summary: `${user.name} withdrew expense ${e.number} for changes`,
      });
    });
    return this.get(id, user);
  }

  async remove(id: string, user: SessionUser) {
    await this.activity.transaction(async (tx, log) => {
      const e = await this.lockOwn(
        tx,
        id,
        user,
        ['DRAFT'],
        'EXPENSE_LOCKED',
        'Only drafts can be deleted.',
      );
      if (e.purchaseOrderId) {
        throw conflict('BILL_LOCKED', 'A vendor bill from a purchase order cannot be deleted.');
      }
      await tx.expense.delete({ where: { id } });
      await log({
        actorId: user.id,
        action: 'expense.deleted',
        entityType: 'expense',
        entityId: id,
        projectId: e.projectId,
        summary: `${user.name} deleted draft expense ${e.number}`,
      });
    });
  }

  /** Marks an approved expense paid and posts it to the ledger (ADR-0011). */
  async pay(id: string, user: SessionUser): Promise<ExpenseView> {
    await this.activity.transaction(async (tx, log) => {
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} FOR UPDATE`;
      const e = await tx.expense.findUnique({ where: { id } });
      if (!e) throw notFound('Expense');
      if (e.status !== 'APPROVED') {
        throw conflict('EXPENSE_NOT_APPROVED', 'Only approved expenses can be paid.');
      }
      const paidAt = new Date();
      await tx.expense.update({ where: { id }, data: { status: 'PAID', paidAt } });
      await tx.financialRecord.create({
        data: {
          kind: 'EXPENSE',
          category: e.category,
          amount: e.amount,
          occurredOn: paidAt,
          projectId: e.projectId,
          expenseId: e.id,
          note: `Paid expense ${e.number}`,
        },
      });
      await log({
        actorId: user.id,
        action: 'expense.paid',
        entityType: 'expense',
        entityId: id,
        projectId: e.projectId,
        summary: `${user.name} paid expense ${e.number} (${rupees(e.amount)})`,
      });
    });
    return this.get(id, user);
  }
}
