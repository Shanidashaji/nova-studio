import { Injectable } from '@nestjs/common';
import {
  daysBetween,
  daysOverdue,
  DAY_MS,
  findBestMatch,
  HEALTH_BAND_LABELS,
  normalize,
  INTERACTION_TYPES,
  STAGE_LABELS,
  TASK_STATUS_LABELS,
  type AssistantReference,
  type InteractionType,
  type ProjectSummary,
  type TaskStatus,
} from '@nova/shared';
import {
  TaskStatus as TaskStatusOrder,
  type ActivityLog,
  type Approval,
  type Client,
  type Deliverable,
  type Project,
  type ProjectStage,
  type StageDefinition,
  type Task,
  type TeamMember,
} from '@nova/db';
import { notFound } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { hiddenEntityTypes } from '../activity/activity-visibility';
import { InsightsService } from '../insights/insights.service';
import { ProjectsService } from '../projects/projects.service';
import { ScheduleService } from '../schedule/schedule.service';
import { TeamService } from '../team/team.service';
import type { AssistantContext, ProposeOutcome, ToolResult } from './assistant.types';

const fmt = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
const pct = (n: number) => `${Math.round(n * 100)}%`;
/** Declaration order of the task status enum (Postgres sorted enums by it, not alphabetically). */
const STATUS_RANK = new Map<string, number>(
  Object.values(TaskStatusOrder).map((status, i) => [status, i]),
);
type ProjectWithClient = Project & { client: Client };
const projectRef = (p: { id: string; title: string }): AssistantReference => ({
  type: 'project',
  id: p.id,
  label: p.title,
});

/**
 * The assistant's capabilities, shared by the demo and Claude providers. Read tools query live
 * data; propose tools resolve entities and build a confirmable change — they never write.
 */
@Injectable()
export class AssistantTools {
  constructor(
    private readonly database: DatabaseService,
    private readonly insights: InsightsService,
    private readonly projects: ProjectsService,
    private readonly team: TeamService,
    private readonly schedule: ScheduleService,
  ) {}

  // ── Read tools ─────────────────────────────────────────────────────────────

  async attention(ctx: AssistantContext, limit = 6): Promise<ToolResult> {
    const pulse = await this.insights.pulse(ctx.user);
    const items = pulse.attention.slice(0, limit);
    if (items.length === 0) return { text: 'Nothing needs a decision right now.', references: [] };
    return {
      text: items.map((i, n) => `${n + 1}. **${i.title}** — ${i.reason}`).join('\n'),
      data: items,
      references: items.flatMap((i) => (i.project ? [projectRef(i.project)] : [])),
    };
  }

  async operations(ctx: AssistantContext): Promise<ToolResult> {
    const pulse = await this.insights.pulse(ctx.user);
    const t = pulse.totals;
    const constraint = pulse.spine.find((s) => s.isConstraint);
    const busiest = [...pulse.spine].sort((a, b) => b.wip - a.wip)[0];
    const lines = [
      `**${t.activeProjects} productions** in progress: ${pulse.spine
        .filter((s) => s.wip > 0)
        .map((s) => `${s.wip} in ${s.label}`)
        .join(', ')}.`,
      `Risk: **${t.critical} critical, ${t.atRisk} at risk**; ${t.blockedTasks} blocked task${t.blockedTasks === 1 ? '' : 's'}; ${t.pendingApprovals} client approval${t.pendingApprovals === 1 ? '' : 's'} waiting.`,
      constraint
        ? `Flow: **${constraint.label}** is the current constraint (${constraint.wip} in stage, ${constraint.throughputPerWeek}/week leaving).`
        : `Flow: ${busiest?.label} holds the most work.`,
      `Next 7 days: ${t.shootsThisWeek} shoot${t.shootsThisWeek === 1 ? '' : 's'}. Weighted sales pipeline ₹${(pulse.pipelineValue.weighted / 1e5).toFixed(1)}L (demo data).`,
    ];
    const top = pulse.attention.slice(0, 3);
    if (top.length) lines.push(`Top decisions:\n${top.map((i) => `- ${i.title}`).join('\n')}`);
    return {
      text: lines.join('\n'),
      data: pulse.totals,
      references: top.flatMap((i) => (i.project ? [projectRef(i.project)] : [])),
    };
  }

