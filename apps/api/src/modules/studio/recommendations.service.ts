import { Injectable } from '@nestjs/common';
import type {
  Client,
  CrewCall,
  LeaveRequest,
  Project,
  ProjectMember,
  Scene,
  Shoot,
  Talent,
  TalentBooking,
  TeamMember,
} from '@nova/db';
import {
  canSeeProjectMoney,
  leaveOverlaps,
  rangesOverlap,
  scoreCrew,
  scoreTalent,
  STUDIO_LOCATION_LABELS,
  TALENT_KIND_LABELS,
  type CastingNeed,
  type CrewRecommendationQuery,
  type RecommendationResult,
  type SessionUser,
  type TalentRecommendationQuery,
} from '@nova/shared';
import { notFound } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { TeamService } from '../team/team.service';
import { TalentService } from './talent.service';
import { iso } from '../projects/project.mapper';

type ShootWithProject = Shoot & { project: (Project & { client: Client | null }) | null };

/**
 * Rule-based casting and crew recommendations. No AI is involved: each candidate is scored by
 * the explainable rules in packages/shared/src/domain/studio.ts (role fit, skills, availability,
 * location, experience, workload, past work) and every point is returned as a reason.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly team: TeamService,
    private readonly talent: TalentService,
  ) {}

  private async shoot(id: string): Promise<ShootWithProject> {
    const shoot = await this.database.models.Shoot.findById(id)
      .populate({ path: 'project', populate: { path: 'client' } })
      .lean<ShootWithProject>();
    if (!shoot || !shoot.project) throw notFound('Shoot');
    return shoot;
  }

  /** Characters named in the shoot's scenes and who (if anyone) is booked to play them. */
  async castingNeeds(shootId: string): Promise<CastingNeed[]> {
    const [scenes, bookings] = await Promise.all([
      this.database.models.Scene.find({ shootId, status: { $ne: 'DROPPED' } })
        .sort({ sortOrder: 1 })
        .lean<Scene[]>(),
      this.database.models.TalentBooking.find({ shootId, status: { $ne: 'RELEASED' } })
        .populate({ path: 'talent', select: { name: 1 } })
        .lean<(TalentBooking & { talent: Pick<Talent, 'name'> | null })[]>(),
    ]);
    const needs = new Map<string, CastingNeed>();
    for (const s of scenes) {
      for (const c of s.characters ?? []) {
        const key = c.trim().toLowerCase();
        const n = needs.get(key) ?? { character: c, scenes: [], booked: [] };
        n.scenes.push(s.number);
        needs.set(key, n);
      }
    }
    for (const b of bookings) {
      const key = b.character.trim().toLowerCase();
      const n = needs.get(key) ?? { character: b.character, scenes: [], booked: [] };
      n.booked.push({
        bookingId: b.id,
        talentId: b.talentId,
        name: b.talent?.name ?? 'Unknown',
        status: b.status,
      });
      needs.set(key, n);
    }
    return [...needs.values()];
  }

  async talentFor(
    q: TalentRecommendationQuery,
    viewer: SessionUser,
  ): Promise<RecommendationResult> {
    const shoot = await this.shoot(q.shootId);
    const project = shoot.project!;
    const city = STUDIO_LOCATION_LABELS[shoot.city];
    const [roster, history] = await Promise.all([
      this.database.models.Talent.find({ isActive: true }).lean<Talent[]>(),
      this.database.models.TalentBooking.find({ status: { $ne: 'RELEASED' } })
        .populate({
          path: 'shoot',
          select: { projectId: 1 },
          populate: { path: 'project', select: { type: 1, clientId: 1 } },
        })
        .lean<
          (TalentBooking & {
            shoot:
              | (Pick<Shoot, 'projectId'> & { project: Pick<Project, 'type' | 'clientId'> | null })
              | null;
          })[]
        >(),
    ]);
    // Remaining artist budget, when the project has a budget plan line for artists.
    const artistLines = await this.database.models.BudgetLine.find({
      projectId: project.id,
      group: 'ARTIST',
    }).lean();
    const plannedDays = Math.max(
      1,
      Math.ceil((shoot.endsAt.getTime() - shoot.startsAt.getTime()) / 86_400_000),
    );
    const budgetPerDay = artistLines.length
      ? Math.round(artistLines.reduce((a, l) => a + l.estimated, 0) / plannedDays)
      : null;
    const showFee = canSeeProjectMoney(viewer.permissions);

    const candidates = await Promise.all(
      roster.map(async (t) => {
        const past = history.filter((h) => h.talentId === t.id && h.shootId !== shoot.id);
        const clash = await this.talent.clashFor(t, shoot);
        const already = history.some((h) => h.talentId === t.id && h.shootId === shoot.id);
        const scored = scoreTalent(
          {
            kind: t.kind,
            skills: t.skills ?? [],
            languages: t.languages ?? [],
            experienceYears: t.experienceYears,
            baseCity: t.baseCity,
            willTravel: t.willTravel,
            dayRate: t.dayRate,
            playingAgeMin: t.playingAgeMin,
            playingAgeMax: t.playingAgeMax,
            isActive: t.isActive,
            clashes: [
              ...(clash ? [clash] : []),
              ...(already ? ['Already booked on this shoot'] : []),
            ],
            sameTypeBookings: past.filter((h) => h.shoot?.project?.type === project.type).length,
            sameClientBookings: past.filter((h) => h.shoot?.project?.clientId === project.clientId)
              .length,
          },
          {
            role: q.role,
            description: q.description,
            city,
            age: q.age ?? null,
            language: q.language ?? null,
            projectType: project.type,
            budgetPerDay: showFee ? budgetPerDay : null,
          },
        );
        return {
          id: t.id,
          name: t.name,
          subtitle: `${TALENT_KIND_LABELS[t.kind]} · ${t.baseCity} · ${t.experienceYears} yrs`,
          score: scored.score,
          available: scored.blockers.length === 0,
          reasons: scored.reasons,
          blockers: scored.blockers,
          dayRate: showFee ? t.dayRate : null,
        };
      }),
    );
    candidates.sort((a, b) => Number(b.available) - Number(a.available) || b.score - a.score);
    return {
      method: 'RULE_BASED',
      explanation:
        'Rule-based ranking, not AI. Points for profile type, matching skills, language, playing age, experience, location and past work with this client or kind of production; artists who are booked elsewhere, unavailable or outside the playing age are listed last with the reason.',
      need: {
        role: q.role,
        description: q.description ?? null,
        city,
        window: { from: iso(shoot.startsAt), to: iso(shoot.endsAt) },
      },
      candidates: candidates.slice(0, 12),
    };
  }

  async crewFor(q: CrewRecommendationQuery): Promise<RecommendationResult> {
    const shoot = await this.shoot(q.shootId);
    const project = shoot.project!;
    const [members, workload, roles] = await Promise.all([
      this.database.models.TeamMember.find({ isActive: true })
        .populate({
          path: 'crewCalls',
          populate: { path: 'shoot', select: { title: 1, startsAt: 1, endsAt: 1, status: 1 } },
        })
        .lean<(TeamMember & { crewCalls: (CrewCall & { shoot: Shoot | null })[] })[]>(),
      this.team.list(),
      this.database.models.ProjectMember.find()
        .populate({ path: 'project', select: { type: 1 } })
        .lean<(ProjectMember & { project: Pick<Project, 'type'> | null })[]>(),
    ]);
    const leaves = await this.database.models.LeaveRequest.find({
      status: 'APPROVED',
      startDate: { $lte: shoot.endsAt },
      endDate: { $gte: new Date(shoot.startsAt.getTime() - 86_400_000) },
    }).lean<LeaveRequest[]>();
    const ratio = new Map(workload.map((w) => [w.id, w.weeks[0]?.ratio ?? 0]));

    const candidates = members.map((m) => {
      const clashes: string[] = [];
      if (m.crewCalls.some((c) => c.shootId === shoot.id)) clashes.push('Already on this shoot');
      const busy = m.crewCalls.find(
        (c) =>
          c.shoot &&
          c.shootId !== shoot.id &&
          c.shoot.status !== 'CANCELLED' &&
          rangesOverlap(c.shoot, shoot),
      );
      if (busy) clashes.push(`Called to “${busy.shoot!.title}” at that time`);
      if (leaves.some((l) => l.teamMemberId === m.id && leaveOverlaps(l, shoot)))
        clashes.push('On approved leave');
      const scored = scoreCrew(
        {
          title: m.title,
          skills: m.skills ?? [],
          baseLocation: m.baseLocation,
          isActive: m.isActive,
          utilisation: ratio.get(m.id) ?? 0,
          clashes,
          sameTypeProjects: roles.filter(
            (r) => r.teamMemberId === m.id && r.project?.type === project.type,
          ).length,
        },
        { role: q.role, city: shoot.city, projectType: project.type },
      );
      return {
        id: m.id,
        name: m.name,
        subtitle: `${m.title} · ${STUDIO_LOCATION_LABELS[m.baseLocation]} · ${Math.round((ratio.get(m.id) ?? 0) * 100)}% booked this week`,
        score: scored.score,
        available: scored.blockers.length === 0,
        reasons: scored.reasons,
        blockers: scored.blockers,
      };
    });
    candidates.sort((a, b) => Number(b.available) - Number(a.available) || b.score - a.score);
    return {
      method: 'RULE_BASED',
      explanation:
        'Rule-based ranking, not AI. Points for the person’s discipline and skills, being based at the shoot’s studio, a light workload this week and past work on this kind of production; anyone already called elsewhere or on leave is listed last with the reason.',
      need: {
        role: q.role,
        description: null,
        city: STUDIO_LOCATION_LABELS[shoot.city],
        window: { from: iso(shoot.startsAt), to: iso(shoot.endsAt) },
      },
      candidates: candidates.slice(0, 10),
    };
  }
}
