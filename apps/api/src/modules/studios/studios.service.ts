import { Injectable } from '@nestjs/common';
import {
  StudioLocation,
  type PopulateOptions,
  type Project,
  type Shoot,
  type Studio,
  type StudioBooking,
  type User,
} from '@nova/db';
import type {
  CreateStudioBooking,
  RangeQuery,
  SessionUser,
  StudioBookingView,
  StudioView,
  UpdateStudioBooking,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { iso } from '../projects/project.mapper';

const DAY = 86_400_000;
/** Bookable hours per day used for utilisation (08:00–22:00). */
const OPEN_HOURS = 14;

const bookingPopulate: PopulateOptions[] = [
  { path: 'studio', select: { name: 1 } },
  { path: 'project', select: { code: 1, title: 1 } },
  { path: 'shoot', select: { title: 1 } },
  { path: 'bookedBy', select: { name: 1 } },
];

type BookingRow = StudioBooking & {
  studio: Pick<Studio, '_id' | 'id' | 'name'>;
  project: Pick<Project, '_id' | 'id' | 'code' | 'title'> | null;
  shoot: Pick<Shoot, '_id' | 'id' | 'title'> | null;
  bookedBy: Pick<User, '_id' | 'id' | 'name'> | null;
};

const toBooking = (b: BookingRow): StudioBookingView => ({
  id: b.id,
  studio: { id: b.studio.id, name: b.studio.name },
  title: b.title,
  status: b.status,
  startsAt: iso(b.startsAt),
  endsAt: iso(b.endsAt),
  notes: b.notes,
  project: b.project ? { id: b.project.id, code: b.project.code, title: b.project.title } : null,
  shoot: b.shoot ? { id: b.shoot.id, title: b.shoot.title } : null,
  bookedBy: b.bookedBy ? { id: b.bookedBy.id, name: b.bookedBy.name } : null,
});

/** Studio locations in their declared order (the former Postgres enum sort order). */
const LOCATION_ORDER: readonly string[] = Object.values(StudioLocation);

const fmt = (d: Date) =>
  d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Studio spaces and their bookings. Overlapping active bookings are rejected, never stored. */
@Injectable()
export class StudiosService {
  constructor(
    private readonly database: DatabaseService,
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
    const studios = await this.database.models.Studio.find()
      .populate({
        path: 'bookings',
        match: { endsAt: { $gt: from }, startsAt: { $lt: to } },
        options: { sort: { startsAt: 1 } },
        populate: bookingPopulate,
      })
      .lean<(Studio & { bookings: BookingRow[] })[]>();
    // Location in declared enum order, then name (as Postgres ordered them).
    studios.sort(
      (a, b) =>
        LOCATION_ORDER.indexOf(a.location) - LOCATION_ORDER.indexOf(b.location) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
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

  /**
   * Serialises bookings per studio and rejects any overlap with an active booking. Must be the
   * first statement of the transaction: locking the studio makes concurrent bookings of it
   * conflict, so MongoDB retries the later one, which then sees the earlier booking.
   */
  private async assertFree(
    studioId: string,
    range: { startsAt: Date; endsAt: Date },
    exceptId?: string,
  ) {
    await this.database.lock('Studio', studioId);
    const clash = await this.database.models.StudioBooking.findOne({
      studioId,
      status: { $ne: 'CANCELLED' },
      startsAt: { $lt: range.endsAt },
      endsAt: { $gt: range.startsAt },
      ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    }).lean<StudioBooking>();
    if (clash) {
      throw conflict(
        'STUDIO_CONFLICT',
        `The studio is already booked for “${clash.title}” (${fmt(clash.startsAt)} – ${fmt(clash.endsAt)}).`,
        { bookingId: clash.id },
      );
    }
  }

  async book(input: CreateStudioBooking, user: SessionUser): Promise<StudioBookingView> {
    const { Studio, Shoot, Project, StudioBooking } = this.database.models;
    const studio = await Studio.findById(input.studioId).lean<Studio>();
    if (!studio?.isActive) throw unprocessable('INVALID_STUDIO', 'Choose an active studio.');
    if (input.shootId) {
      const shoot = await Shoot.findById(input.shootId).lean<Shoot>();
      if (!shoot) throw unprocessable('INVALID_SHOOT', 'Choose an existing shoot.');
      if (input.projectId && input.projectId !== shoot.projectId) {
        throw unprocessable('SHOOT_PROJECT_MISMATCH', 'That shoot belongs to a different project.');
      }
      input.projectId ??= shoot.projectId;
    }
    if (input.projectId && !(await Project.exists({ _id: input.projectId }))) {
      throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    }
    const booking = await this.activity.transaction(async (log) => {
      await this.assertFree(studio.id, input);
      const created = await StudioBooking.create({
        studioId: studio.id,
        title: input.title,
        projectId: input.projectId ?? null,
        shootId: input.shootId ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: input.status,
        notes: input.notes,
        bookedById: user.id,
      });
      const b = await StudioBooking.findById(created._id)
        .populate(bookingPopulate)
        .lean<BookingRow>();
      if (!b) throw notFound('Studio booking');
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
    const { StudioBooking } = this.database.models;
    const b = await StudioBooking.findById(id)
      .populate('studio')
      .lean<StudioBooking & { studio: Studio }>();
    if (!b) throw notFound('Studio booking');
    if (b.status === 'CANCELLED') throw conflict('BOOKING_CANCELLED', 'This booking is cancelled.');
    const startsAt = input.startsAt ?? b.startsAt;
    const endsAt = input.endsAt ?? b.endsAt;
    if (endsAt <= startsAt)
      throw unprocessable('INVALID_RANGE', 'The booking must end after it starts.');
    const updated = await this.activity.transaction(async (log) => {
      if (input.status !== 'CANCELLED') await this.assertFree(b.studioId, { startsAt, endsAt }, id);
      const next = await StudioBooking.findByIdAndUpdate(
        id,
        { $set: { status: input.status, startsAt, endsAt, notes: input.notes } },
        { new: true },
      )
        .populate(bookingPopulate)
        .lean<BookingRow>();
      if (!next) throw notFound('Studio booking');
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