  async projectsBy(
    kind: 'delayed' | 'at_risk' | 'due_soon' | 'active',
    ctx: AssistantContext,
    days = 7,
  ): Promise<ToolResult> {
    const now = new Date();
    const list = await this.projects.list({ status: 'ACTIVE', sort: 'due' }, ctx.user);
    const pick: Record<typeof kind, (p: ProjectSummary) => boolean> = {
      delayed: (p) =>
        daysOverdue(p.dueDate, now) > 0 ||
        p.health.deductions.some((d) => d.code === 'SCHEDULE_SLIP'),
      at_risk: (p) => p.health.band !== 'ON_TRACK',
      due_soon: (p) => {
        const left = daysBetween(now, p.dueDate);
        return left >= 0 && left <= days;
      },
      active: () => true,
    };
    const hits = list.filter(pick[kind]);
    if (hits.length === 0) {
      const none = {
        delayed: 'No productions are delayed.',
        at_risk: 'Every production is on track.',
        due_soon: `Nothing is due in the next ${days} days.`,
        active: 'No active productions.',
      };
      return { text: none[kind], references: [] };
    }
    const line = (p: ProjectSummary) => {
      const late = daysOverdue(p.dueDate, now);
      const due =
        late > 0 ? `**${late} day${late > 1 ? 's' : ''} overdue**` : `due ${fmt(p.dueDate)}`;
      const why = p.health.deductions.map((d) => d.label).join('; ');
      return `- **${p.title}** (${p.code}, ${p.client.name}) — ${p.stage?.label ?? 'delivered'}, ${due}, ${pct(p.progress)} done, health ${p.health.score} ${HEALTH_BAND_LABELS[p.health.band].toLowerCase()}${why ? ` — ${why}` : ''}`;
    };
    return {
      text: hits.map(line).join('\n'),
      data: hits.map((p) => ({ id: p.id, title: p.title, dueDate: p.dueDate, health: p.health })),
      references: hits.map(projectRef),
    };
  }

  async project(ref: string, ctx: AssistantContext): Promise<ToolResult> {
    const id = await this.resolveProjectId(ref, ctx);
    if (!id) return { text: `I couldn't find a production matching “${ref}”.`, references: [] };
    const p = await this.projects.get(id, ctx.user);
    const now = new Date();
    const blockers = p.advance.ok ? [] : p.advance.blockers.map((b) => b.message);
    const pending = p.approvals.filter((a) => a.status === 'PENDING');
    const nextShoot = p.shoots.find((s) => new Date(s.endsAt) >= now);
    const lines = [
      `**${p.title}** (${p.code}) for ${p.client.name} — ${p.stage?.label ?? 'delivered'}, ${pct(p.progress)} complete, health **${p.health.score} (${HEALTH_BAND_LABELS[p.health.band]})**.`,
      `Due ${fmt(p.dueDate)}; NOVA estimate ${fmt(p.projection.projectedDelivery)}${p.projection.daysLate ? ` (${p.projection.daysLate} days late)` : ' (on time)'}.`,
      p.health.deductions.length
        ? `Risk signals: ${p.health.deductions.map((d) => d.label).join('; ')}.`
        : 'No risk signals.',
      blockers.length
        ? `Held at ${p.stage?.label}: ${blockers.join(' ')}`
        : p.advance.ok && p.advance.to
          ? `Ready to advance to ${p.advance.to.label}.`
          : '',
      pending.length
        ? `Waiting on the client: ${pending.map((a) => `${a.title} (since ${fmt(a.requestedAt)})`).join('; ')}.`
        : '',
      nextShoot
        ? `Next shoot: ${nextShoot.title}, ${fmt(nextShoot.startsAt)} at ${nextShoot.location}.`
        : '',
      // Null for a user who may not see what a production costs: the line is left out.
      p.budget !== null && p.spent !== null
        ? `Budget: ₹${(p.spent / 1e5).toFixed(1)}L of ₹${(p.budget / 1e5).toFixed(1)}L spent (demo data).`
        : '',
    ].filter(Boolean);
    return {
      text: lines.join('\n'),
      data: { id: p.id, stage: p.stage, health: p.health, blockers, pending: pending.length },
      references: [projectRef(p)],
    };
  }

