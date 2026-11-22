import { Injectable } from '@nestjs/common';
import type { Db } from '../../database/prisma.service';

export interface NotificationInput {
  /** `<category>.<event>`, e.g. "approval.requested"; the category drives user preferences. */
  kind: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * In-app notifications. Respects each user's preferences (NotificationPreference rows switch a
 * category off; no row means on). Called inside the same transaction as the change it reports.
 */
@Injectable()
export class NotificationsService {
  async notifyUsers(db: Db, userIds: readonly string[], input: NotificationInput) {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return 0;
    const category = input.kind.split('.')[0]!;
    const muted = await db.notificationPreference.findMany({
      where: { userId: { in: ids }, kind: category, inApp: false },
      select: { userId: true },
    });
    const mutedIds = new Set(muted.map((m) => m.userId));
    const recipients = ids.filter((id) => !mutedIds.has(id));
    if (recipients.length === 0) return 0;
    await db.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })),
    });
    return recipients.length;
  }

  /** Notifies every active user whose role holds `permission`, except `exceptUserId`. */
  async notifyPermission(
    db: Db,
    permission: string,
    input: NotificationInput,
    exceptUserId?: string,
  ) {
    const users = await db.user.findMany({
      where: {
        isActive: true,
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
        role: { permissions: { some: { permission: { key: permission } } } },
      },
      select: { id: true },
    });
    return this.notifyUsers(
      db,
      users.map((u) => u.id),
      input,
    );
  }
}
