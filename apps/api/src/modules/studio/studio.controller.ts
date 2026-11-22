import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AddChecklistItem,
  AddScriptVersion,
  AddShootLog,
  AddUnavailability,
  ApplyBreakdown,
  BookTalent,
  CapacityQuery,
  ComposeMessage,
  CreateBudgetLine,
  CreateScene,
  CreateScript,
  CreateTalent,
  CrewRecommendationQuery,
  DecideScript,
  InternalReviewAction,
  MessageQuery,
  NotificationListQuery,
  PreviewMessage,
  ResolveShootLog,
  SceneQuery,
  ScriptQuery,
  ShootDayQuery,
  SubmitScript,
  TalentQuery,
  TalentRecommendationQuery,
  TaskBoardQuery,
  ToggleChecklistItem,
  UpdateBudgetLine,
  UpdateMessage,
  UpdatePostProduction,
  UpdateScene,
  UpdateScript,
  UpdateShootProduction,
  UpdateTalent,
  UpdateTalentBooking,
  UpdateTemplate,
  canSeeProjectMoney,
  type SessionUser,
} from '@nova/shared';
import { z } from 'zod';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { forbidden } from '../../common/errors';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AlertsService } from './alerts.service';
import { BudgetService } from './budget.service';
import { CommsService } from './comms.service';
import { OperationsService } from './operations.service';
import { PostProductionService } from './post-production.service';
import { PreProductionService } from './preproduction.service';
import { RecommendationsService } from './recommendations.service';
import { ScriptsService } from './scripts.service';
import { ShootDayService } from './shoot-day.service';
import { TalentService } from './talent.service';

const Version = z.coerce.number().int().min(1).max(10_000);

/** Artist roster, bookings and recommendations. */
@Controller()
export class TalentController {
  constructor(
    private readonly talent: TalentService,
    private readonly recommend: RecommendationsService,
    private readonly shootDay: ShootDayService,
  ) {}

  @Get('talent')
  @RequirePermissions('workspace:read')
  list(@Query(new ZodValidationPipe(TalentQuery)) q: TalentQuery) {
    return this.talent.list(q);
  }

  @Get('talent/:id')
  @RequirePermissions('workspace:read')
  get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.talent.get(id, user);
  }

  @Post('talent')
  @RequirePermissions('schedule:write')
  create(
    @Body(new ZodValidationPipe(CreateTalent)) body: CreateTalent,
    @CurrentUser() user: SessionUser,
  ) {
    return this.talent.create(body, user);
  }

  @Patch('talent/:id')
  @RequirePermissions('schedule:write')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTalent)) body: UpdateTalent,
    @CurrentUser() user: SessionUser,
  ) {
    return this.talent.update(id, body, user);
  }

  @Post('talent/:id/unavailability')
  @RequirePermissions('schedule:write')
  block(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddUnavailability)) body: AddUnavailability,
    @CurrentUser() user: SessionUser,
  ) {
    return this.talent.addUnavailability(id, body, user);
  }

  @Delete('talent/:id/unavailability/:blockId')
  @RequirePermissions('schedule:write')
  unblock(
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.talent.removeUnavailability(id, blockId, user);
  }

  @Post('shoots/:id/talent')
  @RequirePermissions('schedule:write')
  async book(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(BookTalent)) body: BookTalent,
    @CurrentUser() user: SessionUser,
  ) {
    await this.talent.book(id, body, user);
    return this.shootDay.workspace(id, user);
  }

  @Patch('talent-bookings/:id')
  @RequirePermissions('schedule:write')
  async updateBooking(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTalentBooking)) body: UpdateTalentBooking,
    @CurrentUser() user: SessionUser,
  ) {
    const { shootId } = await this.talent.updateBooking(id, body, user);
    return this.shootDay.workspace(shootId, user);
  }

  @Delete('talent-bookings/:id')
  @RequirePermissions('schedule:write')
  async removeBooking(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const { shootId } = await this.talent.removeBooking(id, user);
    return this.shootDay.workspace(shootId, user);
  }

  @Get('shoots/:id/casting')
  @RequirePermissions('workspace:read')
  casting(@Param('id') id: string) {
    return this.recommend.castingNeeds(id);
  }

  @Get('recommendations/talent')
  @RequirePermissions('workspace:read')
  talentFor(
    @Query(new ZodValidationPipe(TalentRecommendationQuery)) q: TalentRecommendationQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.recommend.talentFor(q, user);
  }

  @Get('recommendations/crew')
  @RequirePermissions('workspace:read')
  crewFor(@Query(new ZodValidationPipe(CrewRecommendationQuery)) q: CrewRecommendationQuery) {
    return this.recommend.crewFor(q);
  }
}

