import { Injectable } from '@nestjs/common';
import type { Shoot, Talent, TalentBooking } from '@nova/db';
import {
  canSeeProjectMoney,
  rangesOverlap,
  TALENT_KIND_LABELS,
  type AddUnavailability,
  type BookTalent,
  type CreateTalent,
  type SessionUser,
  type TalentDetail,
  type TalentQuery,
  type TalentView,
  type UpdateTalent,
  type UpdateTalentBooking,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { containsI } from '../../common/query';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import {
  talentBookingPopulate,
  toTalentBookingView,
  toTalentView,
  type TalentBookingRow,
} from './studio.mapper';

const fmt = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** Inclusive whole-day unavailability as a half-open time range. */
const blockRange = (u: { from: Date; to: Date }) => ({
  startsAt: u.from,
  endsAt: new Date(u.to.getTime() + 24 * 3600 * 1000),
});

/**
 * The artist roster (actors, models, voice artists…) and their shoot bookings. Double booking
 * is refused, like crew calls and equipment: an overlapping booking on a live shoot, or a date
 * the artist marked unavailable, needs an explicit override.
 */
@Injectable()
export class TalentService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  private async stats(ids: string[]) {
    const now = new Date();
    const bookings = await this.database.models.TalentBooking.find({
      talentId: { $in: ids },
      status: { $ne: 'RELEASED' },
    })
      .populate({ path: 'shoot', select: { startsAt: 1, endsAt: 1, status: 1 } })
      .lean<(TalentBooking & { shoot: Pick<Shoot, 'startsAt' | 'endsAt' | 'status'> | null })[]>();
    const out = new Map<string, { upcoming: number; completed: number; windows: Shoot[] }>();
    for (const id of ids) out.set(id, { upcoming: 0, completed: 0, windows: [] });
    for (const b of bookings) {
      if (!b.shoot || b.shoot.status === 'CANCELLED') continue;
      const s = out.get(b.talentId)!;
      if (b.shoot.status === 'WRAPPED') s.completed++;
      else if (b.shoot.endsAt >= now) s.upcoming++;
      s.windows.push(b.shoot as Shoot);
    }
    return out;
  }

  async list(q: TalentQuery): Promise<TalentView[]> {
    const where: Record<string, unknown> = {};
    if (q.includeInactive !== 'true') where.isActive = true;
    if (q.kind) where.kind = q.kind;
    if (q.q) {
      const c = containsI(q.q);
      where.$or = [{ name: c }, { skills: c }, { baseCity: c }, { agency: c }, { languages: c }];
    }
    const rows = await this.database.models.Talent.find(where).sort({ name: 1 }).lean<Talent[]>();
    const stats = await this.stats(rows.map((r) => r.id));
    const window =
      q.freeFrom && q.freeTo
        ? { startsAt: q.freeFrom, endsAt: new Date(q.freeTo.getTime() + 24 * 3600 * 1000) }
        : null;
    return rows
      .map((t) => {
        const s = stats.get(t.id)!;
        const view = toTalentView(t, s);
        if (window) {
          view.busyInWindow =
            s.windows.some((w) => rangesOverlap(w, window)) ||
            (t.unavailable ?? []).some((u) => rangesOverlap(blockRange(u), window));
        }
        return view;
      })
      .filter((v) => !window || !v.busyInWindow);
  }

  async get(id: string, viewer: SessionUser): Promise<TalentDetail> {
    const t = await this.database.models.Talent.findById(id).lean<Talent>();
    if (!t) throw notFound('Artist');
    const [stats, bookings] = await Promise.all([
      this.stats([id]),
      this.database.models.TalentBooking.find({ talentId: id })
        .sort({ createdAt: -1 })
        .populate(talentBookingPopulate)
        .lean<TalentBookingRow[]>(),
    ]);
    const showFee = canSeeProjectMoney(viewer.permissions);
    const views = bookings
      .map((b) => toTalentBookingView(b, showFee))
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.shoot.startsAt.localeCompare(a.shoot.startsAt));
    const projects = new Map<string, TalentDetail['projects'][number]>();
    for (const v of views) {
      if (v.status === 'RELEASED') continue;
      const p = projects.get(v.project.id) ?? { ...v.project, characters: [] };
      if (!p.characters.includes(v.character)) p.characters.push(v.character);
      projects.set(v.project.id, p);
    }
    return {
      ...toTalentView(t, stats.get(id)!),
      dayRate: showFee ? t.dayRate : 0,
      bookings: views,
      projects: [...projects.values()],
    };
  }

  async create(input: CreateTalent, user: SessionUser): Promise<TalentDetail> {
    const created = await this.activity.transaction(async (log) => {
      const t = (await this.database.models.Talent.create(input)).toObject<Talent>();
      await log({
        actorId: user.id,
        action: 'talent.created',
        entityType: 'talent',
        entityId: t.id,
        summary: `${user.name} added ${t.name} (${TALENT_KIND_LABELS[t.kind].toLowerCase()}) to the artist roster`,
      });
      return t;
    });
    return this.get(created.id, user);
  }

  async update(id: string, input: UpdateTalent, user: SessionUser): Promise<TalentDetail> {
    const before = await this.database.models.Talent.findById(id).lean<Talent>();
    if (!before) throw notFound('Artist');
    await this.activity.transaction(async (log) => {
      await this.database.models.Talent.updateOne({ _id: id }, { $set: input });
      await log({
        actorId: user.id,
        action: 'talent.updated',
        entityType: 'talent',
        entityId: id,
        summary:
          input.isActive === false
            ? `${user.name} archived ${before.name} from the artist roster`
            : `${user.name} updated ${before.name}’s profile`,
      });
    });
    return this.get(id, user);
  }

  async addUnavailability(id: string, input: AddUnavailability, user: SessionUser) {
    const t = await this.database.models.Talent.findById(id).lean<Talent>();
    if (!t) throw notFound('Artist');
    await this.activity.transaction(async (log) => {
      await this.database.models.Talent.updateOne(
        { _id: id },
        {
          $push: { unavailable: { from: input.from, to: input.to, reason: input.reason ?? null } },
        },
      );
      await log({
        actorId: user.id,
        action: 'talent.unavailable',
        entityType: 'talent',
        entityId: id,
        summary: `${user.name} marked ${t.name} unavailable ${fmt(input.from)}–${fmt(input.to)}`,
      });
    });
    return this.get(id, user);
  }

  async removeUnavailability(id: string, blockId: string, user: SessionUser) {
    const res = await this.database.models.Talent.updateOne(
      { _id: id },
      { $pull: { unavailable: { _id: blockId } } },
    );
    if (res.matchedCount === 0) throw notFound('Artist');
    return this.get(id, user);
  }

  /** Books an artist for a shoot, refusing double bookings and unavailable dates. */
  async book(shootId: string, input: BookTalent, user: SessionUser) {
    const { Shoot: Shoots, Talent: Talents, TalentBooking: Bookings } = this.database.models;
    const [shoot, talent] = await Promise.all([
      Shoots.findById(shootId).lean<Shoot>(),
      Talents.findById(input.talentId).lean<Talent>(),
    ]);
    if (!shoot) throw notFound('Shoot');
    if (!talent) throw unprocessable('INVALID_TALENT', 'Choose an artist from the roster.');
    if (shoot.status === 'CANCELLED' || shoot.status === 'WRAPPED') {
      throw unprocessable(
        'SHOOT_CLOSED',
        `“${shoot.title}” is ${shoot.status.toLowerCase()}; nothing more can be booked for it.`,
      );
    }
    if (!talent.isActive) {
      throw unprocessable('TALENT_INACTIVE', `${talent.name} is archived from the roster.`);
    }
    const existing = await Bookings.findOne({ shootId, talentId: talent.id }).lean<TalentBooking>();
    if (existing && existing.status !== 'RELEASED') {
      throw conflict('ALREADY_BOOKED', `${talent.name} is already booked for this shoot.`);
    }
    const clash = await this.clashFor(talent, shoot);
    if (clash && !input.allowOverlap) throw conflict('TALENT_CONFLICT', clash);

    await this.activity.transaction(async (log) => {
      const fields = {
        character: input.character,
        fee: input.fee ?? talent.dayRate,
        status: input.status,
        note: input.note ?? null,
      };
      if (existing) await Bookings.updateOne({ _id: existing.id }, { $set: fields });
      else await Bookings.create({ shootId, talentId: talent.id, ...fields });
      await log({
        actorId: user.id,
        action: 'talent.booked',
        entityType: 'talent',
        entityId: talent.id,
        projectId: shoot.projectId,
        summary: `${user.name} ${input.status === 'CONFIRMED' ? 'booked' : 'put a hold on'} ${talent.name} as ${input.character} for “${shoot.title}”${clash ? ' (overlap acknowledged)' : ''}`,
      });
    });
    return { shootId };
  }

  /** A sentence describing why `talent` cannot do `shoot`, or null when free. */
  async clashFor(talent: Talent, shoot: Pick<Shoot, '_id' | 'id' | 'startsAt' | 'endsAt'>) {
    const others = await this.database.models.TalentBooking.find({
      talentId: talent.id,
      shootId: { $ne: shoot.id },
      status: { $ne: 'RELEASED' },
    })
      .populate({ path: 'shoot', select: { title: 1, startsAt: 1, endsAt: 1, status: 1 } })
      .lean<(TalentBooking & { shoot: Shoot | null })[]>();
    const busy = others.find(
      (o) => o.shoot && o.shoot.status !== 'CANCELLED' && rangesOverlap(o.shoot, shoot),
    );
    if (busy) return `${talent.name} is already booked for “${busy.shoot!.title}” at that time.`;
    const block = (talent.unavailable ?? []).find((u) => rangesOverlap(blockRange(u), shoot));
    if (block) {
      return `${talent.name} is unavailable ${fmt(block.from)}–${fmt(block.to)}${block.reason ? ` (${block.reason})` : ''}.`;
    }
    return null;
  }

  async updateBooking(id: string, input: UpdateTalentBooking, user: SessionUser) {
    const { TalentBooking: Bookings } = this.database.models;
    const b = await Bookings.findById(id)
      .populate([{ path: 'talent' }, { path: 'shoot' }])
      .lean<TalentBooking & { talent: Talent; shoot: Shoot }>();
    if (!b) throw notFound('Booking');
    // Re-activating a released booking must not create a double booking.
    if (b.status === 'RELEASED' && input.status && input.status !== 'RELEASED') {
      const clash = await this.clashFor(b.talent, b.shoot);
      if (clash) throw conflict('TALENT_CONFLICT', clash);
    }
    await this.activity.transaction(async (log) => {
      await Bookings.updateOne({ _id: id }, { $set: input });
      await log({
        actorId: user.id,
        action: input.status === 'RELEASED' ? 'talent.released' : 'talent.booking.updated',
        entityType: 'talent',
        entityId: b.talentId,
        projectId: b.shoot.projectId,
        summary:
          input.status && input.status !== b.status
            ? `${user.name} ${input.status === 'CONFIRMED' ? 'confirmed' : input.status === 'RELEASED' ? 'released' : 'put on hold'} ${b.talent.name} for “${b.shoot.title}”`
            : `${user.name} updated ${b.talent.name}’s booking for “${b.shoot.title}”`,
      });
    });
    return { shootId: b.shootId };
  }

  async removeBooking(id: string, user: SessionUser) {
    const b = await this.database.models.TalentBooking.findById(id)
      .populate([{ path: 'talent' }, { path: 'shoot' }])
      .lean<TalentBooking & { talent: Talent; shoot: Shoot }>();
    if (!b) throw notFound('Booking');
    await this.activity.transaction(async (log) => {
      await this.database.models.TalentBooking.deleteOne({ _id: id });
      await log({
        actorId: user.id,
        action: 'talent.released',
        entityType: 'talent',
        entityId: b.talentId,
        projectId: b.shoot.projectId,
        summary: `${user.name} removed ${b.talent.name} from “${b.shoot.title}”`,
      });
    });
    return { shootId: b.shootId };
  }
}
