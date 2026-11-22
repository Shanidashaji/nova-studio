import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  BookAsset,
  CallCrew,
  CreateShoot,
  RangeQuery,
  UpdateAsset,
  UpdateShoot,
  type SessionUser,
} from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ScheduleService } from './schedule.service';

@Controller()
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get('schedule')
  @RequirePermissions('workspace:read')
  view(@Query(new ZodValidationPipe(RangeQuery)) query: RangeQuery) {
    return this.schedule.view(query);
  }

  @Get('shoots/:id')
  @RequirePermissions('workspace:read')
  shoot(@Param('id') id: string) {
    return this.schedule.getShoot(id);
  }

  @Post('shoots')
  @RequirePermissions('schedule:write')
  create(
    @Body(new ZodValidationPipe(CreateShoot)) body: CreateShoot,
    @CurrentUser() user: SessionUser,
  ) {
    return this.schedule.createShoot(body, user);
  }

  @Patch('shoots/:id')
  @RequirePermissions('schedule:write')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateShoot)) body: UpdateShoot,
    @CurrentUser() user: SessionUser,
  ) {
    return this.schedule.updateShoot(id, body, user);
  }

  @Post('shoots/:id/bookings')
  @RequirePermissions('schedule:write')
  book(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(BookAsset)) body: BookAsset,
    @CurrentUser() user: SessionUser,
  ) {
    return this.schedule.bookAsset(id, body, user);
  }

  @Delete('shoots/:id/bookings/:bookingId')
  @RequirePermissions('schedule:write')
  unbook(
    @Param('id') id: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.schedule.removeBooking(id, bookingId, user);
  }

  @Post('shoots/:id/crew')
  @RequirePermissions('schedule:write')
  call(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CallCrew)) body: CallCrew,
    @CurrentUser() user: SessionUser,
  ) {
    return this.schedule.callCrew(id, body, user);
  }

  @Delete('shoots/:id/crew/:crewCallId')
  @RequirePermissions('schedule:write')
  release(
    @Param('id') id: string,
    @Param('crewCallId') crewCallId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.schedule.removeCrew(id, crewCallId, user);
  }

  @Get('assets')
  @RequirePermissions('workspace:read')
  assets(@Query(new ZodValidationPipe(RangeQuery)) query: RangeQuery) {
    return this.schedule.assets(query);
  }

  @Patch('assets/:id')
  @RequirePermissions('asset:write')
  updateAsset(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAsset)) body: UpdateAsset,
    @CurrentUser() user: SessionUser,
  ) {
    return this.schedule.updateAsset(id, body, user);
  }
}
