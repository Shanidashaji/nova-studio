import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  AttendanceQuery,
  CreateLeave,
  RecordAttendance,
  UpdateEmployment,
  UpsertDepartment,
  UpsertEmployeeRecord,
  type SessionUser,
} from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { HrService } from './hr.service';

@Controller('hr')
export class HrController {
  constructor(private readonly hr: HrService) {}

  /** Directory for everyone; restricted record fields only with `hr:read` (in the service). */
  @Get('employees')
  @RequirePermissions('workspace:read')
  employees(@CurrentUser() user: SessionUser) {
    return this.hr.employees(user);
  }

  @Patch('employees/:id')
  @RequirePermissions('hr:write')
  updateEmployment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateEmployment)) body: UpdateEmployment,
    @CurrentUser() user: SessionUser,
  ) {
    return this.hr.updateEmployment(id, body, user);
  }

  @Put('employees/:id/record')
  @RequirePermissions('hr:read', 'hr:write')
  upsertRecord(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertEmployeeRecord)) body: UpsertEmployeeRecord,
    @CurrentUser() user: SessionUser,
  ) {
    return this.hr.upsertRecord(id, body, user);
  }

  @Get('departments')
  @RequirePermissions('workspace:read')
  departments() {
    return this.hr.departments();
  }

  @Post('departments')
  @RequirePermissions('hr:write')
  createDepartment(
    @Body(new ZodValidationPipe(UpsertDepartment)) body: UpsertDepartment,
    @CurrentUser() user: SessionUser,
  ) {
    return this.hr.upsertDepartment(null, body, user);
  }

  @Put('departments/:id')
  @RequirePermissions('hr:write')
  updateDepartment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertDepartment)) body: UpsertDepartment,
    @CurrentUser() user: SessionUser,
  ) {
    return this.hr.upsertDepartment(id, body, user);
  }

  @Get('leave')
  @RequirePermissions('workspace:read')
  leave(@CurrentUser() user: SessionUser) {
    return this.hr.leave(user);
  }

  @Post('leave')
  @RequirePermissions('workspace:read')
  requestLeave(
    @Body(new ZodValidationPipe(CreateLeave)) body: CreateLeave,
    @CurrentUser() user: SessionUser,
  ) {
    return this.hr.requestLeave(body, user);
  }

  @Post('leave/:id/cancel')
  @RequirePermissions('workspace:read')
  cancelLeave(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.hr.cancelLeave(id, user);
  }

  @Get('attendance')
  @RequirePermissions('workspace:read')
  attendance(
    @Query(new ZodValidationPipe(AttendanceQuery)) q: AttendanceQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.hr.attendance(q, user);
  }

  @Post('attendance')
  @RequirePermissions('workspace:read')
  record(
    @Body(new ZodValidationPipe(RecordAttendance)) body: RecordAttendance,
    @CurrentUser() user: SessionUser,
  ) {
    return this.hr.recordAttendance(body, user);
  }
}
