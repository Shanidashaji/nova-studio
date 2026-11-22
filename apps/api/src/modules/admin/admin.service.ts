import { Injectable } from '@nestjs/common';
import {
  ApprovalSubject,
  hashPassword,
  verifyPassword,
  type ApprovalRule,
  type NotificationPreference,
  type Permission as PermissionRow,
  type PopulateOptions,
  type Role,
  type RolePermission,
  type Session,
  type TeamMember,
  type User,
} from '@nova/db';
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
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { iso, isoOrNull } from '../projects/project.mapper';

const rolePermissionsPopulate: PopulateOptions = {
  path: 'permissions',
  populate: { path: 'permission' },
};

type RoleWithPermissions = Role & {
  permissions: (RolePermission & { permission: PermissionRow | null })[];
};

/** A role with its permissions and the number of users holding it (the former `_count`). */
type RoleRow = RoleWithPermissions & { userCount: number };

/** Postgres ordered enums by declaration; keep that order for `subject`. */
const SUBJECT_ORDER: readonly string[] = Object.values(ApprovalSubject);

/**
 * Users, roles, approval rules, sessions and preferences (ADR-0009). Guard rails live here, not
 * in the UI: SUPER_ADMIN is locked, nobody edits their own role or status, the last active
 * super admin cannot be removed, and only a super admin can grant super admin.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  // ── Users ──────────────────────────────────────────────────────────────────

  async users(): Promise<UserView[]> {
    const now = new Date();
    const rows = await this.database.models.User.find()
      .sort({ isActive: -1, name: 1 })
      .populate([
        { path: 'role' },
        // List/one-to-one virtuals keep their foreign field (`userId`) in the select.
        { path: 'teamMember', select: { title: 1, userId: 1 } },
        { path: 'sessions', match: { expiresAt: { $gt: now } }, select: { userId: 1 } },
      ])
      .lean<
        (User & {
          role: Role;
          teamMember: Pick<TeamMember, 'id' | 'title'> | null;
          sessions: Pick<Session, 'id'>[];
        })[]
      >();
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isActive: u.isActive,
      lastLoginAt: isoOrNull(u.lastLoginAt),
      createdAt: iso(u.createdAt),
      role: { id: u.role.id, key: u.role.key, name: u.role.name },
      teamMember: u.teamMember ? { id: u.teamMember.id, title: u.teamMember.title } : null,
      activeSessions: u.sessions.length,
    }));
  }

  /**
   * No escalation: an actor may only grant, or manage users holding, a role whose permissions they
   * hold themselves. Only a Super Admin can grant or manage Super Admin.
   */
  private async assertWithinActor(roleId: string, actor: SessionUser, verb: string) {
    const role = await this.database.models.Role.findById(roleId)
      .populate(rolePermissionsPopulate)
      .lean<RoleWithPermissions>();
    if (!role) throw unprocessable('INVALID_ROLE', 'Choose an existing role.');
    if (actor.role.key === SUPER_ADMIN_ROLE) return role;
    if (role.key === SUPER_ADMIN_ROLE) {
      throw forbidden(`Only a Super Admin can ${verb} a Super Admin.`);
    }
    const extra = role.permissions
      .flatMap((p) => (p.permission ? [p.permission.key] : []))
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
    const { User: Users } = this.database.models;
    const role = await this.assertCanAssign(input.roleId, actor);
    if (await Users.exists({ email: input.email })) {
      throw conflict('EMAIL_TAKEN', 'A user with this email already exists.');
    }
    const passwordHash = await hashPassword(input.password);
    const user = await this.activity.transaction(async (log) => {
      const created = (
        await Users.create({ email: input.email, name: input.name, passwordHash, roleId: role.id })
      ).toObject() as User;
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
    const { User: Users, Session: Sessions } = this.database.models;
    const user = await Users.findById(id).populate('role').lean<User & { role: Role }>();
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
    await this.activity.transaction(async (log) => {
      if (losesSuperAdmin) await this.assertAnotherSuperAdmin(id);
      const res = await Users.updateOne(
        { _id: id },
        { $set: { name: input.name, roleId: input.roleId, isActive: input.isActive } },
      );
      if (res.matchedCount === 0) throw notFound('User');
      // Deactivation ends every session at once; role changes apply on the next request.
      if (input.isActive === false) await Sessions.deleteMany({ userId: id });
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

  /** Runs inside the caller's transaction (model calls join it automatically). */
  private async assertAnotherSuperAdmin(exceptUserId: string) {
    const { Role: Roles, User: Users } = this.database.models;
    const superRoleIds = await Roles.distinct('_id', { key: SUPER_ADMIN_ROLE });
    const others = await Users.countDocuments({
      _id: { $ne: exceptUserId },
      isActive: true,
      roleId: { $in: superRoleIds },
    });
    if (others === 0) {
      throw conflict('LAST_SUPER_ADMIN', 'At least one active Super Admin must remain.');
    }
  }

  async resetPassword(id: string, input: ResetPassword, actor: SessionUser) {
    const { User: Users, Session: Sessions } = this.database.models;
    const user = await Users.findById(id).lean<User>();
    if (!user) throw notFound('User');
    if (id === actor.id) {
      throw forbidden('Change your own password under My account, which asks for the current one.');
    }
    await this.assertWithinActor(user.roleId, actor, 'manage users with');
    const passwordHash = await hashPassword(input.password);
    await this.activity.transaction(async (log) => {
      const res = await Users.updateOne({ _id: id }, { $set: { passwordHash } });
      if (res.matchedCount === 0) throw notFound('User');
      await Sessions.deleteMany({ userId: id });
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
    const { User: Users, Session: Sessions } = this.database.models;
    const user = await Users.findById(id).lean<User>();
    if (!user) throw notFound('User');
    await this.assertWithinActor(user.roleId, actor, 'manage users with');
    await this.activity.transaction(async (log) => {
      const { deletedCount: count } = await Sessions.deleteMany({ userId: id });
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

  private toRole(r: RoleRow): RoleView {
    const keys = new Set(r.permissions.flatMap((p) => (p.permission ? [p.permission.key] : [])));
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      locked: r.key === SUPER_ADMIN_ROLE,
      // Keep vocabulary order for a stable matrix.
      permissions: PERMISSIONS.filter((p) => keys.has(p)),
      userCount: r.userCount,
    };
  }

  /** One role with permissions and user count; joins the surrounding transaction if any. */
  private async roleRow(id: string): Promise<RoleRow | null> {
    const role = await this.database.models.Role.findById(id)
      .populate(rolePermissionsPopulate)
      .lean<RoleWithPermissions>();
    if (!role) return null;
    const userCount = await this.database.models.User.countDocuments({ roleId: id });
    return { ...role, userCount };
  }

  async roles(): Promise<RoleView[]> {
    const { Role: Roles, User: Users } = this.database.models;
    const [rows, counts] = await Promise.all([
      Roles.find()
        .sort({ isSystem: -1, createdAt: 1 })
        .populate(rolePermissionsPopulate)
        .lean<RoleWithPermissions[]>(),
      Users.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$roleId', n: { $sum: 1 } } }]),
    ]);
    const byRole = new Map(counts.map((c) => [c._id, c.n]));
    return rows.map((r) => this.toRole({ ...r, userCount: byRole.get(r.id) ?? 0 }));
  }

  /** Runs inside the caller's transaction (model calls join it automatically). */
  private async permissionIds(keys: readonly Permission[]) {
    // Permission rows are created on demand so new vocabulary needs no data migration.
    const ids: string[] = [];
    for (const key of new Set(keys)) {
      const row = await this.database.models.Permission.findOneAndUpdate(
        { key },
        { $setOnInsert: { key } },
        { upsert: true, new: true },
      ).lean<PermissionRow>();
      ids.push(row.id);
    }
    return ids;
  }

  async createRole(input: CreateRole, actor: SessionUser): Promise<RoleView> {
    const { Role: Roles, RolePermission: RolePermissions } = this.database.models;
    if (await Roles.exists({ key: input.key })) {
      throw conflict('ROLE_EXISTS', 'A role with this key already exists.');
    }
    const role = await this.activity.transaction(async (log) => {
      const ids = await this.permissionIds(input.permissions);
      const doc = await Roles.create({
        key: input.key,
        name: input.name,
        description: input.description ?? null,
      });
      const roleId = doc.id;
      await RolePermissions.insertMany(ids.map((permissionId) => ({ roleId, permissionId })));
      const created = await this.roleRow(roleId);
      if (!created) throw notFound('Role');
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
    const { Role: Roles, RolePermission: RolePermissions } = this.database.models;
    const role = await this.roleRow(id);
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
    const updated = await this.activity.transaction(async (log) => {
      if (input.permissions) {
        const ids = await this.permissionIds(input.permissions);
        await RolePermissions.deleteMany({ roleId: id });
        await RolePermissions.insertMany(ids.map((permissionId) => ({ roleId: id, permissionId })));
      }
      const res = await Roles.updateOne(
        { _id: id },
        { $set: { name: input.name, description: input.description } },
      );
      if (res.matchedCount === 0) throw notFound('Role');
      const next = await this.roleRow(id);
      if (!next) throw notFound('Role');
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
    const role = await this.roleRow(id);
    if (!role) throw notFound('Role');
    if (role.isSystem) throw forbidden('System roles cannot be deleted; edit them instead.');
    if (role.userCount > 0) {
      throw conflict('ROLE_IN_USE', `Move the ${role.userCount} user(s) to another role first.`);
    }
    await this.activity.transaction(async (log) => {
      // RolePermission rows cascade; a user assigned meanwhile makes this refuse (409).
      const deleted = await this.database.deleteCascade('Role', { _id: id });
      if (deleted === 0) throw notFound('Role');
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
    const rows = await this.database.models.ApprovalRule.find().lean<ApprovalRule[]>();
    // Sorted here: `subject` follows the enum's declared order, as Postgres sorted it.
    rows.sort(
      (a, b) =>
        SUBJECT_ORDER.indexOf(a.subject) - SUBJECT_ORDER.indexOf(b.subject) ||
        a.stepOrder - b.stepOrder ||
        a.minAmount - b.minAmount,
    );
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
    const { ApprovalRule: Rules } = this.database.models;
    if (id && !(await Rules.exists({ _id: id }))) {
      throw notFound('Approval rule');
    }
    await this.activity.transaction(async (log) => {
      let rule: ApprovalRule | null;
      if (id) {
        rule = await Rules.findByIdAndUpdate(
          id,
          { $set: input },
          { new: true },
        ).lean<ApprovalRule>();
        if (!rule) throw notFound('Approval rule');
      } else {
        rule = (await Rules.create(input)).toObject();
      }
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
    const { ApprovalRule: Rules } = this.database.models;
    const rule = await Rules.findById(id).lean<ApprovalRule>();
    if (!rule) throw notFound('Approval rule');
    await this.activity.transaction(async (log) => {
      const res = await Rules.deleteOne({ _id: id });
      if (res.deletedCount === 0) throw notFound('Approval rule');
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
    const rows = await this.database.models.Session.find({
      userId: user.id,
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastSeenAt: -1 })
      .lean<Session[]>();
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
    const { deletedCount } = await this.database.models.Session.deleteMany({
      _id: sessionId,
      userId: user.id,
    });
    if (deletedCount === 0) throw notFound('Session');
    await this.activity.log({
      actorId: user.id,
      action: 'auth.session_revoked',
      entityType: 'auth',
      entityId: user.id,
      summary: `${user.name} signed out another session`,
    });
  }

  async changeOwnPassword(user: SessionUser, currentSessionId: string, input: ChangeOwnPassword) {
    const { User: Users, Session: Sessions } = this.database.models;
    const row = await Users.findById(user.id).lean<User>();
    if (!row) throw notFound('User');
    if (!(await verifyPassword(row.passwordHash, input.currentPassword))) {
      throw unprocessable('WRONG_PASSWORD', 'Your current password is incorrect.');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.activity.transaction(async (log) => {
      const res = await Users.updateOne({ _id: user.id }, { $set: { passwordHash } });
      if (res.matchedCount === 0) throw notFound('User');
      // Keep this session; end every other one.
      await Sessions.deleteMany({ userId: user.id, _id: { $ne: currentSessionId } });
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
    const rows = await this.database.models.NotificationPreference.find({
      userId: user.id,
    }).lean<NotificationPreference[]>();
    const off = new Set(rows.filter((r) => !r.inApp).map((r) => r.kind));
    return NOTIFICATION_CATEGORIES.map((kind) => ({
      kind,
      label: NOTIFICATION_CATEGORY_LABELS[kind],
      inApp: !off.has(kind),
    }));
  }

  async setPreferences(user: SessionUser, input: NotificationPreferences) {
    const { NotificationPreference: Preferences } = this.database.models;
    await this.database.transaction(async () => {
      // Sequential: writes inside a transaction must not run concurrently.
      for (const p of input.preferences) {
        await Preferences.updateOne(
          { userId: user.id, kind: p.kind },
          { $set: { inApp: p.inApp } },
          { upsert: true },
        );
      }
    });
    return this.preferences(user);
  }
}