/** Creative documents, versions, approvals and the scene breakdown. */
@Controller()
export class ScriptsController {
  constructor(private readonly scripts: ScriptsService) {}

  @Get('scripts')
  @RequirePermissions('workspace:read')
  list(@Query(new ZodValidationPipe(ScriptQuery)) q: ScriptQuery) {
    return this.scripts.list(q);
  }

  @Get('scripts/:id')
  @RequirePermissions('workspace:read')
  get(@Param('id') id: string) {
    return this.scripts.get(id);
  }

  @Get('scripts/:id/versions/:n')
  @RequirePermissions('workspace:read')
  version(@Param('id') id: string, @Param('n', new ZodValidationPipe(Version)) n: number) {
    return this.scripts.version(id, n);
  }

  @Post('scripts')
  @RequireAnyPermission('project:write', 'document:write')
  create(
    @Body(new ZodValidationPipe(CreateScript)) body: CreateScript,
    @CurrentUser() user: SessionUser,
  ) {
    return this.scripts.create(body, user);
  }

  @Patch('scripts/:id')
  @RequireAnyPermission('project:write', 'document:write')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateScript)) body: UpdateScript,
    @CurrentUser() user: SessionUser,
  ) {
    return this.scripts.update(id, body, user);
  }

  @Delete('scripts/:id')
  @HttpCode(204)
  @RequireAnyPermission('project:write', 'document:write')
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.scripts.remove(id, user);
  }

  @Post('scripts/:id/versions')
  @RequireAnyPermission('project:write', 'document:write')
  addVersion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddScriptVersion)) body: AddScriptVersion,
    @CurrentUser() user: SessionUser,
  ) {
    return this.scripts.addVersion(id, body, user);
  }

  @Post('scripts/:id/submit')
  @RequireAnyPermission('project:write', 'document:write')
  submit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitScript)) body: SubmitScript,
    @CurrentUser() user: SessionUser,
  ) {
    return this.scripts.submit(id, body, user);
  }

  @Post('scripts/:id/decision')
  @RequirePermissions('approval:decide')
  decide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DecideScript)) body: DecideScript,
    @CurrentUser() user: SessionUser,
  ) {
    return this.scripts.decide(id, body, user);
  }

  @Post('scripts/:id/breakdown')
  @RequirePermissions('workspace:read')
  breakdown(@Param('id') id: string) {
    return this.scripts.breakdown(id);
  }

  @Post('scripts/:id/breakdown/apply')
  @RequireAnyPermission('project:write', 'document:write')
  apply(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApplyBreakdown)) body: ApplyBreakdown,
    @CurrentUser() user: SessionUser,
  ) {
    return this.scripts.applyBreakdown(id, body, user);
  }

  @Get('scenes')
  @RequirePermissions('workspace:read')
  scenes(@Query(new ZodValidationPipe(SceneQuery)) q: SceneQuery) {
    return this.scripts.scenes(q);
  }

  @Post('scenes')
  @RequireAnyPermission('project:write', 'document:write')
  createScene(
    @Body(new ZodValidationPipe(CreateScene)) body: CreateScene,
    @CurrentUser() user: SessionUser,
  ) {
    return this.scripts.createScene(body, user);
  }

  /** Scene status (shot / dropped) is also recorded from the set, by schedulers. */
  @Patch('scenes/:id')
  @RequireAnyPermission('project:write', 'document:write', 'schedule:write')
  updateScene(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateScene)) body: UpdateScene,
    @CurrentUser() user: SessionUser,
  ) {
    return this.scripts.updateScene(id, body, user);
  }

  @Delete('scenes/:id')
  @HttpCode(204)
  @RequireAnyPermission('project:write', 'document:write')
  async removeScene(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.scripts.removeScene(id, user);
  }
}

