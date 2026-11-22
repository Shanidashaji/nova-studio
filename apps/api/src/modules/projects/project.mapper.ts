/**
 * Read model for projects: Prisma include shapes plus pure mapping into the shared view types.
 * Health, progress and the delivery projection are computed here from the shared domain rules.
 */
import type { Prisma } from '@nova/db';
import {
  computeHealth,
  computeProgress,
  currentStage,
  daysBetween,
  DAY_MS,
  evaluateForwardTransition,
  type MemberRef,
  type ProjectDetail,
  type ProjectStageView,
  type ProjectSummary,
  type ShootView,
  type StageSnapshot,
  type TaskSnapshot,
  type TaskView,
} from '@nova/shared';

export const iso = (d: Date) => d.toISOString();
export const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const memberRef = (m: {
  id: string;
  name: string;
  title: string;
  avatarUrl: string | null;
}): MemberRef => ({
  id: m.id,
  name: m.name,
  title: m.title,
  avatarUrl: m.avatarUrl,
});

export const summaryInclude = {
  client: true,
  stages: { include: { stageDefinition: true, approvals: true } },
  tasks: {
    select: { id: true, title: true, status: true, projectStageId: true, isStageBlocking: true },
  },
  members: { include: { teamMember: true } },
  finances: { select: { kind: true, amount: true, category: true } },
  deliverables: { select: { rounds: { select: { includedInScope: true } }, approvals: true } },
  shoots: {
    where: { status: { not: 'CANCELLED' } },
    orderBy: { startsAt: 'asc' },
    select: { id: true, title: true, startsAt: true },
  },
} satisfies Prisma.ProjectInclude;

export type ProjectWithSummary = Prisma.ProjectGetPayload<{ include: typeof summaryInclude }>;

export const shootInclude = {
  project: { select: { id: true, code: true, title: true, coverImageUrl: true } },
  crew: { include: { teamMember: true } },
  bookings: { include: { asset: true } },
} satisfies Prisma.ShootInclude;

export type ShootWithRelations = Prisma.ShootGetPayload<{ include: typeof shootInclude }>;

