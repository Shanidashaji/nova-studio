import { Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from '@nova/db';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  PERMISSIONS,
  SUPER_ADMIN_ROLE,
  type ApprovalRuleView,
  type ChangeOwnPassword,
  type CreateRole,
  type CreateUser,
  type NotificationPreferences,
  type NotificationPreferenceView,
  type Permission,
  type ResetPassword,
  type RoleView,
  type SessionUser,
  type SessionView,
  type UpdateRole,
  type UpdateUser,
  type UpsertApprovalRule,
  type UserView,
} from '@nova/shared';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { PrismaService, type Db } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { iso, isoOrNull } from '../projects/project.mapper';

const roleInclude = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
} as const;

/**
 * Users, roles, approval rules, sessions and preferences (ADR-0009). Guard rails live here, not
 * in the UI: SUPER_ADMIN is locked, nobody edits their own role or status, the last active
 * super admin cannot be removed, and only a super admin can grant super admin.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  // ── Users ──────────────────────────────────────────────────────────────────

  async users(): Promise<UserView[]> {
    const now = new Date();
    const rows = await this.prisma.db.user.findMany({
      include: {
        role: true,
        teamMember: { select: { id: true, title: true } },
        sessions: { where: { expiresAt: { gt: now } }, select: { id: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isActive: u.isActive,
      lastLoginAt: isoOrNull(u.lastLoginAt),
      createdAt: iso(u.createdAt),
      role: { id: u.role.id, key: u.role.key, name: u.role.name },
      teamMember: u.teamMember,
      activeSessions: u.sessions.length,
    }));
  }

  /**
   * No escalation: an actor may only grant, or manage users holding, a role whose permissions they
   * hold themselves. Only a Super Admin can grant or manage Super Admin.
   */
  private async assertWithinActor(roleId: string, actor: SessionUser, verb: string) {
    const role = await this.prisma.db.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw unprocessable('INVALID_ROLE', 'Choose an existing role.');
    if (actor.role.key === SUPER_ADMIN_ROLE) return role;
    if (role.key === SUPER_ADMIN_ROLE) {
      throw forbidden(`Only a Super Admin can ${verb} a Super Admin.`);
    }
    const extra = role.permissions
      .map((p) => p.permission.key)
      .filter((k) => !(actor.permissions as string[]).includes(k));
    if (extra.length) {
      throw forbidden(
        `You cannot ${verb} the ${role.name} role: it has permissions you do not hold (${extra.join(', ')}).`,
      );
    }
    return role;
  }

  private assertCanAssign(roleId: string, actor: SessionUser) {
    return this.assertWithinActor(roleId, actor, 'grant');
  }

  async createUser(input: CreateUser, actor: SessionUser): Promise<UserView> {
    const role = await this.assertCanAssign(input.roleId, actor);
    if (await this.prisma.db.user.findUnique({ where: { email: input.email } })) {
      throw conflict('EMAIL_TAKEN', 'A user with this email already exists.');
    }
    const passwordHash = await hashPassword(input.password);
    const user = await this.activity.transaction(async (tx, log) => {
      const created = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash, roleId: role.id },
      });
      await log({
        actorId: actor.id,
        action: 'user.created',
        entityType: 'user',
        entityId: created.id,
        summary: `${actor.name} added user ${created.name} as ${role.name}`,
      });
      return created;
    });
    return (await this.users()).find((u) => u.id === user.id)!;
  }

  async updateUser(id: string, input: UpdateUser, actor: SessionUser): Promise<UserView> {
    const user = await this.prisma.db.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw notFound('User');
    const changesAccess = input.roleId !== undefined || input.isActive !== undefined;
    if (changesAccess && id === actor.id) {
      throw forbidden('You cannot change your own role or deactivate yourself.');
    }
    await this.assertWithinActor(user.roleId, actor, 'manage users with');
    const role = input.roleId ? await this.assertCanAssign(input.roleId, actor) : user.role;
    const losesSuperAdmin =
      user.role.key === SUPER_ADMIN_ROLE &&
      (role.key !== SUPER_ADMIN_ROLE || input.isActive === false);
    await this.activity.transaction(async (tx, log) => {
      if (losesSuperAdmin) await this.assertAnotherSuperAdmin(tx, id);
      await tx.user.update({
        where: { id },
        data: { name: input.name, roleId: input.roleId, isActive: input.isActive },
      });
      // Deactivation ends every session at once; role changes apply on the next request.
      if (input.isActive === false) await tx.session.deleteMany({ where: { userId: id } });
      const parts = [
        input.roleId && input.roleId !== user.roleId
          ? `role ${user.role.name} → ${role.name}`
          : null,
        input.isActive === false
          ? 'deactivated'
          : input.isActive === true && !user.isActive
            ? 'reactivated'
            : null,
        input.name && input.name !== user.name ? `renamed to ${input.name}` : null,
      ].filter(Boolean);
      await log({
        actorId: actor.id,
        action: 'user.updated',
        entityType: 'user',
        entityId: id,
        summary: `${actor.name} updated ${user.name}${parts.length ? `: ${parts.join(', ')}` : ''}`,
        metadata: { before: { roleId: user.roleId, isActive: user.isActive }, after: input },
      });
    });
    return (await this.users()).find((u) => u.id === id)!;
  }

  private async assertAnotherSuperAdmin(tx: Db, exceptUserId: string) {
    const others = await tx.user.count({
      where: { id: { not: exceptUserId }, isActive: true, role: { key: SUPER_ADMIN_ROLE } },
    });
    if (others === 0) {
      throw conflict('LAST_SUPER_ADMIN', 'At least one active Super Admin must remain.');
    }
  }

  async resetPassword(id: string, input: ResetPassword, actor: SessionUser) {
    const user = await this.prisma.db.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw notFound('User');
    if (id === actor.id) {
      throw forbidden('Change your own password under My account, which asks for the current one.');
    }
    await this.assertWithinActor(user.roleId, actor, 'manage users with');
    const passwordHash = await hashPassword(input.password);
    await this.activity.transaction(async (tx, log) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: id } });
      await log({
        actorId: actor.id,
        action: 'user.password_reset',
        entityType: 'user',
        entityId: id,
        summary: `${actor.name} reset the password for ${user.name} and signed them out`,
      });
    });
  }

  async revokeSessions(id: string, actor: SessionUser) {
    const user = await this.prisma.db.user.findUnique({ where: { id } });
    if (!user) throw notFound('User');
    await this.assertWithinActor(user.roleId, actor, 'manage users with');
    await this.activity.transaction(async (tx, log) => {
      const { count } = await tx.session.deleteMany({ where: { userId: id } });
      await log({
        actorId: actor.id,
        action: 'user.sessions_revoked',
        entityType: 'user',
        entityId: id,
        summary: `${actor.name} signed ${user.name} out of ${count} session${count === 1 ? '' : 's'}`,
      });
    });
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  private toRole(r: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: { permission: { key: string } }[];
    _count: { users: number };
  }): RoleView {
    const keys = new Set(r.permissions.map((p) => p.permission.key));
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      locked: r.key === SUPER_ADMIN_ROLE,
      // Keep vocabulary order for a stable matrix.
      permissions: PERMISSIONS.filter((p) => keys.has(p)),
      userCount: r._count.users,
    };
  }

  async roles(): Promise<RoleView[]> {
    const rows = await this.prisma.db.role.findMany({
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toRole(r));
  }

  private async permissionIds(tx: Db, keys: readonly Permission[]) {
    // Permission rows are created on demand so new vocabulary needs no data migration.
    const ids: string[] = [];
    for (const key of new Set(keys)) {
      const row = await tx.permission.upsert({ where: { key }, create: { key }, update: {} });
      ids.push(row.id);
    }
    return ids;
  }

  async createRole(input: CreateRole, actor: SessionUser): Promise<RoleView> {
    if (await this.prisma.db.role.findUnique({ where: { key: input.key } })) {
      throw conflict('ROLE_EXISTS', 'A role with this key already exists.');
    }
    const role = await this.activity.transaction(async (tx, log) => {
      const ids = await this.permissionIds(tx, input.permissions);
      const created = await tx.role.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description,
          permissions: { create: ids.map((permissionId) => ({ permissionId })) },
        },
        include: roleInclude,
      });
      await log({
        actorId: actor.id,
        action: 'role.created',
        entityType: 'role',
        entityId: created.id,
        summary: `${actor.name} created role ${created.name} with ${ids.length} permissions`,
      });
      return created;
    });
    return this.toRole(role);
  }

  async updateRole(id: string, input: UpdateRole, actor: SessionUser): Promise<RoleView> {
    const role = await this.prisma.db.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw notFound('Role');
    if (role.key === SUPER_ADMIN_ROLE) {
      throw forbidden('The Super Admin role is locked and always holds every permission.');
    }
    if (
      input.permissions &&
      actor.role.key === role.key &&
      !input.permissions.includes('role:manage')
    ) {
      throw unprocessable(
        'SELF_LOCKOUT',
        'Removing role management from your own role would lock you out of this screen.',
      );
    }
    const before = this.toRole(role).permissions;
    const updated = await this.activity.transaction(async (tx, log) => {
      if (input.permissions) {
        const ids = await this.permissionIds(tx, input.permissions);
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: ids.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
      const next = await tx.role.update({
        where: { id },
        data: { name: input.name, description: input.description },
        include: roleInclude,
      });
      const after = this.toRole(next).permissions;
      const added = after.filter((p) => !before.includes(p));
      const removed = before.filter((p) => !after.includes(p));
      await log({
        actorId: actor.id,
        action: 'role.updated',
        entityType: 'role',
        entityId: id,
        summary:
          added.length || removed.length
            ? `${actor.name} changed ${next.name}: ${[
                added.length ? `+${added.join(', +')}` : '',
                removed.length ? `−${removed.join(', −')}` : '',
              ]
                .filter(Boolean)
                .join('; ')}`
            : `${actor.name} updated role ${next.name}`,
        metadata: { added, removed },
      });
      return next;
    });
    return this.toRole(updated);
  }

  async deleteRole(id: string, actor: SessionUser) {
    const role = await this.prisma.db.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw notFound('Role');
    if (role.isSystem) throw forbidden('System roles cannot be deleted; edit them instead.');
    if (role._count.users > 0) {
      throw conflict('ROLE_IN_USE', `Move the ${role._count.users} user(s) to another role first.`);
    }
    await this.activity.transaction(async (tx, log) => {
      await tx.role.delete({ where: { id } });
      await log({
        actorId: actor.id,
        action: 'role.deleted',
        entityType: 'role',
        entityId: id,
        summary: `${actor.name} deleted role ${role.name}`,
      });
    });
  }

  // ── Approval rules (ADR-0010) ─────────────────────────────────────────────

  async rules(): Promise<ApprovalRuleView[]> {
    const rows = await this.prisma.db.approvalRule.findMany({
      orderBy: [{ subject: 'asc' }, { stepOrder: 'asc' }, { minAmount: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      name: r.name,
      minAmount: r.minAmount,
      stepOrder: r.stepOrder,
      permission: r.permission,
      isActive: r.isActive,
    }));
  }

  async upsertRule(id: string | null, input: UpsertApprovalRule, actor: SessionUser) {
    if (id && !(await this.prisma.db.approvalRule.findUnique({ where: { id } }))) {
      throw notFound('Approval rule');
    }
    await this.activity.transaction(async (tx, log) => {
      const rule = id
        ? await tx.approvalRule.update({ where: { id }, data: input })
        : await tx.approvalRule.create({ data: input });
      await log({
        actorId: actor.id,
        action: id ? 'approval_rule.updated' : 'approval_rule.created',
        entityType: 'role',
        entityId: rule.id,
        summary: `${actor.name} ${id ? 'updated' : 'added'} approval rule “${rule.name}” (${rule.subject.toLowerCase().replace('_', ' ')}, step ${rule.stepOrder}${rule.minAmount ? `, from ₹${rule.minAmount.toLocaleString('en-IN')}` : ''})`,
      });
    });
    return this.rules();
  }

  async deleteRule(id: string, actor: SessionUser) {
    const rule = await this.prisma.db.approvalRule.findUnique({ where: { id } });
    if (!rule) throw notFound('Approval rule');
    await this.activity.transaction(async (tx, log) => {
      await tx.approvalRule.delete({ where: { id } });
      await log({
        actorId: actor.id,
        action: 'approval_rule.deleted',
        entityType: 'role',
        entityId: id,
        summary: `${actor.name} removed approval rule “${rule.name}”`,
      });
    });
    return this.rules();
  }

  // ── Self-service: sessions, password, preferences ─────────────────────────

  async mySessions(user: SessionUser, currentSessionId: string): Promise<SessionView[]> {
    const rows = await this.prisma.db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      current: s.id === currentSessionId,
      createdAt: iso(s.createdAt),
      lastSeenAt: iso(s.lastSeenAt),
      expiresAt: iso(s.expiresAt),
      ip: s.ip,
      userAgent: s.userAgent,
    }));
  }

  async revokeMySession(user: SessionUser, sessionId: string) {
    const { count } = await this.prisma.db.session.deleteMany({
      where: { id: sessionId, userId: user.id },
    });
    if (count === 0) throw notFound('Session');
    await this.activity.log({
      actorId: user.id,
      action: 'auth.session_revoked',
      entityType: 'auth',
      entityId: user.id,
      summary: `${user.name} signed out another session`,
    });
  }

  async changeOwnPassword(user: SessionUser, currentSessionId: string, input: ChangeOwnPassword) {
    const row = await this.prisma.db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(row.passwordHash, input.currentPassword))) {
      throw unprocessable('WRONG_PASSWORD', 'Your current password is incorrect.');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.activity.transaction(async (tx, log) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Keep this session; end every other one.
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: currentSessionId } } });
      await log({
        actorId: user.id,
        action: 'auth.password_changed',
        entityType: 'auth',
        entityId: user.id,
        summary: `${user.name} changed their password`,
      });
    });
  }

  async preferences(user: SessionUser): Promise<NotificationPreferenceView[]> {
    const rows = await this.prisma.db.notificationPreference.findMany({
      where: { userId: user.id },
    });
    const off = new Set(rows.filter((r) => !r.inApp).map((r) => r.kind));
    return NOTIFICATION_CATEGORIES.map((kind) => ({
      kind,
      label: NOTIFICATION_CATEGORY_LABELS[kind],
      inApp: !off.has(kind),
    }));
  }

  async setPreferences(user: SessionUser, input: NotificationPreferences) {
    await this.prisma.db.$transaction(
      input.preferences.map((p) =>
        this.prisma.db.notificationPreference.upsert({
          where: { userId_kind: { userId: user.id, kind: p.kind } },
          create: { userId: user.id, kind: p.kind, inApp: p.inApp },
          update: { inApp: p.inApp },
        }),
      ),
    );
    return this.preferences(user);
  }
}
