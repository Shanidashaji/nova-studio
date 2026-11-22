import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateFinanceRecord, type SessionUser } from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary')
  @RequirePermissions('finance:read')
  summary() {
    return this.finance.summary();
  }

  @Post('records')
  @RequirePermissions('finance:write')
  create(
    @Body(new ZodValidationPipe(CreateFinanceRecord)) body: CreateFinanceRecord,
    @CurrentUser() user: SessionUser,
  ) {
    return this.finance.create(body, user);
  }
}
