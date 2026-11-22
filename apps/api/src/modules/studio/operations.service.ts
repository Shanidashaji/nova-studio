import { Injectable } from '@nestjs/common';
import type {
  ActivityLog,
  Approval,
  Asset,
  AssetBooking,
  Client,
  ClientInteraction,
  ClientMessage,
  CrewCall,
  Deliverable,
  FeedbackItem,
  LeaveRequest,
  Project,
  RevisionRound,
  Shoot,
  ShootLogEntry,
  StudioBooking,
  Talent,
  TalentBooking,
  Task,
  TeamMember,
  User,
} from '@nova/db';
import {
  canSeeProjectMoney,
  DAY_MS,
  istDayKey,
  istDayStart,
  leaveOverlaps,
  rangesOverlap,
  shootDayKeys,
  STAGE_LABELS,
  STAGE_KEYS,
  utilisationBand,
  type AttentionAction,
  type CapacityQuery,
  type CapacityView,
  type CommandCenterView,
  type ProjectListQuery,
  type ProjectSummary,
  type ReportsView,
  type SessionUser,
  type StageKey,
  type TaskBoardItem,
  type TaskBoardQuery,
  type TaskBoardView,
} from '@nova/shared';
import { containsI } from '../../common/query';
import { DatabaseService } from '../../database/database.service';
import { hiddenEntityTypes } from '../activity/activity-visibility';
import { iso, taskViewPopulate, toTaskView, type TaskViewRow } from '../projects/project.mapper';
import { ProjectsService } from '../projects/projects.service';
import { ScheduleConflicts } from '../schedule/schedule-conflicts';
import { TeamService } from '../team/team.service';
import { BudgetService } from './budget.service';
import { ShootDayService } from './shoot-day.service';

const DIRECTOR = /\bdirector\b(?! of photography)/i;
const CAMERA_OP = /\b(dop|cinematograph\w*|camera|director of photography)\b/i;
const OPEN_TASK = { $ne: 'DONE' } as const;

/** Days (IST keys) of [from, from + n). */
function dayKeys(from: Date, n: number): string[] {
  const start = istDayKey(from);
  const keys: string[] = [];
  for (let i = 0; i < n; i++)
    keys.push(istDayKey(new Date(istDayStart(start).getTime() + i * DAY_MS + 60_000)));
  return keys;
}
const dayRange = (key: string) => ({
  startsAt: istDayStart(key),
  endsAt: new Date(istDayStart(key).getTime() + DAY_MS),
});

/**
 * Studio-wide operational views: the task board, capacity planning, reports and the command
 * centre. Read-only; every figure is computed from live records (no stored aggregates).
 */