  async blocked(ctx: AssistantContext): Promise<ToolResult> {
    const { Task: Tasks, Project: Projects } = this.database.models;
    const [tasks, list] = await Promise.all([
      (async () =>
        Tasks.find({
          status: 'BLOCKED',
          projectId: { $in: await Projects.distinct('_id', { status: 'ACTIVE' }) },
        })
          .populate([
            { path: 'project', select: { title: 1 } },
            { path: 'assignee', select: { name: 1 } },
          ])
          .lean<
            (Task & {
              project: Pick<Project, 'id' | 'title'>;
              assignee: Pick<TeamMember, 'id' | 'name'> | null;
            })[]
          >())(),
      this.projects.list({ status: 'ACTIVE', sort: 'health' }, ctx.user),
    ]);
    const waiting = list.filter((p) => p.pendingApprovals > 0);
    if (tasks.length === 0 && waiting.length === 0)
      return { text: 'No workflows are blocked.', references: [] };
    const lines: string[] = [];
    for (const t of tasks) {
      lines.push(
        `- **${t.project.title}**: “${t.title}” is blocked${t.isStageBlocking ? ' and holds the stage' : ''}${t.blockedReason ? ` — ${t.blockedReason}` : ''}${t.assignee ? ` (${t.assignee.name})` : ''}.`,
      );
    }
    for (const p of waiting)
      lines.push(
        `- **${p.title}**: ${p.pendingApprovals} client approval${p.pendingApprovals > 1 ? 's' : ''} pending in ${p.stage?.label ?? 'review'}.`,
      );
    const refs = [
      ...tasks.map((t) => ({ type: 'task' as const, id: t.id, label: t.title })),
      ...[
        ...new Map([...tasks.map((t) => t.project), ...waiting].map((p) => [p.id, p])).values(),
      ].map(projectRef),
    ];
    return { text: lines.join('\n'), references: refs };
  }

  async workload(): Promise<ToolResult> {
    const members = await this.team.list();
    const sorted = [...members].sort((a, b) => (b.weeks[0]?.ratio ?? 0) - (a.weeks[0]?.ratio ?? 0));
    const lines = sorted.map((m) => {
      const w = m.weeks[0]!;
      const flag = w.ratio > 1 ? ' — **over capacity**' : w.ratio < 0.4 ? ' — has room' : '';
      return `- ${m.name} (${m.title}): ${pct(w.ratio)} next 7 days (${w.hours}h of ${w.capacity}h), ${m.openTasks} open tasks${flag}`;
    });
    const over = sorted.filter((m) => (m.weeks[0]?.ratio ?? 0) > 1);
    const free = sorted.filter((m) => (m.weeks[0]?.ratio ?? 1) < 0.4);
    const head = over.length
      ? `${over.length} ${over.length === 1 ? 'person is' : 'people are'} over capacity${free.length ? `; ${free.map((m) => m.name.split(' ')[0]).join(', ')} could take work` : ''}.`
      : 'Nobody is over capacity.';
    return {
      text: `${head}\n${lines.join('\n')}`,
      data: sorted.map((m) => ({ id: m.id, name: m.name, ratio: m.weeks[0]?.ratio })),
      references: over.map((m) => ({ type: 'member' as const, id: m.id, label: m.name })),
    };
  }

