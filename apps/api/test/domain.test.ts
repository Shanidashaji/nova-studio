import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@nova/db';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, ORIGIN, VIEWER, bootApp, setKnownPasswords, signIn, testDb } from './helpers';

let app: INestApplication;
let db: PrismaClient;
let admin: Awaited<ReturnType<typeof signIn>>;
let viewer: Awaited<ReturnType<typeof signIn>>;

beforeAll(async () => {
  app = await bootApp();
  db = testDb();
  await setKnownPasswords(db);
  admin = await signIn(app, ADMIN);
  viewer = await signIn(app, VIEWER);
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

const project = (code: string) => db.project.findUniqueOrThrow({ where: { code } });

describe('pulse and read models', () => {
  it('returns the spine, a ranked attention queue and totals', async () => {
    const res = await admin.get('/api/v1/workspace/pulse');
    expect(res.status).toBe(200);
    expect(res.body.spine).toHaveLength(6);
    expect(res.body.spine.filter((s: { isConstraint: boolean }) => s.isConstraint)).toHaveLength(1);
    const scores = res.body.attention.map((a: { score: number }) => a.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(res.body.attention.some((a: { kind: string }) => a.kind === 'BOOKING_CONFLICT')).toBe(
      true,
    );
  });

  it('explains project health with deductions', async () => {
    const p = await project('NM-26-039');
    const res = await admin.get(`/api/v1/projects/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.health.band).not.toBe('ON_TRACK');
    expect(res.body.health.deductions.map((d: { code: string }) => d.code)).toContain('OVERDUE');
  });

  it('filters and sorts the project list', async () => {
    const res = await admin.get('/api/v1/projects?stage=EDIT&sort=health');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((p: { stage: { key: string } }) => p.stage.key === 'EDIT')).toBe(true);
  });

  it('rejects invalid query parameters', async () => {
    const res = await admin.get('/api/v1/projects?stage=NOT_A_STAGE');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 in the standard envelope for unknown ids', async () => {
    const res = await admin.get('/api/v1/projects/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('role-based authorisation', () => {
  it('lets a viewer read but not write', async () => {
    expect((await viewer.get('/api/v1/workspace/pulse')).status).toBe(200);
    const p = await project('NM-26-031');
    const res = await viewer
      .post('/api/v1/tasks')
      .set('origin', ORIGIN)
      .send({ projectId: p.id, title: 'Should fail' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('denies the viewer stage transitions and the assistant', async () => {
    const p = await project('NM-26-031');
    expect(
      (
        await viewer
          .post(`/api/v1/projects/${p.id}/transitions`)
          .set('origin', ORIGIN)
          .send({ direction: 'FORWARD' })
      ).status,
    ).toBe(403);
    expect(
      (
        await viewer
          .post('/api/v1/assistant/messages')
          .set('origin', ORIGIN)
          .send({ message: 'hi' })
      ).status,
    ).toBe(403);
  });
});

describe('workflow engine', () => {
  it('blocks a transition and names the open blocking tasks', async () => {
    const p = await project('NM-26-031');
    const res = await admin
      .post(`/api/v1/projects/${p.id}/transitions`)
      .set('origin', ORIGIN)
      .send({ direction: 'FORWARD' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TRANSITION_BLOCKED');
    const blocker = res.body.error.details.blockers.find(
      (b: { code: string }) => b.code === 'OPEN_BLOCKING_TASKS',
    );
    expect(blocker.taskIds.length).toBeGreaterThan(0);
  });

  it('advances once blocking work is done, records history and audit', async () => {
    const p = await db.project.findUniqueOrThrow({
      where: { code: 'NM-26-040' },
      include: { stages: { include: { stageDefinition: true } } },
    });
    const delivery = p.stages.find((s) => s.stageDefinition.key === 'DELIVERY')!;
    // Complete blocking tasks in dependency order through the API.
    const tasks = await db.task.findMany({
      where: { projectStageId: delivery.id },
      orderBy: { createdAt: 'asc' },
    });
    for (const t of tasks.filter((x) => x.status !== 'DONE')) {
      const r = await admin
        .patch(`/api/v1/tasks/${t.id}`)
        .set('origin', ORIGIN)
        .send({ status: 'DONE' });
      expect(r.status).toBe(200);
    }
    const res = await admin
      .post(`/api/v1/projects/${p.id}/transitions`)
      .set('origin', ORIGIN)
      .send({ direction: 'FORWARD' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DELIVERED');
    expect(await db.stageTransition.count({ where: { projectId: p.id, toStageId: null } })).toBe(1);
    expect(
      await db.activityLog.count({ where: { projectId: p.id, action: 'project.delivered' } }),
    ).toBeGreaterThan(0);
  });

  it('requires a reason to send work back', async () => {
    const p = await db.project.findUniqueOrThrow({
      where: { code: 'NM-26-032' },
      include: { stages: { include: { stageDefinition: true } } },
    });
    const edit = p.stages.find((s) => s.stageDefinition.key === 'EDIT')!;
    const missing = await admin
      .post(`/api/v1/projects/${p.id}/transitions`)
      .set('origin', ORIGIN)
      .send({ direction: 'BACKWARD', targetStageId: edit.id });
    expect(missing.status).toBe(400);
    const ok = await admin.post(`/api/v1/projects/${p.id}/transitions`).set('origin', ORIGIN).send({
      direction: 'BACKWARD',
      targetStageId: edit.id,
      reason: 'Client wants a new opening shot',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.stage.key).toBe('EDIT');
  });
});

describe('tasks and dependencies', () => {
  it('refuses to start a task whose prerequisites are open', async () => {
    const grade = await db.task.findFirstOrThrow({
      where: { title: 'Colour grade', project: { code: 'NM-26-031' } },
    });
    const res = await admin
      .patch(`/api/v1/tasks/${grade.id}`)
      .set('origin', ORIGIN)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DEPENDENCIES_OPEN');
  });

  it('rejects dependency cycles', async () => {
    const p = await project('NM-26-037');
    const a = (
      await admin
        .post('/api/v1/tasks')
        .set('origin', ORIGIN)
        .send({ projectId: p.id, title: 'Cycle A' })
    ).body;
    const b = (
      await admin
        .post('/api/v1/tasks')
        .set('origin', ORIGIN)
        .send({ projectId: p.id, title: 'Cycle B' })
    ).body;
    expect(
      (
        await admin
          .post(`/api/v1/tasks/${b.id}/dependencies`)
          .set('origin', ORIGIN)
          .send({ dependsOnId: a.id })
      ).status,
    ).toBe(201);
    const cycle = await admin
      .post(`/api/v1/tasks/${a.id}/dependencies`)
      .set('origin', ORIGIN)
      .send({ dependsOnId: b.id });
    expect(cycle.status).toBe(422);
    expect(cycle.body.error.code).toBe('DEPENDENCY_CYCLE');
  });

  it('validates task input', async () => {
    const res = await admin.post('/api/v1/tasks').set('origin', ORIGIN).send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['projectId', 'title']),
    );
  });
});

describe('scheduling', () => {
  it('rejects double-booking equipment unless the overlap is acknowledged', async () => {
    const shoot = await db.shoot.findFirstOrThrow({ where: { title: 'Beach reels' } });
    const drone = await db.asset.findUniqueOrThrow({ where: { serialTag: 'NM-DRO-INSPIRE3' } });
    const clash = await admin
      .post(`/api/v1/shoots/${shoot.id}/bookings`)
      .set('origin', ORIGIN)
      .send({ assetId: drone.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('BOOKING_CONFLICT');
    const forced = await admin
      .post(`/api/v1/shoots/${shoot.id}/bookings`)
      .set('origin', ORIGIN)
      .send({ assetId: drone.id, allowOverlap: true });
    expect(forced.status).toBe(201);
    expect(forced.body.conflicts.length).toBeGreaterThan(0);
  });

  it('refuses to book equipment in maintenance', async () => {
    const shoot = await db.shoot.findFirstOrThrow({ where: { title: 'Location recce' } });
    const komodo = await db.asset.findUniqueOrThrow({ where: { serialTag: 'NM-CAM-KOMODO' } });
    const res = await admin
      .post(`/api/v1/shoots/${shoot.id}/bookings`)
      .set('origin', ORIGIN)
      .send({ assetId: komodo.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ASSET_UNAVAILABLE');
  });
});

describe('client review loop', () => {
  it('records a client decision and closes the revision round', async () => {
    const approval = await db.approval.findFirstOrThrow({
      where: { status: 'PENDING', deliverable: { project: { code: 'NM-26-032' } } },
    });
    const res = await admin
      .post(`/api/v1/approvals/${approval.id}/decision`)
      .set('origin', ORIGIN)
      .send({ status: 'APPROVED', note: 'Signed off on call' });
    expect(res.status).toBe(201);
    const d = await db.deliverable.findUniqueOrThrow({
      where: { id: approval.deliverableId! },
      include: { rounds: true },
    });
    expect(d.status).toBe('APPROVED');
    expect(d.rounds.every((r) => r.closedAt !== null)).toBe(true);
    const again = await admin
      .post(`/api/v1/approvals/${approval.id}/decision`)
      .set('origin', ORIGIN)
      .send({ status: 'APPROVED' });
    expect(again.status).toBe(409);
  });
});
