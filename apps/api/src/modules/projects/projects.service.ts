import { Injectable } from '@nestjs/common';
import {
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
import type { Prisma } from '@nova/db';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ScheduleConflicts } from '../schedule/schedule-conflicts';
import {
  detailInclude,
  stageSnapshots,
  summaryInclude,
  taskSnapshots,
  toDetail,
  toSummary,
} from './project.mapper';

const HEALTH_ORDER = { CRITICAL: 0, AT_RISK: 1, ON_TRACK: 2 } as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly conflicts: ScheduleConflicts,
  ) {}

  /** All projects as summaries — the working set is small, so filtering by computed fields happens in memory. */
  async list(query: ProjectListQuery): Promise<ProjectSummary[]> {
    const where: Prisma.ProjectWhereInput = {
      ...(query.status === 'ACTIVE' ? { status: { in: ['ACTIVE', 'ON_HOLD'] } } : {}),
      ...(query.status === 'DELIVERED' ? { status: 'DELIVERED' } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.memberId ? { members: { some: { teamMemberId: query.memberId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { code: { contains: query.q, mode: 'insensitive' } },
              { client: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.db.project.findMany({ where, include: summaryInclude });
    const now = new Date();
    let items = rows.map((p) => toSummary(p, now));
    if (query.stage) items = items.filter((p) => p.stage?.key === query.stage);
    if (query.health) items = items.filter((p) => p.health.band === query.health);

    const sorters: Record<
      ProjectListQuery['sort'],
      (a: ProjectSummary, b: ProjectSummary) => number
    > = {
      due: (a, b) => a.dueDate.localeCompare(b.dueDate),
      health: (a, b) =>
        HEALTH_ORDER[a.health.band] - HEALTH_ORDER[b.health.band] ||
        a.health.score - b.health.score,
      progress: (a, b) => b.progress - a.progress,
      title: (a, b) => a.title.localeCompare(b.title),
      budget: (a, b) => b.budget - a.budget,
    };
    return items.sort(sorters[query.sort]);
  }

  async get(id: string): Promise<ProjectDetail> {
    const project = await this.prisma.db.project.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!project) throw notFound('Project');
    const conflicts = await this.conflicts.forShoots(project.shoots.map((s) => s.id));
    return toDetail(project, new Date(), conflicts);
  }

  async create(input: CreateProject, user: SessionUser): Promise<ProjectDetail> {
    const template = await this.prisma.db.workflowTemplate.findUnique({
      where: { id: input.workflowTemplateId },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!template) throw unprocessable('INVALID_TEMPLATE', 'Choose an existing workflow template.');
    const client = await this.prisma.db.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw unprocessable('INVALID_CLIENT', 'Choose an existing client.');

    const now = new Date();
    const project = await this.prisma.db.$transaction(async (tx) => {
      const code = await nextProjectCode(tx, now);
      const created = await tx.project.create({
        data: {
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
        },
      });
      let firstStageId: string | null = null;
      for (const [i, def] of template.stages.entries()) {
        const stage = await tx.projectStage.create({
          data: {
            projectId: created.id,
            stageDefinitionId: def.id,
            status: i === 0 ? 'ACTIVE' : 'PENDING',
            startedAt: i === 0 ? now : null,
          },
        });
        if (i === 0) firstStageId = stage.id;
      }
      await tx.stageTransition.create({
        data: {
          projectId: created.id,
          toStageId: firstStageId,
          direction: 'FORWARD',
          actorId: user.id,
          reason: 'Project opened',
        },
      });
      const row = await this.activity.record(tx, {
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
    return this.get(project.created.id);
  }

  async update(id: string, input: UpdateProject, user: SessionUser): Promise<ProjectDetail> {
    const before = await this.prisma.db.project.findUnique({ where: { id } });
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
    if (changes.length === 0) return this.get(id);

    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: input });
      return this.activity.record(tx, {
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
    return this.get(id);
  }

  /** Skips a future stage the workflow template marks as skippable (e.g. pre-production on a reel). */
  async skipStage(projectId: string, stageId: string, user: SessionUser): Promise<ProjectDetail> {
    const stage = await this.prisma.db.projectStage.findFirst({
      where: { id: stageId, projectId },
      include: { stageDefinition: true, project: { select: { title: true, status: true } } },
    });
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
    const row = await this.prisma.db.$transaction(async (tx) => {
      // Guarded write: the stage may have been started by a transition since it was read.
      const skipped = await tx.projectStage.updateMany({
        where: { id: stageId, status: 'PENDING' },
        data: { status: 'SKIPPED' },
      });
      if (skipped.count === 0) {
        throw conflict('NOT_PENDING', 'This stage has already started and cannot be skipped.');
      }
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'project.stage.skipped',
        entityType: 'project',
        entityId: projectId,
        projectId,
        summary: `${user.name} skipped ${stage.stageDefinition.label} on ${stage.project.title}`,
      });
    });
    this.activity.publish(row);
    return this.get(projectId);
  }

  /** Moves the project through its workflow, enforcing the shared transition rules. */
  async transition(
    id: string,
    input: TransitionRequest,
    user: SessionUser,
    source: 'UI' | 'ASSISTANT' = 'UI',
  ): Promise<ProjectDetail> {
    const project = await this.prisma.db.project.findUnique({
      where: { id },
      include: summaryInclude,
    });
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
    const row = await this.prisma.db.$transaction(async (tx) => {
      // The rules were evaluated on a snapshot. Leaving the stage is a guarded write, so two
      // simultaneous requests cannot both move the project out of the same stage.
      const left = await tx.projectStage.updateMany({
        where: { id: from.id, status: { in: ['ACTIVE', 'BLOCKED'] } },
        data:
          input.direction === 'FORWARD'
            ? { status: 'DONE', completedAt: now }
            : { status: 'PENDING', completedAt: null },
      });
      if (left.count === 0) {
        throw conflict(
          'STAGE_CHANGED',
          `${project.title} has already moved on from ${from.label}. Reload and try again.`,
        );
      }
      if (input.direction === 'FORWARD') {
        if (to) {
          await tx.projectStage.update({
            where: { id: to.id },
            data: { status: 'ACTIVE', startedAt: now, completedAt: null },
          });
        } else {
          await tx.project.update({
            where: { id },
            data: { status: 'DELIVERED', deliveredAt: now },
          });
          await tx.deliverable.updateMany({
            where: { projectId: id, status: 'APPROVED' },
            data: { status: 'DELIVERED' },
          });
        }
      } else {
        // Sending work back: the target becomes active again; it and everything after it reopen.
        const reopen = stages
          .filter((s) => s.order > to!.order && s.status !== 'SKIPPED')
          .map((s) => s.id);
        await tx.projectStage.updateMany({
          where: { id: { in: reopen } },
          data: { status: 'PENDING', completedAt: null },
        });
        await tx.projectStage.update({
          where: { id: to!.id },
          data: { status: 'ACTIVE', startedAt: now, completedAt: null },
        });
      }
      await tx.stageTransition.create({
        data: {
          projectId: id,
          fromStageId: from.id,
          toStageId: to?.id ?? null,
          direction: input.direction,
          reason: input.direction === 'BACKWARD' ? input.reason : null,
          actorId: user.id,
          source,
        },
      });
      const summary =
        input.direction === 'BACKWARD'
          ? `${user.name} sent ${project.title} back from ${from.label} to ${to!.label}: ${input.reason}`
          : to
            ? `${user.name} moved ${project.title} from ${from.label} to ${to.label}`
            : `${user.name} completed ${STAGE_LABELS.DELIVERY} — ${project.title} delivered`;
      return this.activity.record(tx, {
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
    return this.get(id);
  }
}

/** Project codes follow NM-YY-NNN; the sequence continues from the highest existing code. */
async function nextProjectCode(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  // Serialises concurrent creators for the length of the transaction, so two requests never
  // read the same "highest" code.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nova-seq-project'))`;
  const year = String(now.getFullYear()).slice(2);
  const codes = await tx.project.findMany({ select: { code: true } });
  const max = codes.reduce((n, { code }) => Math.max(n, Number(/(\d+)$/.exec(code)?.[1] ?? 0)), 0);
  return `NM-${year}-${String(max + 1).padStart(3, '0')}`;
}
