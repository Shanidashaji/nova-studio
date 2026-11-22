/**
 * Builds the demonstration studio: team, clients, workflows, projects with full stage history,
 * tasks and dependencies, deliverables and revision rounds, shoots and bookings, sales leads,
 * demo finances, client interactions and a back-filled activity log.
 */
import type { Database, Models } from '../database';
import type {
  ActivitySource,
  DeliverableStatus,
  FinanceCategory,
  FinanceKind,
  InteractionType,
  StageKey,
  TaskStatus,
} from '../models/enums';
import {
  ASSETS,
  CLIENTS,
  LEADS,
  MONTHLY_OVERHEADS,
  PROJECTS,
  SHOOTS,
  STAGE_TASKS,
  TEAM,
  TEMPLATES,
  type ProjectFixture,
  type RoleTag,
  type TaskTemplate,
} from './fixtures';

const DAY = 24 * 60 * 60 * 1000;

/** Today at 00:00 local time, so offsets land on whole days. */
const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();
const NOW = new Date();

const at = (dayOffset: number, hour = 9, minute = 0) =>
  new Date(TODAY.getTime() + dayOffset * DAY + (hour * 60 + minute) * 60 * 1000);

/** Deterministic pseudo-random numbers (mulberry32) so every seed produces the same studio. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20251122);
const between = (min: number, max: number) => Math.round(min + random() * (max - min));

const DELIVERABLES: Record<
  string,
  { name: string; format: string; aspectRatio: string; durationSec: number }[]
> = {
  BRAND_FILM: [
    { name: 'Hero film', format: 'ProRes 422 HQ, 4K', aspectRatio: '16:9', durationSec: 90 },
    { name: 'Cut-down 30s', format: 'H.264, 1080p', aspectRatio: '16:9', durationSec: 30 },
    { name: 'Vertical cut', format: 'H.264, 1080×1920', aspectRatio: '9:16', durationSec: 30 },
  ],
  PRODUCT_VIDEO: [
    {
      name: 'Hero product film',
      format: 'ProRes 422 HQ, 4K',
      aspectRatio: '16:9',
      durationSec: 60,
    },
    { name: 'Launch reel', format: 'H.264, 1080×1920', aspectRatio: '9:16', durationSec: 15 },
  ],
  CORPORATE_VIDEO: [
    { name: 'Culture film', format: 'H.264, 4K', aspectRatio: '16:9', durationSec: 180 },
    { name: 'LinkedIn cut', format: 'H.264, 1080×1080', aspectRatio: '1:1', durationSec: 60 },
  ],
  SOCIAL_REEL: [
    { name: 'Reel 01', format: 'H.264, 1080×1920', aspectRatio: '9:16', durationSec: 20 },
    { name: 'Reel 02', format: 'H.264, 1080×1920', aspectRatio: '9:16', durationSec: 20 },
    { name: 'Reel 03', format: 'H.264, 1080×1920', aspectRatio: '9:16', durationSec: 20 },
  ],
  REAL_ESTATE: [
    { name: 'Launch film', format: 'H.264, 4K', aspectRatio: '16:9', durationSec: 120 },
    { name: 'Aerial teaser', format: 'H.264, 1080×1920', aspectRatio: '9:16', durationSec: 20 },
  ],
  STORYTELLING_AD: [
    { name: 'TV commercial', format: 'ProRes 422 HQ, 4K', aspectRatio: '16:9', durationSec: 60 },
    { name: 'Digital cut', format: 'H.264, 1080p', aspectRatio: '16:9', durationSec: 30 },
    { name: 'Story cut', format: 'H.264, 1080×1920', aspectRatio: '9:16', durationSec: 15 },
  ],
  EXPLAINER: [
    { name: 'Episode 1', format: 'H.264, 1080p', aspectRatio: '16:9', durationSec: 120 },
    { name: 'Episode 2', format: 'H.264, 1080p', aspectRatio: '16:9', durationSec: 120 },
    { name: 'Episode 3', format: 'H.264, 1080p', aspectRatio: '16:9', durationSec: 120 },
  ],
  PRODUCT_DEMO: [
    { name: 'Demo walkthrough', format: 'H.264, 4K', aspectRatio: '16:9', durationSec: 120 },
    { name: 'Feature clips', format: 'H.264, 1080×1080', aspectRatio: '1:1', durationSec: 20 },
  ],
  CAMPAIGN: [
    { name: 'Campaign film', format: 'ProRes 422 HQ, 4K', aspectRatio: '16:9', durationSec: 45 },
    { name: 'Campaign reel', format: 'H.264, 1080×1920', aspectRatio: '9:16', durationSec: 20 },
  ],
};

const STAGE_OWNER: Record<StageKey, RoleTag | 'projectDirector' | 'projectEditor'> = {
  BRIEF: 'producer',
  PRE_PRODUCTION: 'projectDirector',
  SHOOT: 'dop',
  EDIT: 'projectEditor',
  REVIEW: 'producer',
  DELIVERY: 'producer',
};

/** A ledger row as the seed writes it (every other column comes from the schema defaults). */
interface NewFinancialRecord {
  projectId?: string | null;
  kind: FinanceKind;
  category: FinanceCategory;
  amount: number;
  occurredOn: Date;
  note: string;
}

