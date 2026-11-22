import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ChangeOwnPassword,
  CreateRole,
  CreateUser,
  NotificationPreferences,
  ResetPassword,
  UpdateRole,
  UpdateUser,
  UpsertApprovalRule,
  type SessionUser,
} from '@nova/shared';
import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermissions,
  type AuthedRequest,
} from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminService } from './admin.service';

@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ── Users ──────────────────────────────────────────────────────────────────

  @Get('admin/users')
  @RequirePermissions('user:manage')
  users() {
    return this.admin.users();
  }

  @Post('admin/users')
  @RequirePermissions('user:manage')
  createUser(
    @Body(new ZodValidationPipe(CreateUser)) body: CreateUser,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.createUser(body, user);
  }

  @Patch('admin/users/:id')
  @RequirePermissions('user:manage')
  updateUser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUser)) body: UpdateUser,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.updateUser(id, body, user);
  }

  @Post('admin/users/:id/password')
  @HttpCode(204)
  @RequirePermissions('user:manage')
  resetPassword(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResetPassword)) body: ResetPassword,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.resetPassword(id, body, user);
  }

  @Delete('admin/users/:id/sessions')
  @HttpCode(204)
  @RequirePermissions('user:manage')
  revokeSessions(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.admin.revokeSessions(id, user);
  }

  // ── Roles & approval rules ─────────────────────────────────────────────────

  @Get('admin/roles')
  @RequireAnyPermission('user:manage', 'role:manage')
  roles() {
    return this.admin.roles();
  }

  @Post('admin/roles')
  @RequirePermissions('role:manage')
  createRole(
    @Body(new ZodValidationPipe(CreateRole)) body: CreateRole,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.createRole(body, user);
  }

  @Patch('admin/roles/:id')
  @RequirePermissions('role:manage')
  updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRole)) body: UpdateRole,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.updateRole(id, body, user);
  }

  @Delete('admin/roles/:id')
  @HttpCode(204)
  @RequirePermissions('role:manage')
  deleteRole(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.admin.deleteRole(id, user);
  }

  @Get('admin/approval-rules')
  @RequireAnyPermission('role:manage', 'expense:approve', 'procurement:approve', 'leave:approve')
  rules() {
    return this.admin.rules();
  }

  @Post('admin/approval-rules')
  @RequirePermissions('role:manage')
  createRule(
    @Body(new ZodValidationPipe(UpsertApprovalRule)) body: UpsertApprovalRule,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.upsertRule(null, body, user);
  }

  @Put('admin/approval-rules/:id')
  @RequirePermissions('role:manage')
  updateRule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertApprovalRule)) body: UpsertApprovalRule,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.upsertRule(id, body, user);
  }

  @Delete('admin/approval-rules/:id')
  @RequirePermissions('role:manage')
  deleteRule(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.admin.deleteRule(id, user);
  }

  // ── Self-service (any signed-in user) ─────────────────────────────────────

  @Get('me/sessions')
  sessions(@CurrentUser() user: SessionUser, @Req() req: AuthedRequest) {
    return this.admin.mySessions(user, req.sessionId!);
  }

  @Delete('me/sessions/:id')
  @HttpCode(204)
  revokeSession(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.admin.revokeMySession(user, id);
  }

  @Post('me/password')
  @HttpCode(204)
  changePassword(
    @Body(new ZodValidationPipe(ChangeOwnPassword)) body: ChangeOwnPassword,
    @CurrentUser() user: SessionUser,
    @Req() req: AuthedRequest,
  ) {
    return this.admin.changeOwnPassword(user, req.sessionId!, body);
  }

  @Get('me/notification-preferences')
  preferences(@CurrentUser() user: SessionUser) {
    return this.admin.preferences(user);
  }

  @Put('me/notification-preferences')
  setPreferences(
    @Body(new ZodValidationPipe(NotificationPreferences)) body: NotificationPreferences,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.setPreferences(user, body);
  }
}
