import { Injectable } from '@nestjs/common';
import type { CreateFinanceRecord, FinanceSummary, SessionUser } from '@nova/shared';
import { unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { summaryInclude, toSummary } from '../projects/project.mapper';

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Business view over DEMONSTRATION financial data (see docs/research/01-company-analysis.md). */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async summary(): Promise<FinanceSummary> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const [records, projects] = await Promise.all([
      this.prisma.db.financialRecord.findMany({ where: { occurredOn: { gte: start } } }),
      this.prisma.db.project.findMany({
        where: { status: { not: 'CANCELLED' } },
        include: summaryInclude,
      }),
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
    if (input.projectId) {
      const project = await this.prisma.db.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      const record = await tx.financialRecord.create({ data: { ...input, isDemo: true } });
      const log = await this.activity.record(tx, {
        actorId: user.id,
        action: 'finance.recorded',
        entityType: 'finance',
        entityId: record.id,
        projectId: input.projectId ?? null,
        summary: `${user.name} recorded ${input.kind === 'INCOME' ? 'income' : 'an expense'} of ₹${input.amount.toLocaleString('en-IN')} (${input.category.toLowerCase().replace('_', ' ')})`,
      });
      return { record, log };
    });
    this.activity.publish(row.log);
    return { id: row.record.id };
  }
}