interface NewActivity {
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  summary: string;
  actorId: string | null;
  source: ActivitySource;
}

interface NewInteraction {
  clientId: string;
  projectId: string;
  type: InteractionType;
  summary: string;
  occurredAt: Date;
  loggedById: string | null;
}

interface Ctx {
  m: Models;
  adminId: string;
  producerUserId: string;
  member: Map<RoleTag, string>;
  memberName: Map<string, string>;
  client: Map<string, { id: string; name: string; contactName: string }>;
  template: Map<
    string,
    {
      id: string;
      stages: {
        id: string;
        key: StageKey;
        label: string;
        order: number;
        expectedDays: number;
        requiresApproval: boolean;
      }[];
    }
  >;
  project: Map<string, { id: string; title: string; code: string; clientId: string }>;
  activity: NewActivity[];
}

export async function buildDemoWorld(
  db: Database,
  users: { adminId: string; producerUserId: string },
): Promise<Record<string, number>> {
  const m = db.models;
  const ctx: Ctx = {
    m,
    ...users,
    member: new Map(),
    memberName: new Map(),
    client: new Map(),
    template: new Map(),
    project: new Map(),
    activity: [],
  };

  // Workflow templates (template first, then its stage definitions).
  for (const t of TEMPLATES) {
    const created = await m.WorkflowTemplate.create({
      name: t.name,
      description: t.description,
      isDefault: t.isDefault,
    });
    const stages = await m.StageDefinition.insertMany(
      t.stages.map((s, i) => ({
        templateId: created._id,
        key: s.key,
        label: s.label,
        order: i + 1,
        expectedDays: s.expectedDays,
        requiresApproval: s.requiresApproval ?? false,
        skippable: s.skippable ?? false,
        exitCriteria: s.exitCriteria,
      })),
    );
    ctx.template.set(t.name, {
      id: created._id,
      stages: stages
        .map((s) => ({
          id: s._id,
          key: s.key,
          label: s.label,
          order: s.order,
          expectedDays: s.expectedDays,
          requiresApproval: s.requiresApproval,
        }))
        .sort((a, b) => a.order - b.order),
    });
  }

  // Team. The producer account is linked to its team member.
  for (const t of TEAM) {
    const created = await m.TeamMember.create({
      name: t.name,
      title: t.title,
      skills: t.skills,
      baseLocation: t.baseLocation,
      weeklyCapacityHours: t.weeklyCapacityHours,
      email: `${t.name.split(' ')[0]!.toLowerCase()}@studio.demo`,
      userId: t.tag === 'producer' ? users.producerUserId : null,
    });
    ctx.member.set(t.tag, created._id);
    ctx.memberName.set(created._id, t.name);
  }

  // Clients.
  for (const c of CLIENTS) {
    const created = await m.Client.create({
      name: c.name,
      industry: c.industry,
      city: c.city,
      status: c.status,
      contactName: c.contactName,
      contactEmail: `${c.contactName.split(' ').at(-1)!.replace('.', '').toLowerCase()}@${c.tag}.demo`,
      accentColor: c.accentColor,
      notes: 'Demonstration client — fictional company.',
    });
    ctx.client.set(c.tag, { id: created._id, name: c.name, contactName: c.contactName });
  }

  const assetIds = new Map<string, string>();
  for (const a of ASSETS) {
    const created = await m.Asset.create({
      name: a.name,
      category: a.category,
      serialTag: `NM-${a.category.slice(0, 3)}-${a.tag.toUpperCase()}`,
      homeLocation: a.homeLocation,
      dailyRate: a.dailyRate,
      status: a.maintenance ? 'MAINTENANCE' : 'AVAILABLE',
      notes: a.maintenance ? 'Sensor recalibration at service centre (demo).' : null,
    });
    assetIds.set(a.tag, created._id);
  }

  for (const p of PROJECTS) await seedProject(ctx, p);

  // Shoots, crew calls and equipment bookings (includes a deliberate A-cam double booking).
  for (const s of SHOOTS) {
    const project = ctx.project.get(s.project)!;
    const startsAt = at(s.dayOffset, s.startHour);
    const endsAt = at(s.dayOffset + s.days - 1, s.endHour);
    const status =
      s.dayOffset + s.days - 1 < 0 ? 'WRAPPED' : s.dayOffset <= 3 ? 'CONFIRMED' : 'PLANNED';
    const shoot = await m.Shoot.create({
      projectId: project.id,
      title: s.title,
      location: s.location,
      city: s.city,
      startsAt,
      endsAt,
      callTime: s.callTime,
      status,
    });
    await m.CrewCall.insertMany(
      s.crew.map((c) => ({
        shootId: shoot._id,
        teamMemberId: ctx.member.get(c.role)!,
        role: c.as,
      })),
    );
    await m.AssetBooking.insertMany(
      s.assets.map((tag) => ({
        shootId: shoot._id,
        assetId: assetIds.get(tag)!,
        startsAt,
        endsAt,
      })),
    );
    log(
      ctx,
      at(Math.min(s.dayOffset, 0) - 6, 11),
      'shoot.created',
      'shoot',
      shoot._id,
      project.id,
      `Scheduled “${s.title}” for ${project.title}`,
    );
  }

  // Edit suites booked for projects in post-production.
  const suiteBookings: [string, string, number, number][] = [
    ['suite1', 'aurora-film', -8, 5],
    ['suite2', 'brightpath-stories', -5, 9],
    ['suite2', 'zenpods-reels', -6, 0],
    ['suite1', 'zenpods-hero', -10, 1],
  ];
  for (const [asset, projectTag, from, to] of suiteBookings) {
    await m.AssetBooking.create({
      assetId: assetIds.get(asset)!,
      projectId: ctx.project.get(projectTag)!.id,
      startsAt: at(from, 9),
      endsAt: at(to, 20),
      note: 'Post-production',
    });
  }

  // Sales pipeline.
  const leadIds = new Map<string, string>();
  for (const l of LEADS) {
    const lead = await m.Lead.create({
      title: l.title,
      clientId: l.client ? ctx.client.get(l.client)!.id : null,
      prospectName: l.prospectName ?? null,
      projectType: l.projectType,
      estimatedValue: l.estimatedValue,
      stage: l.stage,
      source: l.source,
      expectedCloseDate: at(l.closeOffset),
      convertedProjectId:
        l.stage === 'WON' && l.client === 'vibe' ? ctx.project.get('vibe-reels')!.id : null,
      createdAt: at(Math.min(l.closeOffset, 0) - between(10, 30)),
    });
    leadIds.set(l.title, lead._id);
    log(
      ctx,
      at(Math.min(l.closeOffset, 0) - between(1, 8), 15),
      'lead.updated',
      'lead',
      lead._id,
      null,
      `Lead “${l.title}” moved to ${l.stage.toLowerCase()}`,
    );
  }

  // Studio-level demo finances: six months of overheads and income from earlier engagements.
  const finance: NewFinancialRecord[] = [];
  for (let month = 5; month >= 0; month--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - month, 3);
    for (const o of MONTHLY_OVERHEADS) {
      finance.push({
        kind: 'EXPENSE',
        category: o.category,
        amount: o.amount + between(-3000, 3000),
        occurredOn: d,
        note: o.note,
      });
    }
    if (month >= 2) {
      finance.push({
        kind: 'INCOME',
        category: 'FINAL_PAYMENT',
        amount: between(260000, 520000),
        occurredOn: new Date(d.getTime() + 12 * DAY),
        note: 'Earlier engagements (demo)',
      });
    }
  }
  await m.FinancialRecord.insertMany(finance);

  // Notifications for the administrator.
  const aurora = ctx.project.get('aurora-film')!;
  const zenHero = ctx.project.get('zenpods-hero')!;
  const zenReels = ctx.project.get('zenpods-reels')!;
  await m.Notification.insertMany([
    {
      userId: users.adminId,
      kind: 'approval.waiting',
      title: 'Client approval waiting 4 days',
      body: `${zenHero.title} — Hero product film v2`,
      entityType: 'project',
      entityId: zenHero.id,
      createdAt: at(-1, 9),
    },
    {
      userId: users.adminId,
      kind: 'task.blocked',
      title: 'Colour grade blocked',
      body: `${aurora.title} — waiting on sky replacement`,
      entityType: 'project',
      entityId: aurora.id,
      createdAt: at(-1, 17),
    },
    {
      userId: users.adminId,
      kind: 'project.overdue',
      title: 'Project overdue',
      body: `${zenReels.title} passed its due date`,
      entityType: 'project',
      entityId: zenReels.id,
      createdAt: at(0, 8),
    },
    {
      userId: users.adminId,
      kind: 'booking.conflict',
      title: 'Equipment double-booked',
      body: 'Sony FX6 — A-cam is booked by two shoots in 3 days',
      entityType: 'asset',
      entityId: assetIds.get('fx6-a')!,
      createdAt: at(0, 8, 30),
    },
    {
      userId: users.adminId,
      kind: 'lead.update',
      title: 'Lead in negotiation',
      body: 'Resort aerial showcase — decision expected this week',
      entityType: 'lead',
      entityId: leadIds.get('Resort aerial showcase')!,
      readAt: at(-2, 10),
      createdAt: at(-2, 9),
    },
  ]);

  await m.ActivityLog.insertMany(ctx.activity);

  const [
    projects,
    tasks,
    deliverables,
    shoots,
    bookings,
    approvals,
    interactions,
    records,
    activity,
  ] = await Promise.all([
    m.Project.countDocuments(),
    m.Task.countDocuments(),
    m.Deliverable.countDocuments(),
    m.Shoot.countDocuments(),
    m.AssetBooking.countDocuments(),
    m.Approval.countDocuments(),
    m.ClientInteraction.countDocuments(),
    m.FinancialRecord.countDocuments(),
    m.ActivityLog.countDocuments(),
  ]);
  return {
    team: TEAM.length,
    clients: CLIENTS.length,
    projects,
    tasks,
    deliverables,
    approvals,
    shoots,
    bookings,
    assets: ASSETS.length,
    leads: LEADS.length,
    interactions,
    financialRecords: records,
    activity,
  };
}

