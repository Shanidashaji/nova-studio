import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { DatabaseService } from '../../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  /** Liveness plus a database round-trip. */
  @Public()
  @Get()
  async check() {
    await this.database.ping();
    return { status: 'ok', database: 'ok', time: new Date().toISOString() };
  }
}
