import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ActivitySource, EntityType } from '@nova/shared';
import { DatabaseService } from '../../database/database.service';

export interface ActivityInput {
  actorId: string | null;
  source?: ActivitySource;
  action: string;
  entityType: EntityType | 'auth';
  entityId: string;
  projectId?: string | null;
  summary: string;
  metadata?: unknown;
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
    private readonly database: DatabaseService,
    private readonly events: EventEmitter2,
  ) {}

  /** Inserts an activity row; joins the surrounding transaction when there is one. */
  async record(input: ActivityInput): Promise<ActivityEvent> {
    const doc = await this.database.models.ActivityLog.create({
      actorId: input.actorId,
      source: input.source ?? 'UI',
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId ?? null,
      summary: input.summary,
      metadata: input.metadata ?? null,
    });
    return {
      id: doc.id,
      action: doc.action,
      entityType: doc.entityType,
      entityId: doc.entityId,
      projectId: doc.projectId,
      summary: doc.summary,
      createdAt: doc.createdAt,
    };
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
    fn: (log: (input: ActivityInput) => Promise<void>) => Promise<T>,
  ): Promise<T> {
    let rows: ActivityEvent[] = [];
    const result = await this.database.transaction(() => {
      rows = []; // MongoDB may retry the whole transaction; keep only the committed attempt's rows.
      return fn(async (input) => {
        rows.push(await this.record(input));
      });
    });
    for (const row of rows) this.publish(row);
    return result;
  }

  /** Records outside a transaction and publishes immediately. */
  async log(input: ActivityInput) {
    const row = await this.record(input);
    this.publish(row);
    return row;
  }
}
