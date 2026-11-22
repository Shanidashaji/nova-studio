import { Injectable } from '@nestjs/common';
import type { FinancialRecord } from '@nova/db';
import type { CreateFinanceRecord, FinanceSummary, SessionUser } from '@nova/shared';
import { unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { summaryPopulate, toSummary, type SummaryRow } from '../projects/project.mapper';

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Business view over DEMONSTRATION financial data (see docs/research/01-company-analysis.md). */
@Injectable()
export class FinanceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  async summary(): Promise<FinanceSummary> {
    const { FinancialRecord: Records, Project } = this.database.models;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const [records, projects] = await Promise.all([
      Records.find({ occurredOn: { $gte: start } }).lean<FinancialRecord[]>(),
      Project.find({ status: { $ne: 'CANCELLED' } })
        .populate(summaryPopulate)
        .lean<SummaryRow[]>(),
    ]);

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      return { month: monthKey(d), income: 0, expenses: 0 };
    });
    const byMonth = new Map(months.map((m) => [m.month, m]));
    const byCategory = new Map<string, FinanceSummary['byCategory'][number]>();
    for (const r of records) {
      const m = byMonth.get(monthKey(r.occurredOn));
      if (m) m[r.kind === 'INCOME' ? 'income' : 'expenses'] += r.amount;
      const key = `${r.kind}:${r.category}`;
      const entry = byCategory.get(key) ?? { category: r.category, kind: r.kind, amount: 0 };
      entry.amount += r.amount;
      byCategory.set(key, entry);
    }
    const income = months.reduce((n, m) => n + m.income, 0);
    const expenses = months.reduce((n, m) => n + m.expenses, 0);

    return {
      isDemo: true,
      months,
      totals: {
        income,
        expenses,
        margin: income > 0 ? Math.round(((income - expenses) / income) * 1000) / 10 : 0,
      },
      byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
      projects: projects
        .map((p) => {
          const s = toSummary(p, now);
          const invoiced = p.finances
            .filter((f) => f.kind === 'INCOME')
            .reduce((n, f) => n + f.amount, 0);
          const burn = s.budget > 0 ? s.spent / s.budget : 0;
          return {
            id: s.id,
            code: s.code,
            title: s.title,
            client: s.client,
            budget: s.budget,
            spent: s.spent,
            invoiced,
            progress: s.progress,
            burnVsProgress: Math.round((burn - s.progress) * 100) / 100,
          };
        })
        .sort((a, b) => b.burnVsProgress - a.burnVsProgress),
    };
  }

  async create(input: CreateFinanceRecord, user: SessionUser) {
    const { FinancialRecord: Records, Project } = this.database.models;
    if (input.projectId) {
      const project = await Project.exists({ _id: input.projectId });
      if (!project) throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    }
    const row = await this.database.transaction(async () => {
      const record = await Records.create({ ...input, isDemo: true });
      const log = await this.activity.record({
        actorId: user.id,
        action: 'finance.recorded',
        entityType: 'finance',
        entityId: record._id,
        projectId: input.projectId ?? null,
        summary: `${user.name} recorded ${input.kind === 'INCOME' ? 'income' : 'an expense'} of ₹${input.amount.toLocaleString('en-IN')} (${input.category.toLowerCase().replace('_', ' ')})`,
      });
      return { id: record._id, log };
    });
    this.activity.publish(row.log);
    return { id: row.id };
  }
}
