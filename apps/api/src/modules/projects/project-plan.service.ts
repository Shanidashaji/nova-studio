import { Injectable } from '@nestjs/common';
import {
  riskScore,
  type CreateMilestone,
  type MilestoneView,
  type RiskView,
  type SessionUser,
  type UpdateMilestone,
  type UpsertRisk,
} from '@nova/shared';
import { notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { iso, isoOrNull } from './project.mapper';

/** Milestones (billing points) and the risk register of a project. */
@Injectable()
export class ProjectPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private async project(id: string) {
    const p = await this.prisma.db.project.findUnique({ where: { id } });
    if (!p) throw notFound('Project');
    return p;
  }

  async milestones(projectId: string): Promise<MilestoneView[]> {
    await this.project(projectId);
    const rows = await this.prisma.db.milestone.findMany({
      where: { projectId },
      include: { invoices: { where: { status: { not: 'VOID' } }, select: { id: true } } },
      orderBy: { dueDate: 'asc' },
    });
    return rows.map((m) => ({
      id: m.id,
      title: m.title,
      dueDate: iso(m.dueDate),
      completedAt: isoOrNull(m.completedAt),
      billingAmount: m.billingAmount,
      invoiced: m.invoices.length > 0,
    }));
  }

  async addMilestone(projectId: string, input: CreateMilestone, user: SessionUser) {
    const p = await this.project(projectId);
    await this.activity.transaction(async (tx, log) => {
      const m = await tx.milestone.create({ data: { ...input, projectId } });
      await log({
        actorId: user.id,
        action: 'milestone.created',
        entityType: 'milestone',
        entityId: m.id,
        projectId,
        summary: `${user.name} added milestone “${m.title}” to ${p.title}`,
      });
    });
    return this.milestones(projectId);
  }

  async updateMilestone(projectId: string, id: string, input: UpdateMilestone, user: SessionUser) {
    const m = await this.prisma.db.milestone.findFirst({ where: { id, projectId } });
    if (!m) throw notFound('Milestone');
    await this.activity.transaction(async (tx, log) => {
      await tx.milestone.update({
        where: { id },
        data: {
          title: input.title,
          dueDate: input.dueDate,
          ...(input.completed === undefined
            ? {}
            : { completedAt: input.completed ? (m.completedAt ?? new Date()) : null }),
        },
      });
      await log({
        actorId: user.id,
        action: input.completed ? 'milestone.reached' : 'milestone.updated',
        entityType: 'milestone',
        entityId: id,
        projectId,
        summary: input.completed
          ? `${user.name} marked milestone “${m.title}” as reached`
          : `${user.name} updated milestone “${input.title ?? m.title}”`,
      });
    });
    return this.milestones(projectId);
  }

  async risks(projectId: string): Promise<RiskView[]> {
    await this.project(projectId);
    const rows = await this.prisma.db.projectRisk.findMany({
      where: { projectId },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    return rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        likelihood: r.likelihood,
        impact: r.impact,
        score: riskScore(r.likelihood, r.impact),
        mitigation: r.mitigation,
        status: r.status,
        owner: r.owner,
        updatedAt: iso(r.updatedAt),
      }))
      .sort(
        (a, b) => Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') || b.score - a.score,
      );
  }

  async upsertRisk(projectId: string, id: string | null, input: UpsertRisk, user: SessionUser) {
    const p = await this.project(projectId);
    if (
      input.ownerId &&
      !(await this.prisma.db.teamMember.findUnique({ where: { id: input.ownerId } }))
    ) {
      throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    }
    if (id && !(await this.prisma.db.projectRisk.findFirst({ where: { id, projectId } }))) {
      throw notFound('Risk');
    }
    await this.activity.transaction(async (tx, log) => {
      const data = { ...input, ownerId: input.ownerId ?? null };
      const r = id
        ? await tx.projectRisk.update({ where: { id }, data })
        : await tx.projectRisk.create({ data: { ...data, projectId } });
      await log({
        actorId: user.id,
        action: id ? 'risk.updated' : 'risk.created',
        entityType: 'risk',
        entityId: r.id,
        projectId,
        summary: id
          ? `${user.name} updated risk “${r.title}” on ${p.title} (${r.status.toLowerCase()})`
          : `${user.name} logged risk “${r.title}” on ${p.title} (score ${riskScore(r.likelihood, r.impact)}/9)`,
      });
    });
    return this.risks(projectId);
  }
}
