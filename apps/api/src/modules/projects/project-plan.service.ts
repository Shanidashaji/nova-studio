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
import {
  RiskStatus,
  type Invoice,
  type Milestone,
  type Project,
  type ProjectRisk,
  type TeamMember,
} from '@nova/db';
import { notFound, unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { iso, isoOrNull } from './project.mapper';

/** Declaration order of the risk statuses (the former enum's sort order). */
const RISK_STATUS_ORDER: readonly string[] = Object.values(RiskStatus);

/** Milestones (billing points) and the risk register of a project. */
@Injectable()
export class ProjectPlanService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  private async project(id: string) {
    const p = await this.database.models.Project.findById(id).lean<Project>();
    if (!p) throw notFound('Project');
    return p;
  }

  async milestones(projectId: string): Promise<MilestoneView[]> {
    await this.project(projectId);
    const rows = await this.database.models.Milestone.find({ projectId })
      .populate({
        path: 'invoices',
        match: { status: { $ne: 'VOID' } },
        select: { milestoneId: 1 },
      })
      .sort({ dueDate: 1 })
      .lean<(Milestone & { invoices: Pick<Invoice, '_id' | 'id' | 'milestoneId'>[] })[]>();
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
    await this.activity.transaction(async (log) => {
      const m = await this.database.models.Milestone.create({ ...input, projectId });
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
    const { Milestone } = this.database.models;
    const m = await Milestone.findOne({ _id: id, projectId }).lean<Milestone>();
    if (!m) throw notFound('Milestone');
    await this.activity.transaction(async (log) => {
      const updated = await Milestone.updateOne(
        { _id: id },
        {
          $set: {
            title: input.title,
            dueDate: input.dueDate,
            ...(input.completed === undefined
              ? {}
              : { completedAt: input.completed ? (m.completedAt ?? new Date()) : null }),
          },
        },
      );
      if (updated.matchedCount === 0) throw notFound('Milestone');
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
    const rows = await this.database.models.ProjectRisk.find({ projectId })
      .populate({ path: 'owner', select: { name: 1 } })
      .sort({ updatedAt: -1 })
      .lean<(ProjectRisk & { owner: Pick<TeamMember, '_id' | 'id' | 'name'> | null })[]>();
    // Status in declaration order (OPEN, MITIGATED, CLOSED) as the former enum sorted; the
    // sort is stable, so the newest-first order holds within a status.
    rows.sort((a, b) => RISK_STATUS_ORDER.indexOf(a.status) - RISK_STATUS_ORDER.indexOf(b.status));
    return rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        likelihood: r.likelihood,
        impact: r.impact,
        score: riskScore(r.likelihood, r.impact),
        mitigation: r.mitigation,
        status: r.status,
        owner: r.owner ? { id: r.owner.id, name: r.owner.name } : null,
        updatedAt: iso(r.updatedAt),
      }))
      .sort(
        (a, b) => Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') || b.score - a.score,
      );
  }

  async upsertRisk(projectId: string, id: string | null, input: UpsertRisk, user: SessionUser) {
    const { ProjectRisk, TeamMember } = this.database.models;
    const p = await this.project(projectId);
    if (input.ownerId && !(await TeamMember.findById(input.ownerId).lean())) {
      throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    }
    if (id && !(await ProjectRisk.findOne({ _id: id, projectId }).lean())) {
      throw notFound('Risk');
    }
    await this.activity.transaction(async (log) => {
      const data = { ...input, ownerId: input.ownerId ?? null };
      let r: ProjectRisk;
      if (id) {
        const updated = await ProjectRisk.findByIdAndUpdate(
          id,
          { $set: data },
          { new: true },
        ).lean<ProjectRisk>();
        if (!updated) throw notFound('Risk');
        r = updated;
      } else {
        r = (await ProjectRisk.create({ ...data, projectId })).toObject<ProjectRisk>();
      }
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
