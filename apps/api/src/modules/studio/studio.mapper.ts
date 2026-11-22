/** Row → view mapping for the production-studio layer. */
import type {
  Client,
  Project,
  Scene,
  Shoot,
  ShootLogEntry,
  Talent,
  TalentBooking,
  User,
} from '@nova/db';
import type { SceneView, ShootLogView, TalentBookingView, TalentView } from '@nova/shared';
import { iso, isoOrNull } from '../projects/project.mapper';

export function toTalentView(
  t: Talent,
  stats: { upcoming: number; completed: number },
): TalentView {
  return {
    id: t.id,
    name: t.name,
    kind: t.kind,
    email: t.email,
    phone: t.phone,
    agency: t.agency,
    skills: t.skills ?? [],
    languages: t.languages ?? [],
    playingAgeMin: t.playingAgeMin,
    playingAgeMax: t.playingAgeMax,
    experienceYears: t.experienceYears,
    baseCity: t.baseCity,
    willTravel: t.willTravel,
    dayRate: t.dayRate,
    portfolioUrl: t.portfolioUrl,
    notes: t.notes,
    isActive: t.isActive,
    unavailable: (t.unavailable ?? []).map((u) => ({
      id: u._id,
      from: iso(u.from),
      to: iso(u.to),
      reason: u.reason,
    })),
    upcoming: stats.upcoming,
    completed: stats.completed,
  };
}

export type TalentBookingRow = TalentBooking & {
  talent: Talent | null;
  shoot: (Shoot & { project: (Project & { client: Client | null }) | null }) | null;
};

export const talentBookingPopulate = [
  { path: 'talent' },
  { path: 'shoot', populate: { path: 'project', populate: { path: 'client' } } },
];

export function toTalentBookingView(
  b: TalentBookingRow,
  showFee: boolean,
): TalentBookingView | null {
  if (!b.talent || !b.shoot || !b.shoot.project) return null;
  const p = b.shoot.project;
  return {
    id: b.id,
    character: b.character,
    status: b.status,
    fee: showFee ? b.fee : null,
    note: b.note,
    talent: { id: b.talent.id, name: b.talent.name, kind: b.talent.kind, phone: b.talent.phone },
    shoot: {
      id: b.shoot.id,
      title: b.shoot.title,
      startsAt: iso(b.shoot.startsAt),
      endsAt: iso(b.shoot.endsAt),
      status: b.shoot.status,
      location: b.shoot.location,
    },
    project: { id: p.id, code: p.code, title: p.title, clientName: p.client?.name ?? '' },
  };
}

export type SceneRow = Scene & { shoot?: Pick<Shoot, '_id' | 'id' | 'title' | 'startsAt'> | null };

export function toSceneView(s: SceneRow): SceneView {
  return {
    id: s.id,
    projectId: s.projectId,
    scriptId: s.scriptId,
    number: s.number,
    sortOrder: s.sortOrder,
    heading: s.heading,
    description: s.description,
    setting: s.setting,
    timeOfDay: s.timeOfDay,
    location: s.location,
    characters: s.characters ?? [],
    props: s.props ?? [],
    wardrobe: s.wardrobe ?? [],
    equipment: s.equipment ?? [],
    requirements: s.requirements,
    estimatedMinutes: s.estimatedMinutes,
    shoot: s.shoot
      ? { id: s.shoot.id, title: s.shoot.title, startsAt: iso(s.shoot.startsAt) }
      : null,
    shootDate: isoOrNull(s.shootDate),
    plannedStart: s.plannedStart,
    status: s.status,
    notes: s.notes,
    source: s.source,
    completedAt: isoOrNull(s.completedAt),
  };
}

export const sceneSort = { sortOrder: 1 as const, createdAt: 1 as const };

export function toShootLogView(
  l: ShootLogEntry & { author?: Pick<User, 'name'> | null },
): ShootLogView {
  return {
    id: l.id,
    kind: l.kind,
    body: l.body,
    minutesLost: l.minutesLost,
    author: l.author?.name ?? 'Unknown',
    resolvedAt: isoOrNull(l.resolvedAt),
    createdAt: iso(l.createdAt),
  };
}

/** Day key → whole minutes, for "07:30" style times. */
export function minutesOf(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}
