import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApprovalInboxQuery, DecideApproval, type SessionUser } from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ApprovalsService } from './approvals.service';

/** Approval inbox and decisions. Eligibility is checked per step in ApprovalsService. */
@Controller('approval-requests')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @RequirePermissions('workspace:read')
  inbox(
    @Query(new ZodValidationPipe(ApprovalInboxQuery)) q: ApprovalInboxQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.approvals.inbox(user, q);
  }

  @Get(':id')
  @RequirePermissions('workspace:read')
  get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.approvals.get(id, user);
  }

  @Post(':id/decision')
  @RequirePermissions('workspace:read')
  decide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DecideApproval)) body: DecideApproval,
    @CurrentUser() user: SessionUser,
  ) {
    return this.approvals.decide(id, body, user);
  }
}
