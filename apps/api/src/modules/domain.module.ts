import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityController } from './activity/activity.controller';
import { ClientsController } from './clients/clients.controller';
import { ClientsService } from './clients/clients.service';
import { EventsController } from './events/events.controller';
import { FinanceController } from './finance/finance.controller';
import { FinanceService } from './finance/finance.service';
import { HealthController } from './health/health.controller';
import { InsightsController } from './insights/insights.controller';
import { InsightsService } from './insights/insights.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { ReviewsController } from './reviews/reviews.controller';
import { ReviewsService } from './reviews/reviews.service';
import { ScheduleConflicts } from './schedule/schedule-conflicts';
import { ScheduleController } from './schedule/schedule.controller';
import { ScheduleService } from './schedule/schedule.service';
import { SearchController } from './search/search.controller';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { TeamController } from './team/team.controller';
import { TeamService } from './team/team.service';
import { WorkflowController } from './workflow/workflow.controller';
import { WorkflowService } from './workflow/workflow.service';

/**
 * The studio's operational domain. One module on purpose: projects, workflow, schedule, people,
 * clients and finance are facets of the same production model and reference each other freely.
 * Folder boundaries keep each facet's controller and service together.
 */
@Module({
  // The event stream re-validates sessions while it is open (SessionService).
  imports: [AuthModule],
  controllers: [
    HealthController,
    InsightsController,
    ProjectsController,
    TasksController,
    ReviewsController,
    ScheduleController,
    TeamController,
    ClientsController,
    FinanceController,
    WorkflowController,
    ActivityController,
    SearchController,
    EventsController,
  ],
  providers: [
    InsightsService,
    ProjectsService,
    TasksService,
    ReviewsService,
    ScheduleService,
    ScheduleConflicts,
    TeamService,
    ClientsService,
    FinanceService,
    WorkflowService,
  ],
  exports: [
    ProjectsService,
    TasksService,
    ReviewsService,
    ScheduleService,
    TeamService,
    ClientsService,
    InsightsService,
    FinanceService,
  ],
})
export class DomainModule {}
