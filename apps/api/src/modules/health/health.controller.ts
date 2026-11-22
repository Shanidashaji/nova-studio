import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness plus a database round-trip. */
  @Public()
  @Get()
  async check() {
    await this.prisma.db.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok', time: new Date().toISOString() };
  }
}
