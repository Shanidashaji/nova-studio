import type { INestApplication } from '@nestjs/common';
import type { ActivityLog, Database, Project, Task, TeamMember } from '@nova/db';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, ORIGIN, bootApp, found, setKnownPasswords, signIn, testDb } from './helpers';

let app: INestApplication;
let db: Database;
let admin: Awaited<ReturnType<typeof signIn>>;

beforeAll(async () => {
  // Integration tests exercise demo mode regardless of the developer's .env.
  process.env.ANTHROPIC_API_KEY = '';
  app = await bootApp();
  db = await testDb();
  await setKnownPasswords(db);
  admin = await signIn(app, ADMIN);
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

const ask = (message: string, context?: unknown) =>
  admin.post('/api/v1/assistant/messages').set('origin', ORIGIN).send({ message, context });

describe('NOVA assistant (demo mode)', () => {
  it('reports its provider', async () => {
    const res = await admin.get('/api/v1/assistant/status');
    expect(res.body).toEqual({ provider: 'demo', model: null });
  });

  it('answers questions from live data with linked entities', async () => {
    const res = await ask('Which workflows are blocked?');
    expect(res.status).toBe(200);
    expect(res.body.content).toContain('Colour grade');
    expect(res.body.references.some((r: { type: string }) => r.type === 'project')).toBe(true);
    expect(res.body.proposals).toHaveLength(0);
  });

  it('proposes a task without creating it, then creates it on confirmation', async () => {
    const before = await db.models.Task.countDocuments({ title: 'Assistant test task' });
    const res = await ask(
      'Create a task "Assistant test task" for Woven Light due Friday for Divya',
    );
    expect(res.status).toBe(200);
    expect(res.body.proposals).toHaveLength(1);
    const proposal = res.body.proposals[0];
    expect(proposal.status).toBe('PROPOSED');
    expect(await db.models.Task.countDocuments({ title: 'Assistant test task' })).toBe(before);

    const confirmed = await admin
      .post(`/api/v1/assistant/actions/${proposal.id}/confirm`)
      .set('origin', ORIGIN);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('CONFIRMED');
    const task = await found(
      db.models.Task.findOne({ title: 'Assistant test task' })
        .populate('assignee')
        .lean<Task & { assignee: TeamMember | null }>(),
    );
    expect(task.assignee?.name).toBe('Divya Raghavan');
    const log = await db.models.ActivityLog.findOne({
      entityId: task.id,
      action: 'task.created',
    }).lean<ActivityLog>();
    expect(log?.source).toBe('ASSISTANT');

    const twice = await admin
      .post(`/api/v1/assistant/actions/${proposal.id}/confirm`)
      .set('origin', ORIGIN);
    expect(twice.status).toBe(409);
  });

  it('does not apply a cancelled proposal', async () => {
    const res = await ask('Log a call with Coastline: discussed monsoon shoot dates');
    const proposal = res.body.proposals[0];
    const cancelled = await admin
      .post(`/api/v1/assistant/actions/${proposal.id}/cancel`)
      .set('origin', ORIGIN);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(
      await db.models.ClientInteraction.countDocuments({
        summary: 'discussed monsoon shoot dates',
      }),
    ).toBe(0);
  });

  it('marks a proposal stale when its target changed before confirmation', async () => {
    const res = await ask('Mark sky replacement on Woven Light as done');
    const proposal = res.body.proposals[0];
    expect(proposal).toBeTruthy();
    const woven = await found(db.models.Project.findOne({ code: 'NM-26-031' }).lean<Project>());
    const task = await found(
      db.models.Task.findOne({ title: /^Sky replacement/, projectId: woven.id }).lean<Task>(),
    );
    await db.models.Task.updateOne(
      { _id: task.id },
      { $set: { description: 'changed elsewhere' } },
    );
    const confirmed = await admin
      .post(`/api/v1/assistant/actions/${proposal.id}/confirm`)
      .set('origin', ORIGIN);
    expect(confirmed.body.status).toBe('STALE');
    expect((await found(db.models.Task.findById(task.id).lean<Task>())).status).not.toBe('DONE');
  });

  it('scopes a reassignment to the production named in the request', async () => {
    const res = await ask('Reassign colour grade on Campus Stories to Divya');
    expect(res.body.proposals).toHaveLength(1);
    expect(res.body.proposals[0].title).toBe('Update “Colour grade” on Campus Stories');
    expect(res.body.proposals[0].changes[0]).toMatchObject({
      field: 'Assignee',
      to: 'Divya Raghavan',
    });
  });

  it('explains instead of proposing when workflow rules block a stage move', async () => {
    const res = await ask('Advance Woven Light');
    expect(res.body.proposals).toHaveLength(0);
    expect(res.body.content).toMatch(/can't leave Edit yet/);
  });

  it('uses the inspected project as "this project"', async () => {
    const p = await found(db.models.Project.findOne({ code: 'NM-26-037' }).lean<Project>());
    const res = await ask('Create a task "Context task" due tomorrow', {
      inspect: { type: 'project', id: p.id },
    });
    expect(res.body.proposals[0].changes[0].to).toContain('Campus Stories');
  });

  it('persists the conversation history', async () => {
    const res = await admin.get('/api/v1/assistant/history');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body.some((m: { role: string }) => m.role === 'USER')).toBe(true);
  });
});

describe('NOVA languages (demo mode)', () => {
  it('reports the reply and user language', async () => {
    const res = await ask('Which projects are delayed?');
    expect(res.status).toBe(200);
    expect(res.body.language).toEqual({ code: 'en', source: 'model' });
    expect(res.body.userLanguage).toEqual({ code: 'en', source: 'detected' });
  });

  it('says plainly that demo mode cannot answer in Malayalam instead of pretending', async () => {
    const res = await ask('ഇന്ന് എന്താണ് ശ്രദ്ധിക്കേണ്ടത്?');
    expect(res.status).toBe(200);
    expect(res.body.content).toContain('Demo mode understands English only');
    expect(res.body.content).toContain('Malayalam');
    expect(res.body.language.code).toBe('en');
    expect(res.body.userLanguage).toEqual({ code: 'ml', source: 'detected' });

    const history = await admin.get('/api/v1/assistant/history');
    const mine = history.body.find(
      (m: { role: string; content: string }) =>
        m.role === 'USER' && m.content === 'ഇന്ന് എന്താണ് ശ്രദ്ധിക്കേണ്ടത്?',
    );
    expect(mine.language).toEqual({ code: 'ml', source: 'detected' });
  });

  it('accepts voice messages with the recogniser locale and rejects malformed locales', async () => {
    const ok = await admin.post('/api/v1/assistant/messages').set('origin', ORIGIN).send({
      message: 'Show the workload of the team',
      channel: 'voice',
      speechLanguage: 'en-IN',
    });
    expect(ok.status).toBe(200);
    const bad = await admin
      .post('/api/v1/assistant/messages')
      .set('origin', ORIGIN)
      .send({ message: 'hello', channel: 'voice', speechLanguage: 'not a locale' });
    expect(bad.status).toBe(400);
  });
});
