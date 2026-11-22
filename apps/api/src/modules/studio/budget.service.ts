import { Injectable } from '@nestjs/common';
import type {
  BudgetLine,
  Client,
  Expense,
  FinancialRecord,
  Project,
  Shoot,
  TalentBooking,
} from '@nova/db';
import {
  BUDGET_GROUP_LABELS,
  BUDGET_GROUPS,
  budgetGroupOf,
  budgetVariance,
  type BudgetGroup,
  type CreateBudgetLine,
  type ProjectBudgetView,
  type SessionUser,
  type UpdateBudgetLine,
} from '@nova/shared';
import { notFound } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { iso } from '../projects/project.mapper';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * Project budget plan (estimates per group) against actual cost. Actual = expenses posted to the
 * ledger (paid) plus expenses approved but not yet paid; both come from the Finance module.
 * Committed = artist fees booked on upcoming shoots that have not become expenses yet.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  async project(projectId: string): Promise<ProjectBudgetView> {
    const project = await this.database.models.Project.findById(projectId)
      .populate({ path: 'client', select: { name: 1 } })
      .lean<Project & { client: Pick<Client, 'name'> | null }>();
    if (!project) throw notFound('Project');
    const [lines, ledger, expenses, shoots] = await Promise.all([
      this.database.models.BudgetLine.find({ projectId })
        .sort({ group: 1, createdAt: 1 })
        .lean<BudgetLine[]>(),
      this.database.models.FinancialRecord.find({ projectId, kind: 'EXPENSE' }).lean<
        FinancialRecord[]
      >(),
      this.database.models.Expense.find({ projectId }).sort({ incurredOn: -1 }).lean<Expense[]>(),
      this.database.models.Shoot.find(
        { projectId, status: { $ne: 'CANCELLED' } },
        { _id: 1, status: 1 },
      ).lean<Pick<Shoot, '_id' | 'status'>[]>(),
    ]);
    const talent = await this.database.models.TalentBooking.find({
      shootId: { $in: shoots.filter((s) => s.status !== 'WRAPPED').map((s) => s._id) },
      status: { $ne: 'RELEASED' },
    }).lean<TalentBooking[]>();
    // Paid expenses are posted to the ledger with their expenseId; other ledger expense rows
    // (demo history, manual entries) count as paid too.
    const paidByGroup = new Map<BudgetGroup, number>();
    for (const f of ledger) {
      const g = budgetGroupOf(f.category);
      paidByGroup.set(g, (paidByGroup.get(g) ?? 0) + f.amount);
    }
    const approvedByGroup = new Map<BudgetGroup, number>();
    for (const e of expenses.filter((x) => x.status === 'APPROVED')) {
      const g = budgetGroupOf(e.category);
      approvedByGroup.set(g, (approvedByGroup.get(g) ?? 0) + e.amount);
    }
    const committedArtists = talent.reduce((a, t) => a + (t.fee ?? 0), 0);

    const groups = BUDGET_GROUPS.map((group) => {
      const mine = lines.filter((l) => l.group === group);
      const estimated = mine.reduce((a, l) => a + l.estimated, 0);
      const paid = paidByGroup.get(group) ?? 0;
      const approved = approvedByGroup.get(group) ?? 0;
      const actual = paid + approved;
      const v = budgetVariance(estimated, actual);
      return {
        group,
        estimated,
        paid,
        approved,
        actual,
        committed: group === 'ARTIST' ? committedArtists : 0,
        variance: v.variance,
        utilisation: Number.isFinite(v.utilisation) ? v.utilisation : 1,
        band: v.band,
        lines: mine.map((l) => ({
          id: l.id,
          group: l.group,
          label: l.label,
          estimated: l.estimated,
          note: l.note,
        })),
      };
    });
    const estimated = groups.reduce((a, g) => a + g.estimated, 0);
    const paid = groups.reduce((a, g) => a + g.paid, 0);
    const approved = groups.reduce((a, g) => a + g.approved, 0);
    const actual = paid + approved;
    const v = budgetVariance(estimated, actual);
    return {
      project: {
        id: project.id,
        code: project.code,
        title: project.title,
        clientName: project.client?.name ?? '',
      },
      contractValue: project.budget,
      estimated,
      actual,
      paid,
      approved,
      committed: committedArtists,
      pendingApproval: expenses
        .filter((e) => e.status === 'SUBMITTED')
        .reduce((a, e) => a + e.amount, 0),
      variance: v.variance,
      utilisation: Number.isFinite(v.utilisation) ? v.utilisation : 1,
      margin: project.budget - actual,
      groups,
      expenses: expenses.slice(0, 50).map((e) => ({
        id: e.id,
        number: e.number,
        title: e.title,
        category: e.category,
        group: budgetGroupOf(e.category),
        amount: e.amount,
        status: e.status,
        incurredOn: iso(e.incurredOn),
      })),
      dataNote:
        'Figures come from the budget plan and the expenses recorded in Finance. In the demo workspace these are demonstration records, not real accounts.',
    };
  }

  async addLine(projectId: string, input: CreateBudgetLine, user: SessionUser) {
    const project = await this.database.models.Project.findById(projectId).lean<Project>();
    if (!project) throw notFound('Project');
    await this.activity.transaction(async (log) => {
      const line = (
        await this.database.models.BudgetLine.create({ projectId, ...input })
      ).toObject<BudgetLine>();
      await log({
        actorId: user.id,
        action: 'budget.line.created',
        entityType: 'budget',
        entityId: line.id,
        projectId,
        summary: `${user.name} planned ${rupees(input.estimated)} for ${input.label} (${BUDGET_GROUP_LABELS[input.group].split(' (')[0]}) on ${project.title}`,
      });
    });
    return this.project(projectId);
  }

  async updateLine(id: string, input: UpdateBudgetLine, user: SessionUser) {
    const line = await this.database.models.BudgetLine.findById(id).lean<BudgetLine>();
    if (!line) throw notFound('Budget line');
    await this.activity.transaction(async (log) => {
      await this.database.models.BudgetLine.updateOne({ _id: id }, { $set: input });
      await log({
        actorId: user.id,
        action: 'budget.line.updated',
        entityType: 'budget',
        entityId: id,
        projectId: line.projectId,
        summary:
          input.estimated !== undefined && input.estimated !== line.estimated
            ? `${user.name} changed the estimate for ${line.label} from ${rupees(line.estimated)} to ${rupees(input.estimated)}`
            : `${user.name} updated budget line ${line.label}`,
      });
    });
    return this.project(line.projectId);
  }

  async removeLine(id: string, user: SessionUser) {
    const line = await this.database.models.BudgetLine.findById(id).lean<BudgetLine>();
    if (!line) throw notFound('Budget line');
    await this.activity.transaction(async (log) => {
      await this.database.models.BudgetLine.deleteOne({ _id: id });
      await log({
        actorId: user.id,
        action: 'budget.line.deleted',
        entityType: 'budget',
        entityId: id,
        projectId: line.projectId,
        summary: `${user.name} removed budget line ${line.label} (${rupees(line.estimated)})`,
      });
    });
    return this.project(line.projectId);
  }

  /** Estimate vs actual for every project with a budget plan or costs. */
  async report() {
    const [lines, ledger, approved, projects] = await Promise.all([
      this.database.models.BudgetLine.find().lean<BudgetLine[]>(),
      this.database.models.FinancialRecord.find({ kind: 'EXPENSE', projectId: { $ne: null } }).lean<
        FinancialRecord[]
      >(),
      this.database.models.Expense.find({ status: 'APPROVED', projectId: { $ne: null } }).lean<
        Expense[]
      >(),
      this.database.models.Project.find(
        { status: { $ne: 'CANCELLED' } },
        { code: 1, title: 1 },
      ).lean<Pick<Project, '_id' | 'id' | 'code' | 'title'>[]>(),
    ]);
    return projects
      .map((p) => {
        const estimated = lines
          .filter((l) => l.projectId === p.id)
          .reduce((a, l) => a + l.estimated, 0);
        const actual =
          ledger.filter((f) => f.projectId === p.id).reduce((a, f) => a + f.amount, 0) +
          approved.filter((e) => e.projectId === p.id).reduce((a, e) => a + e.amount, 0);
        const v = budgetVariance(estimated, actual);
        return {
          id: p.id,
          code: p.code,
          title: p.title,
          estimated,
          actual,
          variance: v.variance,
          utilisation: Number.isFinite(v.utilisation) ? v.utilisation : 1,
        };
      })
      .filter((r) => r.estimated > 0 || r.actual > 0)
      .sort((a, b) => b.variance - a.variance);
  }
}
