import { Injectable } from '@nestjs/common';
import type {
  Asset,
  AssetBooking,
  CrewCall,
  Project,
  Shoot,
  Talent,
  TalentBooking,
  TeamMember,
} from '@nova/db';
import { findConflicts, type ScheduleView, type ShootView } from '@nova/shared';
import { DatabaseService } from '../../database/database.service';

interface Reservation {
  id: string;
  kind: 'asset' | 'member' | 'talent';
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
  constructor(private readonly database: DatabaseService) {}

  async reservations(): Promise<Reservation[]> {
    const { AssetBooking, CrewCall, Shoot, TalentBooking } = this.database.models;
    const cancelled = await Shoot.distinct('_id', { status: 'CANCELLED' });
    const [bookings, calls, talent] = await Promise.all([
      // Project-only bookings (no shoot) plus bookings of shoots that are not cancelled.
      AssetBooking.find({ $or: [{ shootId: null }, { shootId: { $nin: cancelled } }] })
        .populate([
          { path: 'asset' },
          { path: 'shoot', select: { title: 1 } },
          { path: 'project', select: { title: 1 } },
        ])
        .lean<
          (AssetBooking & {
            asset: Asset;
            shoot: Pick<Shoot, '_id' | 'id' | 'title'> | null;
            project: Pick<Project, '_id' | 'id' | 'title'> | null;
          })[]
        >(),
      CrewCall.find({ shootId: { $nin: cancelled } })
        .populate([{ path: 'teamMember' }, { path: 'shoot' }])
        .lean<(CrewCall & { teamMember: TeamMember; shoot: Shoot })[]>(),
      // Released artists no longer hold the date.
      TalentBooking.find({ shootId: { $nin: cancelled }, status: { $ne: 'RELEASED' } })
        .populate([{ path: 'talent', select: { name: 1 } }, { path: 'shoot' }])
        .lean<(TalentBooking & { talent: Pick<Talent, 'name'> | null; shoot: Shoot | null })[]>(),
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
      ...talent
        .filter((t) => t.shoot && t.talent)
        .map((t) => ({
          id: t.id,
          kind: 'talent' as const,
          resourceId: t.talentId,
          resourceName: t.talent!.name,
          startsAt: t.shoot!.startsAt,
          endsAt: t.shoot!.endsAt,
          shootId: t.shootId,
          label: t.shoot!.title,
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
          talentBookingId: r.kind === 'talent' ? r.id : null,
          with: `${r.resourceName} is also booked for “${o.label}”`,
        };
        result.set(r.shootId, [...(result.get(r.shootId) ?? []), entry]);
      }
    }
    return result;
  }
}
