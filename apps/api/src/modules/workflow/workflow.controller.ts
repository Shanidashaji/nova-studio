import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateWorkflowTemplate, UpdateStageDefinition, type SessionUser } from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { WorkflowService } from './workflow.service';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflows: WorkflowService) {}

  @Get()
  @RequirePermissions('workspace:read')
  list() {
    return this.workflows.list();
  }

  @Post()
  @RequirePermissions('workflow:manage')
  create(
    @Body(new ZodValidationPipe(CreateWorkflowTemplate)) body: CreateWorkflowTemplate,
    @CurrentUser() user: SessionUser,
  ) {
    return this.workflows.create(body, user);
  }

  @Patch('stages/:id')
  @RequirePermissions('workflow:manage')
  updateStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStageDefinition)) body: UpdateStageDefinition,
    @CurrentUser() user: SessionUser,
  ) {
    return this.workflows.updateStage(id, body, user);
  }
}
