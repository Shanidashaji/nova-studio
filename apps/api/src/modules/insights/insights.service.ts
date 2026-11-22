import { Injectable } from '@nestjs/common';
import {
  canSeeProjectMoney,
  attentionScore,
  computeFlow,
  daysBetween,
  daysOverdue,
  DAY_MS,
  evaluateForwardTransition,
  STAGE_KEYS,
  STAGE_LABELS,
  urgencyFromAge,
  urgencyFromDaysLeft,
  type AttentionItem,
  type PulseView,
  type StageKey,
  type UpcomingItem,
} from '@nova/shared';
import type {
  Approval,
  Deliverable,
  Lead,
  Project,
  ProjectStage,
  RevisionRound,
  Shoot,
  StageDefinition,
  Task,
  TeamMember,
  WorkflowTemplate,
} from '@nova/db';
import { DatabaseService } from '../../database/database.service';
import {
  stageSnapshots,
  summaryPopulate,
  taskSnapshots,
  toSummary,
  type SummaryRow,
  type Viewer,
} from '../projects/project.mapper';
import { ScheduleConflicts } from '../schedule/schedule-conflicts';
import { TeamService } from '../team/team.service';

/** Probability that a lead in each stage converts — used for the weighted pipeline value (demo heuristic). */
const LEAD_WEIGHT = {
  INQUIRY: 0.1,
  DISCOVERY: 0.25,
  PROPOSAL: 0.5,
  NEGOTIATION: 0.75,
  WON: 1,
  LOST: 0,
} as const;

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

