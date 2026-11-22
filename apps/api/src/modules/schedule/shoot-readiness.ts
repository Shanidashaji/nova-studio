import { Injectable } from '@nestjs/common';
import type { CrewCall, Scene, Shoot, TalentBooking, TeamMember } from '@nova/db';
import { shootReadiness, type ShootReadinessInput } from '@nova/shared';
import { DatabaseService } from '../../database/database.service';
import { ScheduleConflicts } from './schedule-conflicts';

/** "Director of Photography" is camera, not direction. */
const DIRECTOR = /\bdirector\b(?! of photography)/i;
const CAMERA = /\b(dop|dp|cinematograph\w*|camera|director of photography)\b/i;

/**
 * Pre-production readiness of a shoot: what must be in place before it is confirmed and started
 * (rules in packages/shared/src/domain/studio.ts). Used by the status gate in ScheduleService and
 * shown on the shoot-day and pre-production screens.
 */
@Injectable()
export class ShootReadiness {
  constructor(
    private readonly database: DatabaseService,
    private readonly conflicts: ScheduleConflicts,
  ) {}

  async input(shootId: string): Promise<ShootReadinessInput | null> {
    const { Shoot, Script, Scene, TalentBooking } = this.database.models;
    const shoot = await Shoot.findById(shootId)
      .populate([{ path: 'crew', populate: { path: 'teamMember' } }, { path: 'bookings' }])
      .lean<
        Shoot & { crew: (CrewCall & { teamMember: TeamMember })[]; bookings: { id: string }[] }
      >();
    if (!shoot) return null;
    const [scripts, scenes, talent, conflictMap] = await Promise.all([
      Script.find({ projectId: shoot.projectId, kind: 'SCRIPT' }, { status: 1 }).lean(),
      Scene.find({ shootId, status: { $ne: 'DROPPED' } }, { characters: 1 }).lean<
        Pick<Scene, '_id' | 'characters'>[]
      >(),
      TalentBooking.find({ shootId, status: { $ne: 'RELEASED' } }).lean<TalentBooking[]>(),
      this.conflicts.forShoots([shootId]),
    ]);
    const confirmedParts = new Set(
      talent.filter((t) => t.status === 'CONFIRMED').map((t) => t.character.trim().toLowerCase()),
    );
    const characters = [...new Set(scenes.flatMap((s) => s.characters ?? []))];
    const roles = shoot.crew.map((c) => `${c.role} ${c.teamMember.title}`);
    return {
      location: shoot.location,
      crewCount: shoot.crew.length,
      hasDirector: roles.some((r) => DIRECTOR.test(r)),
      hasCamera: roles.some((r) => CAMERA.test(r)),
      equipmentCount: shoot.bookings.length,
      conflictCount: conflictMap.get(shootId)?.length ?? 0,
      productionManager: !!shoot.productionManagerId,
      scripts: {
        total: scripts.length,
        approved: scripts.filter((s) => s.status === 'APPROVED').length,
      },
      scenesPlanned: scenes.length,
      uncastCharacters: characters.filter((c) => !confirmedParts.has(c.trim().toLowerCase())),
      talentOnHold: talent.filter((t) => t.status === 'HOLD').length,
      callSheetPublished: !!shoot.callSheetPublishedAt,
      checklistOpen: (shoot.checklist ?? []).filter((c) => !c.done).length,
    };
  }

  async evaluate(shootId: string) {
    const input = await this.input(shootId);
    if (!input) return { items: [], canConfirm: false, canStart: false, score: 0 };
    return shootReadiness(input);
  }
}