@Injectable()
export class OperationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly team: TeamService,
    private readonly conflicts: ScheduleConflicts,
    private readonly shootDay: ShootDayService,
    private readonly budget: BudgetService,
  ) {}

  private summaries(
    user: SessionUser,
    status: 'ACTIVE' | 'ALL' = 'ACTIVE',
  ): Promise<ProjectSummary[]> {
    return this.projects.list({ status, sort: 'due' }, user);
  }

  // ── Task board ──────────────────────────────────────────────────────────────

  async taskBoard(q: TaskBoardQuery): Promise<TaskBoardView> {
    const { Task: Tasks, Project: Projects } = this.database.models;
    const live = await Projects.find(
      q.projectId ? { _id: q.projectId } : { status: { $in: ['ACTIVE', 'ON_HOLD'] } },
      { code: 1, title: 1 },
    ).lean<Pick<Project, '_id' | 'id' | 'code' | 'title'>[]>();
    const where: Record<string, unknown> = { projectId: { $in: live.map((p) => p.id) } };
    if (q.assigneeId) where.assigneeId = q.assigneeId;
    if (q.status) where.status = q.status;
    else if (q.includeDone !== 'true') {
      where.$or = [
        { status: OPEN_TASK },
        { completedAt: { $gte: new Date(Date.now() - 14 * DAY_MS) } },
      ];
    }
    if (q.priority) where.priority = q.priority;
    if (q.q) where.title = containsI(q.q);
    const rows = await Tasks.find(where)
      .sort({ dueDate: 1, createdAt: 1 })
      .limit(600)
      .populate([...taskViewPopulate, { path: 'shoot', select: { title: 1 } }])
      .lean<(TaskViewRow & { shoot: Pick<Shoot, '_id' | 'id' | 'title'> | null })[]>();
    const depIds = [...new Set(rows.flatMap((r) => r.dependsOn.map((d) => d.dependsOnId)))];
    const deps = await Tasks.find({ _id: { $in: depIds } }, { title: 1, status: 1 }).lean<
      Pick<Task, '_id' | 'id' | 'title' | 'status'>[]
    >();
    const depMap = new Map(deps.map((d) => [d.id, d]));
    const project = new Map(live.map((p) => [p.id, p]));
    const now = Date.now();
    let items: TaskBoardItem[] = rows.map((t) => {
      const blockers = t.dependsOn
        .map((d) => depMap.get(d.dependsOnId))
        .filter((d): d is NonNullable<typeof d> => !!d && d.status !== 'DONE')
        .map((d) => ({ id: d.id, title: d.title, status: d.status }));
      const p = project.get(t.projectId)!;
      return {
        ...toTaskView(t),
        project: { id: p.id, code: p.code, title: p.title },
        overdue: t.status !== 'DONE' && !!t.dueDate && t.dueDate.getTime() < now,
        blocked: t.status !== 'DONE' && (t.status === 'BLOCKED' || blockers.length > 0),
        blockers,
        shoot: t.shoot ? { id: t.shoot.id, title: t.shoot.title } : null,
      };
    });
    const counts = {
      open: items.filter((i) => i.status !== 'DONE').length,
      overdue: items.filter((i) => i.overdue).length,
      blocked: items.filter((i) => i.blocked).length,
      done: items.filter((i) => i.status === 'DONE').length,
    };
    if (q.flag === 'overdue') items = items.filter((i) => i.overdue);
    if (q.flag === 'blocked') items = items.filter((i) => i.blocked);
    return { items, counts };
  }

  // ── Capacity ────────────────────────────────────────────────────────────────

  async capacity(q: CapacityQuery): Promise<CapacityView> {
    const n = q.days ?? 28;
    const keys = dayKeys(q.from ?? new Date(), n);
    const from = istDayStart(keys[0]!);
    const to = new Date(istDayStart(keys.at(-1)!).getTime() + DAY_MS);
    const m = this.database.models;
    const [
      shoots,
      members,
      talent,
      assets,
      assetBookings,
      studios,
      studioBookings,
      leaves,
      workload,
      conflicts,
    ] = await Promise.all([
      m.Shoot.find({ startsAt: { $lt: to }, endsAt: { $gt: from }, status: { $ne: 'CANCELLED' } })
        .sort({ startsAt: 1 })
        .populate([
          { path: 'project', select: { code: 1 } },
          { path: 'crew' },
          { path: 'talent', match: { status: { $ne: 'RELEASED' } } },
        ])
        .lean<
          (Shoot & {
            project: Pick<Project, 'code'> | null;
            crew: CrewCall[];
            talent: TalentBooking[];
          })[]
        >(),
      m.TeamMember.find({ isActive: true }).lean<TeamMember[]>(),
      m.Talent.find({ isActive: true }).lean<Talent[]>(),
      m.Asset.find({ status: { $ne: 'RETIRED' } }).lean<Asset[]>(),
      m.AssetBooking.find({ startsAt: { $lt: to }, endsAt: { $gt: from } }).lean<AssetBooking[]>(),
      m.Studio.find().lean(),
      m.StudioBooking.find({
        startsAt: { $lt: to },
        endsAt: { $gt: from },
        status: { $ne: 'CANCELLED' },
      }).lean<StudioBooking[]>(),
      m.LeaveRequest.find({
        status: 'APPROVED',
        endDate: { $gte: new Date(from.getTime() - DAY_MS) },
        startDate: { $lte: to },
      }).lean<LeaveRequest[]>(),
      this.team.list(),
      this.conflicts.all(from, to),
    ]);
    const liveShootIds = new Set(shoots.map((s) => s.id));
    const directors = members.filter((x) => DIRECTOR.test(x.title));
    const cameraOps = members.filter((x) => CAMERA_OP.test(x.title));
    const cameras = assets.filter((a) => a.category === 'CAMERA' && a.status === 'AVAILABLE');
    const limits: [number, string][] = [
      [directors.length, 'directors'],
      [cameraOps.length, 'camera operators (DOP / camera)'],
      [cameras.length, 'available camera bodies'],
    ];
    limits.sort((a, b) => a[0] - b[0]);
    const shootCapacity = { value: limits[0]![0], limitedBy: limits[0]![1] };

    const days = keys.map((key) => {
      const range = dayRange(key);
      const today = shoots.filter((s) => rangesOverlap(s, range));
      const onLeave = new Set(
        leaves.filter((l) => leaveOverlaps(l, range)).map((l) => l.teamMemberId),
      );
      const capacity = Math.min(
        directors.filter((x) => !onLeave.has(x.id)).length,
        cameraOps.filter((x) => !onLeave.has(x.id)).length,
        cameras.length,
      );
      return {
        date: key,
        shoots: today.map((s) => ({
          id: s.id,
          title: s.title,
          projectCode: s.project?.code ?? '',
          status: s.status,
        })),
        crewBooked: new Set(today.flatMap((s) => s.crew.map((c) => c.teamMemberId))).size,
        talentBooked: new Set(today.flatMap((s) => s.talent.map((t) => t.talentId))).size,
        equipmentBooked: new Set(
          assetBookings
            .filter((b) => rangesOverlap(b, range) && (!b.shootId || liveShootIds.has(b.shootId)))
            .map((b) => b.assetId),
        ).size,
        studiosBooked: new Set(
          studioBookings.filter((b) => rangesOverlap(b, range)).map((b) => b.studioId),
        ).size,
        shootCapacity: capacity,
        load: capacity > 0 ? today.length / capacity : today.length > 0 ? 2 : 0,
      };
    });
    const peak = days.reduce(
      (a, d) => (d.shoots.length > a.count ? { date: d.date, count: d.shoots.length } : a),
      {
        date: null as string | null,
        count: 0,
      },
    );
    const overlaps: CapacityView['overlaps'] = [];
    for (let i = 0; i < shoots.length; i++)
      for (let j = i + 1; j < shoots.length; j++)
        if (rangesOverlap(shoots[i]!, shoots[j]!)) {
          const start =
            shoots[i]!.startsAt > shoots[j]!.startsAt ? shoots[i]!.startsAt : shoots[j]!.startsAt;
          overlaps.push({
            a: { id: shoots[i]!.id, title: shoots[i]!.title },
            b: { id: shoots[j]!.id, title: shoots[j]!.title },
            date: istDayKey(start),
          });
        }
    const weeks = [0, 1, 2, 3].map((w) => {
      const hours = workload.reduce((a, x) => a + (x.weeks[w]?.hours ?? 0), 0);
      const capacity = workload.reduce((a, x) => a + (x.weeks[w]?.capacity ?? 0), 0);
      return {
        weekStart:
          workload[0]?.weeks[w]?.weekStart ?? iso(new Date(from.getTime() + w * 7 * DAY_MS)),
        hours,
        capacity,
        ratio: capacity ? hours / capacity : 0,
      };
    });
    const daysIn = (s: Shoot) =>
      shootDayKeys(s.startsAt, s.endsAt).filter((k) => keys.includes(k)).length;
    const crew = workload.map((w) => {
      const ratio = w.weeks[0]?.ratio ?? 0;
      return {
        member: { id: w.id, name: w.name, title: w.title, avatarUrl: w.avatarUrl },
        shootDays: shoots
          .filter((s) => s.crew.some((c) => c.teamMemberId === w.id))
          .reduce((a, s) => a + daysIn(s), 0),
        utilisation: ratio,
        band: utilisationBand(ratio),
      };
    });
    const talentRows = talent
      .map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        bookedDays: shoots
          .filter((s) => s.talent.some((b) => b.talentId === t.id))
          .reduce((a, s) => a + daysIn(s), 0),
      }))
      .filter((t) => t.bookedDays > 0)
      .sort((a, b) => b.bookedDays - a.bookedDays);

    // Verdict: can the studio take another production in the next four weeks?
    const avgUtil = weeks.reduce((a, w) => a + w.ratio, 0) / weeks.length;
    let nextOpening: string | null = null;
    for (let i = 0; i + 5 <= days.length; i++) {
      const slice = days.slice(i, i + 5);
      const week = weeks[Math.min(3, Math.floor(i / 7))]!;
      if (slice.every((d) => d.shoots.length < d.shootCapacity) && week.ratio < 0.85) {
        nextOpening = slice[0]!.date;
        break;
      }
    }
    const reasons: string[] = [];
    reasons.push(
      `Team workload averages ${Math.round(avgUtil * 100)}% of capacity over the next four weeks.`,
    );
    reasons.push(
      `The studio can run ${shootCapacity.value} shoot(s) at once, limited by ${shootCapacity.limitedBy}.`,
    );
    if (peak.count > 0) reasons.push(`Busiest day: ${peak.date} with ${peak.count} shoot(s).`);
    if (conflicts.length)
      reasons.push(`${conflicts.length} double booking(s) need resolving first.`);
    const full = days.filter(
      (d) => d.shoots.length >= d.shootCapacity && d.shootCapacity > 0,
    ).length;
    if (full) reasons.push(`${full} day(s) are already at shoot capacity.`);
    const canTakeMore = avgUtil < 0.85 && nextOpening !== null;
    return {
      from: iso(from),
      days,
      totals: {
        crew: members.length,
        talent: talent.length,
        equipment: assets.length,
        equipmentInMaintenance: assets.filter((a) => a.status === 'MAINTENANCE').length,
        studios: studios.length,
        directors: directors.length,
        cameraOperators: cameraOps.length,
        cameraBodies: cameras.length,
      },
      shootCapacity,
      peakConcurrent: peak,
      overlaps,
      conflicts: conflicts.length,
      workload: weeks,
      crew,
      talent: talentRows,
      verdict: {
        canTakeMore,
        headline: canTakeMore
          ? `Yes — there is room from ${nextOpening}.`
          : avgUtil >= 0.85
            ? 'Not without overloading the team: workload is above 85% of capacity.'
            : 'Not in the next four weeks: no five-day window has free shoot capacity.',
        reasons,
        nextOpening,
      },
    };
  }

  // ── Command centre ──────────────────────────────────────────────────────────

  async commandCenter(user: SessionUser): Promise<CommandCenterView> {
    const m = this.database.models;
    const now = new Date();
    const todayKey = istDayKey(now);
    const today = dayRange(todayKey);
    const horizon = new Date(today.endsAt.getTime() + 14 * DAY_MS);
    const [
      day,
      upcomingShoots,
      summaries,
      members,
      leaves,
      assets,
      assetBookings,
      studios,
      studioBookings,
    ] = await Promise.all([
      this.shootDay.day(todayKey),
      m.Shoot.find({ startsAt: { $gte: today.endsAt, $lt: horizon }, status: { $ne: 'CANCELLED' } })
        .sort({ startsAt: 1 })
        .lean<Shoot[]>(),
      this.summaries(user),
      m.TeamMember.countDocuments({ isActive: true }),
      m.LeaveRequest.find({
        status: 'APPROVED',
        startDate: { $lte: today.endsAt },
        endDate: { $gte: new Date(today.startsAt.getTime() - DAY_MS) },
      }).lean<LeaveRequest[]>(),
      m.Asset.find({ status: { $ne: 'RETIRED' } }, { status: 1 }).lean<
        Pick<Asset, '_id' | 'status'>[]
      >(),
      m.AssetBooking.find(
        { startsAt: { $lt: today.endsAt }, endsAt: { $gt: today.startsAt } },
        { assetId: 1, shootId: 1 },
      ).lean<Pick<AssetBooking, 'assetId' | 'shootId'>[]>(),
      m.Studio.countDocuments(),
      m.StudioBooking.find(
        {
          startsAt: { $lt: today.endsAt },
          endsAt: { $gt: today.startsAt },
          status: { $ne: 'CANCELLED' },
        },
        { studioId: 1 },
      ).lean<Pick<StudioBooking, 'studioId'>[]>(),
    ]);
    const todayIds = day.shoots.map((s) => s.id);
    const activeIds = summaries.map((p) => p.id);
    const [
      crewToday,
      talentToday,
      overdueTasks,
      blockedTasks,
      approvals,
      scripts,
      revisions,
      drafts,
      failed,
      issues,
      conflicts,
      activity,
    ] = await Promise.all([
      m.CrewCall.distinct('teamMemberId', { shootId: { $in: todayIds } }),
      m.TalentBooking.distinct('talentId', {
        shootId: { $in: todayIds },
        status: { $ne: 'RELEASED' },
      }),
      m.Task.find({ projectId: { $in: activeIds }, status: OPEN_TASK, dueDate: { $lt: now } })
        .sort({ dueDate: 1 })
        .populate({ path: 'project', select: { title: 1 } })
        .lean<(Task & { project: Pick<Project, 'title'> | null })[]>(),
      m.Task.countDocuments({ projectId: { $in: activeIds }, status: 'BLOCKED' }),
      m.Approval.find({ status: 'PENDING', kind: 'CLIENT' })
        .populate({ path: 'deliverable', select: { name: 1, projectId: 1 } })
        .lean<(Approval & { deliverable: Pick<Deliverable, 'name' | 'projectId'> | null })[]>(),
      m.Script.find({ status: 'IN_REVIEW' }).lean(),
      m.Deliverable.countDocuments({ projectId: { $in: activeIds }, status: 'CHANGES_REQUESTED' }),
      m.ClientMessage.countDocuments({ status: 'DRAFT' }),
      m.ClientMessage.countDocuments({ status: 'FAILED' }),
      m.ShootLogEntry.find({ kind: 'ISSUE', resolvedAt: null, shootId: { $in: todayIds } }).lean<
        ShootLogEntry[]
      >(),
      this.conflicts.all(today.startsAt, horizon),
      m.ActivityLog.find({
        createdAt: { $gte: today.startsAt },
        ...(hiddenEntityTypes(user.permissions).length
          ? { entityType: { $nin: hiddenEntityTypes(user.permissions) } }
          : {}),
      })
        .sort({ createdAt: -1 })
        .limit(12)
        .populate({ path: 'actor', select: { name: 1 } })
        .lean<(ActivityLog & { actor: Pick<User, 'name'> | null })[]>(),
    ]);
    const upcoming = (await this.shootDay.summaries(upcomingShoots)).map((s) => ({
      ...s,
      daysAway: Math.round(
        (istDayStart(istDayKey(s.startsAt)).getTime() - today.startsAt.getTime()) / DAY_MS,
      ),
    }));
    const byDay = new Map<string, { id: string; title: string }[]>();
    for (const s of [...day.shoots, ...upcoming]) {
      for (const k of shootDayKeys(s.startsAt, s.endsAt)) {
        if (k < todayKey) continue;
        byDay.set(k, [...(byDay.get(k) ?? []), { id: s.id, title: s.title }]);
      }
    }
    const simultaneous = [...byDay.entries()]
      .filter(([, list]) => list.length > 1)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 7)
      .map(([date, shoots]) => ({ date, shoots }));
    const overdueReviews = approvals.filter((a) => a.dueAt && a.dueAt < now);
    const atRisk = summaries.filter((p) => p.health.band !== 'ON_TRACK');
    const weekEnd = now.getTime() + 7 * DAY_MS;

    const attention: AttentionAction[] = [];
    if (conflicts.length) {
      attention.push({
        severity: 'critical',
        title: `${conflicts.length} double booking${conflicts.length > 1 ? 's' : ''} in the next two weeks`,
        detail: conflicts
          .slice(0, 2)
          .map((c) => `${c.resourceName} on ${istDayKey(c.at)}`)
          .join('; '),
        target: { kind: 'lens', lens: 'schedule' },
      });
    }
    for (const s of [...day.shoots, ...upcoming.filter((u) => u.daysAway <= 3)]) {
      if (s.status === 'PLANNED' || (s.status === 'CONFIRMED' && !s.canStart)) {
        const days = 'daysAway' in s ? (s as { daysAway: number }).daysAway : 0;
        attention.push({
          severity: days <= 1 ? 'critical' : 'warning',
          title: `${s.title} ${days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `in ${days} days`} and not ready`,
          detail: `${s.status === 'PLANNED' ? 'Still planned, not confirmed' : 'Call sheet not published'} · readiness ${s.readinessScore}%`,
          target: { kind: 'shoot-day', shootId: s.id },
        });
      }
    }
    for (const s of day.shoots.filter((x) => x.openIssues > 0)) {
      attention.push({
        severity: 'warning',
        title: `${s.openIssues} open issue(s) on set: ${s.title}`,
        detail: s.delayMinutes
          ? `${s.delayMinutes} minutes of delay logged today`
          : 'Resolve or escalate from the shoot day screen',
        target: { kind: 'shoot-day', shootId: s.id },
      });
    }
    for (const p of atRisk.filter((x) => x.health.band === 'CRITICAL').slice(0, 3)) {
      attention.push({
        severity: 'critical',
        title: `${p.title} is critical (health ${p.health.score})`,
        detail: p.health.deductions
          .slice(0, 2)
          .map((d) => d.label)
          .join('; '),
        target: { kind: 'inspect', type: 'project', id: p.id },
      });
    }
    if (overdueReviews.length) {
      const a = overdueReviews[0]!;
      attention.push({
        severity: 'warning',
        title: `${overdueReviews.length} client review${overdueReviews.length > 1 ? 's are' : ' is'} past the deadline`,
        detail: a.title,
        target: a.deliverable
          ? { kind: 'inspect', type: 'project', id: a.deliverable.projectId }
          : { kind: 'lens', lens: 'post' },
      });
    }
    const waitingScripts = scripts.filter(
      (s) => s.submittedAt && now.getTime() - s.submittedAt.getTime() > 2 * DAY_MS,
    );
    if (waitingScripts.length) {
      attention.push({
        severity: 'warning',
        title: `${waitingScripts.length} script${waitingScripts.length > 1 ? 's' : ''} waiting more than two days for approval`,
        detail: waitingScripts
          .map((s) => s.title)
          .slice(0, 3)
          .join(', '),
        target: { kind: 'lens', lens: 'scripts' },
      });
    }
    for (const t of overdueTasks.slice(0, 3)) {
      attention.push({
        severity: 'warning',
        title: `Overdue: ${t.title}`,
        detail: `${t.project?.title ?? ''} · due ${istDayKey(t.dueDate!)}`,
        target: { kind: 'inspect', type: 'task', id: t.id },
      });
    }
    if (blockedTasks) {
      attention.push({
        severity: 'warning',
        title: `${blockedTasks} blocked task${blockedTasks > 1 ? 's' : ''}`,
        detail: 'Open the task board filtered to blocked work',
        target: { kind: 'lens', lens: 'tasks' },
      });
    }
    if (failed) {
      attention.push({
        severity: 'warning',
        title: `${failed} client message(s) failed to send`,
        detail: 'Check the address and retry',
        target: { kind: 'lens', lens: 'comms' },
      });
    }
    if (drafts) {
      attention.push({
        severity: 'info',
        title: `${drafts} client message${drafts > 1 ? 's' : ''} waiting for review`,
        detail: 'Prepared by automation; nothing is sent until approved',
        target: { kind: 'lens', lens: 'comms' },
      });
    }
    if (revisions) {
      attention.push({
        severity: 'info',
        title: `${revisions} deliverable(s) with client changes requested`,
        detail: 'Revisions in post-production',
        target: { kind: 'lens', lens: 'post' },
      });
    }
    const rank = { critical: 0, warning: 1, info: 2 } as const;
    attention.sort((a, b) => rank[a.severity] - rank[b.severity]);

    const stageCounts = new Map<StageKey, number>();
    for (const p of summaries)
      if (p.stage) stageCounts.set(p.stage.key, (stageCounts.get(p.stage.key) ?? 0) + 1);
    const out = new Set(assetBookings.map((b) => b.assetId));
    return {
      generatedAt: iso(now),
      today: day.shoots,
      upcoming,
      simultaneous,
      availability: {
        crewTotal: members,
        crewOnShoots: crewToday.length,
        crewOnLeave: new Set(
          leaves.filter((l) => leaveOverlaps(l, today)).map((l) => l.teamMemberId),
        ).size,
        talentBooked: talentToday.length,
        equipmentTotal: assets.length,
        equipmentOut: out.size,
        equipmentMaintenance: assets.filter((a) => a.status === 'MAINTENANCE').length,
        studiosBooked: new Set(studioBookings.map((b) => b.studioId)).size,
        studiosTotal: studios,
      },
      counts: {
        activeProjects: summaries.length,
        overdueTasks: overdueTasks.length,
        blockedTasks,
        pendingClientApprovals: approvals.length,
        overdueReviews: overdueReviews.length,
        pendingScriptApprovals: scripts.length,
        revisionRequests: revisions,
        messagesAwaitingReview: drafts,
        openShootIssues: issues.length,
        projectsAtRisk: atRisk.length,
        deadlinesThisWeek: summaries.filter((p) => new Date(p.dueDate).getTime() <= weekEnd).length,
      },
      byStage: STAGE_KEYS.map((key) => ({
        key,
        label: STAGE_LABELS[key],
        count: stageCounts.get(key) ?? 0,
      })),
      attention: attention.slice(0, 12),
      deadlines: summaries
        .filter((p) => new Date(p.dueDate).getTime() <= now.getTime() + 14 * DAY_MS)
        .slice(0, 8)
        .map((p) => ({
          id: p.id,
          code: p.code,
          title: p.title,
          dueDate: p.dueDate,
          daysLeft: Math.ceil((new Date(p.dueDate).getTime() - now.getTime()) / DAY_MS),
          progress: p.progress,
        })),
      activityToday: activity.map((a) => ({
        id: a.id,
        summary: a.summary,
        createdAt: iso(a.createdAt),
        actor: a.actor?.name ?? null,
      })),
    };
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  async reports(user: SessionUser): Promise<ReportsView> {
    const m = this.database.models;
    const now = new Date();
    const since90 = new Date(now.getTime() - 90 * DAY_MS);
    const [
      all,
      team,
      shoots,
      logs,
      talent,
      talentBookings,
      deliverables,
      clients,
      interactions,
      messages,
    ] = await Promise.all([
      this.summaries(user, 'ALL'),
      this.team.list(),
      m.Shoot.find({
        status: { $ne: 'CANCELLED' },
        startsAt: {
          $gte: new Date(now.getTime() - 56 * DAY_MS),
          $lt: new Date(now.getTime() + 28 * DAY_MS),
        },
      })
        .populate({ path: 'crew' })
        .lean<(Shoot & { crew: CrewCall[] })[]>(),
      m.ShootLogEntry.find().lean<ShootLogEntry[]>(),
      m.Talent.find({ isActive: true }).lean<Talent[]>(),
      m.TalentBooking.find({ status: { $ne: 'RELEASED' } })
        .populate({ path: 'shoot', select: { startsAt: 1, endsAt: 1, status: 1 } })
        .lean<(TalentBooking & { shoot: Shoot | null })[]>(),
      m.Deliverable.find()
        .populate({ path: 'rounds', populate: { path: 'feedback' } })
        .lean<(Deliverable & { rounds: (RevisionRound & { feedback: FeedbackItem[] })[] })[]>(),
      m.Client.find().lean<Client[]>(),
      m.ClientInteraction.find({ occurredAt: { $gte: since90 } }).lean<ClientInteraction[]>(),
      m.ClientMessage.find(
        { createdAt: { $gte: since90 }, status: { $in: ['SENT', 'SIMULATED'] } },
        { clientId: 1, sentAt: 1 },
      ).lean<Pick<ClientMessage, 'clientId' | 'sentAt'>[]>(),
    ]);
    const lastInteraction = await m.ClientInteraction.aggregate<{ _id: string; at: Date }>([
      { $group: { _id: '$clientId', at: { $max: '$occurredAt' } } },
    ]);
    const active = all.filter((p) => p.status === 'ACTIVE' || p.status === 'ON_HOLD');
    const delivered = all.filter((p) => p.status === 'DELIVERED');
    const onTime = delivered.filter((p) => p.deliveredAt && p.deliveredAt <= p.dueDate);
    const stageCounts = new Map<StageKey, number>();
    for (const p of active)
      if (p.stage) stageCounts.set(p.stage.key, (stageCounts.get(p.stage.key) ?? 0) + 1);
    const weekStart = (d: Date) => {
      const k = istDayStart(istDayKey(d));
      const dow = (new Date(k.getTime() + 330 * 60_000).getUTCDay() + 6) % 7;
      return new Date(k.getTime() - dow * DAY_MS);
    };
    const weeks = new Map<string, { weekStart: string; shootDays: number; shoots: number }>();
    for (let w = -8; w < 4; w++) {
      const ws = weekStart(new Date(now.getTime() + w * 7 * DAY_MS));
      weeks.set(iso(ws), { weekStart: iso(ws), shootDays: 0, shoots: 0 });
    }
    for (const s of shoots) {
      const counted = new Set<string>();
      for (const k of shootDayKeys(s.startsAt, s.endsAt)) {
        const ws = iso(weekStart(istDayStart(k)));
        const row = weeks.get(ws);
        if (!row) continue;
        row.shootDays++;
        if (!counted.has(ws)) {
          row.shoots++;
          counted.add(ws);
        }
      }
    }
    const daysOf = (s: Pick<Shoot, 'startsAt' | 'endsAt'>) =>
      shootDayKeys(s.startsAt, s.endsAt).length;
    const rounds = deliverables.flatMap((d) => d.rounds);
    const feedback = rounds.flatMap((r) => r.feedback);
    const last = new Map(lastInteraction.map((l) => [l._id, l.at]));
    return {
      generatedAt: iso(now),
      dataNote:
        'Computed from the records in NOVA. The seeded workspace contains demonstration data, not real studio figures.',
      projects: {
        active: active.length,
        delivered: delivered.length,
        deliveredOnTime: onTime.length,
        onTimeRate: delivered.length ? onTime.length / delivered.length : null,
        delayed: active
          .filter((p) => new Date(p.dueDate) < now)
          .map((p) => ({
            id: p.id,
            code: p.code,
            title: p.title,
            daysLate: Math.ceil((now.getTime() - new Date(p.dueDate).getTime()) / DAY_MS),
            stage: p.stage?.label ?? null,
          })),
        byStage: STAGE_KEYS.map((key) => ({
          key,
          label: STAGE_LABELS[key],
          count: stageCounts.get(key) ?? 0,
        })),
        upcomingDeliveries: active
          .filter(
            (p) =>
              new Date(p.dueDate) >= now &&
              new Date(p.dueDate).getTime() <= now.getTime() + 30 * DAY_MS,
          )
          .map((p) => ({
            id: p.id,
            code: p.code,
            title: p.title,
            dueDate: p.dueDate,
            progress: p.progress,
          })),
        performance: all
          .filter((p) => p.status !== 'CANCELLED')
          .map((p) => ({
            id: p.id,
            code: p.code,
            title: p.title,
            client: p.client.name,
            progress: p.progress,
            health: p.health.score,
            dueDate: p.dueDate,
            status: p.status,
          })),
      },
      shoots: {
        weeks: [...weeks.values()],
        total: shoots.length,
        wrapped: shoots.filter((s) => s.status === 'WRAPPED').length,
        delayMinutes: logs.filter((l) => l.kind === 'DELAY').reduce((a, l) => a + l.minutesLost, 0),
        issues: logs.filter((l) => l.kind === 'ISSUE').length,
      },
      crew: team.map((t) => ({
        id: t.id,
        name: t.name,
        title: t.title,
        shootDays: shoots
          .filter((s) => s.crew.some((c) => c.teamMemberId === t.id))
          .reduce((a, s) => a + daysOf(s), 0),
        openTasks: t.openTasks,
        utilisation: t.weeks[0]?.ratio ?? 0,
      })),
      talent: talent
        .map((t) => {
          const mine = talentBookings.filter(
            (b) => b.talentId === t.id && b.shoot && b.shoot.status !== 'CANCELLED',
          );
          return {
            id: t.id,
            name: t.name,
            kind: t.kind,
            bookings: mine.length,
            shootDays: mine.reduce((a, b) => a + daysOf(b.shoot!), 0),
          };
        })
        .sort((a, b) => b.shootDays - a.shootDays),
      budget: canSeeProjectMoney(user.permissions) ? await this.budget.report() : null,
      revisions: {
        deliverables: deliverables.length,
        rounds: rounds.length,
        averageRounds: deliverables.length ? rounds.length / deliverables.length : 0,
        beyondScope: rounds.filter((r) => !r.includedInScope).length,
        clientFeedback: feedback.filter((f) => (f.source ?? 'CLIENT') === 'CLIENT').length,
        internalFeedback: feedback.filter((f) => f.source === 'INTERNAL').length,
      },
      clients: clients
        .map((c) => ({
          id: c.id,
          name: c.name,
          activeProjects: active.filter((p) => p.client.id === c.id).length,
          completedProjects: delivered.filter((p) => p.client.id === c.id).length,
          interactions90d: interactions.filter((i) => i.clientId === c.id).length,
          messages90d: messages.filter((x) => x.clientId === c.id).length,
          lastContact: last.get(c.id) ? iso(last.get(c.id)!) : null,
        }))
        .sort(
          (a, b) => b.activeProjects - a.activeProjects || b.interactions90d - a.interactions90d,
        ),
    };
  }
}
