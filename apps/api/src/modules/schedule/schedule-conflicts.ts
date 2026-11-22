import { Injectable } from '@nestjs/common';
import { findConflicts, type ScheduleView, type ShootView } from '@nova/shared';
import { PrismaService } from '../../database/prisma.service';

interface Reservation {
  id: string;
  kind: 'asset' | 'member';
  resourceId: string;
  resourceName: string;
  startsAt: Date;
  endsAt: Date;
  shootId: string | null;
  label: string;
}

/**
 * Detects double bookings of equipment and crew. Equipment bookings and crew calls (timed by
 * their shoot) are both "reservations" of a resource; overlapping reservations are conflicts.
 */
@Injectable()
export class ScheduleConflicts {
  constructor(private readonly prisma: PrismaService) {}

  async reservations(): Promise<Reservation[]> {
    const [bookings, calls] = await Promise.all([
      this.prisma.db.assetBooking.findMany({
        where: { OR: [{ shootId: null }, { shoot: { status: { not: 'CANCELLED' } } }] },
        include: {
          asset: true,
          shoot: { select: { title: true } },
          project: { select: { title: true } },
        },
      }),
      this.prisma.db.crewCall.findMany({
        where: { shoot: { status: { not: 'CANCELLED' } } },
        include: { teamMember: true, shoot: true },
      }),
    ]);
    return [
      ...bookings.map((b) => ({
        id: b.id,
        kind: 'asset' as const,
        resourceId: b.assetId,
        resourceName: b.asset.name,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        shootId: b.shootId,
        label: b.shoot?.title ?? b.project?.title ?? 'Booking',
      })),
      ...calls.map((c) => ({
        id: c.id,
        kind: 'member' as const,
        resourceId: c.teamMemberId,
        resourceName: c.teamMember.name,
        startsAt: c.shoot.startsAt,
        endsAt: c.shoot.endsAt,
        shootId: c.shootId,
        label: c.shoot.title,
      })),
    ];
  }

  /** Every overlapping pair, optionally limited to those touching a time window. */
  async all(from?: Date, to?: Date): Promise<ScheduleView['conflicts']> {
    const list = await this.reservations();
    const byId = new Map(list.map((r) => [r.id, r]));
    return (
      findConflicts(
        list.map((r) => ({
          id: r.id,
          resourceId: `${r.kind}:${r.resourceId}`,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
        })),
      )
        .map((c) => {
          const a = byId.get(c.bookingIds[0])!;
          const b = byId.get(c.bookingIds[1])!;
          const at = a.startsAt > b.startsAt ? a.startsAt : b.startsAt;
          const until = a.endsAt < b.endsAt ? a.endsAt : b.endsAt;
          return { a, at, until, ids: c.bookingIds };
        })
        // An overlap that began before the window and is still running belongs in it.
        .filter(({ at, until }) => (!from || until >= from) && (!to || at <= to))
        .map(({ a, at, ids }) => ({
          resourceType: a.kind,
          resourceId: a.resourceId,
          resourceName: a.resourceName,
          bookingIds: ids,
          at: at.toISOString(),
        }))
    );
  }

  /** Conflicts per shoot, described from that shoot's point of view. */
  async forShoots(shootIds: string[]): Promise<Map<string, ShootView['conflicts']>> {
    const result = new Map<string, ShootView['conflicts']>();
    if (shootIds.length === 0) return result;
    const list = await this.reservations();
    const byId = new Map(list.map((r) => [r.id, r]));
    const pairs = findConflicts(
      list.map((r) => ({
        id: r.id,
        resourceId: `${r.kind}:${r.resourceId}`,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
      })),
    );
    for (const pair of pairs) {
      for (const [mine, other] of [pair.bookingIds, [...pair.bookingIds].reverse()] as [
        string,
        string,
      ][]) {
        const r = byId.get(mine)!;
        const o = byId.get(other)!;
        if (!r.shootId || !shootIds.includes(r.shootId)) continue;
        const entry = {
          bookingId: r.kind === 'asset' ? r.id : null,
          crewCallId: r.kind === 'member' ? r.id : null,
          with: `${r.resourceName} is also booked for “${o.label}”`,
        };
        result.set(r.shootId, [...(result.get(r.shootId) ?? []), entry]);
      }
    }
    return result;
  }
}