/**
 * The operational picture behind the Pulse lens: pipeline flow metrics, a ranked and explained
 * attention queue, upcoming events and headline totals.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly conflicts: ScheduleConflicts,
    private readonly team: TeamService,
  ) {}

  /** `viewer` decides whether budget signals are included (`canSeeProjectMoney`). */
  async pulse(viewer: Viewer): Promise<PulseView> {
    const now = new Date();
    const showMoney = canSeeProjectMoney(viewer.permissions);
    const horizon = new Date(now.getTime() + 14 * DAY_MS);
    const {
      Project: Projects,
      ProjectStage: ProjectStages,
      Approval: Approvals,
      Deliverable: Deliverables,
      Task: Tasks,
      Shoot: Shoots,
      Lead: Leads,
      WorkflowTemplate: WorkflowTemplates,
    } = this.database.models;

    // Relation filters ("project is ACTIVE") resolve to id lists first.
    const activeProjectIds = await Projects.distinct('_id', { status: 'ACTIVE' });
    const [activeDeliverableIds, activeStageIds, openStageIds] = await Promise.all([
      Deliverables.distinct('_id', { projectId: { $in: activeProjectIds } }),
      ProjectStages.distinct('_id', { projectId: { $in: activeProjectIds } }),
      ProjectStages.distinct('_id', {
        projectId: { $in: activeProjectIds },
        status: { $in: ['ACTIVE', 'BLOCKED'] },
      }),
    ]);

    const [
      projects,
      allStages,
      pendingApprovals,
      changesRequested,
      blockedTasks,
      overdueTasks,
      shoots,
      conflicts,
      members,
      leads,
      delivered,
    ] = await Promise.all([
      Projects.find({ status: { $in: ['ACTIVE', 'ON_HOLD'] } })
        .populate(summaryPopulate)
        .lean<SummaryRow[]>(),
      ProjectStages.find({ startedAt: { $ne: null } })
        .select({ startedAt: 1, completedAt: 1, status: 1, stageDefinitionId: 1 })
        .populate({ path: 'stageDefinition', select: { key: 1 } })
        .lean<
          (Pick<ProjectStage, 'startedAt' | 'completedAt' | 'status'> & {
            stageDefinition: Pick<StageDefinition, 'key'> | null;
          })[]
        >(),
      Approvals.find({
        // Active productions only, like every other queue on Pulse.
        status: 'PENDING',
        kind: 'CLIENT',
        $or: [
          { deliverableId: { $in: activeDeliverableIds } },
          { projectStageId: { $in: activeStageIds } },
        ],
      })
        .populate([
          { path: 'deliverable', populate: { path: 'project' } },
          { path: 'projectStage', populate: { path: 'project' } },
        ])
        .lean<
          (Approval & {
            deliverable: (Deliverable & { project: Project | null }) | null;
            projectStage: (ProjectStage & { project: Project | null }) | null;
          })[]
        >(),
      Deliverables.find({ status: 'CHANGES_REQUESTED', projectId: { $in: activeProjectIds } })
        .populate([{ path: 'project' }, { path: 'rounds' }])
        .lean<(Deliverable & { project: Project; rounds: RevisionRound[] })[]>(),
      Tasks.find({ status: 'BLOCKED', projectId: { $in: activeProjectIds } })
        .populate([{ path: 'project' }, { path: 'assignee' }])
        .lean<(Task & { project: Project; assignee: TeamMember | null })[]>(),
      Tasks.find({
        status: { $nin: ['DONE', 'BLOCKED'] },
        isStageBlocking: true,
        dueDate: { $lt: now },
        projectId: { $in: activeProjectIds },
        projectStageId: { $in: openStageIds },
      })
        .populate('project')
        .lean<(Task & { project: Project })[]>(),
      Shoots.find({
        status: { $ne: 'CANCELLED' },
        endsAt: { $gte: now },
        startsAt: { $lte: horizon },
      })
        .sort({ startsAt: 1 })
        .populate('project')
        .lean<(Shoot & { project: Project })[]>(),
      this.conflicts.all(now),
      this.team.list(),
      Leads.find({ stage: { $nin: ['WON', 'LOST'] } }).lean<Lead[]>(),
      Projects.find({ status: 'DELIVERED' })
        .select({ dueDate: 1, deliveredAt: 1 })
        .lean<Pick<Project, 'dueDate' | 'deliveredAt'>[]>(),
    ]);

    const summaries = projects.map((p) => toSummary(p, now));
    const ref = (p: { id: string; code: string; title: string }) => ({
      id: p.id,
      code: p.code,
      title: p.title,
    });

    // ── Spine: flow metrics per stage ───────────────────────────────────────
    const wip: Partial<Record<StageKey, number>> = {};
    for (const s of summaries)
      if (s.stage && s.status === 'ACTIVE') wip[s.stage.key] = (wip[s.stage.key] ?? 0) + 1;
    const flow = computeFlow({
      stages: STAGE_KEYS,
      now,
      wip,
      visits: allStages.flatMap((s) =>
        s.stageDefinition
          ? [{ stageKey: s.stageDefinition.key, enteredAt: s.startedAt!, exitedAt: s.completedAt }]
          : [],
      ),
    });
    const defaultTemplate = await WorkflowTemplates.findOne({ isDefault: true })
      .populate('stages')
      .lean<WorkflowTemplate & { stages: StageDefinition[] }>();
    const spine = flow.stages.map((f) => {
      const inStage = summaries.filter((s) => s.status === 'ACTIVE' && s.stage?.key === f.key);
      return {
        key: f.key,
        label: STAGE_LABELS[f.key],
        wip: f.wip,
        blocked: inStage.filter((s) => s.blockedTasks > 0 || s.stage?.status === 'BLOCKED').length,
        atRisk: inStage.filter((s) => s.health.band !== 'ON_TRACK').length,
        avgDwellDays: f.avgDwellDays,
        throughputPerWeek: f.throughputPerWeek,
        expectedDays: defaultTemplate?.stages.find((s) => s.key === f.key)?.expectedDays ?? 0,
        isConstraint: flow.constraint === f.key,
        projects: inStage.map((s) => ({
          id: s.id,
          code: s.code,
          title: s.title,
          band: s.health.band,
        })),
      };
    });

    // ── Attention queue ─────────────────────────────────────────────────────
    const items: AttentionItem[] = [];
    const push = (
      i: Omit<AttentionItem, 'score'> & {
        urgency: number;
        priority: Parameters<typeof attentionScore>[0]['priority'];
      },
    ) => {
      const { urgency, priority, ...rest } = i;
      items.push({ ...rest, score: attentionScore({ severity: i.severity, urgency, priority }) });
    };

    for (const s of summaries.filter((p) => p.status === 'ACTIVE')) {
      const daysLeft = daysBetween(now, s.dueDate);
      const late = daysOverdue(s.dueDate, now);
      if (late > 0) {
        push({
          id: `overdue:${s.id}`,
          kind: 'OVERDUE_PROJECT',
          severity: 'critical',
          title: `${s.title} is ${late} day${late > 1 ? 's' : ''} overdue`,
          reason: `Due ${fmtDate(new Date(s.dueDate))}; currently in ${s.stage?.label ?? 'no stage'} at ${Math.round(s.progress * 100)}% progress.`,
          entity: { type: 'project', id: s.id },
          project: ref(s),
          action: { label: 'Open project', kind: 'open' },
          urgency: 1,
          priority: s.priority,
        });
      }
      // The item quotes how much of the budget is spent, so it is for callers who may see that.
      const burn = showMoney && s.health.deductions.find((d) => d.code === 'BUDGET_BURN');
      if (burn) {
        push({
          id: `burn:${s.id}`,
          kind: 'BUDGET_BURN',
          severity: 'warning',
          title: `Budget burning ahead of progress on ${s.title}`,
          reason: `${burn.label}. NOVA estimate based on demo finance records.`,
          entity: { type: 'project', id: s.id },
          project: ref(s),
          action: { label: 'Review budget', kind: 'open' },
          urgency: urgencyFromDaysLeft(daysLeft),
          priority: s.priority,
        });
      }
      // Ready to advance: everything blocking is done.
      const p = projects.find((x) => x.id === s.id)!;
      const evaluation = evaluateForwardTransition({
        projectStatus: p.status,
        stages: stageSnapshots(p.stages),
        tasks: taskSnapshots(p.tasks),
      });
      if (evaluation.ok && evaluation.to) {
        push({
          id: `ready:${s.id}`,
          kind: 'STAGE_READY',
          severity: 'info',
          title: `${s.title} is ready to move to ${evaluation.to.label}`,
          reason: `All blocking work in ${evaluation.from.label} is complete${evaluation.from.requiresApproval ? ' and approved' : ''}.`,
          entity: { type: 'project', id: s.id },
          project: ref(s),
          action: { label: `Advance to ${evaluation.to.label}`, kind: 'advance' },
          urgency: 0.6,
          priority: s.priority,
        });
      }
    }

    for (const a of pendingApprovals) {
      const project = a.deliverable?.project ?? a.projectStage?.project;
      if (!project || project.status !== 'ACTIVE') continue;
      const age = daysBetween(a.requestedAt, now);
      if (age < 2) continue;
      const daysLeft = daysBetween(now, project.dueDate);
      push({
        id: `approval:${a.id}`,
        kind: 'APPROVAL_WAITING',
        severity: age > 5 || daysLeft <= 3 ? 'critical' : 'warning',
        title: `Client approval waiting ${age} days — ${project.title}`,
        reason: `“${a.title}” was sent ${fmtDate(a.requestedAt)}; the project is due ${fmtDate(project.dueDate)} (${daysLeft} days).`,
        entity: a.deliverableId
          ? { type: 'deliverable', id: a.deliverableId }
          : { type: 'project', id: project.id },
        project: ref(project),
        action: { label: 'Record decision', kind: 'decide' },
        urgency: Math.max(urgencyFromAge(age), urgencyFromDaysLeft(daysLeft)),
        priority: project.priority,
      });
    }

    // One item per project, listing every deliverable sent back.
    const changesByProject = new Map<string, typeof changesRequested>();
    for (const d of changesRequested)
      changesByProject.set(d.projectId, [...(changesByProject.get(d.projectId) ?? []), d]);
    for (const [projectId, list] of changesByProject) {
      const project = list[0]!.project;
      const extra = list.flatMap((d) => d.rounds).filter((r) => !r.includedInScope).length;
      const round = Math.max(...list.map((d) => d.currentVersion));
      push({
        id: `changes:${projectId}`,
        kind: 'CHANGES_REQUESTED',
        severity: extra > 0 ? 'critical' : 'warning',
        title: `Changes requested on ${list.length > 1 ? `${list.length} deliverables` : list[0]!.name} — ${project.title}`,
        reason: `Round ${round} with ${project.includedRevisions} included${extra > 0 ? `; ${extra} round${extra > 1 ? 's' : ''} beyond scope — consider a change order` : ''}.`,
        entity:
          list.length === 1
            ? { type: 'deliverable', id: list[0]!.id }
            : { type: 'project', id: projectId },
        project: ref(project),
        action: { label: 'Open feedback', kind: 'open' },
        urgency: urgencyFromDaysLeft(daysBetween(now, project.dueDate)),
        priority: project.priority,
      });
    }

    for (const t of blockedTasks) {
      push({
        id: `blocked:${t.id}`,
        kind: 'BLOCKED_TASK',
        severity: t.isStageBlocking ? 'critical' : 'warning',
        title: `${t.title} is blocked — ${t.project.title}`,
        reason:
          t.blockedReason ??
          `${t.assignee?.name ?? 'Unassigned'} cannot proceed.${t.isStageBlocking ? ' The stage cannot advance until it is resolved.' : ''}`,
        entity: { type: 'task', id: t.id },
        project: ref(t.project),
        action: { label: 'Open task', kind: 'open' },
        urgency: urgencyFromDaysLeft(t.dueDate ? daysBetween(now, t.dueDate) : 7),
        priority: t.project.priority,
      });
    }

    const overdueByProject = new Map<string, typeof overdueTasks>();
    for (const t of overdueTasks)
      overdueByProject.set(t.projectId, [...(overdueByProject.get(t.projectId) ?? []), t]);
    for (const [projectId, list] of overdueByProject) {
      const project = list[0]!.project;
      const oldest = Math.max(...list.map((t) => daysOverdue(t.dueDate!, now)));
      push({
        id: `late:${projectId}`,
        kind: 'OVERDUE_TASK',
        severity: 'warning',
        title: `${list.length} blocking task${list.length > 1 ? 's' : ''} past due — ${project.title}`,
        reason: `${list
          .map((t) => `“${t.title}”`)
          .slice(0, 3)
          .join(
            ', ',
          )}${list.length > 3 ? '…' : ''}; oldest ${oldest} day${oldest !== 1 ? 's' : ''} late.`,
        entity:
          list.length === 1
            ? { type: 'task', id: list[0]!.id }
            : { type: 'project', id: projectId },
        project: ref(project),
        action: { label: list.length === 1 ? 'Open task' : 'Open project', kind: 'open' },
        urgency: urgencyFromAge(oldest),
        priority: project.priority,
      });
    }

    for (const c of conflicts) {
      push({
        id: `conflict:${c.bookingIds.join(':')}`,
        kind: 'BOOKING_CONFLICT',
        severity: 'critical',
        title: `${c.resourceName} is double-booked`,
        reason: `Two ${c.resourceType === 'asset' ? 'bookings' : 'crew calls'} overlap on ${fmtDate(new Date(c.at))}.`,
        entity:
          c.resourceType === 'asset'
            ? { type: 'asset', id: c.resourceId }
            : { type: 'member', id: c.resourceId },
        project: null,
        action: { label: 'Resolve in schedule', kind: 'resolve-conflict' },
        urgency: urgencyFromDaysLeft(daysBetween(now, c.at)),
        priority: 'HIGH',
      });
    }

    // Over-capacity crew in the next two windows, grouped into one decision.
    const overloaded = members
      .map((m) => ({ m, week: m.weeks.slice(0, 2).find((w) => w.ratio > 1) }))
      .filter((x): x is { m: (typeof members)[number]; week: NonNullable<typeof x.week> } =>
        Boolean(x.week),
      )
      .sort((a, b) => b.week.ratio - a.week.ratio);
    if (overloaded.length > 0) {
      const top = overloaded[0]!;
      const thisWeek = overloaded.some((o) => o.week === o.m.weeks[0]);
      push({
        id: `overload:${overloaded.map((o) => o.m.id).join(':')}`,
        kind: 'CREW_OVERLOAD',
        severity: 'warning',
        title:
          overloaded.length === 1
            ? `${top.m.name} is over capacity`
            : `${overloaded.length} people are over capacity`,
        reason:
          overloaded
            .map(
              (o) =>
                `${o.m.name} ${Math.round(o.week.ratio * 100)}% (${o.week.hours}h of ${o.week.capacity}h)`,
            )
            .join(', ') + (thisWeek ? ' in the next 7 days.' : ' in the following week.'),
        entity: { type: 'member', id: top.m.id },
        project: null,
        action: { label: 'Rebalance in People', kind: 'open' },
        urgency: thisWeek ? 0.9 : 0.6,
        priority: overloaded.length > 2 ? 'HIGH' : 'MEDIUM',
      });
    }

    // ── Upcoming ────────────────────────────────────────────────────────────
    const upcoming: UpcomingItem[] = [
      ...shoots.map((s) => ({
        id: `shoot:${s.id}`,
        kind: 'shoot' as const,
        title: s.title,
        at: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        project: ref(s.project),
        location: s.location,
      })),
      ...summaries
        .filter(
          (s) =>
            s.status === 'ACTIVE' && new Date(s.dueDate) >= now && new Date(s.dueDate) <= horizon,
        )
        .map((s) => ({
          id: `due:${s.id}`,
          kind: 'deadline' as const,
          title: `${s.title} due`,
          at: s.dueDate,
          project: ref(s),
        })),
    ].sort((a, b) => a.at.localeCompare(b.at));

    const weekEnd = new Date(now.getTime() + 7 * DAY_MS);
    // Only deliveries with a recorded date can be judged on time or late.
    const dated = delivered.filter((d) => d.deliveredAt);
    const onTime = dated.filter((d) => d.deliveredAt! <= d.dueDate).length;
    const activeSummaries = summaries.filter((s) => s.status === 'ACTIVE');

    return {
      generatedAt: now.toISOString(),
      spine,
      attention: items.sort((a, b) => b.score - a.score).slice(0, 14),
      upcoming,
      totals: {
        activeProjects: activeSummaries.length,
        atRisk: activeSummaries.filter((s) => s.health.band === 'AT_RISK').length,
        critical: activeSummaries.filter((s) => s.health.band === 'CRITICAL').length,
        pendingApprovals: pendingApprovals.length,
        blockedTasks: blockedTasks.length,
        shootsThisWeek: shoots.filter((s) => s.startsAt <= weekEnd).length,
        onTimeRate: dated.length ? Math.round((onTime / dated.length) * 100) / 100 : 1,
      },
      pipelineValue: {
        open: leads.reduce((n, l) => n + l.estimatedValue, 0),
        weighted: Math.round(
          leads.reduce((n, l) => n + l.estimatedValue * LEAD_WEIGHT[l.stage], 0),
        ),
      },
    };
  }
}
