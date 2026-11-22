import { Module } from '@nestjs/common';
import { DomainModule } from '../domain.module';
import { AlertsService } from './alerts.service';
import { BudgetService } from './budget.service';
import { CommsAutomation } from './comms.automation';
import { CommsService } from './comms.service';
import { OperationsService } from './operations.service';
import { PostProductionService } from './post-production.service';
import { PreProductionService } from './preproduction.service';
import { RecommendationsService } from './recommendations.service';
import { ScriptsService } from './scripts.service';
import { ShootDayService } from './shoot-day.service';
import {
  CommsController,
  OperationsController,
  ProductionController,
  ScriptsController,
  TalentController,
} from './studio.controller';
import { TalentService } from './talent.service';

/**
 * The production-studio layer on top of the operational core: artists, creative documents and
 * scene breakdown, shoot-day operations, client communication automation, budget plans, the
 * post-production board, capacity planning, reports, the command centre and smart alerts.
 */
@Module({
  imports: [DomainModule],
  controllers: [
    TalentController,
    ScriptsController,
    ProductionController,
    CommsController,
    OperationsController,
  ],
  providers: [
    TalentService,
    RecommendationsService,
    ScriptsService,
    ShootDayService,
    CommsService,
    CommsAutomation,
    BudgetService,
    PostProductionService,
    PreProductionService,
    OperationsService,
    AlertsService,
  ],
  exports: [OperationsService, ShootDayService, TalentService, ScriptsService, CommsService],
})
export class StudioModule {}
