import { Injectable } from '@nestjs/common';
import type { Prisma } from '@nova/db';
import type {
  CreateStudioBooking,
  RangeQuery,
  SessionUser,
  StudioBookingView,
  StudioView,
  UpdateStudioBooking,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import type { Db } from '../../database/prisma.service';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { iso } from '../projects/project.mapper';

const DAY = 86_400_000;
/** Bookable hours per day used for utilisation (08:00–22:00). */
const OPEN_HOURS = 14;

const bookingInclude = {
  studio: { select: { id: true, name: true } },
  project: { select: { id: true, code: true, title: true } },
  shoot: { select: { id: true, title: true } },
  bookedBy: { select: { id: true, name: true } },
} satisfies Prisma.StudioBookingInclude;

const toBooking = (
  b: Prisma.StudioBookingGetPayload<{ include: typeof bookingInclude }>,
): StudioBookingView => ({
  id: b.id,
  studio: b.studio,
  title: b.title,
  status: b.status,
  startsAt: iso(b.startsAt),
  endsAt: iso(b.endsAt),
  notes: b.notes,
  project: b.project,
  shoot: b.shoot,
  bookedBy: b.bookedBy,
});

const fmt = (d: Date) =>
  d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Studio spaces and their bookings. Overlapping active bookings are rejected, never stored. */
@Injectable()
export class StudiosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async list(q: RangeQuery): Promise<StudioView[]> {
    const now = new Date();
    const from = q.from ?? new Date(now.getTime() - 7 * DAY);
    const to = q.to ?? new Date(now.getTime() + 28 * DAY);
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY);
    const studios = await this.prisma.db.studio.findMany({
      include: {
        bookings: {
          where: { endsAt: { gt: from }, startsAt: { lt: to } },
          include: bookingInclude,
          orderBy: { startsAt: 'asc' },
        },
      },
      orderBy: [{ location: 'asc' }, { name: 'asc' }],
    });
    return studios.map((s) => {
      const booked = s.bookings
        .filter((b) => b.status !== 'CANCELLED')
        .reduce((n, b) => {
          const start = Math.max(b.startsAt.getTime(), weekStart.getTime());
          const end = Math.min(b.endsAt.getTime(), weekEnd.getTime());
          return n + Math.max(0, end - start) / 3_600_000;
        }, 0);
      return {
        id: s.id,
        name: s.name,
        location: s.location,
        kind: s.kind,
        capacity: s.capacity,
        hourlyRate: s.hourlyRate,
        features: s.features,
        isActive: s.isActive,
        bookings: s.bookings.map(toBooking),
        utilisation: Math.round((booked / (OPEN_HOURS * 7)) * 100) / 100,
      };
    });
  }

  /** Serialises bookings per studio and rejects any overlap with an active booking. */
  private async assertFree(
    tx: Db,
    studioId: string,
    range: { startsAt: Date; endsAt: Date },
    exceptId?: string,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nova-studio-${studioId}`}))`;
    const clash = await tx.studioBooking.findFirst({
      where: {
        studioId,
        status: { not: 'CANCELLED' },
        startsAt: { lt: range.endsAt },
        endsAt: { gt: range.startsAt },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) {
      throw conflict(
        'STUDIO_CONFLICT',
        `The studio is already booked for “${clash.title}” (${fmt(clash.startsAt)} – ${fmt(clash.endsAt)}).`,
        { bookingId: clash.id },
      );
    }
  }

  async book(input: CreateStudioBooking, user: SessionUser): Promise<StudioBookingView> {
    const studio = await this.prisma.db.studio.findUnique({ where: { id: input.studioId } });
    if (!studio?.isActive) throw unprocessable('INVALID_STUDIO', 'Choose an active studio.');
    if (input.shootId) {
      const shoot = await this.prisma.db.shoot.findUnique({ where: { id: input.shootId } });
      if (!shoot) throw unprocessable('INVALID_SHOOT', 'Choose an existing shoot.');
      if (input.projectId && input.projectId !== shoot.projectId) {
        throw unprocessable('SHOOT_PROJECT_MISMATCH', 'That shoot belongs to a different project.');
      }
      input.projectId ??= shoot.projectId;
    }
    if (
      input.projectId &&
      !(await this.prisma.db.project.findUnique({ where: { id: input.projectId } }))
    ) {
      throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    }
    const booking = await this.activity.transaction(async (tx, log) => {
      await this.assertFree(tx, studio.id, input);
      const b = await tx.studioBooking.create({
        data: {
          studioId: studio.id,
          title: input.title,
          projectId: input.projectId ?? null,
          shootId: input.shootId ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: input.status,
          notes: input.notes,
          bookedById: user.id,
        },
        include: bookingInclude,
      });
      await log({
        actorId: user.id,
        action: 'studio.booked',
        entityType: 'studio_booking',
        entityId: b.id,
        projectId: b.projectId,
        summary: `${user.name} booked ${studio.name} for “${b.title}” (${fmt(b.startsAt)})${b.status === 'TENTATIVE' ? ' — tentative' : ''}`,
      });
      return b;
    });
    return toBooking(booking);
  }

  async update(
    id: string,
    input: UpdateStudioBooking,
    user: SessionUser,
  ): Promise<StudioBookingView> {
    const b = await this.prisma.db.studioBooking.findUnique({
      where: { id },
      include: { studio: true },
    });
    if (!b) throw notFound('Studio booking');
    if (b.status === 'CANCELLED') throw conflict('BOOKING_CANCELLED', 'This booking is cancelled.');
    const startsAt = input.startsAt ?? b.startsAt;
    const endsAt = input.endsAt ?? b.endsAt;
    if (endsAt <= startsAt)
      throw unprocessable('INVALID_RANGE', 'The booking must end after it starts.');
    const updated = await this.activity.transaction(async (tx, log) => {
      if (input.status !== 'CANCELLED')
        await this.assertFree(tx, b.studioId, { startsAt, endsAt }, id);
      const next = await tx.studioBooking.update({
        where: { id },
        data: { status: input.status, startsAt, endsAt, notes: input.notes },
        include: bookingInclude,
      });
      await log({
        actorId: user.id,
        action: input.status === 'CANCELLED' ? 'studio.cancelled' : 'studio.updated',
        entityType: 'studio_booking',
        entityId: id,
        projectId: b.projectId,
        summary:
          input.status === 'CANCELLED'
            ? `${user.name} cancelled ${b.studio.name} booking “${b.title}”`
            : `${user.name} updated ${b.studio.name} booking “${b.title}”${input.status === 'CONFIRMED' && b.status === 'TENTATIVE' ? ' — confirmed' : ''}`,
      });
      return next;
    });
    return toBooking(updated);
  }
}