export const detailInclude = {
  ...summaryInclude,
  workflowTemplate: { select: { id: true, name: true } },
  stages: { include: { stageDefinition: true, approvals: true, owner: true } },
  tasks: {
    include: { assignee: true, dependsOn: { select: { dependsOnId: true } } },
    orderBy: [{ createdAt: 'asc' }],
  },
  deliverables: {
    include: {
      rounds: {
        include: { feedback: { orderBy: { createdAt: 'asc' } } },
        orderBy: { number: 'asc' },
      },
      approvals: { orderBy: { requestedAt: 'desc' } },
    },
    orderBy: { createdAt: 'asc' },
  },
  shoots: { include: shootInclude, orderBy: { startsAt: 'asc' } },
  transitions: {
    include: {
      actor: { select: { name: true } },
      fromStage: { include: { stageDefinition: { select: { label: true } } } },
      toStage: { include: { stageDefinition: { select: { label: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.ProjectInclude;

export type ProjectWithDetail = Prisma.ProjectGetPayload<{ include: typeof detailInclude }>;

type StageRow = ProjectWithSummary['stages'][number];

export function stageSnapshots(stages: StageRow[]): StageSnapshot[] {
  return stages.map((s) => ({
    id: s.id,
    key: s.stageDefinition.key,
    label: s.stageDefinition.label,
    order: s.stageDefinition.order,
    status: s.status,
    requiresApproval: s.stageDefinition.requiresApproval,
    approved: stageApproved(s),
  }));
}

/**
 * Is the stage's approval gate open?
 *
 * Approvals on a stage are either a sign-off of the stage itself or the client's decision on one
 * deliverable sent for review during it. The gate is open only when every one of those threads
 * ends in an approval: one approved deliverable must not release a stage in which another is
 * still pending or has changes requested. A stage sign-off granted before the stage was last
 * (re)started belongs to an earlier pass — sending work back reopens the gate.
 */
export function stageApproved(s: {
  startedAt: Date | null;
  approvals: readonly {
    deliverableId: string | null;
    status: string;
    requestedAt: Date;
    decidedAt: Date | null;
  }[];
}): boolean {
  const latest = new Map<string, (typeof s.approvals)[number]>();
  for (const a of s.approvals) {
    const key = a.deliverableId ?? '';
    const current = latest.get(key);
    if (!current || a.requestedAt > current.requestedAt) latest.set(key, a);
  }
  if (latest.size === 0) return false;
  return [...latest].every(([key, a]) => {
    if (a.status !== 'APPROVED') return false;
    const stale = key === '' && s.startedAt && a.decidedAt && a.decidedAt < s.startedAt;
    return !stale;
  });
}

export function taskSnapshots(tasks: ProjectWithSummary['tasks']): TaskSnapshot[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    projectStageId: t.projectStageId,
    isStageBlocking: t.isStageBlocking,
  }));
}

/** Pending client approvals across stage-level and deliverable-level approvals (de-duplicated). */
function pendingClientApprovals(p: ProjectWithSummary) {
  const all = [
    ...p.stages.flatMap((s) => s.approvals),
    ...p.deliverables.flatMap((d) => d.approvals),
  ];
  const unique = new Map(all.map((a) => [a.id, a]));
  return [...unique.values()].filter((a) => a.status === 'PENDING' && a.kind === 'CLIENT');
}

export function toSummary(p: ProjectWithSummary, now: Date): ProjectSummary {
  const stages = stageSnapshots(p.stages);
  const tasks = taskSnapshots(p.tasks);
  const progress = p.status === 'DELIVERED' ? 1 : computeProgress(stages, tasks);
  const spent = p.finances.filter((f) => f.kind === 'EXPENSE').reduce((n, f) => n + f.amount, 0);
  const blockedTasks = p.tasks.filter((t) => t.status === 'BLOCKED').length;
  const pending = pendingClientApprovals(p);

  const health = computeHealth({
    now,
    startDate: p.startDate,
    dueDate: p.dueDate,
    delivered: p.status === 'DELIVERED' || p.status === 'CANCELLED',
    progress,
    blockedTaskCount: blockedTasks,
    pendingClientApprovalAges: pending.map((a) => daysBetween(a.requestedAt, now)),
    budget: p.budget,
    spent,
    revisionsBeyondScope: p.deliverables.flatMap((d) => d.rounds).filter((r) => !r.includedInScope)
      .length,
  });

  const active = currentStage(stages);
  const nextShoot =
    p.shoots.find((s) => s.startsAt.getTime() >= now.getTime() - 12 * 3600 * 1000) ?? null;

  return {
    id: p.id,
    code: p.code,
    title: p.title,
    logline: p.logline,
    type: p.type,
    status: p.status,
    priority: p.priority,
    location: p.location,
    coverImageUrl: p.coverImageUrl,
    client: { id: p.client.id, name: p.client.name, accentColor: p.client.accentColor },
    stage: active
      ? { id: active.id, key: active.key, label: active.label, status: active.status }
      : null,
    startDate: iso(p.startDate),
    dueDate: iso(p.dueDate),
    deliveredAt: isoOrNull(p.deliveredAt),
    progress: Math.round(progress * 100) / 100,
    health,
    budget: p.budget,
    spent,
    team: p.members.map((m) => memberRef(m.teamMember)),
    openTasks: p.tasks.filter((t) => t.status !== 'DONE').length,
    blockedTasks,
    pendingApprovals: pending.length,
    nextShoot: nextShoot
      ? { id: nextShoot.id, title: nextShoot.title, startsAt: iso(nextShoot.startsAt) }
      : null,
    aiAssisted: p.aiAssisted,
  };
}

export function toTaskView(t: ProjectWithDetail['tasks'][number]): TaskView {
  return {
    id: t.id,
    projectId: t.projectId,
    projectStageId: t.projectStageId,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: isoOrNull(t.dueDate),
    estimateHours: t.estimateHours,
    isStageBlocking: t.isStageBlocking,
    blockedReason: t.blockedReason,
    completedAt: isoOrNull(t.completedAt),
    assignee: t.assignee ? memberRef(t.assignee) : null,
    dependsOn: t.dependsOn.map((d) => d.dependsOnId),
    parentId: t.parentId,
    updatedAt: iso(t.updatedAt),
  };
}

export function toShootView(
  s: ShootWithRelations,
  conflicts: ShootView['conflicts'] = [],
): ShootView {
  return {
    id: s.id,
    projectId: s.projectId,
    project: s.project,
    title: s.title,
    location: s.location,
    city: s.city,
    startsAt: iso(s.startsAt),
    endsAt: iso(s.endsAt),
    callTime: s.callTime,
    status: s.status,
    notes: s.notes,
    crew: s.crew.map((c) => ({ id: c.id, role: c.role, member: memberRef(c.teamMember) })),
    bookings: s.bookings.map((b) => ({
      id: b.id,
      asset: { id: b.asset.id, name: b.asset.name, category: b.asset.category },
    })),
    conflicts,
  };
}

export const approvalView = (
  a: ProjectWithDetail['deliverables'][number]['approvals'][number],
) => ({
  id: a.id,
  kind: a.kind,
  status: a.status,
  title: a.title,
  requestedAt: iso(a.requestedAt),
  decidedAt: isoOrNull(a.decidedAt),
  decidedBy: a.decidedBy,
  note: a.note,
  deliverableId: a.deliverableId,
  projectStageId: a.projectStageId,
});

export function toDetail(
  p: ProjectWithDetail,
  now: Date,
  shootConflicts: Map<string, ShootView['conflicts']> = new Map(),
): ProjectDetail {
  const summary = toSummary(p, now);
  const snapshots = stageSnapshots(p.stages);
  const tasks = taskSnapshots(p.tasks);
  const ordered = [...p.stages].sort((a, b) => a.stageDefinition.order - b.stageDefinition.order);

  const stages: ProjectStageView[] = ordered.map((s) => ({
    id: s.id,
    key: s.stageDefinition.key,
    label: s.stageDefinition.label,
    order: s.stageDefinition.order,
    status: s.status,
    expectedDays: s.stageDefinition.expectedDays,
    requiresApproval: s.stageDefinition.requiresApproval,
    skippable: s.stageDefinition.skippable,
    approved: s.approvals.some((a) => a.status === 'APPROVED'),
    exitCriteria: s.stageDefinition.exitCriteria,
    owner: s.owner ? memberRef(s.owner) : null,
    startedAt: isoOrNull(s.startedAt),
    completedAt: isoOrNull(s.completedAt),
  }));

  const evaluation =
    p.status === 'ACTIVE'
      ? evaluateForwardTransition({ projectStatus: p.status, stages: snapshots, tasks })
      : {
          ok: false as const,
          blockers: [
            {
              code: 'PROJECT_NOT_ACTIVE' as const,
              message: `The project is ${p.status.toLowerCase().replace('_', ' ')}.`,
            },
          ],
        };

  const approvals = new Map<string, ReturnType<typeof approvalView>>();
  for (const a of [
    ...p.stages.flatMap((s) => s.approvals),
    ...p.deliverables.flatMap((d) => d.approvals),
  ]) {
    approvals.set(a.id, approvalView(a));
  }

  const income = p.finances.filter((f) => f.kind === 'INCOME').reduce((n, f) => n + f.amount, 0);
  const byCategory = new Map<string, number>();
  for (const f of p.finances.filter((f) => f.kind === 'EXPENSE')) {
    byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + f.amount);
  }

  return {
    ...summary,
    workflow: p.workflowTemplate,
    includedRevisions: p.includedRevisions,
    stages,
    tasks: p.tasks.map(toTaskView),
    deliverables: p.deliverables.map((d) => ({
      id: d.id,
      name: d.name,
      format: d.format,
      aspectRatio: d.aspectRatio,
      durationSec: d.durationSec,
      status: d.status,
      currentVersion: d.currentVersion,
      dueDate: isoOrNull(d.dueDate),
      previewImageUrl: d.previewImageUrl,
      rounds: d.rounds.map((r) => ({
        id: r.id,
        number: r.number,
        sentAt: iso(r.sentAt),
        closedAt: isoOrNull(r.closedAt),
        includedInScope: r.includedInScope,
        feedback: r.feedback.map((f) => ({
          id: f.id,
          timecode: f.timecode,
          body: f.body,
          author: f.author,
          status: f.status,
          createdAt: iso(f.createdAt),
        })),
      })),
      approvals: d.approvals.map(approvalView),
    })),
    approvals: [...approvals.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    shoots: p.shoots.map((s) => toShootView(s, shootConflicts.get(s.id))),
    members: p.members.map((m) => ({ ...memberRef(m.teamMember), role: m.role })),
    transitions: p.transitions.map((t) => ({
      id: t.id,
      from: t.fromStage?.stageDefinition.label ?? null,
      to: t.toStage?.stageDefinition.label ?? null,
      direction: t.direction,
      reason: t.reason,
      actor: t.actor?.name ?? null,
      source: t.source,
      createdAt: iso(t.createdAt),
    })),
    finance: {
      income,
      expenses: summary.spent,
      byCategory: [...byCategory.entries()].map(([category, amount]) => ({
        category: category as ProjectDetail['finance']['byCategory'][number]['category'],
        amount,
      })),
    },
    advance: evaluation.ok
      ? {
          ok: true,
          to: evaluation.to ? { id: evaluation.to.id, label: evaluation.to.label } : null,
        }
      : { ok: false, blockers: evaluation.blockers },
    projection: projectDelivery(p, stages, tasks, now),
  };
}

/**
 * Projected delivery: the remaining expected stage days, scaled by how fast this project has
 * moved through its completed stages so far (pace ratio clamped to 0.6–2.0). A heuristic,
 * labelled "NOVA estimate" in the UI.
 */
function projectDelivery(
  p: ProjectWithDetail,
  stages: ProjectStageView[],
  tasks: TaskSnapshot[],
  now: Date,
): { projectedDelivery: string; daysLate: number } {
  if (p.status === 'DELIVERED' && p.deliveredAt) {
    return {
      projectedDelivery: iso(p.deliveredAt),
      daysLate: daysBetween(p.dueDate, p.deliveredAt),
    };
  }
  const done = stages.filter((s) => s.status === 'DONE' && s.startedAt && s.completedAt);
  const actual = done.reduce(
    (n, s) => n + (Date.parse(s.completedAt!) - Date.parse(s.startedAt!)) / DAY_MS,
    0,
  );
  const expected = done.reduce((n, s) => n + s.expectedDays, 0);
  const pace = expected > 0 ? Math.min(2, Math.max(0.6, actual / expected)) : 1;

  let remaining = 0;
  for (const s of stages) {
    if (s.status === 'PENDING') remaining += s.expectedDays;
    if (s.status === 'ACTIVE' || s.status === 'BLOCKED') {
      const stageTasks = tasks.filter((t) => t.projectStageId === s.id);
      const share = stageTasks.length
        ? stageTasks.filter((t) => t.status === 'DONE').length / stageTasks.length
        : 0;
      remaining += s.expectedDays * (1 - share);
    }
  }
  const projected = new Date(now.getTime() + remaining * pace * DAY_MS);
  return {
    projectedDelivery: iso(projected),
    daysLate: Math.max(0, daysBetween(p.dueDate, projected)),
  };
}
