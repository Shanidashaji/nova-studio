import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

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
 * category off; no row means on). Called inside the same transaction as the change it reports
 * (the writes join the surrounding transaction automatically).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  async notifyUsers(userIds: readonly string[], input: NotificationInput) {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return 0;
    const { NotificationPreference, Notification } = this.database.models;
    const category = input.kind.split('.')[0]!;
    const muted = await NotificationPreference.find(
      { userId: { $in: ids }, kind: category, inApp: false },
      { userId: 1 },
    ).lean();
    const mutedIds = new Set(muted.map((m) => m.userId));
    const recipients = ids.filter((id) => !mutedIds.has(id));
    if (recipients.length === 0) return 0;
    await Notification.insertMany(
      recipients.map((userId) => ({
        userId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })),
    );
    return recipients.length;
  }

  /** Notifies every active user whose role holds `permission`, except `exceptUserId`. */
  async notifyPermission(permission: string, input: NotificationInput, exceptUserId?: string) {
    const { Permission, RolePermission, User } = this.database.models;
    const perm = await Permission.findOne({ key: permission }, { _id: 1 }).lean();
    if (!perm) return 0;
    const roleIds = await RolePermission.distinct('roleId', { permissionId: perm._id });
    const users = await User.find(
      {
        isActive: true,
        roleId: { $in: roleIds },
        ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}),
      },
      { _id: 1 },
    ).lean();
    return this.notifyUsers(
      users.map((u) => u._id),
      input,
    );
  }
}
