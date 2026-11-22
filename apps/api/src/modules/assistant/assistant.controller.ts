import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AssistantMessageRequest, type SessionUser } from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AssistantService } from './assistant.service';

@Controller('assistant')
@RequirePermissions('assistant:use')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  status() {
    return this.assistant.status();
  }

  @Get('history')
  history(@CurrentUser() user: SessionUser) {
    return this.assistant.history(user);
  }

  /** Rate-limited: each message can call an external model. */
  @Post('messages')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  message(
    @Body(new ZodValidationPipe(AssistantMessageRequest)) body: AssistantMessageRequest,
    @CurrentUser() user: SessionUser,
  ) {
    return this.assistant.message(user, body);
  }

  @Post('actions/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.assistant.confirm(id, user);
  }

  @Post('actions/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.assistant.cancel(id, user);
  }
}
