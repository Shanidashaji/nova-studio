import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators';
import { InsightsService } from './insights.service';

@Controller('workspace')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** The operational picture for the Pulse lens and the Pipeline Spine. */
  @Get('pulse')
  @RequirePermissions('workspace:read')
  pulse() {
    return this.insights.pulse();
  }
}
