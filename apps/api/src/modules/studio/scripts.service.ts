import { Injectable } from '@nestjs/common';
import type { Client, Project, Scene, Script, ScriptVersion, Shoot, User } from '@nova/db';
import {
  breakdownScript,
  CREATIVE_KIND_LABELS,
  daysBetween,
  SCRIPT_STATUS_LABELS,
  shootDayKeys,
  istDayKey,
  type AddScriptVersion,
  type ApplyBreakdown,
  type BreakdownResult,
  type CreateScene,
  type CreateScript,
  type DecideScript,
  type SceneQuery,
  type SceneView,
  type ScriptDetail,
  type ScriptQuery,
  type ScriptSummary,
  type SessionUser,
  type SubmitScript,
  type UpdateScene,
  type UpdateScript,
} from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../activity/notifications.service';
import { iso, isoOrNull } from '../projects/project.mapper';
import { sceneSort, toSceneView, type SceneRow } from './studio.mapper';

type ScriptRow = Script & {
  project: (Project & { client: Client | null }) | null;
  createdBy: Pick<User, 'name'> | null;
};

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * Creative documents of a project — brief, concept, script, storyboard, shot list — with
 * versions and an approval decision, plus the scene breakdown that drives scheduling.
 * A new version of an approved script reopens it: an approval covers the version it was given for.
 */
