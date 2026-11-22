import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connectDatabase, type Database, type ModelName, type Models } from '@nova/db';
import { ENV, type Env } from '../config/env';

/**
 * The application's MongoDB connection (Mongoose). Services inject this and use `.models`.
 *
 *   const project = await this.database.models.Project.findById(id).lean();
 *   await this.database.transaction(async () => { ... });   // every call inside joins it
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db?: Database;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit() {
    this.db = await connectDatabase(this.env.DATABASE_URL, {
      // Serverless instances each hold their own pool; keep it small there.
      maxPoolSize: process.env.VERCEL ? 5 : 20,
    });
  }

  async onModuleDestroy() {
    await this.db?.close();
  }

  get database(): Database {
    if (!this.db) throw new Error('Database used before the module initialised.');
    return this.db;
  }

  get models(): Models {
    return this.database.models;
  }

  /** Runs `fn` in a MongoDB transaction. `fn` may run more than once on a transient conflict. */
  transaction<R>(fn: () => Promise<R>): Promise<R> {
    return this.database.transaction(() => fn());
  }

  /** Locks a document for the rest of the current transaction (the former SELECT … FOR UPDATE). */
  lock(model: ModelName, id: string): Promise<boolean> {
    return this.database.lock(model, id);
  }

  /** Deletes records applying the former foreign-key rules (cascade / set null / restrict). */
  deleteCascade(model: ModelName, filter: Record<string, unknown>): Promise<number> {
    return this.database.deleteCascade(model, filter);
  }

  /** Next value of a named counter, never lower than `floor + 1`. */
  nextSequence(name: string, floor = 0): Promise<number> {
    return this.database.nextSequence(name, floor);
  }

  /** Round-trip to the server, for health checks. */
  async ping(): Promise<void> {
    await this.database.connection.db!.admin().ping();
  }
}