/** Shoot-day workspace, pre-production checklists, post-production board. */
@Controller()
export class ProductionController {
  constructor(
    private readonly shootDay: ShootDayService,
    private readonly pre: PreProductionService,
    private readonly post: PostProductionService,
  ) {}

  @Get('shoot-day')
  @RequirePermissions('workspace:read')
  day(@Query(new ZodValidationPipe(ShootDayQuery)) q: ShootDayQuery) {
    return this.shootDay.day(q.date);
  }

  @Get('shoots/:id/workspace')
  @RequirePermissions('workspace:read')
  workspace(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.shootDay.workspace(id, user);
  }

  @Patch('shoots/:id/production')
  @RequirePermissions('schedule:write')
  production(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateShootProduction)) body: UpdateShootProduction,
    @CurrentUser() user: SessionUser,
  ) {
    return this.shootDay.updateProduction(id, body, user);
  }

  @Post('shoots/:id/call-sheet/publish')
  @RequirePermissions('schedule:write')
  publish(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.shootDay.publishCallSheet(id, user);
  }

  @Post('shoots/:id/checklist')
  @RequireAnyPermission('schedule:write', 'task:write')
  addItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddChecklistItem)) body: AddChecklistItem,
    @CurrentUser() user: SessionUser,
  ) {
    return this.shootDay.addChecklistItem(id, body, user);
  }

  @Patch('shoots/:id/checklist/:itemId')
  @RequireAnyPermission('schedule:write', 'task:write')
  toggle(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(ToggleChecklistItem)) body: ToggleChecklistItem,
    @CurrentUser() user: SessionUser,
  ) {
    return this.shootDay.toggleChecklistItem(id, itemId, body, user);
  }

  @Delete('shoots/:id/checklist/:itemId')
  @RequirePermissions('schedule:write')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.shootDay.removeChecklistItem(id, itemId, user);
  }

  @Post('shoots/:id/log')
  @RequireAnyPermission('schedule:write', 'task:write')
  addLog(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddShootLog)) body: AddShootLog,
    @CurrentUser() user: SessionUser,
  ) {
    return this.shootDay.addLog(id, body, user);
  }

  @Patch('shoot-log/:id')
  @RequireAnyPermission('schedule:write', 'task:write')
  resolveLog(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResolveShootLog)) body: ResolveShootLog,
    @CurrentUser() user: SessionUser,
  ) {
    return this.shootDay.resolveLog(id, body.resolved, user);
  }

  @Get('projects/:id/readiness')
  @RequirePermissions('workspace:read')
  readiness(@Param('id') id: string) {
    return this.pre.project(id);
  }

  @Get('post-production')
  @RequirePermissions('workspace:read')
  board() {
    return this.post.board();
  }

  @Patch('deliverables/:id/post')
  @RequirePermissions('project:write')
  updatePost(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePostProduction)) body: UpdatePostProduction,
    @CurrentUser() user: SessionUser,
  ) {
    return this.post.update(id, body, user);
  }

  @Post('deliverables/:id/internal-review')
  @RequirePermissions('project:write')
  internal(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(InternalReviewAction)) body: InternalReviewAction,
    @CurrentUser() user: SessionUser,
  ) {
    return this.post.internalReview(id, body, user);
  }
}

