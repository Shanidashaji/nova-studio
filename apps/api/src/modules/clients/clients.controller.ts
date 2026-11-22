import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  CreateClient,
  CreateLead,
  LogInteraction,
  UpdateLead,
  type SessionUser,
} from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ClientsService } from './clients.service';

@Controller()
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get('clients')
  @RequirePermissions('workspace:read')
  list(@CurrentUser() user: SessionUser) {
    return this.clients.list(user);
  }

  @Get('clients/:id')
  @RequirePermissions('workspace:read')
  get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.clients.get(id, user);
  }

  @Post('clients')
  @RequirePermissions('client:write')
  create(
    @Body(new ZodValidationPipe(CreateClient)) body: CreateClient,
    @CurrentUser() user: SessionUser,
  ) {
    return this.clients.create(body, user);
  }

  @Post('clients/:id/interactions')
  @RequirePermissions('client:write')
  log(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LogInteraction)) body: LogInteraction,
    @CurrentUser() user: SessionUser,
  ) {
    return this.clients.logInteraction(id, body, user);
  }

  @Get('leads')
  @RequirePermissions('workspace:read')
  leads() {
    return this.clients.leads();
  }

  @Post('leads')
  @RequirePermissions('sales:write')
  createLead(
    @Body(new ZodValidationPipe(CreateLead)) body: CreateLead,
    @CurrentUser() user: SessionUser,
  ) {
    return this.clients.createLead(body, user);
  }

  @Patch('leads/:id')
  @RequirePermissions('sales:write')
  updateLead(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateLead)) body: UpdateLead,
    @CurrentUser() user: SessionUser,
  ) {
    return this.clients.updateLead(id, body, user);
  }
}
