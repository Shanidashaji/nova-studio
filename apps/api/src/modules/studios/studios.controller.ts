import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateStudioBooking,
  RangeQuery,
  UpdateStudioBooking,
  type SessionUser,
} from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { StudiosService } from './studios.service';

@Controller()
export class StudiosController {
  constructor(private readonly studios: StudiosService) {}

  @Get('studios')
  @RequirePermissions('workspace:read')
  list(@Query(new ZodValidationPipe(RangeQuery)) q: RangeQuery) {
    return this.studios.list(q);
  }

  @Post('studio-bookings')
  @RequirePermissions('studio:write')
  book(
    @Body(new ZodValidationPipe(CreateStudioBooking)) body: CreateStudioBooking,
    @CurrentUser() user: SessionUser,
  ) {
    return this.studios.book(body, user);
  }

  @Patch('studio-bookings/:id')
  @RequirePermissions('studio:write')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStudioBooking)) body: UpdateStudioBooking,
    @CurrentUser() user: SessionUser,
  ) {
    return this.studios.update(id, body, user);
  }
}
