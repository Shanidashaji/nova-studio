import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ActivityQuery,
  type ActivityView,
  type NotificationView,
  type Page,
  type SessionUser,
} from '@nova/shared';
import type { Prisma } from '@nova/db';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { notFound } from '../../common/errors';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { PrismaService } from '../../database/prisma.service';
import { iso, isoOrNull } from '../projects/project.mapper';
import { hiddenEntityTypes } from './activity-visibility';

@Controller()
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

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
    const where: Prisma.ActivityLogWhereInput = {
      ...(restricted.length ? { entityType: { notIn: restricted } } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.entityType
        ? { entityType: restricted.includes(q.entityType) ? '__none__' : q.entityType }
        : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.source ? { source: q.source } : {}),
    };
    const rows = await this.prisma.db.activityLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
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
        actor: a.actor,
        createdAt: iso(a.createdAt),
      })),
      nextCursor: rows.length > q.limit ? items.at(-1)!.id : null,
    };
  }

  @Get('notifications')
  async notifications(
    @CurrentUser() user: SessionUser,
  ): Promise<{ items: NotificationView[]; unread: number }> {
    const [rows, unread] = await Promise.all([
      this.prisma.db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      // Counted separately: the list is capped, the badge must not be.
      this.prisma.db.notification.count({ where: { userId: user.id, readAt: null } }),
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
        createdAt: iso(n.createdAt),
      })),
      unread,
    };
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<void> {
    const result = await this.prisma.db.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.db.notification.count({ where: { id, userId: user.id } });
      if (!exists) throw notFound('Notification');
    }
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: SessionUser): Promise<void> {
    await this.prisma.db.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
