import { Injectable } from '@nestjs/common';
import type {
  CreateWorkflowTemplate,
  SessionUser,
  UpdateStageDefinition,
  WorkflowTemplateView,
} from '@nova/shared';
import type { StageDefinition, WorkflowTemplate } from '@nova/db';
import { conflict, notFound } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';

type TemplateWithStages = WorkflowTemplate & { stages: StageDefinition[] };

/** Workflow templates: the ordered stage definitions projects follow. */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  async list(): Promise<WorkflowTemplateView[]> {
    const { WorkflowTemplate, Project } = this.database.models;
    const [templates, counts] = await Promise.all([
      WorkflowTemplate.find()
        .populate({ path: 'stages', options: { sort: { order: 1 } } })
        .sort({ isDefault: -1, name: 1 })
        .lean<TemplateWithStages[]>(),
      Project.aggregate<{ _id: string; n: number }>([
        { $group: { _id: '$workflowTemplateId', n: { $sum: 1 } } },
      ]),
    ]);
    const projectCount = new Map(counts.map((c) => [c._id, c.n]));
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      isDefault: t.isDefault,
      projectCount: projectCount.get(t.id) ?? 0,
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
    const { WorkflowTemplate, StageDefinition } = this.database.models;
    const base = await WorkflowTemplate.findById(input.basedOnId)
      .populate('stages')
      .lean<TemplateWithStages>();
    if (!base) throw notFound('Workflow template');
    const exists = await WorkflowTemplate.findOne({ name: input.name }).lean();
    if (exists) throw conflict('ALREADY_EXISTS', 'A workflow with this name already exists.');

    const row = await this.database.transaction(async () => {
      const t = await WorkflowTemplate.create({
        name: input.name,
        description: input.description,
      });
      const templateId = t.id;
      await StageDefinition.insertMany(
        base.stages.map(
          ({ key, label, order, expectedDays, requiresApproval, skippable, exitCriteria }) => ({
            templateId,
            key,
            label,
            order,
            expectedDays,
            requiresApproval,
            skippable,
            exitCriteria,
          }),
        ),
      );
      return this.activity.record({
        actorId: user.id,
        action: 'workflow.created',
        entityType: 'workflow',
        entityId: templateId,
        summary: `${user.name} created workflow “${t.name}” from “${base.name}”`,
      });
    });
    this.activity.publish(row);
    return this.list();
  }

  async updateStage(stageId: string, input: UpdateStageDefinition, user: SessionUser) {
    const { StageDefinition } = this.database.models;
    const stage = await StageDefinition.findById(stageId)
      .populate('template')
      .lean<StageDefinition & { template: WorkflowTemplate }>();
    if (!stage) throw notFound('Stage definition');
    const row = await this.database.transaction(async () => {
      const updated = await StageDefinition.updateOne({ _id: stageId }, { $set: input });
      if (updated.matchedCount === 0) throw notFound('Stage definition');
      return this.activity.record({
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