// ─── Projects ─────────────────────────────────────────────────────────────────

async function seedProject(ctx: Ctx, p: ProjectFixture) {
  const { m } = ctx;
  const template = ctx.template.get(p.template)!;
  const client = ctx.client.get(p.client)!;
  const delivered = p.status === 'DELIVERED';
  const roleId = (role: TaskTemplate['role']) =>
    ctx.member.get(
      role === 'projectDirector' ? p.director : role === 'projectEditor' ? p.editor : role,
    )!;

  const project = await m.Project.create({
    code: p.code,
    title: p.title,
    logline: p.logline,
    clientId: client.id,
    type: p.type,
    workflowTemplateId: template.id,
    status: p.status,
    priority: p.priority,
    location: p.location,
    startDate: at(p.startOffset),
    dueDate: at(p.dueOffset, 18),
    deliveredAt: delivered ? at(p.dueOffset - 1, 17) : null,
    budget: p.budget,
    includedRevisions: p.includedRevisions,
    coverImageUrl: null,
    aiAssisted: p.aiAssisted,
    createdAt: at(p.startOffset - 2),
  });
  await m.ProjectMember.insertMany(
    projectMembers(ctx, p).map((member) => ({ ...member, projectId: project._id })),
  );
  ctx.project.set(p.tag, { id: project._id, title: p.title, code: p.code, clientId: client.id });
  log(
    ctx,
    at(p.startOffset, 10),
    'project.created',
    'project',
    project._id,
    project._id,
    `Opened ${p.code} “${p.title}” for ${client.name}`,
    ctx.adminId,
  );

  // Stage timeline: completed stages share the time between start and the current stage's start.
  const stages = template.stages;
  const currentIdx = p.stage ? stages.findIndex((s) => s.key === p.stage) : stages.length;
  const skipped = new Set(p.skipStages ?? []);
  const current = stages[currentIdx];
  const currentStartOffset = current
    ? -Math.max(1, Math.round(current.expectedDays * (0.3 + p.stageProgress * 0.7)))
    : p.dueOffset - 1;
  const doneStages = stages.slice(0, currentIdx).filter((s) => !skipped.has(s.key));
  const doneDays = doneStages.reduce((n, s) => n + s.expectedDays, 0);
  const span = currentStartOffset - p.startOffset;

  const windows = new Map<string, { start: number; end: number }>();
  let cursor = p.startOffset;
  for (const s of doneStages) {
    const len = (span * s.expectedDays) / Math.max(1, doneDays);
    windows.set(s.id, { start: cursor, end: cursor + len });
    cursor += len;
  }
  // Remaining stages are planned evenly up to the due date.
  const remaining = stages.slice(currentIdx).filter((s) => !skipped.has(s.key));
  const remainingDays = remaining.reduce((n, s) => n + s.expectedDays, 0);
  cursor = currentStartOffset;
  const planSpan = Math.max(remainingDays * 0.5, p.dueOffset - currentStartOffset);
  for (const s of remaining) {
    const len = (planSpan * s.expectedDays) / Math.max(1, remainingDays);
    windows.set(s.id, { start: cursor, end: cursor + len });
    cursor += len;
  }

  const projectStageIds = new Map<StageKey, string>();
  let previousStageId: string | null = null;
  for (const [i, s] of stages.entries()) {
    const w = windows.get(s.id);
    const status = skipped.has(s.key)
      ? 'SKIPPED'
      : i < currentIdx
        ? 'DONE'
        : i === currentIdx
          ? 'ACTIVE'
          : 'PENDING';
    const ps = await m.ProjectStage.create({
      projectId: project._id,
      stageDefinitionId: s.id,
      status,
      ownerId: roleId(STAGE_OWNER[s.key]),
      startedAt: w && status !== 'PENDING' ? atFraction(w.start) : null,
      completedAt: w && status === 'DONE' ? atFraction(w.end) : null,
    });
    projectStageIds.set(s.key, ps._id);

    if (status === 'DONE' || status === 'ACTIVE') {
      const when = atFraction(w!.start);
      await m.StageTransition.create({
        projectId: project._id,
        fromStageId: previousStageId,
        toStageId: ps._id,
        direction: 'FORWARD',
        actorId: ctx.producerUserId,
        source: 'UI',
        reason: previousStageId ? null : 'Project kicked off',
        createdAt: when,
      });
      log(
        ctx,
        when,
        'project.transitioned',
        'project',
        project._id,
        project._id,
        previousStageId ? `${p.title} moved to ${s.label}` : `${p.title} started in ${s.label}`,
        ctx.producerUserId,
      );
      previousStageId = ps._id;
    }
    if (status === 'DONE' && s.requiresApproval) {
      await m.Approval.create({
        kind: 'CLIENT',
        status: 'APPROVED',
        projectStageId: ps._id,
        title: `${s.label} sign-off`,
        requestedAt: atFraction(w!.end - 1),
        decidedAt: atFraction(w!.end),
        decidedBy: client.contactName,
      });
    }
  }
  if (delivered && previousStageId) {
    await m.StageTransition.create({
      projectId: project._id,
      fromStageId: previousStageId,
      toStageId: null,
      direction: 'FORWARD',
      actorId: ctx.producerUserId,
      reason: 'Delivered to client',
      createdAt: at(p.dueOffset - 1, 17),
    });
    log(
      ctx,
      at(p.dueOffset - 1, 17),
      'project.delivered',
      'project',
      project._id,
      project._id,
      `${p.title} delivered to ${client.name}`,
      ctx.producerUserId,
    );
  }

  // Tasks. Effort scales with project size: a reel pack is not a brand film.
  const sizeFactor = Math.min(1, Math.max(0.3, p.budget / 600000));
  const taskIds: { id: string; key: StageKey; title: string }[] = [];
  for (const [i, s] of stages.entries()) {
    if (skipped.has(s.key)) continue;
    const templates = [...STAGE_TASKS[s.key]];
    const w = windows.get(s.id)!;
    const doneCount =
      i < currentIdx
        ? templates.length
        : i === currentIdx
          ? Math.floor(templates.length * p.stageProgress)
          : 0;
    const created: string[] = [];
    for (const [j, t] of templates.entries()) {
      let status: TaskStatus =
        j < doneCount ? 'DONE' : i === currentIdx && j === doneCount ? 'IN_PROGRESS' : 'TODO';
      let blockedReason: string | null = null;
      let due = w.start + ((w.end - w.start) * (j + 1)) / templates.length;
      // Open work in the current stage is planned from today onwards (scenarios below add the exceptions).
      if (i === currentIdx && j >= doneCount) due = Math.max(due, (j - doneCount + 1) * 2);
      // Scenario overrides.
      if (p.tag === 'aurora-film' && t.title === 'Colour grade') {
        status = 'BLOCKED';
        blockedReason = 'Waiting on sky replacement and clean-up from the AI & VFX artist.';
      }
      if (p.tag === 'aurora-film' && t.title === 'Sound design and mix') status = 'IN_PROGRESS';
      if (p.tag === 'neotech-corp' && s.key === 'SHOOT' && status === 'IN_PROGRESS')
        status = 'TODO';
      if (p.tag === 'zenpods-hero' && t.title === 'Consolidate client feedback') status = 'TODO';

      const task = await m.Task.create({
        projectId: project._id,
        projectStageId: projectStageIds.get(s.key)!,
        title: t.title,
        assigneeId: roleId(t.role),
        status,
        blockedReason,
        priority: t.blocking ? (p.priority === 'URGENT' ? 'URGENT' : 'HIGH') : 'MEDIUM',
        dueDate: atFraction(due, 18),
        estimateHours: Math.max(1, Math.round(t.hours * sizeFactor)),
        isStageBlocking: t.blocking,
        completedAt: status === 'DONE' ? atFraction(Math.min(due, -0.2)) : null,
        createdAt: atFraction(w.start),
      });
      created.push(task._id);
      taskIds.push({ id: task._id, key: s.key, title: t.title });
      if (t.after !== undefined) {
        await m.TaskDependency.create({ taskId: task._id, dependsOnId: created[t.after]! });
      }
      if (status === 'DONE') {
        log(
          ctx,
          atFraction(Math.min(due, -0.2)),
          'task.completed',
          'task',
          task._id,
          project._id,
          `${ctx.memberName.get(roleId(t.role))} completed “${t.title}” on ${p.title}`,
          ctx.producerUserId,
        );
      }
    }
  }

  if (p.tag === 'aurora-film') {
    const grade = taskIds.find((t) => t.title === 'Colour grade')!;
    const vfx = await m.Task.create({
      projectId: project._id,
      projectStageId: projectStageIds.get('EDIT')!,
      title: 'Sky replacement and clean-up (AI-assisted)',
      description: 'Replace overcast skies in the loom-yard scenes; remove modern signage.',
      assigneeId: ctx.member.get('ai')!,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueDate: at(-1, 18),
      estimateHours: 12,
      isStageBlocking: true,
      createdAt: at(-6),
    });
    await m.TaskDependency.create({ taskId: grade.id, dependsOnId: vfx._id });
    log(
      ctx,
      at(-1, 17, 40),
      'task.blocked',
      'task',
      grade.id,
      project._id,
      'Colour grade on Woven Light marked blocked — waiting on sky replacement',
      ctx.producerUserId,
    );
  }
  if (p.tag === 'zenpods-reels') {
    await m.Task.create({
      projectId: project._id,
      projectStageId: projectStageIds.get('REVIEW')!,
      title: 'Updated price card graphics',
      description: 'Round 3 feedback: replace the old price card in all four reels.',
      assigneeId: ctx.member.get('motion')!,
      status: 'BLOCKED',
      blockedReason: 'Waiting on the client’s new price card artwork.',
      priority: 'URGENT',
      dueDate: at(0, 18),
      estimateHours: 3,
      isStageBlocking: true,
      createdAt: at(-1, 13),
    });
  }
  if (p.aiAssisted && p.tag !== 'neotech-demo') {
    const pre = projectStageIds.get('PRE_PRODUCTION')!;
    const preIdx = stages.findIndex((s) => s.key === 'PRE_PRODUCTION');
    await m.Task.create({
      projectId: project._id,
      projectStageId: pre,
      title: 'AI-assisted previs frames',
      description: 'Generate style frames and an animatic to align the client on look and pacing.',
      assigneeId: ctx.member.get('ai')!,
      status: preIdx < currentIdx ? 'DONE' : preIdx === currentIdx ? 'IN_PROGRESS' : 'TODO',
      priority: 'MEDIUM',
      estimateHours: 8,
      dueDate: atFraction(windows.get(stages[preIdx]!.id)!.end, 18),
      completedAt: preIdx < currentIdx ? atFraction(windows.get(stages[preIdx]!.id)!.end) : null,
    });
  }

  await seedDeliverables(
    ctx,
    p,
    project._id,
    projectStageIds.get('REVIEW') ?? null,
    currentIdx,
    stages,
  );
  await seedFinance(ctx, p, project._id, stages, currentIdx, windows);
  await seedInteractions(ctx, p, project._id, client);
}

