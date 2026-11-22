/**
 * Read model for projects: Mongoose populate shapes (with the lean row types they produce) plus
 * pure mapping into the shared view types. Health, progress and the delivery projection are
 * computed here from the shared domain rules.
 */
import type {
  Approval,
  Asset,
  AssetBooking,
  Client,
  CrewCall,
  Deliverable,
  FeedbackItem,
  FinancialRecord,
  PopulateOptions,
  Project,
  ProjectMember,
  ProjectStage,
  RevisionRound,
  Shoot,
  StageDefinition,
  StageTransition,
  Task,
  TaskDependency,
  TeamMember,
  User,
  WorkflowTemplate,
} from '@nova/db';
import {
  canSeeProjectMoney,
  computeHealth,
  computeProgress,
  currentStage,
  daysBetween,
  DAY_MS,
  evaluateForwardTransition,
  type MemberRef,
  type Permission,
  type ProjectDetail,
  type ProjectStageView,
  type ProjectSummary,
  type ShootView,
  type StageSnapshot,
  type TaskSnapshot,
  type TaskView,
} from '@nova/shared';

/** The caller a read model is being prepared for. Only the permissions matter here. */
export interface Viewer {
  permissions: readonly Permission[];
}

/** A summary as computed, before visibility rules: the money is always present. */
export type FullProjectSummary = Omit<ProjectSummary, 'budget' | 'spent'> & {
  budget: number;
  spent: number;
};

/** A detail view as computed, before visibility rules. */
export type FullProjectDetail = Omit<ProjectDetail, 'budget' | 'spent' | 'finance'> & {
  budget: number;
  spent: number;
  finance: NonNullable<ProjectDetail['finance']>;
};

/**
 * What the budget-burn risk signal says to a caller who may not see the figures: the signal and
 * its weight stay (the health score would be unexplained without it), the percentages go.
 */
const BUDGET_BURN_WITHOUT_FIGURES = 'Spending is running ahead of progress';

const withoutBurnFigures = (health: FullProjectSummary['health']) => ({
  ...health,
  deductions: health.deductions.map((d) =>
    d.code === 'BUDGET_BURN' ? { ...d, label: BUDGET_BURN_WITHOUT_FIGURES } : d,
  ),
});

/** The summary this viewer may receive (see `canSeeProjectMoney` in the shared contracts). */
export function summaryFor(p: FullProjectSummary, viewer: Viewer): ProjectSummary {
  if (canSeeProjectMoney(viewer.permissions)) return p;
  return { ...p, budget: null, spent: null, health: withoutBurnFigures(p.health) };
}

/** The detail view this viewer may receive: without budget, spend and the finance breakdown. */
export function detailFor(p: FullProjectDetail, viewer: Viewer): ProjectDetail {
  if (canSeeProjectMoney(viewer.permissions)) return p;
  return {
    ...p,
    budget: null,
    spent: null,
    finance: null,
    health: withoutBurnFigures(p.health),
  };
}

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

/** A task with what `toTaskView` needs: its assignee and the ids of the tasks it waits for. */
export type TaskViewRow = Task & {
  assignee: TeamMember | null;
  dependsOn: Pick<TaskDependency, '_id' | 'id' | 'taskId' | 'dependsOnId'>[];
};

/** Populate for a task read through `toTaskView` (list virtuals keep their foreign field). */
export const taskViewPopulate: PopulateOptions[] = [
  { path: 'assignee' },
  { path: 'dependsOn', select: { taskId: 1, dependsOnId: 1 } },
];

export const summaryPopulate: PopulateOptions[] = [
  { path: 'client' },
  { path: 'stages', populate: [{ path: 'stageDefinition' }, { path: 'approvals' }] },
  {
    path: 'tasks',
    select: { title: 1, status: 1, projectStageId: 1, isStageBlocking: 1, projectId: 1 },
  },
  { path: 'members', populate: { path: 'teamMember' } },
  { path: 'finances', select: { kind: 1, amount: 1, category: 1, projectId: 1 } },
  {
    path: 'deliverables',
    select: { projectId: 1 },
    populate: [
      { path: 'rounds', select: { includedInScope: 1, deliverableId: 1 } },
      { path: 'approvals' },
    ],
  },
  {
    path: 'shoots',
    match: { status: { $ne: 'CANCELLED' } },
    options: { sort: { startsAt: 1 } },
    select: { title: 1, startsAt: 1, projectId: 1 },
  },
];

export type SummaryRow = Project & {
  client: Client;
  stages: (ProjectStage & { stageDefinition: StageDefinition; approvals: Approval[] })[];
  tasks: Pick<
    Task,
    '_id' | 'id' | 'title' | 'status' | 'projectStageId' | 'isStageBlocking' | 'projectId'
  >[];
  members: (ProjectMember & { teamMember: TeamMember })[];
  finances: Pick<FinancialRecord, '_id' | 'id' | 'kind' | 'amount' | 'category' | 'projectId'>[];
  deliverables: (Pick<Deliverable, '_id' | 'id' | 'projectId'> & {
    rounds: Pick<RevisionRound, '_id' | 'id' | 'includedInScope' | 'deliverableId'>[];
    approvals: Approval[];
  })[];
  shoots: Pick<Shoot, '_id' | 'id' | 'title' | 'startsAt' | 'projectId'>[];
};

