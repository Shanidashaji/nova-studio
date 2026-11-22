import { Injectable } from '@nestjs/common';
import {
  canSeeProjectMoney,
  evaluateBackwardTransition,
  evaluateForwardTransition,
  STAGE_LABELS,
  type CreateProject,
  type ProjectDetail,
  type ProjectListQuery,
  type ProjectSummary,
  type SessionUser,
  type TransitionRequest,
  type UpdateProject,
} from '@nova/shared';
import type { Project, ProjectStage, StageDefinition, WorkflowTemplate } from '@nova/db';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { allocateProjectCode } from '../../common/numbering';
import { containsI } from '../../common/query';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { ScheduleConflicts } from '../schedule/schedule-conflicts';
import {
  detailFor,
  detailPopulate,
  stageSnapshots,
  summaryFor,
  summaryPopulate,
  taskSnapshots,
  toDetail,
  toSummary,
  type DetailRow,
  type FullProjectSummary,
  type SummaryRow,
  type Viewer,
} from './project.mapper';

const HEALTH_ORDER = { CRITICAL: 0, AT_RISK: 1, ON_TRACK: 2 } as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly conflicts: ScheduleConflicts,
  ) {}

  /**
   * All projects as summaries — the working set is small, so filtering by computed fields happens
   * in memory. `viewer` decides whether budget and spend are included (`canSeeProjectMoney`).
   */
  async list(query: ProjectListQuery, viewer: Viewer): Promise<ProjectSummary[]> {
    const { Project, ProjectMember, Client } = this.database.models;
    const where: Record<string, unknown> = {
      ...(query.status === 'ACTIVE' ? { status: { $in: ['ACTIVE', 'ON_HOLD'] } } : {}),
      ...(query.status === 'DELIVERED' ? { status: 'DELIVERED' } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.memberId
        ? {
            _id: {
              $in: await ProjectMember.distinct('projectId', { teamMemberId: query.memberId }),
            },
          }
        : {}),
      ...(query.q
        ? {
            $or: [
              { title: containsI(query.q) },
              { code: containsI(query.q) },
              { clientId: { $in: await Client.distinct('_id', { name: containsI(query.q) }) } },
            ],
          }
        : {}),
    };
    const rows = await Project.find(where).populate(summaryPopulate).lean<SummaryRow[]>();
    const now = new Date();
    let items = rows.map((p) => toSummary(p, now));
    if (query.stage) items = items.filter((p) => p.stage?.key === query.stage);
    if (query.health) items = items.filter((p) => p.health.band === query.health);

    const sorters: Record<
      ProjectListQuery['sort'],
      (a: FullProjectSummary, b: FullProjectSummary) => number
    > = {
      due: (a, b) => a.dueDate.localeCompare(b.dueDate),
      health: (a, b) =>
        HEALTH_ORDER[a.health.band] - HEALTH_ORDER[b.health.band] ||
        a.health.score - b.health.score,
      progress: (a, b) => b.progress - a.progress,
      title: (a, b) => a.title.localeCompare(b.title),
      budget: (a, b) => b.budget - a.budget,
    };
    // Ordering by budget would reveal the ranking to a caller who may not see the figures.
    const sort =
      query.sort === 'budget' && !canSeeProjectMoney(viewer.permissions) ? 'due' : query.sort;
    return items.sort(sorters[sort]).map((p) => summaryFor(p, viewer));
  }

  async get(id: string, viewer: Viewer): Promise<ProjectDetail> {
    const project = await this.database.models.Project.findById(id)
      .populate(detailPopulate)
      .lean<DetailRow>();
    if (!project) throw notFound('Project');
    const conflicts = await this.conflicts.forShoots(project.shoots.map((s) => s.id));
    return detailFor(toDetail(project, new Date(), conflicts), viewer);
  }

  async create(input: CreateProject, user: SessionUser): Promise<ProjectDetail> {
    const { Project, ProjectStage, StageTransition, WorkflowTemplate, Client } =
      this.database.models;
    const template = await WorkflowTemplate.findById(input.workflowTemplateId)
      .populate({ path: 'stages', options: { sort: { order: 1 } } })
      .lean<WorkflowTemplate & { stages: StageDefinition[] }>();
    if (!template) throw unprocessable('INVALID_TEMPLATE', 'Choose an existing workflow template.');
    const client = await Client.findById(input.clientId).lean();
    if (!client) throw unprocessable('INVALID_CLIENT', 'Choose an existing client.');

    const now = new Date();
    const project = await this.database.transaction(async () => {
      // Serialised allocation: concurrent creators never receive the same code.
      const code = await allocateProjectCode(this.database, now);
      const created = (
        await Project.create({
          code,
          title: input.title,
          logline: input.logline,
          clientId: input.clientId,
          type: input.type,
          workflowTemplateId: template.id,
          priority: input.priority,
          location: input.location,
          startDate: input.startDate,
          dueDate: input.dueDate,
          budget: input.budget,
          includedRevisions: input.includedRevisions,
          aiAssisted: input.aiAssisted,
        })
      ).toObject<Project>();
      let firstStageId: string | null = null;
      for (const [i, def] of template.stages.entries()) {
        const stage = await ProjectStage.create({
          projectId: created.id,
          stageDefinitionId: def.id,
          status: i === 0 ? 'ACTIVE' : 'PENDING',
          startedAt: i === 0 ? now : null,
        });
        if (i === 0) firstStageId = stage.id;
      }
      await StageTransition.create({
        projectId: created.id,
        toStageId: firstStageId,
        direction: 'FORWARD',
        actorId: user.id,
        reason: 'Project opened',
      });
      const row = await this.activity.record({
        actorId: user.id,
        action: 'project.created',
        entityType: 'project',
        entityId: created.id,
        projectId: created.id,
        summary: `${user.name} opened ${code} “${created.title}” for ${client.name}`,
      });
      return { created, row };
    });
    this.activity.publish(project.row);
    return this.get(project.created.id, user);
  }

  async update(id: string, input: UpdateProject, user: SessionUser): Promise<ProjectDetail> {
    const { Project } = this.database.models;
    const before = await Project.findById(id).lean<Project>();
    if (!before) throw notFound('Project');
    // Delivery is the end of the workflow: it is reached by completing the last stage, and a
    // delivered project is a closed record. Editing the status may only pause, resume or cancel.
    if (input.status && input.status !== before.status && before.status === 'DELIVERED') {
      throw unprocessable(
        'PROJECT_DELIVERED',
        `${before.title} has been delivered; its status can no longer be changed.`,
      );
    }
    if (input.dueDate && input.dueDate <= before.startDate) {
      throw unprocessable('INVALID_DUE_DATE', 'The due date must be after the start date.');
    }
    const changes = Object.entries(input).filter(
      ([k, v]) => v !== undefined && String(v) !== String(before[k as keyof typeof before]),
    );
    if (changes.length === 0) return this.get(id, user);

    const row = await this.database.transaction(async () => {
      const updated = await Project.updateOne({ _id: id }, { $set: input });
      if (updated.matchedCount === 0) throw notFound('Project');
      return this.activity.record({
        actorId: user.id,
        action: 'project.updated',
        entityType: 'project',
        entityId: id,
        projectId: id,
        summary: `${user.name} updated ${changes.map(([k]) => k).join(', ')} on ${before.title}`,
        metadata: Object.fromEntries(
          changes.map(([k, v]) => [
            k,
            { from: String(before[k as keyof typeof before]), to: String(v) },
          ]),
        ),
      });
    });
    this.activity.publish(row);
    return this.get(id, user);
  }

  /** Skips a future stage the workflow template marks as skippable (e.g. pre-production on a reel). */
  async skipStage(projectId: string, stageId: string, user: SessionUser): Promise<ProjectDetail> {
    const { ProjectStage } = this.database.models;
    const stage = await ProjectStage.findOne({ _id: stageId, projectId })
      .populate([{ path: 'stageDefinition' }, { path: 'project', select: { title: 1, status: 1 } }])
      .lean<
        ProjectStage & {
          stageDefinition: StageDefinition;
          project: Pick<Project, '_id' | 'id' | 'title' | 'status'>;
        }
      >();
    if (!stage) throw notFound('Stage');
    if (stage.project.status === 'DELIVERED' || stage.project.status === 'CANCELLED') {
      throw unprocessable(
        'PROJECT_NOT_ACTIVE',
        `The project is ${stage.project.status.toLowerCase()}.`,
      );
    }
    if (!stage.stageDefinition.skippable) {
      throw unprocessable(
        'NOT_SKIPPABLE',
        `${stage.stageDefinition.label} cannot be skipped on this workflow.`,
      );
    }
    if (stage.status !== 'PENDING') {
      throw unprocessable('NOT_PENDING', 'Only stages that have not started can be skipped.');
    }
    const row = await this.database.transaction(async () => {
      // Guarded write: the stage may have been started by a transition since it was read.
      const skipped = await ProjectStage.updateMany(
        { _id: stageId, status: 'PENDING' },
        { $set: { status: 'SKIPPED' } },
      );
      if (skipped.matchedCount === 0) {
        throw conflict('NOT_PENDING', 'This stage has already started and cannot be skipped.');
      }
      return this.activity.record({
        actorId: user.id,
        action: 'project.stage.skipped',
        entityType: 'project',
        entityId: projectId,
        projectId,
        summary: `${user.name} skipped ${stage.stageDefinition.label} on ${stage.project.title}`,
      });
    });
    this.activity.publish(row);
    return this.get(projectId, user);
  }

  /** Moves the project through its workflow, enforcing the shared transition rules. */
  async transition(
    id: string,
    input: TransitionRequest,
    user: SessionUser,
    source: 'UI' | 'ASSISTANT' = 'UI',
  ): Promise<ProjectDetail> {
    const { Project, ProjectStage, Deliverable, StageTransition } = this.database.models;
    const project = await Project.findById(id).populate(summaryPopulate).lean<SummaryRow>();
    if (!project) throw notFound('Project');
    const stages = stageSnapshots(project.stages);
    const evaluation =
      input.direction === 'FORWARD'
        ? evaluateForwardTransition({
            projectStatus: project.status,
            stages,
            tasks: taskSnapshots(project.tasks),
            targetStageId: input.targetStageId,
          })
        : evaluateBackwardTransition({
            projectStatus: project.status,
            stages,
            targetStageId: input.targetStageId,
            reason: input.reason,
          });

    if (!evaluation.ok) {
      throw unprocessable(
        'TRANSITION_BLOCKED',
        evaluation.blockers.map((b) => b.message).join(' '),
        {
          blockers: evaluation.blockers,
        },
      );
    }

    const { from, to } = evaluation;
    const now = new Date();
    const row = await this.database.transaction(async () => {
      // The rules were evaluated on a snapshot. Leaving the stage is a guarded write, so two
      // simultaneous requests cannot both move the project out of the same stage.
      const left = await ProjectStage.updateMany(
        { _id: from.id, status: { $in: ['ACTIVE', 'BLOCKED'] } },
        {
          $set:
            input.direction === 'FORWARD'
              ? { status: 'DONE', completedAt: now }
              : { status: 'PENDING', completedAt: null },
        },
      );
      if (left.matchedCount === 0) {
        throw conflict(
          'STAGE_CHANGED',
          `${project.title} has already moved on from ${from.label}. Reload and try again.`,
        );
      }
      if (input.direction === 'FORWARD') {
        if (to) {
          const started = await ProjectStage.updateOne(
            { _id: to.id },
            { $set: { status: 'ACTIVE', startedAt: now, completedAt: null } },
          );
          if (started.matchedCount === 0) throw notFound('Stage');
        } else {
          const delivered = await Project.updateOne(
            { _id: id },
            { $set: { status: 'DELIVERED', deliveredAt: now } },
          );
          if (delivered.matchedCount === 0) throw notFound('Project');
          await Deliverable.updateMany(
            { projectId: id, status: 'APPROVED' },
            { $set: { status: 'DELIVERED' } },
          );
        }
      } else {
        // Sending work back: the target becomes active again; it and everything after it reopen.
        const reopen = stages
          .filter((s) => s.order > to!.order && s.status !== 'SKIPPED')
          .map((s) => s.id);
        await ProjectStage.updateMany(
          { _id: { $in: reopen } },
          { $set: { status: 'PENDING', completedAt: null } },
        );
        const restarted = await ProjectStage.updateOne(
          { _id: to!.id },
          { $set: { status: 'ACTIVE', startedAt: now, completedAt: null } },
        );
        if (restarted.matchedCount === 0) throw notFound('Stage');
      }
      await StageTransition.create({
        projectId: id,
        fromStageId: from.id,
        toStageId: to?.id ?? null,
        direction: input.direction,
        reason: input.direction === 'BACKWARD' ? input.reason : null,
        actorId: user.id,
        source,
      });
      const summary =
        input.direction === 'BACKWARD'
          ? `${user.name} sent ${project.title} back from ${from.label} to ${to!.label}: ${input.reason}`
          : to
            ? `${user.name} moved ${project.title} from ${from.label} to ${to.label}`
            : `${user.name} completed ${STAGE_LABELS.DELIVERY} — ${project.title} delivered`;
      return this.activity.record({
        actorId: user.id,
        source,
        action: to ? 'project.transitioned' : 'project.delivered',
        entityType: 'project',
        entityId: id,
        projectId: id,
        summary,
        metadata: { from: from.label, to: to?.label ?? null, direction: input.direction },
      });
    });
    this.activity.publish(row);
    return this.get(id, user);
  }
}
