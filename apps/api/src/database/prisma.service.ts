import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@nova/db';
import { ENV, type Env } from '../config/env';

/**
 * Exposes a single Prisma client to the application. Services inject this and use `.db`.
 * Composition (rather than extending PrismaClient) keeps the driver-adapter setup in @nova/db.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.db = createPrismaClient(env.DATABASE_URL);
  }

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}

/** Prisma client or interactive-transaction client; both expose the same model delegates. */
export type Db = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
