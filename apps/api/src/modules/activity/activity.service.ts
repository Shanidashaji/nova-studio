import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ActivitySource, EntityType } from '@nova/shared';
import type { Prisma } from '@nova/db';
import { PrismaService, type Db } from '../../database/prisma.service';

export interface ActivityInput {
  actorId: string | null;
  source?: ActivitySource;
  action: string;
  entityType: EntityType | 'auth';
  entityId: string;
  projectId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ActivityEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  summary: string;
  createdAt: Date;
}

/** Name of the in-process event emitted after an activity row is committed. */
export const ACTIVITY_EVENT = 'activity.recorded';

/**
 * Append-only audit trail. Domain services call `record()` inside the same transaction as the
 * change it describes, then `publish()` after commit so live clients refresh.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  record(db: Db, input: ActivityInput) {
    return db.activityLog.create({
      data: {
        actorId: input.actorId,
        source: input.source ?? 'UI',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        projectId: input.projectId ?? null,
        summary: input.summary,
        metadata: input.metadata,
      },
    });
  }

  /** Emits a committed activity row to real-time subscribers. */
  publish(activity: ActivityEvent) {
    this.events.emit(ACTIVITY_EVENT, activity);
  }

  /**
   * Runs `fn` in one database transaction. Activity recorded through `log` commits with the
   * change and is published to live clients only after the commit succeeds.
   */
  async transaction<T>(
    fn: (tx: Db, log: (input: ActivityInput) => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const rows: ActivityEvent[] = [];
    const result = await this.prisma.db.$transaction(
      (tx) =>
        fn(tx, async (input) => {
          rows.push(await this.record(tx, input));
        }),
      { timeout: 15_000 },
    );
    for (const row of rows) this.publish(row);
    return result;
  }

  /** Records outside a transaction and publishes immediately. */
  async log(input: ActivityInput) {
    const row = await this.record(this.prisma.db, input);
    this.publish(row);
    return row;
  }
}