  async approvals(): Promise<ToolResult> {
    const withProject = { path: 'project', populate: { path: 'client' } };
    const rows = await this.database.models.Approval.find({ status: 'PENDING' })
      .sort({ requestedAt: 1 })
      .populate([
        { path: 'deliverable', populate: withProject },
        { path: 'projectStage', populate: withProject },
      ])
      .lean<
        (Approval & {
          deliverable: (Deliverable & { project: ProjectWithClient }) | null;
          projectStage: (ProjectStage & { project: ProjectWithClient }) | null;
        })[]
      >();
    if (rows.length === 0) return { text: 'No approvals are waiting.', references: [] };
    const now = new Date();
    const lines = rows.map((a) => {
      const p = (a.deliverable?.project ?? a.projectStage?.project)!;
      return `- **${p.title}** — ${a.title}, waiting ${daysBetween(a.requestedAt, now)} days on ${p.client.name}; project due ${fmt(p.dueDate)}.`;
    });
    const refs = rows
      .map((a) => (a.deliverable?.project ?? a.projectStage?.project)!)
      .map(projectRef);
    return { text: lines.join('\n'), references: refs };
  }

  async shoots(days = 7): Promise<ToolResult> {
    const from = new Date();
    const view = await this.schedule.view({ from, to: new Date(from.getTime() + days * DAY_MS) });
    const list = view.shoots.filter((s) => s.status !== 'CANCELLED' && new Date(s.endsAt) >= from);
    if (list.length === 0) return { text: `No shoots in the next ${days} days.`, references: [] };
    const lines = list.map(
      (s) =>
        `- **${fmt(s.startsAt)}** — ${s.title} for ${s.project.title} at ${s.location}; ${s.crew.length} crew, ${s.bookings.length} items${s.conflicts.length ? ` — ⚠ ${s.conflicts[0]!.with}` : ''}.`,
    );
    return {
      text: lines.join('\n'),
      references: list.map((s) => ({ type: 'shoot' as const, id: s.id, label: s.title })),
    };
  }

