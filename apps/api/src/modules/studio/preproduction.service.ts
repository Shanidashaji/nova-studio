import { Injectable } from '@nestjs/common';
import type {
  BudgetLine,
  Client,
  Project,
  ProjectStage,
  Scene,
  Script,
  Shoot,
  StageDefinition,
  TalentBooking,
} from '@nova/db';
import type { ProjectReadinessView } from '@nova/shared';
import { notFound } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { iso } from '../projects/project.mapper';
import { ShootReadiness } from '../schedule/shoot-readiness';

type Item = ProjectReadinessView['items'][number];

/**
 * Pre-production checklist of a project: everything that must be in place before its shoots
 * begin — brief, concept, approved script, breakdown, locations, casting, crew, equipment,
 * schedule, budget plan, call sheets and approvals. Each item links to where it is fixed.
 */
@Injectable()
export class PreProductionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly readiness: ShootReadiness,
  ) {}

  async project(projectId: string): Promise<ProjectReadinessView> {
    const m = this.database.models;
    const project = await m.Project.findById(projectId)
      .populate([
        { path: 'client', select: { name: 1 } },
        { path: 'stages', populate: { path: 'stageDefinition' } },
      ])
      .lean<
        Project & {
          client: Pick<Client, 'name'> | null;
          stages: (ProjectStage & { stageDefinition: StageDefinition })[];
        }
      >();
    if (!project) throw notFound('Project');
    const [scripts, scenes, shoots, lines] = await Promise.all([
      m.Script.find({ projectId }).lean<Script[]>(),
      m.Scene.find({ projectId, status: { $ne: 'DROPPED' } }).lean<Scene[]>(),
      m.Shoot.find({ projectId, status: { $ne: 'CANCELLED' } })
        .sort({ startsAt: 1 })
        .populate([{ path: 'crew' }, { path: 'bookings' }])
        .lean<(Shoot & { crew: unknown[]; bookings: unknown[] })[]>(),
      m.BudgetLine.find({ projectId }).lean<BudgetLine[]>(),
    ]);
    const talent = await m.TalentBooking.find({
      shootId: { $in: shoots.map((s) => s.id) },
      status: { $ne: 'RELEASED' },
    }).lean<TalentBooking[]>();
    const evaluations = await Promise.all(
      shoots.map(async (s) => [s, await this.readiness.evaluate(s.id)] as const),
    );

    const doc = (kind: Script['kind']) => scripts.filter((s) => s.kind === kind);
    const docItem = (key: string, label: string, kind: Script['kind'], required: boolean): Item => {
      const list = doc(kind);
      const approved = list.filter((s) => s.status === 'APPROVED');
      return {
        key,
        label,
        status: approved.length
          ? 'done'
          : list.length
            ? required
              ? 'missing'
              : 'warning'
            : required
              ? 'missing'
              : 'warning',
        detail: approved.length
          ? `${approved[0]!.title} approved.`
          : list.length
            ? `${list[0]!.title} is ${list[0]!.status.toLowerCase().replace('_', ' ')}.`
            : `No ${label.toLowerCase()} yet.`,
        target: { kind: 'lens', lens: 'scripts' },
      };
    };
    const characters = [
      ...new Set(scenes.flatMap((s) => s.characters.map((c) => c.toLowerCase()))),
    ];
    const cast = new Set(
      talent.filter((t) => t.status === 'CONFIRMED').map((t) => t.character.toLowerCase()),
    );
    const uncast = characters.filter((c) => !cast.has(c));
    const scheduled = scenes.filter((s) => s.shootId);
    const withLocation = scenes.filter((s) => s.location);
    const upcoming = shoots.filter((s) => s.status !== 'WRAPPED');
    const pre = project.stages.find((s) => s.stageDefinition.key === 'PRE_PRODUCTION');
    const items: Item[] = [
      docItem('brief', 'Client brief', 'BRIEF', false),
      docItem('concept', 'Creative concept', 'CONCEPT', false),
      docItem('script', 'Script approved', 'SCRIPT', true),
      docItem('storyboard', 'Storyboard', 'STORYBOARD', false),
      {
        key: 'breakdown',
        label: 'Scene breakdown',
        status: scenes.length ? 'done' : 'missing',
        detail: scenes.length
          ? `${scenes.length} scene(s) broken down.`
          : 'Break the script into scenes.',
        target: { kind: 'lens', lens: 'scripts' },
      },
      {
        key: 'locations',
        label: 'Locations scouted',
        status:
          scenes.length === 0 ? 'na' : withLocation.length === scenes.length ? 'done' : 'warning',
        detail: scenes.length
          ? `${withLocation.length} of ${scenes.length} scenes have a location.`
          : 'No scenes yet.',
        target: { kind: 'lens', lens: 'scripts' },
      },
      {
        key: 'casting',
        label: 'Casting',
        status: characters.length === 0 ? 'na' : uncast.length === 0 ? 'done' : 'missing',
        detail:
          characters.length === 0
            ? 'No characters in the breakdown.'
            : uncast.length
              ? `Not cast: ${uncast.slice(0, 4).join(', ')}.`
              : 'Every character has a confirmed artist.',
        target: { kind: 'lens', lens: 'talent' },
      },
      {
        key: 'schedule',
        label: 'Shoots scheduled',
        status:
          shoots.length === 0
            ? 'missing'
            : scenes.length && scheduled.length < scenes.length
              ? 'warning'
              : 'done',
        detail:
          shoots.length === 0
            ? 'No shoot scheduled.'
            : `${shoots.length} shoot(s); ${scheduled.length} of ${scenes.length} scenes scheduled.`,
        target: { kind: 'lens', lens: 'schedule' },
      },
      {
        key: 'crew',
        label: 'Crew assigned',
        status:
          upcoming.length === 0
            ? 'na'
            : upcoming.every((s) => s.crew.length > 0)
              ? 'done'
              : 'missing',
        detail: upcoming.length
          ? `${upcoming.filter((s) => s.crew.length > 0).length} of ${upcoming.length} upcoming shoot(s) have crew.`
          : 'No upcoming shoot.',
        target: upcoming[0] ? { kind: 'shoot-day', shootId: upcoming[0].id } : null,
      },
      {
        key: 'equipment',
        label: 'Equipment planned',
        status:
          upcoming.length === 0
            ? 'na'
            : upcoming.every((s) => s.bookings.length > 0)
              ? 'done'
              : 'missing',
        detail: upcoming.length
          ? `${upcoming.filter((s) => s.bookings.length > 0).length} of ${upcoming.length} upcoming shoot(s) have equipment.`
          : 'No upcoming shoot.',
        target: upcoming[0] ? { kind: 'inspect', type: 'shoot', id: upcoming[0].id } : null,
      },
      {
        key: 'budget',
        label: 'Budget planned',
        status: lines.length ? 'done' : 'warning',
        detail: lines.length ? `${lines.length} budget line(s).` : 'No budget plan yet.',
        target: { kind: 'inspect', type: 'project', id: projectId },
      },
      {
        key: 'callsheets',
        label: 'Call sheets published',
        status:
          upcoming.length === 0
            ? 'na'
            : upcoming.every((s) => s.callSheetPublishedAt)
              ? 'done'
              : 'missing',
        detail: upcoming.length
          ? `${upcoming.filter((s) => s.callSheetPublishedAt).length} of ${upcoming.length} published.`
          : 'No upcoming shoot.',
        target: upcoming[0] ? { kind: 'shoot-day', shootId: upcoming[0].id } : null,
      },
      {
        key: 'approval',
        label: 'Pre-production sign-off',
        status:
          !pre || pre.status === 'SKIPPED' ? 'na' : pre.status === 'DONE' ? 'done' : 'warning',
        detail: !pre
          ? 'This workflow has no pre-production stage.'
          : pre.status === 'DONE'
            ? 'Stage completed.'
            : `Stage is ${pre.status.toLowerCase()}.`,
        target: { kind: 'inspect', type: 'project', id: projectId },
      },
    ];
    const scored = items.filter((i) => i.status !== 'na');
    const score = Math.round(
      (scored.reduce(
        (a, i) => a + (i.status === 'done' ? 1 : i.status === 'warning' ? 0.5 : 0),
        0,
      ) /
        Math.max(1, scored.length)) *
        100,
    );
    const active = project.stages.find((s) => s.status === 'ACTIVE' || s.status === 'BLOCKED');
    return {
      project: {
        id: project.id,
        code: project.code,
        title: project.title,
        clientName: project.client?.name ?? '',
        stage: active?.stageDefinition.key ?? null,
      },
      items,
      score,
      shoots: evaluations.map(([s, r]) => ({
        id: s.id,
        title: s.title,
        startsAt: iso(s.startsAt),
        status: s.status,
        readinessScore: r.score,
        canConfirm: r.canConfirm,
      })),
    };
  }
}
