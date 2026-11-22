import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { AddDependency, CreateTask, UpdateTask, type SessionUser } from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get(':id')
  @RequirePermissions('workspace:read')
  get(@Param('id') id: string) {
    return this.tasks.get(id);
  }

  @Post()
  @RequirePermissions('task:write')
  create(
    @Body(new ZodValidationPipe(CreateTask)) body: CreateTask,
    @CurrentUser() user: SessionUser,
  ) {
    return this.tasks.create(body, user);
  }

  @Patch(':id')
  @RequirePermissions('task:write')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTask)) body: UpdateTask,
    @CurrentUser() user: SessionUser,
  ) {
    return this.tasks.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('task:write')
  remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.tasks.remove(id, user);
  }

  @Post(':id/dependencies')
  @RequirePermissions('task:write')
  addDependency(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddDependency)) body: AddDependency,
    @CurrentUser() user: SessionUser,
  ) {
    return this.tasks.addDependency(id, body, user);
  }

  @Delete(':id/dependencies/:dependsOnId')
  @RequirePermissions('task:write')
  removeDependency(
    @Param('id') id: string,
    @Param('dependsOnId') dependsOnId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.tasks.removeDependency(id, dependsOnId, user);
  }
}
