import { Injectable, Logger } from '@nestjs/common';
import {
  isDuplicateKeyError,
  type Approval,
  type Notification,
  type Project,
  type Shoot,
  type Task,
  type TeamMember,
} from '@nova/db';
import {
  DAY_MS,
  istDayKey,
  type NotificationListQuery,
  type NotificationView,
  type SessionUser,
} from '@nova/shared';
import { notFound } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { iso, isoOrNull } from '../projects/project.mapper';
import { ScheduleConflicts } from '../schedule/schedule-conflicts';

interface Alert {
  kind: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  dedupeKey: string;
}

/**
 * Smart alerts: a periodic sweep that turns conditions in the data (a shoot tomorrow, a double
 * booking, an overdue task or review, a deadline at risk, a failed client message) into in-app
 * notifications for the people who can act. Each alert has a dedupe key, so it is raised once.
 * Runs at most every ten minutes per process, when the inbox or the command centre is opened.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger('Alerts');
  private last = 0;

  constructor(
    private readonly database: DatabaseService,
    private readonly conflicts: ScheduleConflicts,
  ) {}

  private async holders(permission: string): Promise<string[]> {
    const { Permission, RolePermission, User } = this.database.models;
    const perm = await Permission.findOne({ key: permission }, { _id: 1 }).lean();
    if (!perm) return [];
    const roles = await RolePermission.distinct('roleId', { permissionId: perm._id });
    return (await User.find({ isActive: true, roleId: { $in: roles } }, { _id: 1 }).lean()).map(
      (u) => u._id,
    );
  }

  private async raise(userIds: string[], alerts: Alert[]) {
    if (!userIds.length || !alerts.length) return 0;
    const muted = await this.database.models.NotificationPreference.find({
      userId: { $in: userIds },
      inApp: false,
    }).lean();
    const off = new Set(muted.map((m) => `${m.userId}:${m.kind}`));
    const docs = userIds.flatMap((userId) =>
      alerts
        .filter((a) => !off.has(`${userId}:${a.kind.split('.')[0]}`))
        .map((a) => ({ userId, ...a, body: a.body })),
    );
    if (!docs.length) return 0;
    // Most keys already exist after the first sweep: skip them, insert the rest one by one.
    const existing = new Set(
      (
        await this.database.models.Notification.find(
          { userId: { $in: userIds }, dedupeKey: { $in: alerts.map((a) => a.dedupeKey) } },
          { userId: 1, dedupeKey: 1 },
        ).lean()
      ).map((n) => `${n.userId}:${n.dedupeKey}`),
    );
    let inserted = 0;
    for (const doc of docs.filter((d) => !existing.has(`${d.userId}:${d.dedupeKey}`))) {
      try {
        await this.database.models.Notification.create(doc);
        inserted++;
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
      }
    }
    return inserted;
  }

  async sweep(force = false): Promise<number> {
    if (!force && Date.now() - this.last < 10 * 60_000) return 0;
    this.last = Date.now();
    try {
      return await this.run();
    } catch (error) {
      this.logger.warn(
        `Alert sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  private async run(): Promise<number> {
    const m = this.database.models;
    const now = new Date();
    const day = istDayKey(now);
    let raised = 0;
    const [schedulers, managers, comms] = await Promise.all([
      this.holders('schedule:write'),
      this.holders('project:write'),
      this.holders('client:write'),
    ]);

    // Shoots in the next 24 hours.
    const soon = await m.Shoot.find({
      startsAt: { $gte: now, $lt: new Date(now.getTime() + DAY_MS) },
      status: { $ne: 'CANCELLED' },
    }).lean<Shoot[]>();
    raised += await this.raise(
      schedulers,
      soon.map((s) => ({
        kind: 'booking.upcoming',
        title: `Shoot within 24 hours: ${s.title}`,
        body: `${s.status === 'PLANNED' ? 'Still not confirmed. ' : ''}Call ${s.callTime ?? s.crewCallTime ?? '—'} at ${s.location}.`,
        entityType: 'shoot',
        entityId: s.id,
        dedupeKey: `shoot24:${s.id}:${s.startsAt.toISOString()}`,
      })),
    );

    // Double bookings.
    const conflicts = await this.conflicts.all(now, new Date(now.getTime() + 21 * DAY_MS));
    raised += await this.raise(
      schedulers,
      conflicts.map((c) => ({
        kind: 'booking.conflict',
        title: `Double booking: ${c.resourceName}`,
        body: `Two bookings overlap on ${istDayKey(c.at)}. Release or move one of them.`,
        entityType:
          c.resourceType === 'asset' ? 'asset' : c.resourceType === 'talent' ? 'talent' : 'member',
        entityId: c.resourceId,
        dedupeKey: `conflict:${[...c.bookingIds].sort().join(':')}`,
      })),
    );

    // Overdue tasks → the assignee (when they have a login).
    const overdue = await m.Task.find({
      status: { $ne: 'DONE' },
      dueDate: { $lt: now, $gte: new Date(now.getTime() - 30 * DAY_MS) },
    })
      .populate({ path: 'assignee', select: { userId: 1 } })
      .lean<(Task & { assignee: Pick<TeamMember, 'userId'> | null })[]>();
    for (const t of overdue) {
      if (!t.assignee?.userId) continue;
      raised += await this.raise(
        [t.assignee.userId],
        [
          {
            kind: 'task.overdue',
            title: `Overdue: ${t.title}`,
            body: `Was due ${istDayKey(t.dueDate!)}.`,
            entityType: 'task',
            entityId: t.id,
            dedupeKey: `overdue:${t.id}`,
          },
        ],
      );
    }

    // Client reviews past their deadline.
    const late = await m.Approval.find({ status: 'PENDING', dueAt: { $lt: now } })
      .populate({ path: 'deliverable', select: { projectId: 1 } })
      .lean<(Approval & { deliverable: { projectId: string } | null })[]>();
    raised += await this.raise(
      managers,
      late
        .filter((a) => a.deliverable)
        .map((a) => ({
          kind: 'approval.overdue',
          title: `Client review overdue: ${a.title.replace(/^Client approval — /, '')}`,
          body: 'Follow up with the client or agree a new date.',
          entityType: 'project',
          entityId: a.deliverable!.projectId,
          dedupeKey: `review-overdue:${a.id}`,
        })),
    );

    // Deadlines at risk: due within three days with little done.
    const due = await m.Project.find({
      status: 'ACTIVE',
      dueDate: { $gte: now, $lt: new Date(now.getTime() + 3 * DAY_MS) },
    }).lean<Project[]>();
    for (const p of due) {
      const [open, total] = await Promise.all([
        m.Task.countDocuments({ projectId: p.id, status: { $ne: 'DONE' } }),
        m.Task.countDocuments({ projectId: p.id }),
      ]);
      if (total === 0 || open / total < 0.2) continue;
      raised += await this.raise(managers, [
        {
          kind: 'project.deadline',
          title: `Deadline at risk: ${p.title}`,
          body: `Due ${istDayKey(p.dueDate)} with ${open} of ${total} tasks open.`,
          entityType: 'project',
          entityId: p.id,
          dedupeKey: `deadline:${p.id}:${day}`,
        },
      ]);
    }

    // Client messages that failed.
    const failed = await m.ClientMessage.find({
      status: 'FAILED',
      updatedAt: { $gte: new Date(now.getTime() - 7 * DAY_MS) },
    }).lean();
    raised += await this.raise(
      comms,
      failed.map((f) => ({
        kind: 'project.message',
        title: `Message failed: ${f.subject}`,
        body: f.statusNote ?? 'The provider refused the message.',
        entityType: 'message',
        entityId: f._id,
        dedupeKey: `message-failed:${f._id}`,
      })),
    );
    return raised;
  }

  // ── Inbox ───────────────────────────────────────────────────────────────────

  async inbox(
    user: SessionUser,
    q: NotificationListQuery,
  ): Promise<{ items: NotificationView[]; unread: number; open: number }> {
    await this.sweep();
    const where: Record<string, unknown> = { userId: user.id };
    if (q.filter === 'unread') where.readAt = null;
    if (q.filter === 'resolved') where.resolvedAt = { $ne: null };
    if (q.filter === 'open') where.resolvedAt = null;
    const N = this.database.models.Notification;
    const [rows, unread, open] = await Promise.all([
      N.find(where).sort({ createdAt: -1, _id: -1 }).limit(50).lean<Notification[]>(),
      N.countDocuments({ userId: user.id, readAt: null }),
      N.countDocuments({ userId: user.id, resolvedAt: null }),
    ]);
    return {
      items: rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        entityType: n.entityType,
        entityId: n.entityId,
        readAt: isoOrNull(n.readAt),
        resolvedAt: isoOrNull(n.resolvedAt ?? null),
        createdAt: iso(n.createdAt),
      })),
      unread,
      open,
    };
  }

  async mark(user: SessionUser, id: string, change: 'unread' | 'resolve' | 'reopen') {
    const set =
      change === 'unread'
        ? { readAt: null }
        : change === 'resolve'
          ? { resolvedAt: new Date(), readAt: new Date() }
          : { resolvedAt: null };
    const res = await this.database.models.Notification.updateOne(
      { _id: id, userId: user.id },
      { $set: set },
    );
    if (res.matchedCount === 0) throw notFound('Notification');
  }
}