async function seedDeliverables(
  ctx: Ctx,
  p: ProjectFixture,
  projectId: string,
  reviewStageId: string | null,
  currentIdx: number,
  stages: { key: StageKey }[],
) {
  const { m } = ctx;
  const stageIdx = (k: StageKey) => stages.findIndex((s) => s.key === k);
  const specs = DELIVERABLES[p.type] ?? DELIVERABLES.BRAND_FILM!;
  const contact = ctx.client.get(p.client)!.contactName;

  for (const [i, d] of specs.entries()) {
    let status: DeliverableStatus = 'PLANNED';
    let version = 0;
    if (p.status === 'DELIVERED') [status, version] = ['DELIVERED', 2];
    else if (currentIdx > stageIdx('REVIEW')) [status, version] = ['APPROVED', 2];
    else if (currentIdx === stageIdx('REVIEW')) [status, version] = ['IN_REVIEW', 1];
    else if (currentIdx === stageIdx('EDIT')) [status, version] = ['IN_PROGRESS', 0];

    if (p.tag === 'zenpods-hero') version = i === 0 ? 2 : 1;
    if (p.tag === 'zenpods-reels') [status, version] = ['CHANGES_REQUESTED', 3];

    const deliverable = await m.Deliverable.create({
      projectId,
      ...d,
      status,
      currentVersion: version,
      dueDate: at(p.dueOffset, 18),
      previewImageUrl: null,
    });

    // Revision rounds and feedback.
    for (let round = 1; round <= version; round++) {
      const sentOffset = p.tag === 'zenpods-hero' && round === 2 ? -4 : -10 + round * 3;
      const isLatest = round === version;
      const open = isLatest && (status === 'IN_REVIEW' || status === 'CHANGES_REQUESTED');
      const rr = await m.RevisionRound.create({
        deliverableId: deliverable._id,
        number: round,
        sentAt: at(sentOffset, 16),
        closedAt: open ? null : at(sentOffset + 2, 12),
        includedInScope: round <= p.includedRevisions,
      });
      const notes =
        p.tag === 'zenpods-reels' && isLatest
          ? [
              [
                '00:00:02:10',
                'Logo needs to appear in the first second for marketplace rules.',
                'OPEN',
              ],
              ['00:00:11:04', 'Use the new price card — the old one is still showing.', 'OPEN'],
            ]
          : open
            ? []
            : [
                ['00:00:04:12', 'Can the opening shot hold a little longer?', 'RESOLVED'],
                ['00:00:21:03', 'Product colour looks slightly warm here.', 'RESOLVED'],
              ];
      for (const [timecode, body, fstatus] of notes) {
        await m.FeedbackItem.create({
          revisionRoundId: rr._id,
          timecode,
          body: body!,
          author: contact,
          status: fstatus as 'OPEN' | 'RESOLVED',
          createdAt: at(sentOffset + 1, 11),
        });
      }
    }

    // Approvals on deliverables in review.
    if (p.tag === 'zenpods-hero' && i === 0) {
      await m.Approval.create({
        kind: 'CLIENT',
        status: 'PENDING',
        deliverableId: deliverable._id,
        projectStageId: reviewStageId,
        title: 'Client approval — Hero product film v2',
        requestedAt: at(-4, 16),
      });
      log(
        ctx,
        at(-4, 16),
        'approval.requested',
        'deliverable',
        deliverable._id,
        projectId,
        `Sent ${d.name} v2 to ${contact} for approval`,
        ctx.producerUserId,
      );
    } else if (p.tag === 'zenpods-reels' && i === 0) {
      await m.Approval.create({
        kind: 'CLIENT',
        status: 'CHANGES_REQUESTED',
        deliverableId: deliverable._id,
        projectStageId: reviewStageId,
        title: 'Client approval — reel pack v3',
        requestedAt: at(-3, 15),
        decidedAt: at(-1, 12),
        decidedBy: contact,
        note: 'Logo timing and price card need changes.',
      });
      log(
        ctx,
        at(-1, 12),
        'approval.decided',
        'deliverable',
        deliverable._id,
        projectId,
        `${contact} requested changes on Unboxing Reels (round 3 — beyond included revisions)`,
        null,
      );
    } else if (status === 'APPROVED' || status === 'DELIVERED') {
      await m.Approval.create({
        kind: 'CLIENT',
        status: 'APPROVED',
        deliverableId: deliverable._id,
        title: `Client approval — ${d.name}`,
        requestedAt: at(p.dueOffset - 5, 15),
        decidedAt: at(p.dueOffset - 3, 11),
        decidedBy: contact,
      });
    }
  }

  // Stage-level approval for projects already past Review.
  if (reviewStageId && currentIdx > stageIdx('REVIEW')) {
    await m.Approval.create({
      kind: 'CLIENT',
      status: 'APPROVED',
      projectStageId: reviewStageId,
      title: 'Final cut sign-off',
      requestedAt: at(p.dueOffset - 5, 15),
      decidedAt: at(p.dueOffset - 3, 11),
      decidedBy: contact,
    });
  }
}