/** Former name of `SummaryRow`. */
export type ProjectWithSummary = SummaryRow;

export const shootPopulate: PopulateOptions[] = [
  { path: 'project', select: { code: 1, title: 1, coverImageUrl: 1 } },
  { path: 'crew', populate: { path: 'teamMember' } },
  { path: 'bookings', populate: { path: 'asset' } },
];

export type ShootRow = Shoot & {
  project: Pick<Project, '_id' | 'id' | 'code' | 'title' | 'coverImageUrl'>;
  crew: (CrewCall & { teamMember: TeamMember })[];
  bookings: (AssetBooking & { asset: Asset })[];
};

/** Former name of `ShootRow`. */
export type ShootWithRelations = ShootRow;

const stageLabel: PopulateOptions = { path: 'stageDefinition', select: { label: 1 } };

/**
 * Everything the project page shows. As the former include did, it replaces the summary's
 * stages, tasks, deliverables and shoots (so the detail's shoots include cancelled ones).
 */
export const detailPopulate: PopulateOptions[] = [
  ...summaryPopulate.filter((p) => !['stages', 'tasks', 'deliverables', 'shoots'].includes(p.path)),
  { path: 'workflowTemplate', select: { name: 1 } },
  {
    path: 'stages',
    populate: [{ path: 'stageDefinition' }, { path: 'approvals' }, { path: 'owner' }],
  },
  { path: 'tasks', options: { sort: { createdAt: 1 } }, populate: taskViewPopulate },
  {
    path: 'deliverables',
    options: { sort: { createdAt: 1 } },
    populate: [
      {
        path: 'rounds',
        options: { sort: { number: 1 } },
        populate: { path: 'feedback', options: { sort: { createdAt: 1 } } },
      },
      { path: 'approvals', options: { sort: { requestedAt: -1 } } },
    ],
  },
  { path: 'shoots', options: { sort: { startsAt: 1 } }, populate: shootPopulate },
  {
    path: 'transitions',
    options: { sort: { createdAt: -1 } },
    populate: [
      { path: 'actor', select: { name: 1 } },
      { path: 'fromStage', populate: stageLabel },
      { path: 'toStage', populate: stageLabel },
    ],
  },
];

type TransitionStage = ProjectStage & {
  stageDefinition: Pick<StageDefinition, '_id' | 'id' | 'label'>;
};

export type DetailRow = Omit<SummaryRow, 'stages' | 'tasks' | 'deliverables' | 'shoots'> & {
  workflowTemplate: Pick<WorkflowTemplate, '_id' | 'id' | 'name'>;
  stages: (ProjectStage & {
    stageDefinition: StageDefinition;
    approvals: Approval[];
    owner: TeamMember | null;
  })[];
  tasks: TaskViewRow[];
  deliverables: (Deliverable & {
    rounds: (RevisionRound & { feedback: FeedbackItem[] })[];
    approvals: Approval[];
  })[];
  shoots: ShootRow[];
  transitions: (StageTransition & {
    actor: Pick<User, '_id' | 'id' | 'name'> | null;
    fromStage: TransitionStage | null;
    toStage: TransitionStage | null;
  })[];
};

/** Former name of `DetailRow`. */
export type ProjectWithDetail = DetailRow;

type StageRow = SummaryRow['stages'][number];

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

export function taskSnapshots(tasks: SummaryRow['tasks']): TaskSnapshot[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    projectStageId: t.projectStageId,
    isStageBlocking: t.isStageBlocking,
  }));
}

/** Pending client approvals across stage-level and deliverable-level approvals (de-duplicated). */
function pendingClientApprovals(p: SummaryRow) {
  const all = [
    ...p.stages.flatMap((s) => s.approvals),
    ...p.deliverables.flatMap((d) => d.approvals),
  ];
  const unique = new Map(all.map((a) => [a.id, a]));
  return [...unique.values()].filter((a) => a.status === 'PENDING' && a.kind === 'CLIENT');
}

export function toSummary(p: SummaryRow, now: Date): FullProjectSummary {
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

export function toTaskView(t: TaskViewRow): TaskView {
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

export function toShootView(s: ShootRow, conflicts: ShootView['conflicts'] = []): ShootView {
  return {
    id: s.id,
    projectId: s.projectId,
    // Mapped field by field: the lean row also carries `_id`, which is not part of the view.
    project: {
      id: s.project.id,
      code: s.project.code,
      title: s.project.title,
      coverImageUrl: s.project.coverImageUrl,
    },
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

export const approvalView = (a: Approval) => ({
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
  p: DetailRow,
  now: Date,
  shootConflicts: Map<string, ShootView['conflicts']> = new Map(),
): FullProjectDetail {
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
    workflow: { id: p.workflowTemplate.id, name: p.workflowTemplate.name },
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
        category: category as FullProjectDetail['finance']['byCategory'][number]['category'],
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
  p: DetailRow,
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