@Injectable()
export class ScriptsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private summary(s: ScriptRow, sceneCount: number): ScriptSummary {
    const p = s.project!;
    return {
      id: s.id,
      kind: s.kind,
      title: s.title,
      status: s.status,
      currentVersion: s.currentVersion,
      project: { id: p.id, code: p.code, title: p.title, clientName: p.client?.name ?? '' },
      sceneCount,
      submittedAt: isoOrNull(s.submittedAt),
      decidedAt: isoOrNull(s.decidedAt),
      decidedBy: s.decidedBy,
      waitingDays:
        s.status === 'IN_REVIEW' && s.submittedAt ? daysBetween(s.submittedAt, new Date()) : null,
      updatedAt: iso(s.updatedAt),
      createdBy: s.createdBy?.name ?? 'Unknown',
    };
  }

  async list(q: ScriptQuery): Promise<ScriptSummary[]> {
    const where: Record<string, unknown> = {};
    if (q.projectId) where.projectId = q.projectId;
    if (q.kind) where.kind = q.kind;
    if (q.status) where.status = q.status;
    const rows = await this.database.models.Script.find(where)
      .sort({ updatedAt: -1 })
      .populate([
        { path: 'project', populate: { path: 'client', select: { name: 1 } } },
        { path: 'createdBy', select: { name: 1 } },
      ])
      .lean<ScriptRow[]>();
    const counts = await this.database.models.Scene.aggregate<{ _id: string; n: number }>([
      { $match: { scriptId: { $in: rows.map((r) => r.id) } } },
      { $group: { _id: '$scriptId', n: { $sum: 1 } } },
    ]);
    const n = new Map(counts.map((c) => [c._id, c.n]));
    return rows.filter((r) => r.project).map((r) => this.summary(r, n.get(r.id) ?? 0));
  }

  async get(id: string): Promise<ScriptDetail> {
    const s = await this.database.models.Script.findById(id)
      .populate([
        { path: 'project', populate: { path: 'client', select: { name: 1 } } },
        { path: 'createdBy', select: { name: 1 } },
      ])
      .lean<ScriptRow>();
    if (!s || !s.project) throw notFound('Script');
    const [versions, scenes] = await Promise.all([
      this.database.models.ScriptVersion.find({ scriptId: id })
        .sort({ number: -1 })
        .populate({ path: 'author', select: { name: 1 } })
        .lean<(ScriptVersion & { author: Pick<User, 'name'> | null })[]>(),
      this.database.models.Scene.find({ scriptId: id })
        .sort(sceneSort)
        .populate({ path: 'shoot', select: { title: 1, startsAt: 1 } })
        .lean<SceneRow[]>(),
    ]);
    const current = versions.find((v) => v.number === s.currentVersion) ?? versions[0];
    return {
      ...this.summary(s, scenes.length),
      clientInstructions: s.clientInstructions,
      notes: s.notes,
      decisionNote: s.decisionNote,
      body: current?.body ?? '',
      versions: versions.map((v) => ({
        id: v.id,
        number: v.number,
        changeNote: v.changeNote,
        fileName: v.fileName,
        author: v.author?.name ?? 'Unknown',
        createdAt: iso(v.createdAt),
        words: words(v.body),
      })),
      scenes: scenes.map(toSceneView),
    };
  }

  async version(id: string, number: number) {
    const v = await this.database.models.ScriptVersion.findOne({
      scriptId: id,
      number,
    }).lean<ScriptVersion>();
    if (!v) throw notFound('Version');
    return {
      number: v.number,
      body: v.body,
      changeNote: v.changeNote,
      createdAt: iso(v.createdAt),
    };
  }

  async create(input: CreateScript, user: SessionUser): Promise<ScriptDetail> {
    const project = await this.database.models.Project.findById(input.projectId).lean<Project>();
    if (!project) throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    const script = await this.activity.transaction(async (log) => {
      const s = (
        await this.database.models.Script.create({
          projectId: project.id,
          kind: input.kind,
          title: input.title,
          clientInstructions: input.clientInstructions ?? null,
          notes: input.notes ?? null,
          createdById: user.id,
        })
      ).toObject<Script>();
      await this.database.models.ScriptVersion.create({
        scriptId: s.id,
        number: 1,
        body: input.body,
        fileName: input.fileName ?? null,
        changeNote: input.fileName ? `Uploaded ${input.fileName}` : 'First draft',
        authorId: user.id,
      });
      await log({
        actorId: user.id,
        action: 'script.created',
        entityType: 'script',
        entityId: s.id,
        projectId: project.id,
        summary: `${user.name} ${input.fileName ? 'uploaded' : 'wrote'} ${CREATIVE_KIND_LABELS[input.kind].toLowerCase()} “${s.title}” for ${project.title}`,
      });
      return s;
    });
    return this.get(script.id);
  }

  async update(id: string, input: UpdateScript, user: SessionUser) {
    const s = await this.database.models.Script.findById(id).lean<Script>();
    if (!s) throw notFound('Script');
    await this.activity.transaction(async (log) => {
      await this.database.models.Script.updateOne({ _id: id }, { $set: input });
      await log({
        actorId: user.id,
        action: 'script.updated',
        entityType: 'script',
        entityId: id,
        projectId: s.projectId,
        summary: `${user.name} updated the notes of “${s.title}”`,
      });
    });
    return this.get(id);
  }

  async addVersion(id: string, input: AddScriptVersion, user: SessionUser) {
    await this.activity.transaction(async (log) => {
      await this.database.lock('Script', id);
      const s = await this.database.models.Script.findById(id).lean<Script>();
      if (!s) throw notFound('Script');
      if (s.status === 'IN_REVIEW') {
        throw conflict(
          'SCRIPT_IN_REVIEW',
          `“${s.title}” is with the client for review. Record their decision before adding a new version.`,
        );
      }
      const number = s.currentVersion + 1;
      await this.database.models.ScriptVersion.create({
        scriptId: id,
        number,
        body: input.body,
        changeNote: input.changeNote ?? null,
        fileName: input.fileName ?? null,
        authorId: user.id,
      });
      // An approval or rejection was for the previous version.
      await this.database.models.Script.updateOne(
        { _id: id },
        {
          $set: {
            currentVersion: number,
            status: 'DRAFT',
            decidedAt: null,
            decidedBy: null,
            decisionNote: null,
          },
        },
      );
      await log({
        actorId: user.id,
        action: 'script.version',
        entityType: 'script',
        entityId: id,
        projectId: s.projectId,
        summary: `${user.name} saved v${number} of “${s.title}”${s.status === 'APPROVED' ? ' (approval of v' + s.currentVersion + ' no longer applies)' : ''}${input.changeNote ? `: ${input.changeNote}` : ''}`,
      });
    });
    return this.get(id);
  }

  async submit(id: string, input: SubmitScript, user: SessionUser) {
    const s = await this.database.models.Script.findById(id).lean<Script>();
    if (!s) throw notFound('Script');
    if (s.status === 'IN_REVIEW')
      throw conflict('ALREADY_IN_REVIEW', `“${s.title}” is already in review.`);
    if (s.status === 'APPROVED') {
      throw conflict(
        'ALREADY_APPROVED',
        `v${s.currentVersion} of “${s.title}” is already approved.`,
      );
    }
    await this.activity.transaction(async (log) => {
      const res = await this.database.models.Script.updateOne(
        { _id: id, status: s.status },
        { $set: { status: 'IN_REVIEW', submittedAt: new Date(), notes: input.note ?? s.notes } },
      );
      if (res.matchedCount === 0)
        throw conflict('SCRIPT_CHANGED', 'The script changed; reload it.');
      await log({
        actorId: user.id,
        action: 'script.submitted',
        entityType: 'script',
        entityId: id,
        projectId: s.projectId,
        summary: `${user.name} sent v${s.currentVersion} of “${s.title}” for client review`,
      });
      await this.notifications.notifyPermission(
        'approval:decide',
        {
          kind: 'approval.script',
          title: `Script waiting for approval: ${s.title}`,
          body: `v${s.currentVersion} sent for review by ${user.name}.`,
          entityType: 'script',
          entityId: id,
        },
        user.id,
      );
    });
    return this.get(id);
  }

  async decide(id: string, input: DecideScript, user: SessionUser) {
    const s = await this.database.models.Script.findById(id).lean<Script>();
    if (!s) throw notFound('Script');
    if (s.status !== 'IN_REVIEW') {
      throw conflict(
        'NOT_IN_REVIEW',
        `“${s.title}” is ${SCRIPT_STATUS_LABELS[s.status].toLowerCase()}; send it for review before recording a decision.`,
      );
    }
    if (input.status !== 'APPROVED' && !input.note) {
      throw unprocessable('NOTE_REQUIRED', 'Say what needs to change (or why it was rejected).');
    }
    await this.activity.transaction(async (log) => {
      const res = await this.database.models.Script.updateOne(
        { _id: id, status: 'IN_REVIEW' },
        {
          $set: {
            status: input.status,
            decidedAt: new Date(),
            decidedBy: input.decidedBy ?? user.name,
            decisionNote: input.note ?? null,
          },
        },
      );
      if (res.matchedCount === 0)
        throw conflict('ALREADY_DECIDED', 'This review was already decided.');
      await log({
        actorId: user.id,
        action: input.status === 'APPROVED' ? 'script.approved' : 'script.changes_requested',
        entityType: 'script',
        entityId: id,
        projectId: s.projectId,
        summary: `${input.decidedBy ?? user.name} ${input.status === 'APPROVED' ? 'approved' : input.status === 'REJECTED' ? 'rejected' : 'requested changes to'} v${s.currentVersion} of “${s.title}”${input.decidedBy ? ` (recorded by ${user.name})` : ''}`,
      });
    });
    return this.get(id);
  }

  async remove(id: string, user: SessionUser) {
    const s = await this.database.models.Script.findById(id).lean<Script>();
    if (!s) throw notFound('Script');
    if (s.status === 'APPROVED' || s.status === 'IN_REVIEW') {
      throw conflict(
        'SCRIPT_LOCKED',
        `“${s.title}” is ${SCRIPT_STATUS_LABELS[s.status].toLowerCase()} and is part of the project record; it cannot be deleted.`,
      );
    }
    await this.activity.transaction(async (log) => {
      await this.database.deleteCascade('Script', { _id: id });
      await log({
        actorId: user.id,
        action: 'script.deleted',
        entityType: 'script',
        entityId: id,
        projectId: s.projectId,
        summary: `${user.name} deleted draft “${s.title}”`,
      });
    });
  }

  /** Rule-based breakdown of the current version (a preview; nothing is saved). */
  async breakdown(id: string): Promise<BreakdownResult> {
    const s = await this.get(id);
    return breakdownScript(s.body);
  }

  async applyBreakdown(id: string, input: ApplyBreakdown, user: SessionUser) {
    const s = await this.database.models.Script.findById(id).lean<Script>();
    if (!s) throw notFound('Script');
    await this.activity.transaction(async (log) => {
      if (input.replace) {
        await this.database.models.Scene.deleteMany({
          scriptId: id,
          source: 'RULE_BASED',
          shootId: null,
        });
      }
      const last = await this.database.models.Scene.findOne({ projectId: s.projectId })
        .sort({ sortOrder: -1 })
        .lean<Scene>();
      let order = (last?.sortOrder ?? 0) + 1;
      await this.database.models.Scene.insertMany(
        input.scenes.map((x) => ({
          ...x,
          projectId: s.projectId,
          scriptId: id,
          sortOrder: order++,
          source: 'RULE_BASED',
        })),
      );
      await log({
        actorId: user.id,
        action: 'scene.breakdown',
        entityType: 'script',
        entityId: id,
        projectId: s.projectId,
        summary: `${user.name} added ${input.scenes.length} scene(s) from the rule-based breakdown of “${s.title}”`,
      });
    });
    return this.get(id);
  }

  // ── Scenes ──────────────────────────────────────────────────────────────────

  async scenes(q: SceneQuery): Promise<SceneView[]> {
    const where: Record<string, unknown> = {};
    if (q.projectId) where.projectId = q.projectId;
    if (q.shootId) where.shootId = q.shootId;
    const rows = await this.database.models.Scene.find(where)
      .sort(q.shootId ? { shootDate: 1, plannedStart: 1, sortOrder: 1 } : sceneSort)
      .populate({ path: 'shoot', select: { title: 1, startsAt: 1 } })
      .lean<SceneRow[]>();
    return rows.map(toSceneView);
  }

  private async sceneView(id: string) {
    const row = await this.database.models.Scene.findById(id)
      .populate({ path: 'shoot', select: { title: 1, startsAt: 1 } })
      .lean<SceneRow>();
    if (!row) throw notFound('Scene');
    return toSceneView(row);
  }

  async createScene(input: CreateScene, user: SessionUser): Promise<SceneView> {
    const project = await this.database.models.Project.findById(input.projectId).lean<Project>();
    if (!project) throw unprocessable('INVALID_PROJECT', 'Choose an existing project.');
    if (input.scriptId) {
      const script = await this.database.models.Script.findById(input.scriptId).lean<Script>();
      if (!script || script.projectId !== project.id)
        throw unprocessable('INVALID_SCRIPT', 'The script belongs to another project.');
    }
    const last = await this.database.models.Scene.findOne({ projectId: project.id })
      .sort({ sortOrder: -1 })
      .lean<Scene>();
    const scene = await this.activity.transaction(async (log) => {
      const created = (
        await this.database.models.Scene.create({
          ...input,
          scriptId: input.scriptId ?? null,
          sortOrder: (last?.sortOrder ?? 0) + 1,
        })
      ).toObject<Scene>();
      await log({
        actorId: user.id,
        action: 'scene.created',
        entityType: 'scene',
        entityId: created.id,
        projectId: project.id,
        summary: `${user.name} added scene ${created.number} “${created.heading}” to ${project.title}`,
      });
      return created;
    });
    return this.sceneView(scene.id);
  }

  async updateScene(id: string, input: UpdateScene, user: SessionUser): Promise<SceneView> {
    const scene = await this.database.models.Scene.findById(id).lean<Scene>();
    if (!scene) throw notFound('Scene');
    const set: Record<string, unknown> = { ...input };
    let shoot: Shoot | null = null;
    const shootId = input.shootId === undefined ? scene.shootId : input.shootId;
    if (shootId) {
      shoot = await this.database.models.Shoot.findById(shootId).lean<Shoot>();
      if (!shoot || shoot.projectId !== scene.projectId) {
        throw unprocessable('INVALID_SHOOT', 'Schedule the scene on a shoot of the same project.');
      }
    }
    if (input.shootId !== undefined) {
      if (input.shootId === null) {
        set.shootDate = null;
        set.plannedStart = null;
        if (scene.status === 'SCHEDULED') set.status = 'PLANNED';
      } else {
        if (scene.status === 'PLANNED' && !input.status) set.status = 'SCHEDULED';
        // Default to the shoot's first day.
        if (input.shootDate === undefined && (!scene.shootDate || scene.shootId !== input.shootId))
          set.shootDate = new Date(`${istDayKey(shoot!.startsAt)}T00:00:00.000Z`);
      }
    }
    if (input.shootDate && shoot) {
      const days = shootDayKeys(shoot.startsAt, shoot.endsAt);
      const key = input.shootDate.toISOString().slice(0, 10);
      if (!days.includes(key)) {
        throw unprocessable(
          'DATE_OUTSIDE_SHOOT',
          `“${shoot.title}” runs ${days[0]} to ${days.at(-1)}.`,
        );
      }
      set.shootDate = new Date(`${key}T00:00:00.000Z`);
    }
    if (input.status === 'SHOT') {
      if (!shootId) throw unprocessable('NOT_SCHEDULED', 'Schedule the scene on a shoot first.');
      set.completedAt = new Date();
    } else if (input.status) set.completedAt = null;
    if (input.status === 'SCHEDULED' && !shootId) {
      throw unprocessable('NOT_SCHEDULED', 'Choose the shoot this scene is scheduled on.');
    }

    await this.activity.transaction(async (log) => {
      await this.database.models.Scene.updateOne({ _id: id }, { $set: set });
      const what =
        input.status && input.status !== scene.status
          ? input.status === 'SHOT'
            ? `marked scene ${scene.number} shot`
            : input.status === 'DROPPED'
              ? `dropped scene ${scene.number}`
              : `set scene ${scene.number} to ${input.status.toLowerCase()}`
          : input.shootId !== undefined && input.shootId !== scene.shootId
            ? input.shootId
              ? `scheduled scene ${scene.number} on “${shoot!.title}”`
              : `unscheduled scene ${scene.number}`
            : `updated scene ${scene.number}`;
      await log({
        actorId: user.id,
        action: input.status === 'SHOT' ? 'scene.shot' : 'scene.updated',
        entityType: 'scene',
        entityId: id,
        projectId: scene.projectId,
        summary: `${user.name} ${what}`,
      });
    });
    return this.sceneView(id);
  }

  async removeScene(id: string, user: SessionUser) {
    const scene = await this.database.models.Scene.findById(id).lean<Scene>();
    if (!scene) throw notFound('Scene');
    if (scene.status === 'SHOT') {
      throw conflict(
        'SCENE_SHOT',
        'This scene has been shot; mark it dropped instead of deleting it.',
      );
    }
    await this.activity.transaction(async (log) => {
      await this.database.models.Scene.deleteOne({ _id: id });
      await log({
        actorId: user.id,
        action: 'scene.deleted',
        entityType: 'scene',
        entityId: id,
        projectId: scene.projectId,
        summary: `${user.name} removed scene ${scene.number} “${scene.heading}”`,
      });
    });
  }
}