async function seedFinance(
  ctx: Ctx,
  p: ProjectFixture,
  projectId: string,
  stages: { id: string; key: StageKey }[],
  currentIdx: number,
  windows: Map<string, { start: number; end: number }>,
) {
  const records: NewFinancialRecord[] = [];
  const add = (
    kind: 'INCOME' | 'EXPENSE',
    category: FinanceCategory,
    amount: number,
    offset: number,
    note: string,
  ) =>
    records.push({
      projectId,
      kind,
      category,
      amount: Math.round(amount),
      occurredOn: atFraction(Math.min(offset, 0)),
      note,
    });

  add('INCOME', 'ADVANCE', p.budget * 0.4, p.startOffset + 1, 'Advance on signing (40%)');
  const shootIdx = stages.findIndex((s) => s.key === 'SHOOT');
  if (currentIdx > shootIdx) {
    add(
      'INCOME',
      'MILESTONE',
      p.budget * 0.3,
      windows.get(stages[shootIdx]!.id)?.end ?? p.startOffset + 5,
      'Milestone after shoot (30%)',
    );
  }
  if (p.status === 'DELIVERED')
    add('INCOME', 'FINAL_PAYMENT', p.budget * 0.3, p.dueOffset + 4, 'Final payment (30%)');

  // Spend tracks progress; Woven Light deliberately overspends (budget-burn scenario).
  const progress = Math.min(1, (currentIdx + p.stageProgress) / stages.length);
  const burnFactor = p.tag === 'aurora-film' ? 2.2 : 0.92;
  const spend = p.budget * 0.62 * progress * burnFactor;
  const split: [FinanceCategory, number, string][] = [
    ['CREW', 0.45, 'Freelance crew and talent'],
    ['EQUIPMENT_RENTAL', 0.2, 'Additional rentals'],
    ['LOCATION', 0.2, 'Location fees and permits'],
    ['TRAVEL', 0.15, 'Travel and logistics'],
  ];
  for (const [category, share, note] of split) {
    if (spend * share < 1000) continue;
    add(
      'EXPENSE',
      category,
      spend * share,
      p.startOffset + between(2, Math.max(3, -p.startOffset - 1)),
      note,
    );
  }
  await ctx.m.FinancialRecord.insertMany(records);
}

