import { Controller, Get, Param } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators';
import { TeamService } from './team.service';

@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @RequirePermissions('workspace:read')
  list() {
    return this.team.list();
  }

  @Get(':id')
  @RequirePermissions('workspace:read')
  get(@Param('id') id: string) {
    return this.team.get(id);
  }
}
