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
import type { Project, ProjectStage, Task, TaskDependency, TeamMember } from '@nova/db';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { taskViewPopulate, toTaskView, type TaskViewRow } from '../projects/project.mapper';

@Injectable()
export class TasksService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  async get(id: string): Promise<TaskView> {
    const task = await this.database.models.Task.findById(id)
      .populate(taskViewPopulate)
      .lean<TaskViewRow>();
    if (!task) throw notFound('Task');
    return toTaskView(task);
  }

  async create(
    input: CreateTask,
    user: SessionUser,
    source: 'UI' | 'ASSISTANT' = 'UI',
  ): Promise<TaskView> {
    const { Project, ProjectStage, TeamMember, Task } = this.database.models;
    const project = await Project.findById(input.projectId)
      .populate({
        path: 'stages',
        match: { status: { $in: ['ACTIVE', 'BLOCKED'] } },
        select: { projectId: 1 },
      })
      .lean<Project & { stages: Pick<ProjectStage, '_id' | 'id' | 'projectId'>[] }>();
    if (!project) throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    const stageId = input.projectStageId ?? project.stages[0]?.id;
    if (input.projectStageId) {
      const stage = await ProjectStage.findOne({
        _id: input.projectStageId,
        projectId: project.id,
      }).lean();
      if (!stage)
        throw unprocessable('INVALID_STAGE', 'The stage does not belong to this project.');
    }
    const assignee = input.assigneeId
      ? await TeamMember.findById(input.assigneeId).lean<TeamMember>()
      : null;
    if (input.assigneeId && !assignee)
      throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    if (assignee && !assignee.isActive)
      throw unprocessable('MEMBER_INACTIVE', `${assignee.name} is no longer on the team.`);
    if (input.shootId) {
      const shoot = await this.database.models.Shoot.findById(input.shootId, {
        projectId: 1,
      }).lean();
      if (!shoot || shoot.projectId !== project.id)
        throw unprocessable('INVALID_SHOOT', 'The shoot must belong to the same project.');
    }
    if (input.parentId) {
      const parent = await Task.findById(input.parentId).lean<Task>();
      if (!parent || parent.projectId !== project.id)
        throw unprocessable('INVALID_PARENT', 'The parent task must be in the same project.');
      if (parent.parentId)
        throw unprocessable('NESTED_SUBTASK', 'Subtasks cannot have their own subtasks.');
    }

    const { task, row } = await this.database.transaction(async () => {
      const task = (
        await Task.create({ ...input, projectStageId: stageId ?? null })
      ).toObject<Task>();
      const row = await this.activity.record({
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
    const { Task, TeamMember } = this.database.models;
    const before = await Task.findById(id)
      .populate([
        { path: 'project', select: { title: 1 } },
        { path: 'assignee' },
        { path: 'dependsOn', populate: { path: 'dependsOn' } },
      ])
      .lean<
        Task & {
          project: Pick<Project, '_id' | 'id' | 'title'>;
          assignee: TeamMember | null;
          dependsOn: (TaskDependency & { dependsOn: Task })[];
        }
      >();
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
      const member = await TeamMember.findById(input.assigneeId).lean();
      if (!member) throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    }
    if (input.shootId) {
      const shoot = await this.database.models.Shoot.findById(input.shootId, {
        projectId: 1,
      }).lean();
      if (!shoot || shoot.projectId !== before.projectId)
        throw unprocessable('INVALID_SHOOT', 'The shoot must belong to the same project.');
    }

    const statusChanged = input.status && input.status !== before.status;
    const data = {
      ...input,
      ...(statusChanged ? { completedAt: input.status === 'DONE' ? new Date() : null } : {}),
      ...(statusChanged && input.status !== 'BLOCKED' ? { blockedReason: null } : {}),
    };

    const row = await this.database.transaction(async () => {
      const after = await Task.findByIdAndUpdate(id, { $set: data }, { new: true })
        .populate('assignee')
        .lean<Task & { assignee: TeamMember | null }>();
      if (!after) throw notFound('Task');
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
      return this.activity.record({
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
    const task = await this.database.models.Task.findById(id)
      .populate([
        { path: 'project', select: { title: 1 } },
        { path: 'subtasks', select: { title: 1, parentId: 1 } },
      ])
      .lean<
        Task & {
          project: Pick<Project, '_id' | 'id' | 'title'>;
          subtasks: Pick<Task, '_id' | 'id' | 'title' | 'parentId'>[];
        }
      >();
    if (!task) throw notFound('Task');
    // Subtasks are deleted with their parent (cascade, as the former foreign key did); the
    // audit trail must say so.
    const subtasks = task.subtasks.length
      ? ` and its ${task.subtasks.length} subtask${task.subtasks.length > 1 ? 's' : ''}`
      : '';
    const row = await this.database.transaction(async () => {
      // Cascades to subtasks and to dependency edges in both directions.
      const deleted = await this.database.deleteCascade('Task', { _id: id });
      if (deleted === 0) throw notFound('Task');
      return this.activity.record({
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
    const { Task, TaskDependency } = this.database.models;
    const [task, dependsOn] = await Promise.all([
      Task.findById(id).lean<Task>(),
      Task.findById(input.dependsOnId).lean<Task>(),
    ]);
    if (!task || !dependsOn) throw notFound('Task');
    if (task.projectId !== dependsOn.projectId) {
      throw unprocessable('CROSS_PROJECT', 'Dependencies must be within the same project.');
    }
    const projectTaskIds = await Task.distinct('_id', { projectId: task.projectId });
    const edges = await TaskDependency.find(
      { taskId: { $in: projectTaskIds } },
      { taskId: 1, dependsOnId: 1 },
    ).lean<Pick<TaskDependency, '_id' | 'id' | 'taskId' | 'dependsOnId'>[]>();
    if (edges.some((e) => e.taskId === id && e.dependsOnId === input.dependsOnId)) {
      throw conflict('ALREADY_EXISTS', 'This dependency already exists.');
    }
    if (wouldCreateCycle(edges, id, input.dependsOnId)) {
      throw unprocessable('DEPENDENCY_CYCLE', 'That dependency would create a loop.');
    }
    const row = await this.database.transaction(async () => {
      await TaskDependency.create({ taskId: id, dependsOnId: input.dependsOnId });
      return this.activity.record({
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
    const { TaskDependency } = this.database.models;
    const dep = await TaskDependency.findOne({ taskId: id, dependsOnId })
      .populate([{ path: 'task' }, { path: 'dependsOn' }])
      .lean<TaskDependency & { task: Task; dependsOn: Task }>();
    if (!dep) throw notFound('Dependency');
    const row = await this.database.transaction(async () => {
      const deleted = await TaskDependency.deleteOne({ taskId: id, dependsOnId });
      if (deleted.deletedCount === 0) throw notFound('Dependency');
      return this.activity.record({
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
