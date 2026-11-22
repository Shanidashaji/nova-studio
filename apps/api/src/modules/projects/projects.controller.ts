import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateProject,
  ProjectListQuery,
  TransitionRequest,
  UpdateProject,
  type SessionUser,
} from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions('workspace:read')
  list(@Query(new ZodValidationPipe(ProjectListQuery)) query: ProjectListQuery) {
    return this.projects.list(query);
  }

  @Get(':id')
  @RequirePermissions('workspace:read')
  get(@Param('id') id: string) {
    return this.projects.get(id);
  }

  @Post()
  @RequirePermissions('project:write')
  create(
    @Body(new ZodValidationPipe(CreateProject)) body: CreateProject,
    @CurrentUser() user: SessionUser,
  ) {
    return this.projects.create(body, user);
  }

  @Patch(':id')
  @RequirePermissions('project:write')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProject)) body: UpdateProject,
    @CurrentUser() user: SessionUser,
  ) {
    return this.projects.update(id, body, user);
  }

  @Post(':id/transitions')
  @RequirePermissions('workflow:transition')
  transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TransitionRequest)) body: TransitionRequest,
    @CurrentUser() user: SessionUser,
  ) {
    return this.projects.transition(id, body, user);
  }

  @Post(':id/stages/:stageId/skip')
  @RequirePermissions('workflow:transition')
  skip(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.projects.skipStage(id, stageId, user);
  }
}
