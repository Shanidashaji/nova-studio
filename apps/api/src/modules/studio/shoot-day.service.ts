import { Injectable } from '@nestjs/common';
import type {
  Client,
  CrewCall,
  Project,
  Scene,
  Shoot,
  ShootLogEntry,
  TalentBooking,
  TeamMember,
  User,
} from '@nova/db';
import {
  canSeeProjectMoney,
  istDayKey,
  istDayStart,
  shootDayKeys,
  shootDayNumber,
  shootReadiness,
  type AddChecklistItem,
  type AddShootLog,
  type SessionUser,
  type ShootDaySummary,
  type ShootDayView,
  type ShootWorkspaceView,
  type ToggleChecklistItem,
  type UpdateShootProduction,
  DAY_MS,
  SHOOT_LOG_KIND_LABELS,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../activity/notifications.service';
import { iso, isoOrNull, memberRef } from '../projects/project.mapper';
import { ScheduleService } from '../schedule/schedule.service';
import { ShootReadiness } from '../schedule/shoot-readiness';
import {
  talentBookingPopulate,
  toSceneView,
  toShootLogView,
  toTalentBookingView,
  type SceneRow,
  type TalentBookingRow,
} from './studio.mapper';

/**
 * The shoot-day workspace: call sheet, scenes and their progress, artists, checklist and the
 * running log of issues, delays and schedule changes. Built for a phone on set.
 */
@Injectable()
export class ShootDayService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly schedule: ScheduleService,
    private readonly readiness: ShootReadiness,
  ) {}

  async workspace(shootId: string, viewer: SessionUser): Promise<ShootWorkspaceView> {
    const shootView = await this.schedule.getShoot(shootId);
    const { Shoot: Shoots, TalentBooking, Scene: Scenes, ShootLogEntry } = this.database.models;
    const [shoot, talent, scenes, log, readinessInput] = await Promise.all([
      Shoots.findById(shootId)
        .populate([
          { path: 'project', populate: { path: 'client' } },
          { path: 'productionManager' },
        ])
        .lean<
          Shoot & {
            project: (Project & { client: Client | null }) | null;
            productionManager: TeamMember | null;
          }
        >(),
      TalentBooking.find({ shootId })
        .sort({ createdAt: 1 })
        .populate(talentBookingPopulate)
        .lean<TalentBookingRow[]>(),
      Scenes.find({ shootId })
        .sort({ shootDate: 1, plannedStart: 1, sortOrder: 1 })
        .populate({ path: 'shoot', select: { title: 1, startsAt: 1 } })
        .lean<SceneRow[]>(),
      ShootLogEntry.find({ shootId })
        .sort({ createdAt: -1 })
        .populate({ path: 'author', select: { name: 1 } })
        .lean<(ShootLogEntry & { author: Pick<User, 'name'> | null })[]>(),
      this.readiness.input(shootId),
    ]);
    if (!shoot || !shoot.project || !readinessInput) throw notFound('Shoot');
    const showFee = canSeeProjectMoney(viewer.permissions);
    const keys = shootDayKeys(shoot.startsAt, shoot.endsAt);
    const live = scenes.filter((s) => s.status !== 'DROPPED');
    const client = shoot.project.client;
    return {
      shoot: shootView,
      client: {
        id: client?.id ?? '',
        name: client?.name ?? '',
        contactName: client?.contactName ?? null,
        contactPhone: client?.contactPhone ?? null,
      },
      productionManager: shoot.productionManager ? memberRef(shoot.productionManager) : null,
      crewCallTime: shoot.crewCallTime ?? null,
      callSheetNotes: shoot.callSheetNotes ?? null,
      callSheetPublishedAt: isoOrNull(shoot.callSheetPublishedAt ?? null),
      footageStatus: shoot.footageStatus ?? 'PENDING',
      wrapNotes: shoot.wrapNotes ?? null,
      startedAt: isoOrNull(shoot.startedAt ?? null),
      wrappedAt: isoOrNull(shoot.wrappedAt ?? null),
      days: keys.map((key, i) => ({ key, day: i + 1, of: keys.length })),
      talent: talent
        .map((t) => toTalentBookingView(t, showFee))
        .filter((t): t is NonNullable<typeof t> => t !== null),
      scenes: scenes.map(toSceneView),
      checklist: (shoot.checklist ?? []).map((c) => ({
        id: c._id,
        label: c.label,
        done: c.done,
        doneAt: isoOrNull(c.doneAt),
        doneBy: c.doneBy,
      })),
      log: log.map(toShootLogView),
      readiness: shootReadiness(readinessInput),
      progress: {
        total: live.length,
        shot: live.filter((s) => s.status === 'SHOT').length,
        dropped: scenes.length - live.length,
        minutesPlanned: live.reduce((a, s) => a + s.estimatedMinutes, 0),
        minutesShot: live
          .filter((s) => s.status === 'SHOT')
          .reduce((a, s) => a + s.estimatedMinutes, 0),
      },
      delayMinutes: log.filter((l) => l.kind === 'DELAY').reduce((a, l) => a + l.minutesLost, 0),
      openIssues: log.filter((l) => l.kind === 'ISSUE' && !l.resolvedAt).length,
    };
  }

  /** Shoots on an IST calendar day (default today), with their shoot-day number and progress. */
  async day(dateKey: string | undefined): Promise<ShootDayView> {
    const key = dateKey ?? istDayKey(new Date());
    const start = istDayStart(key);
    const end = new Date(start.getTime() + DAY_MS);
    const shoots = await this.database.models.Shoot.find({
      startsAt: { $lt: end },
      endsAt: { $gt: start },
      status: { $ne: 'CANCELLED' },
    })
      .sort({ startsAt: 1 })
      .lean<Shoot[]>();
    const summaries = await this.summaries(shoots, key);
    const next = summaries.length
      ? null
      : await this.database.models.Shoot.findOne({
          startsAt: { $gte: end },
          status: { $ne: 'CANCELLED' },
        })
          .sort({ startsAt: 1 })
          .lean<Shoot>();
    return {
      date: key,
      shoots: summaries,
      next: next ? { id: next.id, title: next.title, startsAt: iso(next.startsAt) } : null,
    };
  }

  /** Compact shoot-day cards for a set of shoots (used by the command centre too). */
  async summaries(shoots: Shoot[], dayKey?: string): Promise<ShootDaySummary[]> {
    if (shoots.length === 0) return [];
    const ids = shoots.map((s) => s.id);
    const {
      CrewCall: Calls,
      TalentBooking,
      Scene: Scenes,
      ShootLogEntry,
      Project: Projects,
    } = this.database.models;
    const [calls, talent, scenes, log, projects] = await Promise.all([
      Calls.find({ shootId: { $in: ids } }, { shootId: 1 }).lean<Pick<CrewCall, 'shootId'>[]>(),
      TalentBooking.find(
        { shootId: { $in: ids }, status: { $ne: 'RELEASED' } },
        { shootId: 1 },
      ).lean<Pick<TalentBooking, 'shootId'>[]>(),
      Scenes.find({ shootId: { $in: ids }, status: { $ne: 'DROPPED' } }).lean<Scene[]>(),
      ShootLogEntry.find({ shootId: { $in: ids } }).lean<ShootLogEntry[]>(),
      Projects.find({ _id: { $in: shoots.map((s) => s.projectId) } }, { code: 1, title: 1 }).lean<
        Pick<Project, '_id' | 'id' | 'code' | 'title'>[]
      >(),
    ]);
    const readiness = new Map(
      await Promise.all(ids.map(async (id) => [id, await this.readiness.evaluate(id)] as const)),
    );
    const project = new Map(projects.map((p) => [p.id, p]));
    return shoots.map((s) => {
      const key =
        dayKey ??
        istDayKey(s.startsAt < new Date() && s.endsAt > new Date() ? new Date() : s.startsAt);
      const mine = scenes.filter((x) => x.shootId === s.id);
      const today = mine.filter(
        (x) => !x.shootDate || x.shootDate.toISOString().slice(0, 10) === key,
      );
      const entries = log.filter((l) => l.shootId === s.id);
      const p = project.get(s.projectId);
      const r = readiness.get(s.id)!;
      return {
        id: s.id,
        title: s.title,
        status: s.status,
        project: { id: s.projectId, code: p?.code ?? '', title: p?.title ?? '' },
        location: s.location,
        city: s.city,
        startsAt: iso(s.startsAt),
        endsAt: iso(s.endsAt),
        callTime: s.callTime,
        crewCallTime: s.crewCallTime ?? null,
        day: shootDayNumber(s, key) ?? { day: 1, of: shootDayKeys(s.startsAt, s.endsAt).length },
        crew: calls.filter((c) => c.shootId === s.id).length,
        talent: talent.filter((t) => t.shootId === s.id).length,
        scenesToday: today.length,
        scenesShot: today.filter((x) => x.status === 'SHOT').length,
        openIssues: entries.filter((l) => l.kind === 'ISSUE' && !l.resolvedAt).length,
        delayMinutes: entries
          .filter((l) => l.kind === 'DELAY')
          .reduce((a, l) => a + l.minutesLost, 0),
        readinessScore: r.score,
        canStart: r.canStart,
      };
    });
  }

  private async load(shootId: string) {
    const shoot = await this.database.models.Shoot.findById(shootId).lean<Shoot>();
    if (!shoot) throw notFound('Shoot');
    return shoot;
  }

  async updateProduction(shootId: string, input: UpdateShootProduction, user: SessionUser) {
    const shoot = await this.load(shootId);
    if (input.productionManagerId) {
      const m = await this.database.models.TeamMember.findById(
        input.productionManagerId,
      ).lean<TeamMember>();
      if (!m || !m.isActive) throw unprocessable('INVALID_MEMBER', 'Choose an active team member.');
    }
    await this.activity.transaction(async (log) => {
      await this.database.models.Shoot.updateOne({ _id: shootId }, { $set: input });
      await log({
        actorId: user.id,
        action: input.footageStatus ? 'shoot.footage' : 'shoot.production',
        entityType: 'shoot',
        entityId: shootId,
        projectId: shoot.projectId,
        summary: input.footageStatus
          ? `${user.name} set footage of “${shoot.title}” to ${input.footageStatus.toLowerCase().replace('_', ' ')}`
          : `${user.name} updated the call sheet of “${shoot.title}”`,
      });
    });
    return this.workspace(shootId, user);
  }

  /** Publishes the call sheet to everyone called (in-app notification to crew with a login). */
  async publishCallSheet(shootId: string, user: SessionUser) {
    const shoot = await this.load(shootId);
    if (shoot.status === 'CANCELLED' || shoot.status === 'WRAPPED') {
      throw unprocessable('SHOOT_CLOSED', `“${shoot.title}” is ${shoot.status.toLowerCase()}.`);
    }
    const check = await this.readiness.input(shootId);
    if (!check || check.crewCount === 0 || !shoot.location.trim()) {
      throw unprocessable(
        'CALL_SHEET_INCOMPLETE',
        'Call crew and set the location before publishing the call sheet.',
      );
    }
    const crew = await this.database.models.CrewCall.find({ shootId })
      .populate({ path: 'teamMember', select: { userId: 1 } })
      .lean<(CrewCall & { teamMember: Pick<TeamMember, 'userId'> | null })[]>();
    const republish = !!shoot.callSheetPublishedAt;
    await this.activity.transaction(async (log) => {
      await this.database.models.Shoot.updateOne(
        { _id: shootId },
        { $set: { callSheetPublishedAt: new Date() } },
      );
      await this.notifications.notifyUsers(
        crew.map((c) => c.teamMember?.userId).filter((id): id is string => !!id && id !== user.id),
        {
          kind: 'booking.callsheet',
          title: `${republish ? 'Updated call sheet' : 'Call sheet'}: ${shoot.title}`,
          body: `Call ${shoot.crewCallTime ?? shoot.callTime ?? ''} · ${shoot.location}`,
          entityType: 'shoot',
          entityId: shootId,
        },
      );
      await log({
        actorId: user.id,
        action: 'shoot.callsheet',
        entityType: 'shoot',
        entityId: shootId,
        projectId: shoot.projectId,
        summary: `${user.name} ${republish ? 're-published' : 'published'} the call sheet for “${shoot.title}” to ${crew.length} crew`,
      });
    });
    return this.workspace(shootId, user);
  }

  async addChecklistItem(shootId: string, input: AddChecklistItem, user: SessionUser) {
    const shoot = await this.load(shootId);
    if ((shoot.checklist ?? []).length >= 40)
      throw unprocessable('CHECKLIST_FULL', 'Up to 40 items.');
    await this.database.models.Shoot.updateOne(
      { _id: shootId },
      { $push: { checklist: { label: input.label, done: false } } },
    );
    return this.workspace(shootId, user);
  }

  async toggleChecklistItem(
    shootId: string,
    itemId: string,
    input: ToggleChecklistItem,
    user: SessionUser,
  ) {
    const shoot = await this.load(shootId);
    const item = (shoot.checklist ?? []).find((c) => c._id === itemId);
    if (!item) throw notFound('Checklist item');
    await this.activity.transaction(async (log) => {
      await this.database.models.Shoot.updateOne(
        { _id: shootId, 'checklist._id': itemId },
        {
          $set: {
            'checklist.$.done': input.done,
            'checklist.$.doneAt': input.done ? new Date() : null,
            'checklist.$.doneBy': input.done ? user.name : null,
          },
        },
      );
      await log({
        actorId: user.id,
        action: 'shoot.checklist',
        entityType: 'shoot',
        entityId: shootId,
        projectId: shoot.projectId,
        summary: `${user.name} ${input.done ? 'ticked' : 'unticked'} “${item.label}” on “${shoot.title}”`,
      });
    });
    return this.workspace(shootId, user);
  }

  async removeChecklistItem(shootId: string, itemId: string, user: SessionUser) {
    await this.load(shootId);
    await this.database.models.Shoot.updateOne(
      { _id: shootId },
      { $pull: { checklist: { _id: itemId } } },
    );
    return this.workspace(shootId, user);
  }

  async addLog(shootId: string, input: AddShootLog, user: SessionUser) {
    const shoot = await this.load(shootId);
    if (shoot.status === 'CANCELLED')
      throw conflict('SHOOT_CANCELLED', 'This shoot was cancelled.');
    await this.activity.transaction(async (log) => {
      await this.database.models.ShootLogEntry.create({ shootId, ...input, authorId: user.id });
      await log({
        actorId: user.id,
        action: `shoot.log.${input.kind.toLowerCase()}`,
        entityType: 'shoot',
        entityId: shootId,
        projectId: shoot.projectId,
        summary: `${user.name} logged ${SHOOT_LOG_KIND_LABELS[input.kind].toLowerCase()} on “${shoot.title}”: ${input.body.slice(0, 120)}${input.minutesLost ? ` (${input.minutesLost} min)` : ''}`,
      });
      if (input.kind === 'ISSUE' || (input.kind === 'DELAY' && input.minutesLost >= 30)) {
        await this.notifications.notifyPermission(
          'schedule:write',
          {
            kind: 'booking.issue',
            title: `${SHOOT_LOG_KIND_LABELS[input.kind]} on set: ${shoot.title}`,
            body: input.body.slice(0, 140),
            entityType: 'shoot',
            entityId: shootId,
          },
          user.id,
        );
      }
    });
    return this.workspace(shootId, user);
  }

  async resolveLog(id: string, resolved: boolean, user: SessionUser) {
    const entry = await this.database.models.ShootLogEntry.findById(id).lean<ShootLogEntry>();
    if (!entry) throw notFound('Log entry');
    await this.database.models.ShootLogEntry.updateOne(
      { _id: id },
      { $set: { resolvedAt: resolved ? new Date() : null } },
    );
    if (resolved) {
      const shoot = await this.load(entry.shootId);
      await this.activity.log({
        actorId: user.id,
        action: 'shoot.log.resolved',
        entityType: 'shoot',
        entityId: entry.shootId,
        projectId: shoot.projectId,
        summary: `${user.name} resolved “${entry.body.slice(0, 80)}” on “${shoot.title}”`,
      });
    }
    return this.workspace(entry.shootId, user);
  }
}