async function seedInteractions(
  ctx: Ctx,
  p: ProjectFixture,
  projectId: string,
  client: { id: string; name: string; contactName: string },
) {
  const items: NewInteraction[] = [
    {
      clientId: client.id,
      projectId,
      type: 'CALL',
      summary: `Discovery call for “${p.title}” — goals, audience and timeline captured.`,
      occurredAt: at(p.startOffset - 2, 11),
      loggedById: ctx.producerUserId,
    },
    {
      clientId: client.id,
      projectId,
      type: 'EMAIL',
      summary: 'Shared creative treatment and estimate.',
      occurredAt: at(p.startOffset + 2, 17),
      loggedById: ctx.producerUserId,
    },
  ];
  if (p.tag === 'zenpods-hero') {
    items.push({
      clientId: client.id,
      projectId,
      type: 'WHATSAPP',
      summary: 'Followed up on v2 review link — marketing head travelling, reply expected soon.',
      occurredAt: at(-2, 12),
      loggedById: ctx.producerUserId,
    });
  }
  if (p.tag === 'zenpods-reels') {
    items.push({
      clientId: client.id,
      projectId,
      type: 'FEEDBACK',
      summary: 'Round 3 feedback: logo timing and updated price card.',
      occurredAt: at(-1, 12),
      loggedById: ctx.producerUserId,
    });
  }
  if (p.tag === 'aurora-film') {
    items.push({
      clientId: client.id,
      projectId,
      type: 'MEETING',
      summary: 'Rough-cut screening at the studio; client loved the loom sequence.',
      occurredAt: at(-7, 15),
      loggedById: ctx.adminId,
    });
  }
  await ctx.m.ClientInteraction.insertMany(items);
  for (const i of items) {
    log(
      ctx,
      i.occurredAt,
      'client.interaction',
      'client',
      client.id,
      projectId,
      `${i.type.charAt(0)}${i.type.slice(1).toLowerCase()} with ${client.name}: ${i.summary}`,
      i.loggedById ?? null,
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** One membership per person; the first role listed wins when someone wears two hats. */
function projectMembers(ctx: Ctx, p: ProjectFixture) {
  const roles: [RoleTag, string][] = [
    [p.director, 'Director'],
    ['producer', 'Producer'],
    ['dop', 'DOP'],
    [p.editor, 'Editor'],
    ...(p.aiAssisted ? ([['ai', 'AI & VFX']] as [RoleTag, string][]) : []),
  ];
  const seen = new Set<RoleTag>();
  return roles
    .filter(([tag]) => (seen.has(tag) ? false : (seen.add(tag), true)))
    .map(([tag, role]) => ({ teamMemberId: ctx.member.get(tag)!, role }));
}

/** A date at a fractional day offset from today (09:00 unless an hour is given). */
function atFraction(offset: number, hour?: number): Date {
  const base =
    hour === undefined
      ? TODAY.getTime() + offset * DAY + 9 * 3600 * 1000
      : at(Math.floor(offset), hour).getTime();
  return new Date(base);
}

function log(
  ctx: Ctx,
  createdAt: Date,
  action: string,
  entityType: string,
  entityId: string,
  projectId: string | null,
  summary: string,
  actorId: string | null = ctx.producerUserId,
) {
  if (createdAt > NOW) return;
  ctx.activity.push({
    createdAt,
    action,
    entityType,
    entityId,
    projectId,
    summary,
    actorId,
    source: actorId ? 'UI' : 'SYSTEM',
  });
}
