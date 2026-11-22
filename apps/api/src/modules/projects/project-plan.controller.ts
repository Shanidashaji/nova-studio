import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  ConvertLead,
  CreateContact,
  CreateMilestone,
  UpdateLeadOwnership,
  UpdateMilestone,
  UpsertRisk,
  type SessionUser,
} from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CrmService } from '../clients/crm.service';
import { ProjectPlanService } from './project-plan.service';

/** Project plan (milestones, risks) and CRM additions (contacts, lead ownership, conversion). */
@Controller()
export class ProjectPlanController {
  constructor(
    private readonly plan: ProjectPlanService,
    private readonly crm: CrmService,
  ) {}

  @Get('projects/:id/milestones')
  @RequirePermissions('workspace:read')
  milestones(@Param('id') id: string) {
    return this.plan.milestones(id);
  }

  @Post('projects/:id/milestones')
  @RequirePermissions('project:write')
  addMilestone(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateMilestone)) body: CreateMilestone,
    @CurrentUser() user: SessionUser,
  ) {
    return this.plan.addMilestone(id, body, user);
  }

  @Patch('projects/:id/milestones/:milestoneId')
  @RequirePermissions('project:write')
  updateMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body(new ZodValidationPipe(UpdateMilestone)) body: UpdateMilestone,
    @CurrentUser() user: SessionUser,
  ) {
    return this.plan.updateMilestone(id, milestoneId, body, user);
  }

  @Get('projects/:id/risks')
  @RequirePermissions('workspace:read')
  risks(@Param('id') id: string) {
    return this.plan.risks(id);
  }

  @Post('projects/:id/risks')
  @RequirePermissions('project:write')
  addRisk(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertRisk)) body: UpsertRisk,
    @CurrentUser() user: SessionUser,
  ) {
    return this.plan.upsertRisk(id, null, body, user);
  }

  @Put('projects/:id/risks/:riskId')
  @RequirePermissions('project:write')
  updateRisk(
    @Param('id') id: string,
    @Param('riskId') riskId: string,
    @Body(new ZodValidationPipe(UpsertRisk)) body: UpsertRisk,
    @CurrentUser() user: SessionUser,
  ) {
    return this.plan.upsertRisk(id, riskId, body, user);
  }

  // ── CRM ───────────────────────────────────────────────────────────────────

  @Get('clients/:id/contacts')
  @RequirePermissions('workspace:read')
  contacts(@Param('id') id: string) {
    return this.crm.contacts(id);
  }

  @Post('clients/:id/contacts')
  @RequirePermissions('client:write')
  addContact(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateContact)) body: CreateContact,
    @CurrentUser() user: SessionUser,
  ) {
    return this.crm.addContact(id, body, user);
  }

  @Delete('clients/:id/contacts/:contactId')
  @RequirePermissions('client:write')
  removeContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.crm.removeContact(id, contactId, user);
  }

  @Patch('leads/:id/ownership')
  @RequirePermissions('sales:write')
  ownership(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateLeadOwnership)) body: UpdateLeadOwnership,
    @CurrentUser() user: SessionUser,
  ) {
    return this.crm.updateOwnership(id, body, user);
  }

  @Post('leads/:id/convert')
  @RequirePermissions('sales:write', 'project:write')
  convert(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConvertLead)) body: ConvertLead,
    @CurrentUser() user: SessionUser,
  ) {
    return this.crm.convert(id, body, user);
  }
}
