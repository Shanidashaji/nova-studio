import { Controller, OnModuleDestroy, Req, Res, Get } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Permission } from '@nova/shared';
import type { Response } from 'express';
import { SESSION_COOKIE, SessionService } from '../../auth/session.service';
import { RequirePermissions, type AuthedRequest } from '../../common/decorators';
import { canSeeActivity } from '../activity/activity-visibility';
import { ACTIVITY_EVENT, type ActivityEvent } from '../activity/activity.service';

interface Client {
  res: Response;
  token: string;
  permissions: readonly Permission[];
}

/**
 * Server-Sent Events stream (ADR-0006). Each committed activity row is pushed to the connected
 * workspaces, which refresh the affected queries.
 *
 * The stream obeys the same visibility rule as the audit trail: a client receives the row itself
 * only when its user may read that kind of record. Everyone else gets a bare `refresh` event, so
 * their own views still update without the summary (amounts, names) leaving the server.
 *
 * A stream outlives the request that opened it, so the session is re-checked on every heartbeat:
 * a signed-out, deactivated or expired user is disconnected within one interval.
 */
@Controller('events')
export class EventsController implements OnModuleDestroy {
  private readonly clients = new Set<Client>();

  constructor(
    events: EventEmitter2,
    private readonly sessions: SessionService,
  ) {
    events.on(ACTIVITY_EVENT, (activity: ActivityEvent) => this.broadcast(activity));
  }

  @Get()
  @RequirePermissions('workspace:read')
  stream(@Req() req: AuthedRequest, @Res() res: Response) {
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

    const client: Client = {
      res,
      token: (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE] ?? '',
      permissions: req.user?.permissions ?? [],
    };
    this.clients.add(client);

    // The comment keeps proxies from closing an idle connection; the session check keeps a
    // revoked session from listening on.
    const heartbeat = setInterval(() => void this.beat(client), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(client);
    });
  }

  private async beat(client: Client) {
    try {
      const resolved = await this.sessions.resolve(client.token);
      if (!resolved || !resolved.user.permissions.includes('workspace:read')) {
        client.res.end();
        return;
      }
      client.permissions = resolved.user.permissions;
      client.res.write(': keep-alive\n\n');
    } catch {
      // A database hiccup must not drop every live connection; the next beat checks again.
      client.res.write(': keep-alive\n\n');
    }
  }

  private broadcast(activity: ActivityEvent) {
    const full = `event: activity\nid: ${activity.id}\ndata: ${JSON.stringify({
      id: activity.id,
      action: activity.action,
      entityType: activity.entityType,
      entityId: activity.entityId,
      projectId: activity.projectId,
      summary: activity.summary,
      createdAt: activity.createdAt,
    })}\n\n`;
    const bare = `event: refresh\nid: ${activity.id}\ndata: {}\n\n`;
    for (const client of this.clients) {
      client.res.write(canSeeActivity(client.permissions, activity.entityType) ? full : bare);
    }
  }

  onModuleDestroy() {
    for (const client of this.clients) client.res.end();
    this.clients.clear();
  }
}