  /**
   * Recap of recent changes. Reads only the audit rows this user may see (the same rule as the
   * Activity lens), over a bounded window and a bounded number of rows.
   */
  async activity(requestedDays: number, ctx: AssistantContext): Promise<ToolResult> {
    const days = Number.isFinite(requestedDays)
      ? Math.min(60, Math.max(1, Math.round(requestedDays)))
      : 7;
    const since = new Date(Date.now() - days * DAY_MS);
    const hidden = hiddenEntityTypes(ctx.user.permissions);
    const rows = await this.database.models.ActivityLog.find({
      createdAt: { $gte: since },
      ...(hidden.length ? { entityType: { $nin: hidden } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean<ActivityLog[]>();
    if (rows.length === 0) return { text: `No activity in the last ${days} days.`, references: [] };
    const count = (prefix: string) => rows.filter((r) => r.action.startsWith(prefix)).length;
    const completed = rows.filter((r) => r.action === 'task.completed').length;
    const moved = rows.filter(
      (r) => r.action === 'project.transitioned' || r.action === 'project.delivered',
    );
    const lines = [
      `**${rows.length} changes** in the last ${days} days: ${completed} tasks completed, ${moved.length} stage moves, ${count('approval.')} approval events, ${count('client.')} client interactions, ${count('shoot.') + count('asset.') + count('crew.')} scheduling changes.`,
      moved.length
        ? `Stage moves:\n${moved
            .slice(0, 6)
            .map((r) => `- ${r.summary}`)
            .join('\n')}`
        : '',
      `Most recent:\n${rows
        .slice(0, 5)
        .map((r) => `- ${r.summary}`)
        .join('\n')}`,
    ].filter(Boolean);
    const projectIds = [...new Set(moved.map((r) => r.projectId).filter((x): x is string => !!x))];
    const projects = projectIds.length
      ? await this.database.models.Project.find({ _id: { $in: projectIds } })
          .select({ title: 1 })
          .lean<Pick<Project, 'id' | 'title'>[]>()
      : [];
    return { text: lines.join('\n'), references: projects.map(projectRef) };
  }

  // ── Propose tools (no writes) ──────────────────────────────────────────────

  async proposeCreateTask(
    input: {
      project?: string;
      title: string;
      assignee?: string;
      dueDate?: Date | null;
      blocking?: boolean;
    },
    ctx: AssistantContext,
  ): Promise<ProposeOutcome> {
    const projectId = await this.resolveProjectId(input.project ?? '', ctx);
    if (!projectId)
      return {
        ok: false,
        reason: 'Which production is this task for? Name it, or open it in the inspector first.',
      };
    const project = await this.database.models.Project.findById(projectId)
      .populate({
        path: 'stages',
        match: { status: { $in: ['ACTIVE', 'BLOCKED'] } },
        populate: { path: 'stageDefinition' },
      })
      .lean<Project & { stages: (ProjectStage & { stageDefinition: StageDefinition })[] }>();
    if (!project) return { ok: false, reason: 'That production no longer exists.' };
    const member = input.assignee ? await this.resolveMember(input.assignee) : null;
    if (input.assignee && !member)
      return { ok: false, reason: `I couldn't find a team member matching “${input.assignee}”.` };
    const stage = project.stages[0];
    return {
      ok: true,
      proposal: {
        kind: 'CREATE_TASK',
        title: `Create task “${input.title}” on ${project.title}`,
        payload: {
          projectId: project.id,
          projectStageId: stage?.id ?? null,
          title: input.title,
          assigneeId: member?.id ?? null,
          dueDate: input.dueDate ? input.dueDate.toISOString() : null,
          isStageBlocking: input.blocking ?? false,
        },
        changes: [
          { field: 'Production', from: null, to: `${project.code} · ${project.title}` },
          { field: 'Stage', from: null, to: stage ? STAGE_LABELS[stage.stageDefinition.key] : '—' },
          { field: 'Title', from: null, to: input.title },
          {
            field: 'Assignee',
            from: null,
            to: member ? `${member.name} (${member.title})` : 'Unassigned',
          },
          { field: 'Due', from: null, to: input.dueDate ? fmt(input.dueDate) : 'No date' },
          ...(input.blocking ? [{ field: 'Blocks stage', from: null, to: 'Yes' }] : []),
        ],
      },
      references: [
        projectRef(project),
        ...(member ? [{ type: 'member' as const, id: member.id, label: member.name }] : []),
      ],
    };
  }

  async proposeUpdateTask(
    input: { task: string; project?: string; status?: TaskStatus; assignee?: string },
    ctx: AssistantContext,
  ): Promise<ProposeOutcome> {
    const projectId = input.project
      ? await this.resolveProjectId(input.project, ctx)
      : await this.contextProjectId(ctx);
    const task = await this.resolveTask(input.task, projectId);
    if (!task)
      return {
        ok: false,
        reason: `I couldn't find a task matching “${input.task}”${projectId ? ' in that production' : ''}.`,
      };
    const member = input.assignee ? await this.resolveMember(input.assignee) : null;
    if (input.assignee && !member)
      return { ok: false, reason: `I couldn't find a team member matching “${input.assignee}”.` };
    if (!input.status && !member)
      return {
        ok: false,
        reason: 'What should change on that task — its status or who it is assigned to?',
      };
    const changes: { field: string; from: string | null; to: string }[] = [];
    if (input.status)
      changes.push({
        field: 'Status',
        from: TASK_STATUS_LABELS[task.status],
        to: TASK_STATUS_LABELS[input.status],
      });
    if (member)
      changes.push({
        field: 'Assignee',
        from: task.assignee?.name ?? 'Unassigned',
        to: member.name,
      });
    return {
      ok: true,
      proposal: {
        kind: 'UPDATE_TASK',
        title: `Update “${task.title}” on ${task.project.title}`,
        payload: {
          taskId: task.id,
          ...(input.status ? { status: input.status } : {}),
          ...(member ? { assigneeId: member.id } : {}),
        },
        changes,
        targetVersion: task.updatedAt.toISOString(),
      },
      references: [{ type: 'task', id: task.id, label: task.title }, projectRef(task.project)],
    };
  }

  async proposeAdvance(
    input: { project?: string },
    ctx: AssistantContext,
  ): Promise<ProposeOutcome> {
    const projectId = await this.resolveProjectId(input.project ?? '', ctx);
    if (!projectId) return { ok: false, reason: 'Which production should move to its next stage?' };
    const p = await this.projects.get(projectId, ctx.user);
    if (!p.advance.ok) {
      return {
        ok: false,
        reason: `${p.title} can't leave ${p.stage?.label ?? 'its stage'} yet: ${p.advance.blockers.map((b) => b.message).join(' ')}`,
      };
    }
    const row = await this.database.models.Project.findById(p.id)
      .select({ updatedAt: 1 })
      .lean<Pick<Project, 'id' | 'updatedAt'>>();
    if (!row) throw notFound('Project');
    const to = p.advance.to?.label ?? 'Delivered';
    return {
      ok: true,
      proposal: {
        kind: 'ADVANCE_PROJECT',
        title: `Move ${p.title} from ${p.stage?.label} to ${to}`,
        payload: { projectId: p.id, fromStageId: p.stage?.id ?? null },
        changes: [{ field: 'Stage', from: p.stage?.label ?? null, to }],
        targetVersion: row.updatedAt.toISOString(),
      },
      references: [projectRef(p)],
    };
  }

  async proposeLogInteraction(
    input: { client?: string; type: string; summary: string },
    ctx: AssistantContext,
  ): Promise<ProposeOutcome> {
    const type = (INTERACTION_TYPES as readonly string[]).includes(input.type.toUpperCase())
      ? (input.type.toUpperCase() as InteractionType)
      : 'CALL';
    let clientId: string | null = null;
    let projectId: string | null = null;
    const clients = await this.database.models.Client.find()
      .select({ name: 1 })
      .lean<Pick<Client, 'id' | 'name'>[]>();
    const match = input.client
      ? findBestMatch(
          input.client,
          clients.map((c) => ({ id: c.id, names: [c.name, c.name.split(' ')[0]!] })),
        )
      : null;
    if (match) clientId = match.id;
    if (!clientId) {
      const pid = await this.contextProjectId(ctx);
      if (pid) {
        const p = await this.database.models.Project.findById(pid)
          .select({ clientId: 1 })
          .lean<Pick<Project, 'id' | 'clientId'>>();
        clientId = p?.clientId ?? null;
        projectId = p?.id ?? null;
      } else if (ctx.focus?.type === 'client' || ctx.inspect?.type === 'client') {
        clientId = (ctx.inspect?.type === 'client' ? ctx.inspect.id : ctx.focus!.id) ?? null;
      }
    }
    const client = clientId ? clients.find((c) => c.id === clientId) : null;
    if (!client) return { ok: false, reason: 'Which client was this with?' };
    return {
      ok: true,
      proposal: {
        kind: 'LOG_INTERACTION',
        title: `Log a ${type.toLowerCase()} with ${client.name}`,
        payload: { clientId: client.id, projectId, type, summary: input.summary },
        changes: [
          { field: 'Client', from: null, to: client.name },
          { field: 'Type', from: null, to: type.charAt(0) + type.slice(1).toLowerCase() },
          { field: 'Summary', from: null, to: input.summary },
        ],
      },
      references: [{ type: 'client', id: client.id, label: client.name }],
    };
  }

  // ── Entity resolution ──────────────────────────────────────────────────────

  /** The production the conversation is about: the inspected one, else the focused one. */
  async contextProjectId(ctx: AssistantContext): Promise<string | null> {
    if (ctx.inspect?.type === 'project') return ctx.inspect.id;
    if (ctx.focus?.type === 'project') return ctx.focus.id;
    if (ctx.inspect?.type === 'task') {
      const t = await this.database.models.Task.findById(ctx.inspect.id)
        .select({ projectId: 1 })
        .lean<Pick<Task, 'id' | 'projectId'>>();
      return t?.projectId ?? null;
    }
    return null;
  }

  async resolveProjectId(ref: string, ctx: AssistantContext): Promise<string | null> {
    // `clientId` must be selected for the `client` virtual to populate.
    const projects = await this.database.models.Project.find()
      .select({ title: 1, code: 1, clientId: 1 })
      .populate({ path: 'client', select: { name: 1 } })
      .lean<
        (Pick<Project, 'id' | 'title' | 'code' | 'clientId'> & {
          client: Pick<Client, 'id' | 'name'>;
        })[]
      >();
    if (projects.some((p) => p.id === ref)) return ref;
    const hit = ref.trim()
      ? (findBestMatch(
          ref,
          projects.map((p) => ({ id: p.id, names: [p.title, p.code] })),
          0.5,
        ) ??
        findBestMatch(
          ref,
          projects.map((p) => ({ id: p.id, names: [`${p.client.name} ${p.title}`] })),
          0.6,
        ))
      : null;
    if (hit) return hit.id;
    if (!ref.trim() || /\b(this|current|that) (project|production|film)\b|\bit\b/i.test(ref))
      return this.contextProjectId(ctx);
    return null;
  }

  async resolveMember(ref: string) {
    const members = await this.database.models.TeamMember.find({ isActive: true }).lean<
      TeamMember[]
    >();
    if (members.some((m) => m.id === ref)) return members.find((m) => m.id === ref)!;
    const aliases = (title: string) =>
      /photography/i.test(title)
        ? ['DOP', 'DP', 'cinematographer']
        : /drone/i.test(title)
          ? ['drone pilot']
          : [];
    return findBestMatch(
      ref,
      members.map((m) => ({
        ...m,
        names: [m.name, m.name.split(' ')[0]!, m.title, ...aliases(m.title)],
      })),
      0.75,
    );
  }

  async resolveTask(ref: string, projectId: string | null) {
    const { Task: Tasks, Project: Projects } = this.database.models;
    const live: string[] = await Projects.distinct('_id', {
      status: { $in: ['ACTIVE', 'ON_HOLD'] },
    });
    const tasks = (
      await Tasks.find({
        projectId: projectId ? { $in: live.filter((id) => id === projectId) } : { $in: live },
      })
        .sort({ updatedAt: -1 })
        .populate([
          { path: 'project', select: { title: 1 } },
          { path: 'assignee', select: { name: 1 } },
        ])
        .lean<
          (Task & {
            project: Pick<Project, 'id' | 'title'>;
            assignee: Pick<TeamMember, 'id' | 'name'> | null;
          })[]
        >()
    )
      // Status in enum declaration order (as Postgres ordered it), then most recently updated;
      // the sort is stable, so the updatedAt order from the query survives within a status.
      .sort((a, b) => (STATUS_RANK.get(a.status) ?? 0) - (STATUS_RANK.get(b.status) ?? 0));
    if (tasks.some((t) => t.id === ref)) return tasks.find((t) => t.id === ref)!;
    // Prefer open work when several tasks share a name (e.g. "Colour grade" on every project).
    const open = tasks.filter((t) => t.status !== 'DONE');
    const byName =
      findBestMatch(
        ref,
        open.map((t) => ({ ...t, names: [t.title] })),
        0.6,
      ) ??
      findBestMatch(
        ref,
        tasks.map((t) => ({ ...t, names: [t.title] })),
        0.6,
      );
    if (byName) return byName;
    // Short references ("sky replacement") match when every word typed appears in an open task's title.
    const words = normalize(ref)
      .split(' ')
      .filter((w) => w.length > 2);
    if (words.length === 0) return null;
    const exact = open
      .filter((t) => words.every((w) => normalize(t.title).includes(w)))
      .sort((a, b) => a.title.length - b.title.length);
    return exact[0] ?? null;
  }

  /** Finds a production named in free text; returns its id and the text without its name. */
  async splitProject(
    text: string,
    ctx: AssistantContext,
  ): Promise<{ projectId: string | null; rest: string }> {
    const projects = await this.database.models.Project.find()
      .select({ title: 1, code: 1 })
      .lean<Pick<Project, 'id' | 'title' | 'code'>[]>();
    const hit = findBestMatch(
      text,
      projects.map((p) => ({ ...p, names: [p.title, p.code] })),
      1,
    );
    if (!hit) return { projectId: await this.contextProjectId(ctx), rest: text };
    const rest = normalize(text)
      .replace(normalize(hit.title), ' ')
      .replace(normalize(hit.code), ' ');
    return { projectId: hit.id, rest };
  }
}
