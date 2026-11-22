import { Injectable } from '@nestjs/common';
import type {
  CreateWorkflowTemplate,
  SessionUser,
  UpdateStageDefinition,
  WorkflowTemplateView,
} from '@nova/shared';
import { conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';

/** Workflow templates: the ordered stage definitions projects follow. */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async list(): Promise<WorkflowTemplateView[]> {
    const templates = await this.prisma.db.workflowTemplate.findMany({
      include: { stages: { orderBy: { order: 'asc' } }, _count: { select: { projects: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      isDefault: t.isDefault,
      projectCount: t._count.projects,
      stages: t.stages.map((s) => ({
        id: s.id,
        key: s.key,
        label: s.label,
        order: s.order,
        expectedDays: s.expectedDays,
        requiresApproval: s.requiresApproval,
        skippable: s.skippable,
        exitCriteria: s.exitCriteria,
      })),
    }));
  }

  /** New templates start as a copy of an existing one, then stages are tuned. */
  async create(input: CreateWorkflowTemplate, user: SessionUser) {
    const base = await this.prisma.db.workflowTemplate.findUnique({
      where: { id: input.basedOnId },
      include: { stages: true },
    });
    if (!base) throw notFound('Workflow template');
    const exists = await this.prisma.db.workflowTemplate.findUnique({
      where: { name: input.name },
    });
    if (exists) throw conflict('ALREADY_EXISTS', 'A workflow with this name already exists.');

    const row = await this.prisma.db.$transaction(async (tx) => {
      const t = await tx.workflowTemplate.create({
        data: {
          name: input.name,
          description: input.description,
          stages: {
            create: base.stages.map(
              ({ key, label, order, expectedDays, requiresApproval, skippable, exitCriteria }) => ({
                key,
                label,
                order,
                expectedDays,
                requiresApproval,
                skippable,
                exitCriteria,
              }),
            ),
          },
        },
      });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'workflow.created',
        entityType: 'workflow',
        entityId: t.id,
        summary: `${user.name} created workflow “${t.name}” from “${base.name}”`,
      });
    });
    this.activity.publish(row);
    return this.list();
  }

  async updateStage(stageId: string, input: UpdateStageDefinition, user: SessionUser) {
    const stage = await this.prisma.db.stageDefinition.findUnique({
      where: { id: stageId },
      include: { template: true },
    });
    if (!stage) throw notFound('Stage definition');
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.stageDefinition.update({ where: { id: stageId }, data: input });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'workflow.updated',
        entityType: 'workflow',
        entityId: stage.templateId,
        summary: `${user.name} changed ${stage.label} in “${stage.template.name}” (${Object.keys(input).join(', ')})`,
        metadata: input,
      });
    });
    this.activity.publish(row);
    return this.list();
  }
}
