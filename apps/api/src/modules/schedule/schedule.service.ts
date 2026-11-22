import { Injectable } from '@nestjs/common';
import {
  clashesWith,
  DAY_MS,
  leaveOverlaps,
  rangesOverlap,
  STUDIO_LOCATION_LABELS,
  type AssetView,
  type BookAsset,
  type CallCrew,
  type CreateShoot,
  type RangeQuery,
  type ScheduleView,
  type SessionUser,
  type ShootView,
  type UpdateAsset,
  type UpdateShoot,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { iso, shootInclude, toShootView } from '../projects/project.mapper';
import { ScheduleConflicts } from './schedule-conflicts';

const fmt = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly conflicts: ScheduleConflicts,
  ) {}

  private window(query: RangeQuery) {
    const from = query.from ?? new Date(Date.now() - 3 * DAY_MS);
    const to = query.to ?? new Date(from.getTime() + 24 * DAY_MS);
    return { from, to };
  }

  async view(query: RangeQuery): Promise<ScheduleView> {
    const { from, to } = this.window(query);
    const [shoots, assets, conflicts] = await Promise.all([
      this.prisma.db.shoot.findMany({
        where: { startsAt: { lt: to }, endsAt: { gt: from } },
        include: shootInclude,
        orderBy: { startsAt: 'asc' },
      }),
      this.assets({ from, to }),
      this.conflicts.all(from, to),
    ]);
    const perShoot = await this.conflicts.forShoots(shoots.map((s) => s.id));
    return {
      from: iso(from),
      to: iso(to),
      shoots: shoots.map((s) => toShootView(s, perShoot.get(s.id))),
      assets,
      conflicts,
    };
  }

  async assets(query: RangeQuery): Promise<AssetView[]> {
    const { from, to } = this.window(query);
    const [assets, conflicts] = await Promise.all([
      this.prisma.db.asset.findMany({
        include: {
          bookings: {
            where: { startsAt: { lt: to }, endsAt: { gt: from } },
            include: {
              shoot: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  project: { select: { id: true, code: true, title: true } },
                },
              },
              project: { select: { id: true, code: true, title: true } },
            },
            orderBy: { startsAt: 'asc' },
          },
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      this.conflicts.all(),
    ]);
    const conflicted = new Set(conflicts.flatMap((c) => c.bookingIds));
    return assets.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      serialTag: a.serialTag,
      homeLocation: a.homeLocation,
      status: a.status,
      dailyRate: a.dailyRate,
      notes: a.notes,
      bookings: a.bookings
        .filter((b) => b.shoot?.status !== 'CANCELLED')
        .map((b) => ({
          id: b.id,
          startsAt: iso(b.startsAt),
          endsAt: iso(b.endsAt),
          shoot: b.shoot ? { id: b.shoot.id, title: b.shoot.title } : null,
          project: b.project ?? b.shoot?.project ?? null,
          conflict: conflicted.has(b.id),
        })),
    }));
  }

  async getShoot(id: string): Promise<ShootView> {
    const shoot = await this.prisma.db.shoot.findUnique({ where: { id }, include: shootInclude });
    if (!shoot) throw notFound('Shoot');
    const conflicts = await this.conflicts.forShoots([id]);
    return toShootView(shoot, conflicts.get(id));
  }

  async createShoot(input: CreateShoot, user: SessionUser): Promise<ShootView> {
    const project = await this.prisma.db.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    const row = await this.prisma.db.$transaction(async (tx) => {
      const shoot = await tx.shoot.create({ data: input });
      const log = await this.activity.record(tx, {
        actorId: user.id,
        action: 'shoot.created',
        entityType: 'shoot',
        entityId: shoot.id,
        projectId: project.id,
        summary: `${user.name} scheduled “${shoot.title}” for ${project.title} on ${fmt(shoot.startsAt)} in ${STUDIO_LOCATION_LABELS[shoot.city]}`,
      });
      return { shoot, log };
    });
    this.activity.publish(row.log);
    return this.getShoot(row.shoot.id);
  }

  async updateShoot(id: string, input: UpdateShoot, user: SessionUser): Promise<ShootView> {
    const before = await this.prisma.db.shoot.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!before) throw notFound('Shoot');
    const startsAt = input.startsAt ?? before.startsAt;
    const endsAt = input.endsAt ?? before.endsAt;
    if (endsAt <= startsAt)
      throw unprocessable('INVALID_RANGE', 'The shoot must end after it starts.');

    // Moving a shoot (or reviving a cancelled one) moves its equipment and crew with it. That
    // must not silently create double bookings which booking them one by one would have refused.
    const moved =
      startsAt.getTime() !== before.startsAt.getTime() ||
      endsAt.getTime() !== before.endsAt.getTime();
    const revived =
      before.status === 'CANCELLED' && input.status !== undefined && input.status !== 'CANCELLED';
    const staysCancelled = (input.status ?? before.status) === 'CANCELLED';
    if ((moved || revived) && !staysCancelled) {
      const clashes = await this.newClashes(id, before, { startsAt, endsAt }, revived);
      if (clashes.length > 0) {
        throw conflict(
          'SHOOT_CONFLICT',
          `That time double-books ${clashes.slice(0, 3).join(', ')}${clashes.length > 3 ? ` and ${clashes.length - 3} more` : ''}. Release them from this shoot first, or choose another time.`,
          { resources: clashes },
        );
      }
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.shoot.update({ where: { id }, data: input });
      // Equipment bookings follow the shoot's time window.
      if (input.startsAt || input.endsAt) {
        await tx.assetBooking.updateMany({ where: { shootId: id }, data: { startsAt, endsAt } });
      }
      return this.activity.record(tx, {
        actorId: user.id,
        action: input.status === 'CANCELLED' ? 'shoot.cancelled' : 'shoot.updated',
        entityType: 'shoot',
        entityId: id,
        projectId: before.projectId,
        summary:
          input.status && input.status !== before.status
            ? `${user.name} marked “${before.title}” as ${input.status.toLowerCase()}`
            : `${user.name} updated “${before.title}”`,
      });
    });
    this.activity.publish(row);
    return this.getShoot(id);
  }

  /**
   * Equipment and crew of `shootId` that would be double-booked in `window` but are not already
   * (overlaps the scheduler acknowledged earlier stay acknowledged). For a shoot being revived
   * from cancelled, every overlap is new.
   */
  private async newClashes(
    shootId: string,
    current: { startsAt: Date; endsAt: Date },
    window: { startsAt: Date; endsAt: Date },
    revived: boolean,
  ): Promise<string[]> {
    const [bookings, calls] = await Promise.all([
      this.prisma.db.assetBooking.findMany({
        where: { shootId },
        include: {
          asset: {
            include: {
              bookings: {
                where: {
                  NOT: { shootId },
                  OR: [{ shootId: null }, { shoot: { status: { not: 'CANCELLED' } } }],
                },
              },
            },
          },
        },
      }),
      this.prisma.db.crewCall.findMany({
        where: { shootId },
        include: {
          teamMember: {
            include: {
              crewCalls: {
                where: { NOT: { shootId }, shoot: { status: { not: 'CANCELLED' } } },
                include: { shoot: { select: { startsAt: true, endsAt: true } } },
              },
            },
          },
        },
      }),
    ]);
    const isNew = (other: { startsAt: Date; endsAt: Date }) =>
      rangesOverlap(other, window) && (revived || !rangesOverlap(other, current));
    return [
      ...bookings.filter((b) => b.asset.bookings.some(isNew)).map((b) => b.asset.name),
      ...calls
        .filter((c) => c.teamMember.crewCalls.some((o) => isNew(o.shoot)))
        .map((c) => c.teamMember.name),
    ];
  }

  /** Equipment and crew can only be added to a shoot that is still going to happen. */
  private assertOpen(shoot: { title: string; status: string }) {
    if (shoot.status === 'CANCELLED' || shoot.status === 'WRAPPED') {
      throw unprocessable(
        'SHOOT_CLOSED',
        `“${shoot.title}” is ${shoot.status.toLowerCase()}; nothing more can be booked for it.`,
      );
    }
  }

  /** Books equipment for a shoot. Overlaps are rejected unless explicitly allowed. */
  async bookAsset(shootId: string, input: BookAsset, user: SessionUser): Promise<ShootView> {
    const shoot = await this.prisma.db.shoot.findUnique({ where: { id: shootId } });
    if (!shoot) throw notFound('Shoot');
    this.assertOpen(shoot);
    const asset = await this.prisma.db.asset.findUnique({
      where: { id: input.assetId },
      include: {
        bookings: {
          include: {
            shoot: { select: { title: true, status: true } },
            project: { select: { title: true } },
          },
        },
      },
    });
    if (!asset) throw unprocessable('INVALID_ASSET', 'Choose an existing asset.');
    if (asset.status !== 'AVAILABLE') {
      throw conflict(
        'ASSET_UNAVAILABLE',
        `${asset.name} is ${asset.status.toLowerCase()} and cannot be booked.`,
      );
    }
    if (asset.bookings.some((b) => b.shootId === shootId)) {
      throw conflict('ALREADY_BOOKED', `${asset.name} is already booked for this shoot.`);
    }
    const active = asset.bookings.filter((b) => b.shoot?.status !== 'CANCELLED');
    const clashes = clashesWith(
      active.map((b) => ({
        id: b.id,
        resourceId: asset.id,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
      })),
      { resourceId: asset.id, startsAt: shoot.startsAt, endsAt: shoot.endsAt },
    );
    if (clashes.length > 0 && !input.allowOverlap) {
      const other = active.find((b) => b.id === clashes[0]!.id)!;
      throw conflict(
        'BOOKING_CONFLICT',
        `${asset.name} is already booked for “${other.shoot?.title ?? other.project?.title ?? 'another booking'}” at that time.`,
        {
          bookingIds: clashes.map((c) => c.id),
        },
      );
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.assetBooking.create({
        data: { assetId: asset.id, shootId, startsAt: shoot.startsAt, endsAt: shoot.endsAt },
      });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'asset.booked',
        entityType: 'asset',
        entityId: asset.id,
        projectId: shoot.projectId,
        summary: `${user.name} booked ${asset.name} for “${shoot.title}”${clashes.length ? ' (overlap acknowledged)' : ''}`,
      });
    });
    this.activity.publish(row);
    return this.getShoot(shootId);
  }

  async removeBooking(shootId: string, bookingId: string, user: SessionUser): Promise<ShootView> {
    const booking = await this.prisma.db.assetBooking.findFirst({
      where: { id: bookingId, shootId },
      include: { asset: true, shoot: true },
    });
    if (!booking) throw notFound('Booking');
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.assetBooking.delete({ where: { id: bookingId } });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'asset.released',
        entityType: 'asset',
        entityId: booking.assetId,
        projectId: booking.shoot!.projectId,
        summary: `${user.name} released ${booking.asset.name} from “${booking.shoot!.title}”`,
      });
    });
    this.activity.publish(row);
    return this.getShoot(shootId);
  }

  async callCrew(shootId: string, input: CallCrew, user: SessionUser): Promise<ShootView> {
    const shoot = await this.prisma.db.shoot.findUnique({ where: { id: shootId } });
    if (!shoot) throw notFound('Shoot');
    this.assertOpen(shoot);
    const member = await this.prisma.db.teamMember.findUnique({
      where: { id: input.teamMemberId },
      include: { crewCalls: { include: { shoot: true } } },
    });
    if (!member) throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    if (!member.isActive) {
      throw unprocessable('MEMBER_INACTIVE', `${member.name} is no longer on the team.`);
    }
    if (member.crewCalls.some((c) => c.shootId === shootId)) {
      throw conflict('ALREADY_CALLED', `${member.name} is already on this shoot.`);
    }
    const clash = member.crewCalls.find(
      (c) => c.shoot.status !== 'CANCELLED' && rangesOverlap(c.shoot, shoot),
    );
    if (clash && !input.allowOverlap) {
      throw conflict(
        'CREW_CONFLICT',
        `${member.name} is already called to “${clash.shoot.title}” at that time.`,
      );
    }
    // Approved leave is a scheduling constraint, like a double booking.
    // The query is a coarse pre-filter (a day of slack); every candidate is then tested exactly.
    const leaves = await this.prisma.db.leaveRequest.findMany({
      where: {
        teamMemberId: member.id,
        status: 'APPROVED',
        startDate: { lte: shoot.endsAt },
        endDate: { gte: new Date(shoot.startsAt.getTime() - 24 * 3600 * 1000) },
      },
    });
    if (leaves.some((leave) => leaveOverlaps(leave, shoot)) && !input.allowOverlap) {
      throw conflict('CREW_ON_LEAVE', `${member.name} is on approved leave during this shoot.`);
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.crewCall.create({ data: { shootId, teamMemberId: member.id, role: input.role } });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'crew.called',
        entityType: 'member',
        entityId: member.id,
        projectId: shoot.projectId,
        summary: `${user.name} called ${member.name} to “${shoot.title}” as ${input.role}`,
      });
    });
    this.activity.publish(row);
    return this.getShoot(shootId);
  }

  async removeCrew(shootId: string, crewCallId: string, user: SessionUser): Promise<ShootView> {
    const call = await this.prisma.db.crewCall.findFirst({
      where: { id: crewCallId, shootId },
      include: { teamMember: true, shoot: true },
    });
    if (!call) throw notFound('Crew call');
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.crewCall.delete({ where: { id: crewCallId } });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'crew.released',
        entityType: 'member',
        entityId: call.teamMemberId,
        projectId: call.shoot.projectId,
        summary: `${user.name} released ${call.teamMember.name} from “${call.shoot.title}”`,
      });
    });
    this.activity.publish(row);
    return this.getShoot(shootId);
  }

  async updateAsset(id: string, input: UpdateAsset, user: SessionUser) {
    const asset = await this.prisma.db.asset.findUnique({ where: { id } });
    if (!asset) throw notFound('Asset');
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.asset.update({ where: { id }, data: input });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'asset.updated',
        entityType: 'asset',
        entityId: id,
        summary:
          input.status && input.status !== asset.status
            ? `${user.name} set ${asset.name} to ${input.status.toLowerCase()}`
            : `${user.name} updated ${asset.name}`,
      });
    });
    this.activity.publish(row);
    const [view] = (await this.assets({})).filter((a) => a.id === id);
    return view!;
  }
}
