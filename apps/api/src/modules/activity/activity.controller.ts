import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ActivityQuery,
  type ActivityView,
  type NotificationView,
  type Page,
  type SessionUser,
} from '@nova/shared';
import type { ActivityLog, Notification, User } from '@nova/db';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { notFound } from '../../common/errors';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { DatabaseService } from '../../database/database.service';
import { iso, isoOrNull } from '../projects/project.mapper';
import { hiddenEntityTypes } from './activity-visibility';

@Controller()
export class ActivityController {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Audit trail, newest first, with cursor pagination. A row is as sensitive as the record it
   * describes: security, finance, HR and confidential-document rows are returned only to roles
   * that may read those records (see activity-visibility.ts); `audit:read` sees everything.
   */
  @Get('activity')
  @RequirePermissions('workspace:read')
  async list(
    @Query(new ZodValidationPipe(ActivityQuery)) q: ActivityQuery,
    @CurrentUser() user: SessionUser,
  ): Promise<Page<ActivityView>> {
    const restricted = hiddenEntityTypes(user.permissions);
    const { ActivityLog: Activity } = this.database.models;
    const where: Record<string, unknown> = {
      ...(restricted.length ? { entityType: { $nin: restricted } } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.entityType
        ? { entityType: restricted.includes(q.entityType) ? '__none__' : q.entityType }
        : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.source ? { source: q.source } : {}),
    };
    // Keyset pagination on (createdAt desc, _id desc): continue strictly after the cursor row.
    if (q.cursor) {
      const cursor = await Activity.findById(q.cursor, { createdAt: 1 }).lean();
      if (cursor) {
        where.$or = [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
        ];
      }
    }
    const rows = await Activity.find(where)
      .populate({ path: 'actor', select: { name: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(q.limit + 1)
      .lean<(ActivityLog & { actor: Pick<User, 'id' | 'name'> | null })[]>();
    const items = rows.slice(0, q.limit);
    return {
      items: items.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        projectId: a.projectId,
        summary: a.summary,
        source: a.source,
        actor: a.actor ? { id: a.actor.id, name: a.actor.name } : null,
        createdAt: iso(a.createdAt),
      })),
      nextCursor: rows.length > q.limit ? items.at(-1)!.id : null,
    };
  }

  @Get('notifications')
  async notifications(
    @CurrentUser() user: SessionUser,
  ): Promise<{ items: NotificationView[]; unread: number }> {
    const { Notification: Notifications } = this.database.models;
    const [rows, unread] = await Promise.all([
      Notifications.find({ userId: user.id })
        .sort({ createdAt: -1, _id: -1 })
        .limit(30)
        .lean<Notification[]>(),
      // Counted separately: the list is capped, the badge must not be.
      Notifications.countDocuments({ userId: user.id, readAt: null }),
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
    };
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<void> {
    const { Notification: Notifications } = this.database.models;
    const result = await Notifications.updateMany(
      { _id: id, userId: user.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      const exists = await Notifications.countDocuments({ _id: id, userId: user.id });
      if (!exists) throw notFound('Notification');
    }
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: SessionUser): Promise<void> {
    await this.database.models.Notification.updateMany(
      { userId: user.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
  }
}
