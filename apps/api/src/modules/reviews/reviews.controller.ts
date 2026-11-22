import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import {
  AddFeedback,
  ApprovalDecision,
  ResolveFeedback,
  SendForReview,
  type SessionUser,
} from '@nova/shared';
import type { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('deliverables/:id/review')
  @RequirePermissions('project:write')
  send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SendForReview)) body: SendForReview,
    @CurrentUser() user: SessionUser,
  ) {
    return this.reviews.sendForReview(id, body, user);
  }

  @Post('stages/:id/approval-request')
  @RequirePermissions('project:write')
  requestStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SendForReview)) body: SendForReview,
    @CurrentUser() user: SessionUser,
  ) {
    return this.reviews.requestStageApproval(id, body, user);
  }

  @Post('deliverables/:id/feedback')
  @RequirePermissions('project:write')
  feedback(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddFeedback)) body: AddFeedback,
    @CurrentUser() user: SessionUser,
  ) {
    return this.reviews.addFeedback(id, body, user);
  }

  @Patch('feedback/:id')
  @RequirePermissions('project:write')
  resolve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResolveFeedback)) body: z.infer<typeof ResolveFeedback>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.reviews.setFeedbackStatus(id, body.status, user);
  }

  @Post('approvals/:id/decision')
  @RequirePermissions('approval:decide')
  decide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApprovalDecision)) body: ApprovalDecision,
    @CurrentUser() user: SessionUser,
  ) {
    return this.reviews.decide(id, body, user);
  }
}
