import { Injectable } from '@nestjs/common';
import {
  TASK_STATUS_LABELS,
  wouldCreateCycle,
  type AddDependency,
  type CreateTask,
  type SessionUser,
  type TaskView,
  type UpdateTask,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { toTaskView } from '../projects/project.mapper';

const taskInclude = { assignee: true, dependsOn: { select: { dependsOnId: true } } } as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async get(id: string): Promise<TaskView> {
    const task = await this.prisma.db.task.findUnique({ where: { id }, include: taskInclude });
    if (!task) throw notFound('Task');
    return toTaskView(task);
  }

  async create(
    input: CreateTask,
    user: SessionUser,
    source: 'UI' | 'ASSISTANT' = 'UI',
  ): Promise<TaskView> {
    const project = await this.prisma.db.project.findUnique({
      where: { id: input.projectId },
      include: {
        stages: { where: { status: { in: ['ACTIVE', 'BLOCKED'] } }, select: { id: true } },
      },
    });
    if (!project) throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    const stageId = input.projectStageId ?? project.stages[0]?.id;
    if (input.projectStageId) {
      const stage = await this.prisma.db.projectStage.findFirst({
        where: { id: input.projectStageId, projectId: project.id },
      });
      if (!stage)
        throw unprocessable('INVALID_STAGE', 'The stage does not belong to this project.');
    }
    const assignee = input.assigneeId
      ? await this.prisma.db.teamMember.findUnique({ where: { id: input.assigneeId } })
      : null;
    if (input.assigneeId && !assignee)
      throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    if (assignee && !assignee.isActive)
      throw unprocessable('MEMBER_INACTIVE', `${assignee.name} is no longer on the team.`);
    if (input.parentId) {
      const parent = await this.prisma.db.task.findUnique({ where: { id: input.parentId } });
      if (!parent || parent.projectId !== project.id)
        throw unprocessable('INVALID_PARENT', 'The parent task must be in the same project.');
      if (parent.parentId)
        throw unprocessable('NESTED_SUBTASK', 'Subtasks cannot have their own subtasks.');
    }

    const { task, row } = await this.prisma.db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: { ...input, projectStageId: stageId ?? null },
      });
      const row = await this.activity.record(tx, {
        actorId: user.id,
        source,
        action: 'task.created',
        entityType: 'task',
        entityId: task.id,
        projectId: project.id,
        summary: `${user.name} added “${task.title}” to ${project.title}${assignee ? ` for ${assignee.name}` : ''}`,
      });
      return { task, row };
    });
    this.activity.publish(row);
    return this.get(task.id);
  }

  async update(
    id: string,
    input: UpdateTask,
    user: SessionUser,
    source: 'UI' | 'ASSISTANT' = 'UI',
  ): Promise<TaskView> {
    const before = await this.prisma.db.task.findUnique({
      where: { id },
      include: {
        project: { select: { title: true } },
        assignee: true,
        dependsOn: { include: { dependsOn: true } },
      },
    });
    if (!before) throw notFound('Task');

    // A task cannot start while work it depends on is unfinished.
    if (input.status && ['IN_PROGRESS', 'IN_REVIEW', 'DONE'].includes(input.status)) {
      const open = before.dependsOn.filter((d) => d.dependsOn.status !== 'DONE');
      if (open.length > 0) {
        throw unprocessable(
          'DEPENDENCIES_OPEN',
          `Finish ${open.map((d) => `“${d.dependsOn.title}”`).join(', ')} first.`,
          { taskIds: open.map((d) => d.dependsOnId) },
        );
      }
    }
    if (input.assigneeId) {
      const member = await this.prisma.db.teamMember.findUnique({
        where: { id: input.assigneeId },
      });
      if (!member) throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    }

    const statusChanged = input.status && input.status !== before.status;
    const data = {
      ...input,
      ...(statusChanged ? { completedAt: input.status === 'DONE' ? new Date() : null } : {}),
      ...(statusChanged && input.status !== 'BLOCKED' ? { blockedReason: null } : {}),
    };

    const row = await this.prisma.db.$transaction(async (tx) => {
      const after = await tx.task.update({ where: { id }, data, include: { assignee: true } });
      const parts: string[] = [];
      if (statusChanged)
        parts.push(`moved “${before.title}” to ${TASK_STATUS_LABELS[input.status!].toLowerCase()}`);
      if (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId) {
        parts.push(
          after.assignee
            ? `assigned “${before.title}” to ${after.assignee.name}`
            : `unassigned “${before.title}”`,
        );
      }
      if (parts.length === 0) parts.push(`updated “${before.title}”`);
      return this.activity.record(tx, {
        actorId: user.id,
        source,
        action: statusChanged
          ? input.status === 'DONE'
            ? 'task.completed'
            : 'task.status'
          : 'task.updated',
        entityType: 'task',
        entityId: id,
        projectId: before.projectId,
        summary: `${user.name} ${parts.join(' and ')} on ${before.project.title}`,
        metadata: { from: before.status, to: input.status ?? before.status },
      });
    });
    this.activity.publish(row);
    return this.get(id);
  }

  async remove(id: string, user: SessionUser): Promise<void> {
    const task = await this.prisma.db.task.findUnique({
      where: { id },
      include: {
        project: { select: { title: true } },
        subtasks: { select: { title: true } },
      },
    });
    if (!task) throw notFound('Task');
    // Subtasks are deleted with their parent (database cascade); the audit trail must say so.
    const subtasks = task.subtasks.length
      ? ` and its ${task.subtasks.length} subtask${task.subtasks.length > 1 ? 's' : ''}`
      : '';
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.task.delete({ where: { id } });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'task.deleted',
        entityType: 'task',
        entityId: id,
        projectId: task.projectId,
        summary: `${user.name} removed “${task.title}”${subtasks} from ${task.project.title}`,
        ...(task.subtasks.length
          ? { metadata: { subtasks: task.subtasks.map((s) => s.title) } }
          : {}),
      });
    });
    this.activity.publish(row);
  }

  async addDependency(id: string, input: AddDependency, user: SessionUser): Promise<TaskView> {
    const [task, dependsOn] = await Promise.all([
      this.prisma.db.task.findUnique({ where: { id } }),
      this.prisma.db.task.findUnique({ where: { id: input.dependsOnId } }),
    ]);
    if (!task || !dependsOn) throw notFound('Task');
    if (task.projectId !== dependsOn.projectId) {
      throw unprocessable('CROSS_PROJECT', 'Dependencies must be within the same project.');
    }
    const edges = await this.prisma.db.taskDependency.findMany({
      where: { task: { projectId: task.projectId } },
      select: { taskId: true, dependsOnId: true },
    });
    if (edges.some((e) => e.taskId === id && e.dependsOnId === input.dependsOnId)) {
      throw conflict('ALREADY_EXISTS', 'This dependency already exists.');
    }
    if (wouldCreateCycle(edges, id, input.dependsOnId)) {
      throw unprocessable('DEPENDENCY_CYCLE', 'That dependency would create a loop.');
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.taskDependency.create({ data: { taskId: id, dependsOnId: input.dependsOnId } });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'task.dependency.added',
        entityType: 'task',
        entityId: id,
        projectId: task.projectId,
        summary: `${user.name} made “${task.title}” wait for “${dependsOn.title}”`,
      });
    });
    this.activity.publish(row);
    return this.get(id);
  }

  async removeDependency(id: string, dependsOnId: string, user: SessionUser): Promise<TaskView> {
    const dep = await this.prisma.db.taskDependency.findUnique({
      where: { taskId_dependsOnId: { taskId: id, dependsOnId } },
      include: { task: true, dependsOn: true },
    });
    if (!dep) throw notFound('Dependency');
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.taskDependency.delete({
        where: { taskId_dependsOnId: { taskId: id, dependsOnId } },
      });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'task.dependency.removed',
        entityType: 'task',
        entityId: id,
        projectId: dep.task.projectId,
        summary: `${user.name} removed the dependency of “${dep.task.title}” on “${dep.dependsOn.title}”`,
      });
    });
    this.activity.publish(row);
    return this.get(id);
  }
}