/** Client communication: messages, templates, automation settings. */
@Controller('communications')
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  @Get()
  @RequirePermissions('workspace:read')
  overview(@Query(new ZodValidationPipe(MessageQuery)) q: MessageQuery) {
    return this.comms.overview(q);
  }

  @Get('templates')
  @RequirePermissions('workspace:read')
  templates() {
    return this.comms.templates();
  }

  @Patch('templates/:id')
  @RequirePermissions('client:write')
  updateTemplate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTemplate)) body: UpdateTemplate,
    @CurrentUser() user: SessionUser,
  ) {
    return this.comms.updateTemplate(id, body, user);
  }

  @Post('preview')
  @RequirePermissions('workspace:read')
  preview(
    @Body(new ZodValidationPipe(PreviewMessage)) body: PreviewMessage,
    @CurrentUser() user: SessionUser,
  ) {
    return this.comms.preview(body, user);
  }

  @Post('dispatch-due')
  @RequirePermissions('client:write')
  async dispatch() {
    return { dispatched: await this.comms.dispatchDue(true) };
  }

  @Get(':id')
  @RequirePermissions('workspace:read')
  get(@Param('id') id: string) {
    return this.comms.get(id);
  }

  @Post()
  @RequirePermissions('client:write')
  compose(
    @Body(new ZodValidationPipe(ComposeMessage)) body: ComposeMessage,
    @CurrentUser() user: SessionUser,
  ) {
    return this.comms.compose(body, user);
  }

  @Patch(':id')
  @RequirePermissions('client:write')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMessage)) body: UpdateMessage,
    @CurrentUser() user: SessionUser,
  ) {
    return this.comms.update(id, body, user);
  }

  @Post(':id/send')
  @RequirePermissions('client:write')
  send(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.comms.send(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('client:write')
  cancel(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.comms.cancel(id, user);
  }
}

/** Budget plans, task board, capacity, reports, command centre, notification inbox. */
@Controller()
export class OperationsController {
  constructor(
    private readonly budget: BudgetService,
    private readonly ops: OperationsService,
    private readonly alerts: AlertsService,
  ) {}

  private money(user: SessionUser) {
    if (!canSeeProjectMoney(user.permissions))
      throw forbidden('Your role cannot see production costs.');
  }

  @Get('projects/:id/budget')
  @RequirePermissions('workspace:read')
  projectBudget(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    this.money(user);
    return this.budget.project(id);
  }

  @Post('projects/:id/budget-lines')
  @RequireAnyPermission('finance:write', 'project:write')
  addLine(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateBudgetLine)) body: CreateBudgetLine,
    @CurrentUser() user: SessionUser,
  ) {
    return this.budget.addLine(id, body, user);
  }

  @Patch('budget-lines/:id')
  @RequireAnyPermission('finance:write', 'project:write')
  updateLine(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBudgetLine)) body: UpdateBudgetLine,
    @CurrentUser() user: SessionUser,
  ) {
    return this.budget.updateLine(id, body, user);
  }

  @Delete('budget-lines/:id')
  @RequireAnyPermission('finance:write', 'project:write')
  removeLine(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.budget.removeLine(id, user);
  }

  @Get('task-board')
  @RequirePermissions('workspace:read')
  tasks(@Query(new ZodValidationPipe(TaskBoardQuery)) q: TaskBoardQuery) {
    return this.ops.taskBoard(q);
  }

  @Get('capacity')
  @RequirePermissions('workspace:read')
  capacity(@Query(new ZodValidationPipe(CapacityQuery)) q: CapacityQuery) {
    return this.ops.capacity(q);
  }

  @Get('reports')
  @RequirePermissions('workspace:read')
  reports(@CurrentUser() user: SessionUser) {
    return this.ops.reports(user);
  }

  @Get('command-center')
  @RequirePermissions('workspace:read')
  async command(@CurrentUser() user: SessionUser) {
    void this.alerts.sweep();
    return this.ops.commandCenter(user);
  }

  @Get('notifications/inbox')
  inbox(
    @Query(new ZodValidationPipe(NotificationListQuery)) q: NotificationListQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.alerts.inbox(user, q);
  }

  @Post('notifications/:id/unread')
  @HttpCode(204)
  async unread(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.alerts.mark(user, id, 'unread');
  }

  @Post('notifications/:id/resolve')
  @HttpCode(204)
  async resolve(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.alerts.mark(user, id, 'resolve');
  }

  @Post('notifications/:id/reopen')
  @HttpCode(204)
  async reopen(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.alerts.mark(user, id, 'reopen');
  }
}
