import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ApprovalRequest,
  ApprovalStep,
  Expense,
  PopulateOptions,
  Project,
  PurchaseOrder,
  QueryFilter,
  User,
  Vendor,
} from '@nova/db';
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
import { DatabaseService } from '../../database/database.service';
import { ActivityService, type ActivityInput } from '../activity/activity.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { iso, isoOrNull } from '../projects/project.mapper';

export const expensePopulate: PopulateOptions[] = [
  { path: 'project', select: { code: 1, title: 1 } },
  { path: 'vendor', select: { name: 1 } },
  { path: 'purchaseOrder', select: { number: 1 } },
  { path: 'submittedBy', select: { name: 1 } },
  {
    // Newest first; the view uses only the latest request. Steps are loaded to count them.
    path: 'approvals',
    select: { expenseId: 1, status: 1, currentStep: 1, createdAt: 1 },
    options: { sort: { createdAt: -1 } },
    populate: { path: 'steps', select: { requestId: 1 } },
  },
];

export type ExpenseRow = Expense & {
  project: Pick<Project, '_id' | 'id' | 'code' | 'title'> | null;
  vendor: Pick<Vendor, '_id' | 'id' | 'name'> | null;
  purchaseOrder: Pick<PurchaseOrder, '_id' | 'id' | 'number'> | null;
  submittedBy: Pick<User, '_id' | 'id' | 'name'>;
  approvals: (Pick<ApprovalRequest, '_id' | 'id' | 'status' | 'currentStep' | 'createdAt'> & {
    steps: Pick<ApprovalStep, '_id' | 'id' | 'requestId'>[];
  })[];
};

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
    project: e.project ? { id: e.project.id, code: e.project.code, title: e.project.title } : null,
    vendor: e.vendor ? { id: e.vendor.id, name: e.vendor.name } : null,
    purchaseOrder: e.purchaseOrder
      ? { id: e.purchaseOrder.id, number: e.purchaseOrder.number }
      : null,
    submittedBy: { id: e.submittedBy.id, name: e.submittedBy.name },
    paidAt: isoOrNull(e.paidAt),
    approval: a
      ? { id: a.id, status: a.status, currentStep: a.currentStep, steps: a.steps.length }
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
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
  ) {}

  onModuleInit() {
    this.approvals.register('EXPENSE', {
      onApproved: async (r) => {
        // Guarded: only an expense still awaiting approval moves on.
        await this.database.models.Expense.updateMany(
          { _id: r.expenseId!, status: 'SUBMITTED' },
          { $set: { status: 'APPROVED' } },
        );
      },
      onRejected: async (r) => {
        await this.database.models.Expense.updateMany(
          { _id: r.expenseId!, status: 'SUBMITTED' },
          { $set: { status: 'REJECTED' } },
        );
      },
    });
  }

  private scope(user: SessionUser): QueryFilter<Expense> {
    return user.permissions.includes('finance:read') ? {} : { submittedById: user.id };
  }

  async list(q: ExpenseListQuery, user: SessionUser): Promise<ExpenseView[]> {
    const rows = await this.database.models.Expense.find({
      ...this.scope(user),
      ...(q.status ? { status: q.status } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.mine ? { submittedById: user.id } : {}),
    })
      .populate(expensePopulate)
      .sort({ incurredOn: -1, number: -1 })
      .limit(200)
      .lean<ExpenseRow[]>();
    return rows.map(toExpense);
  }

  async get(id: string, user: SessionUser): Promise<ExpenseView> {
    const e = await this.database.models.Expense.findOne({ _id: id, ...this.scope(user) })
      .populate(expensePopulate)
      .lean<ExpenseRow>();
    if (!e) throw notFound('Expense');
    return toExpense(e);
  }

  private async validateLinks(input: { projectId?: string; vendorId?: string }) {
    const { Project, Vendor } = this.database.models;
    if (input.projectId && !(await Project.exists({ _id: input.projectId }))) {
      throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    }
    if (input.vendorId) {
      const v = await Vendor.findById(input.vendorId, { isActive: 1 }).lean();
      if (!v?.isActive) throw unprocessable('INVALID_VENDOR', 'Choose an active vendor.');
    }
  }

  private openApproval(
    log: (i: ActivityInput) => Promise<void>,
    e: { id: string; number: string; title: string; amount: number; projectId: string | null },
    user: SessionUser,
  ) {
    return this.approvals.open(log, {
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
    const expense = await this.activity.transaction(async (log) => {
      const number = await allocateNumber(this.database, 'expense');
      const doc = await this.database.models.Expense.create({
        ...data,
        number,
        submittedById: user.id,
        status: submit ? 'SUBMITTED' : 'DRAFT',
      });
      const e = doc.toObject<Expense>();
      await log({
        actorId: user.id,
        action: 'expense.created',
        entityType: 'expense',
        entityId: e.id,
        projectId: e.projectId,
        summary: `${user.name} ${submit ? 'submitted' : 'drafted'} expense ${number} — ${e.title} (${rupees(e.amount)})`,
      });
      if (submit) await this.openApproval(log, e, user);
      return e;
    });
    return this.get(expense.id, user);
  }

  /**
   * Locks the expense document and checks ownership and state inside the caller's transaction, so
   * two concurrent requests cannot both pass the check (e.g. a submit racing a delete).
   */
  private async lockOwn(
    id: string,
    user: SessionUser,
    allowed: readonly ExpenseStatus[],
    code: string,
    message: string,
  ) {
    await this.database.lock('Expense', id);
    const e = await this.database.models.Expense.findById(id).lean<Expense>();
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
    await this.activity.transaction(async (log) => {
      const e = await this.lockOwn(
        id,
        user,
        ['DRAFT', 'REJECTED'],
        'EXPENSE_LOCKED',
        'Only draft or rejected expenses can be edited.',
      );
      await this.database.models.Expense.updateOne(
        { _id: id },
        { $set: { ...input, status: 'DRAFT' } },
      );
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
    await this.activity.transaction(async (log) => {
      await this.lockOwn(
        id,
        user,
        ['DRAFT', 'REJECTED'],
        'EXPENSE_NOT_DRAFT',
        'This expense has already been submitted.',
      );
      const updated = await this.database.models.Expense.findByIdAndUpdate(
        id,
        { $set: { status: 'SUBMITTED' } },
        { new: true },
      ).lean<Expense>();
      if (!updated) throw notFound('Expense');
      await this.openApproval(log, updated, user);
    });
    return this.get(id, user);
  }

  async withdraw(id: string, user: SessionUser): Promise<ExpenseView> {
    await this.activity.transaction(async (log) => {
      const e = await this.lockOwn(
        id,
        user,
        ['SUBMITTED'],
        'EXPENSE_NOT_SUBMITTED',
        'Only an expense awaiting approval can be withdrawn.',
      );
      await this.approvals.cancelOpen({ expenseId: id });
      await this.database.models.Expense.updateOne({ _id: id }, { $set: { status: 'DRAFT' } });
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
    await this.activity.transaction(async (log) => {
      const e = await this.lockOwn(
        id,
        user,
        ['DRAFT'],
        'EXPENSE_LOCKED',
        'Only drafts can be deleted.',
      );
      if (e.purchaseOrderId) {
        throw conflict('BILL_LOCKED', 'A vendor bill from a purchase order cannot be deleted.');
      }
      // Former foreign keys: approval requests cascade, documents are unlinked, a ledger row blocks.
      await this.database.deleteCascade('Expense', { _id: id });
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
    await this.activity.transaction(async (log) => {
      const { Expense: Expenses, FinancialRecord } = this.database.models;
      await this.database.lock('Expense', id);
      const e = await Expenses.findById(id).lean<Expense>();
      if (!e) throw notFound('Expense');
      if (e.status !== 'APPROVED') {
        throw conflict('EXPENSE_NOT_APPROVED', 'Only approved expenses can be paid.');
      }
      const paidAt = new Date();
      await Expenses.updateOne({ _id: id }, { $set: { status: 'PAID', paidAt } });
      // Same transaction as the status change; the unique expenseId index allows one ledger row.
      await FinancialRecord.create({
        kind: 'EXPENSE',
        category: e.category,
        amount: e.amount,
        occurredOn: paidAt,
        projectId: e.projectId,
        expenseId: e.id,
        note: `Paid expense ${e.number}`,
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
