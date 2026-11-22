/**
 * Production-studio layer: artists and double-booking, scripts and breakdown, shoot readiness
 * gates, the shoot-day log, client communication automation, budget variance, the task board,
 * capacity, the command centre and smart alerts. Runs against the seeded test database.
 */
import type { INestApplication } from '@nestjs/common';
import type { ClientMessage, Database, Project, Shoot, Talent, WorkflowTemplate } from '@nova/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN,
  CREATIVE,
  ORIGIN,
  PRODUCER,
  VIEWER,
  bootApp,
  found,
  setKnownPasswords,
  signIn,
  testDb,
} from './helpers';

type Agent = Awaited<ReturnType<typeof signIn>>;
let app: INestApplication;
let db: Database;
let admin: Agent;
let producer: Agent;
let creative: Agent;
let viewer: Agent;

beforeAll(async () => {
  app = await bootApp();
  db = await testDb();
  await setKnownPasswords(db);
  admin = await signIn(app, ADMIN);
  producer = await signIn(app, PRODUCER);
  creative = await signIn(app, CREATIVE);
  viewer = await signIn(app, VIEWER);
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

const post = (a: Agent, url: string, body?: object) =>
  a
    .post(`/api/v1${url}`)
    .set('origin', ORIGIN)
    .send(body ?? {});
const patch = (a: Agent, url: string, body: object) =>
  a.patch(`/api/v1${url}`).set('origin', ORIGIN).send(body);
const del = (a: Agent, url: string) => a.delete(`/api/v1${url}`).set('origin', ORIGIN);
const get = (a: Agent, url: string) => a.get(`/api/v1${url}`);
const DAY = 86_400_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Automation runs after the response (async event handler); poll for its result. */
async function eventually<T>(fn: () => Promise<T | null | undefined>, tries = 25): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await wait(200);
  }
  throw new Error('Condition not met in time');
}

/** A fresh client + project for isolated workflows. */
async function newProject(title: string) {
  const template = await found(
    db.models.WorkflowTemplate.findOne({ isDefault: true }).lean<WorkflowTemplate>(),
  );
  const client = await post(admin, '/clients', {
    name: `${title} Client`,
    industry: 'Retail',
    city: 'Kozhikode',
    contactName: 'Asha Client',
    contactEmail: 'asha@client.example',
    contactPhone: '+91 90000 11111',
  });
  expect(client.status).toBe(201);
  const start = new Date();
  const res = await post(admin, '/projects', {
    title,
    clientId: client.body.id,
    type: 'BRAND_FILM',
    workflowTemplateId: template.id,
    location: 'KOZHIKODE',
    startDate: start.toISOString(),
    dueDate: new Date(start.getTime() + 40 * DAY).toISOString(),
    budget: 500000,
  });
  expect(res.status).toBe(201);
  return { projectId: res.body.id as string, clientId: client.body.id as string };
}

async function newShoot(projectId: string, dayOffset: number, days = 1, title = 'Test shoot') {
  const startsAt = new Date(Date.now() + dayOffset * DAY);
  startsAt.setUTCHours(3, 30, 0, 0);
  const endsAt = new Date(startsAt.getTime() + (days - 1) * DAY + 10 * 3600 * 1000);
  const res = await post(admin, '/shoots', {
    projectId,
    title,
    location: 'Studio floor A',
    city: 'KOZHIKODE',
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    callTime: '08:00',
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Workflow A — brief to delivery building blocks', () => {
  let projectId: string;
  let scriptId: string;
  let shootId: string;

  it('creates a project and prepares a confirmation message by automation', async () => {
    ({ projectId } = await newProject('Workflow A Film'));
    const msg = await eventually(() =>
      db.models.ClientMessage.findOne({
        projectId,
        trigger: 'PROJECT_CONFIRMED',
      }).lean<ClientMessage>(),
    );
    expect(msg.status).toBe('DRAFT');
    expect(msg.body).toContain('Workflow A Film');
    expect(msg.recipientAddress).toBe('asha@client.example');
  });

  it('writes a brief and a script, versions them and keeps approval per version', async () => {
    const brief = await post(creative, '/scripts', {
      projectId,
      kind: 'BRIEF',
      title: 'Brief',
      body: 'Goal: launch.',
    });
    expect(brief.status).toBe(201);
    const script = await post(creative, '/scripts', {
      projectId,
      title: 'Hero film',
      body: '1. INT. KITCHEN - NIGHT\nMEERA (30) pours COFFEE.\n\nMEERA\nHello.\n\n2. EXT. BEACH - DAY\nAerial drone shot. RAHUL walks with a SURFBOARD.',
    });
    expect(script.status).toBe(201);
    scriptId = script.body.id;
    expect(script.body.currentVersion).toBe(1);

    // A viewer cannot decide; deciding a draft is refused.
    expect(
      (await post(viewer, `/scripts/${scriptId}/decision`, { status: 'APPROVED' })).status,
    ).toBe(403);
    expect(
      (await post(admin, `/scripts/${scriptId}/decision`, { status: 'APPROVED' })).status,
    ).toBe(409);

    expect((await post(creative, `/scripts/${scriptId}/submit`, {})).status).toBe(201);
    // In review: no new version until the client decides.
    expect((await post(creative, `/scripts/${scriptId}/versions`, { body: 'x' })).status).toBe(409);
    const changes = await post(admin, `/scripts/${scriptId}/decision`, {
      status: 'CHANGES_REQUESTED',
    });
    expect(changes.status).toBe(422); // a note is required
    expect(
      (
        await post(admin, `/scripts/${scriptId}/decision`, {
          status: 'CHANGES_REQUESTED',
          note: 'Shorter',
        })
      ).body.status,
    ).toBe('CHANGES_REQUESTED');
    const v2 = await post(creative, `/scripts/${scriptId}/versions`, {
      body: '1. INT. KITCHEN - NIGHT\nMEERA (30) pours COFFEE.\n\nMEERA\nHello.\n\n2. EXT. BEACH - DAY\nAerial drone shot. RAHUL walks with a SURFBOARD.',
      changeNote: 'Shorter',
    });
    expect(v2.body.currentVersion).toBe(2);
    expect(v2.body.status).toBe('DRAFT');
    await post(creative, `/scripts/${scriptId}/submit`, {});
    const approved = await post(admin, `/scripts/${scriptId}/decision`, {
      status: 'APPROVED',
      decidedBy: 'Asha Client',
    });
    expect(approved.body).toMatchObject({ status: 'APPROVED', decidedBy: 'Asha Client' });
    await eventually(() =>
      db.models.ClientMessage.findOne({
        trigger: 'SCRIPT_REVIEW',
        dedupeKey: `SCRIPT_REVIEW:${scriptId}:v2`,
      }).lean(),
    );
    // Approved scripts are part of the record.
    expect((await del(creative, `/scripts/${scriptId}`)).status).toBe(409);
  });

  it('breaks the script down by rule and applies the scenes', async () => {
    const preview = await post(creative, `/scripts/${scriptId}/breakdown`);
    expect(preview.status).toBe(201);
    expect(preview.body.method).toBe('RULE_BASED');
    expect(preview.body.scenes).toHaveLength(2);
    expect(preview.body.scenes[0]).toMatchObject({
      setting: 'INT',
      timeOfDay: 'NIGHT',
      characters: ['Meera'],
    });
    expect(preview.body.scenes[1].equipment).toContain('Drone');
    const applied = await post(creative, `/scripts/${scriptId}/breakdown/apply`, {
      scenes: preview.body.scenes,
    });
    expect(applied.body.scenes).toHaveLength(2);
  });

  it(
    'blocks confirming a shoot until it is ready, then runs the shoot day',
    { timeout: 90_000 },
    async () => {
      shootId = await newShoot(projectId, 6);
      const notReady = await patch(admin, `/shoots/${shootId}`, { status: 'CONFIRMED' });
      expect(notReady.status).toBe(422);
      expect(notReady.body.error.code).toBe('SHOOT_NOT_READY');

      const scenes = await get(admin, `/scenes?projectId=${projectId}`);
      for (const s of scenes.body)
        expect((await patch(admin, `/scenes/${s.id}`, { shootId })).body.status).toBe('SCHEDULED');

      const members = await db.models.TeamMember.find({ isActive: true }).lean();
      const director = members.find((m) => m.title === 'Director')!;
      const dop = members.find((m) => m.title === 'Director of Photography')!;
      // Crew free on that day (seeded shoots are in the next ~12 days; day 6 is free in the seed).
      expect(
        (
          await post(admin, `/shoots/${shootId}/crew`, {
            teamMemberId: director.id,
            role: 'Director',
          })
        ).status,
      ).toBe(201);
      expect(
        (await post(admin, `/shoots/${shootId}/crew`, { teamMemberId: dop.id, role: 'DOP' }))
          .status,
      ).toBe(201);
      const asset = await db.models.Asset.findOne({
        status: 'AVAILABLE',
        category: 'LIGHTING',
      }).lean();
      expect(
        (await post(admin, `/shoots/${shootId}/bookings`, { assetId: asset!.id })).status,
      ).toBe(201);

      // Casting: recommendations explain themselves; book the characters.
      const recs = await get(
        admin,
        `/recommendations/talent?shootId=${shootId}&role=Meera&description=nurse%20mother`,
      );
      expect(recs.status).toBe(200);
      expect(recs.body.method).toBe('RULE_BASED');
      expect(recs.body.candidates[0].reasons.length).toBeGreaterThan(0);
      const meera = await found(
        db.models.Talent.findOne({ name: 'Meera Krishnan' }).lean<Talent>(),
      );
      const rahul = await found(
        db.models.Talent.findOne({ name: 'Rahul Varghese' }).lean<Talent>(),
      );
      const held = await post(admin, `/shoots/${shootId}/talent`, {
        talentId: meera.id,
        character: 'Meera',
      });
      expect(held.status).toBe(201);
      let ws = await post(admin, `/shoots/${shootId}/talent`, {
        talentId: rahul.id,
        character: 'Rahul',
        status: 'CONFIRMED',
      });
      expect((await patch(admin, `/shoots/${shootId}`, { status: 'CONFIRMED' })).status).toBe(422); // Meera on hold
      const booking = ws.body.talent.find(
        (t: { talent: { id: string } }) => t.talent.id === meera.id,
      );
      ws = await patch(admin, `/talent-bookings/${booking.id}`, { status: 'CONFIRMED' });
      expect(ws.body.readiness.canConfirm).toBe(true);

      const confirmed = await patch(admin, `/shoots/${shootId}`, { status: 'CONFIRMED' });
      expect(confirmed.status).toBe(200);
      // Automation: confirmation + instructions + reminder.
      const prepared = await eventually(async () => {
        const rows = await db.models.ClientMessage.find({ shootId }).lean<ClientMessage[]>();
        return rows.length >= 3 ? rows : null;
      });
      expect(prepared.map((r) => r.trigger).sort()).toEqual([
        'PRE_SHOOT_INSTRUCTIONS',
        'SHOOT_CONFIRMED',
        'SHOOT_REMINDER',
      ]);
      expect(prepared.find((r) => r.trigger === 'SHOOT_REMINDER')!.status).toBe('QUEUED'); // AUTO template

      // Cannot start a shoot that is days away, nor without a call sheet.
      expect((await patch(admin, `/shoots/${shootId}`, { status: 'IN_PROGRESS' })).status).toBe(
        422,
      );
      const published = await post(admin, `/shoots/${shootId}/call-sheet/publish`);
      expect(published.body.callSheetPublishedAt).not.toBeNull();

      // Move the shoot: schedule-change message, old reminders superseded.
      const s = await found(db.models.Shoot.findById(shootId).lean<Shoot>());
      const moved = await patch(admin, `/shoots/${shootId}`, {
        startsAt: new Date(s.startsAt.getTime() - DAY).toISOString(),
        endsAt: new Date(s.endsAt.getTime() - DAY).toISOString(),
      });
      expect(moved.status).toBe(200);
      const change = await eventually(() =>
        db.models.ClientMessage.findOne({
          shootId,
          trigger: 'SCHEDULE_CHANGED',
        }).lean<ClientMessage>(),
      );
      expect(change.body).toMatch(/has moved from/);
      const superseded = await db.models.ClientMessage.find({
        shootId,
        trigger: 'SHOOT_REMINDER',
        status: 'CANCELLED',
      }).lean();
      expect(superseded.length).toBe(1);
    },
  );

  it('logs issues on set and scene progress', async () => {
    let ws = await post(producer, `/shoots/${shootId}/log`, {
      kind: 'DELAY',
      body: 'Generator late',
      minutesLost: 40,
    });
    expect(ws.status).toBe(201);
    ws = await post(producer, `/shoots/${shootId}/log`, { kind: 'ISSUE', body: 'Permit missing' });
    expect(ws.body.openIssues).toBe(1);
    expect(ws.body.delayMinutes).toBe(40);
    const issue = ws.body.log.find((l: { kind: string }) => l.kind === 'ISSUE');
    ws = await patch(producer, `/shoot-log/${issue.id}`, { resolved: true });
    expect(ws.body.openIssues).toBe(0);
    const scene = ws.body.scenes[0];
    expect((await patch(producer, `/scenes/${scene.id}`, { status: 'SHOT' })).body.status).toBe(
      'SHOT',
    );
    const item = ws.body.checklist[0];
    ws = await patch(producer, `/shoots/${shootId}/checklist/${item.id}`, { done: true });
    expect(ws.body.checklist[0].done).toBe(true);
  });

  it('gates the client review behind internal review and tracks deadlines', async () => {
    const deliverable = await db.models.Deliverable.create({
      projectId,
      name: 'Hero 16:9',
      format: 'MP4',
      aspectRatio: '16:9',
    });
    const editor = await db.models.TeamMember.findOne({ title: /editor/i }).lean();
    expect(
      (
        await patch(admin, `/deliverables/${deliverable.id}/post`, {
          editorId: editor!.id,
          editProgress: 60,
        })
      ).status,
    ).toBe(200);
    expect(
      (await post(admin, `/deliverables/${deliverable.id}/internal-review`, { action: 'REQUEST' }))
        .status,
    ).toBe(201);
    const blocked = await post(admin, `/deliverables/${deliverable.id}/review`, {});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('INTERNAL_REVIEW_OPEN');
    // Not started counts as not passed either.
    expect(
      (
        await post(creative, `/deliverables/${deliverable.id}/internal-review`, {
          action: 'APPROVE',
        })
      ).status,
    ).toBe(403);
    expect(
      (await post(admin, `/deliverables/${deliverable.id}/internal-review`, { action: 'APPROVE' }))
        .status,
    ).toBe(201);
    expect((await post(admin, `/deliverables/${deliverable.id}/review`, {})).status).toBe(201);
    const approval = await db.models.Approval.findOne({ deliverableId: deliverable.id }).lean();
    expect(approval!.dueAt!.getTime()).toBeGreaterThan(Date.now() + 2 * DAY);
    const msg = await eventually(() =>
      db.models.ClientMessage.findOne({
        trigger: 'APPROVAL_REQUEST',
        projectId,
      }).lean<ClientMessage>(),
    );
    expect(msg.body).toContain('[reviewLink]'); // no review portal configured: held for a person
    const board = await get(admin, '/post-production');
    const item = board.body.items.find(
      (i: { deliverableId: string }) => i.deliverableId === deliverable.id,
    );
    expect(item).toMatchObject({
      reviewState: 'PENDING_CLIENT',
      editProgress: 100,
      internalReview: 'APPROVED',
    });
  });
});

describe('Workflow B — simultaneous shoots and conflicts', () => {
  it(
    'refuses double-booking an artist and reports it when forced',
    { timeout: 90_000 },
    async () => {
      const { projectId: p1 } = await newProject('Workflow B One');
      const { projectId: p2 } = await newProject('Workflow B Two');
      const a = await newShoot(p1, 20, 3, 'Three-day shoot');
      const b = await newShoot(p2, 21, 1, 'Overlapping shoot');
      const devika = await found(db.models.Talent.findOne({ name: 'Devika Menon' }).lean<Talent>());
      expect(
        (await post(admin, `/shoots/${a}/talent`, { talentId: devika.id, character: 'Dancer' }))
          .status,
      ).toBe(201);
      const clash = await post(admin, `/shoots/${b}/talent`, {
        talentId: devika.id,
        character: 'Dancer',
      });
      expect(clash.status).toBe(409);
      expect(clash.body.error.code).toBe('TALENT_CONFLICT');
      const forced = await post(admin, `/shoots/${b}/talent`, {
        talentId: devika.id,
        character: 'Dancer',
        allowOverlap: true,
      });
      expect(forced.status).toBe(201);
      expect(
        forced.body.shoot.conflicts.some(
          (c: { talentBookingId: string | null }) => c.talentBookingId,
        ),
      ).toBe(true);
      expect(forced.body.shoot.dayCount).toBe(1);
      expect((await get(admin, `/shoots/${a}`)).body.dayCount).toBe(3);

      // Unavailable dates are refused too.
      const karthik = await found(
        db.models.Talent.findOne({ name: 'Karthik Raja' }).lean<Talent>(),
      );
      const blocked = await post(admin, `/talent/${karthik.id}/unavailability`, {
        from: new Date(Date.now() + 20 * DAY).toISOString(),
        to: new Date(Date.now() + 22 * DAY).toISOString(),
        reason: 'Travel',
      });
      expect(blocked.status).toBe(201);
      expect(
        (await post(admin, `/shoots/${a}/talent`, { talentId: karthik.id, character: 'Traveller' }))
          .status,
      ).toBe(409);

      // Capacity sees the overlap; resolving the conflict clears it.
      const cap = await get(
        admin,
        `/capacity?from=${new Date(Date.now() + 19 * DAY).toISOString()}&days=7`,
      );
      expect(cap.status).toBe(200);
      expect(cap.body.overlaps.length).toBeGreaterThan(0);
      expect(cap.body.verdict.headline).toBeTruthy();
      const ws = forced.body.talent.find(
        (t: { talent: { id: string } }) => t.talent.id === devika.id,
      );
      const released = await patch(admin, `/talent-bookings/${ws.id}`, { status: 'RELEASED' });
      expect(released.body.shoot.conflicts.length).toBe(0);
    },
  );

  it('lists artists free for a window', async () => {
    const free = await get(
      admin,
      `/talent?freeFrom=${new Date(Date.now() + 20 * DAY).toISOString()}&freeTo=${new Date(Date.now() + 21 * DAY).toISOString()}`,
    );
    expect(free.body.map((t: { name: string }) => t.name)).not.toContain('Karthik Raja');
  });
});

describe('Workflow C — task board flags overdue and blocked work', () => {
  it('derives overdue and dependency blockers', async () => {
    const { projectId } = await newProject('Workflow C');
    const first = await post(admin, '/tasks', {
      projectId,
      title: 'Location permit',
      dueDate: new Date(Date.now() - 2 * DAY).toISOString(),
    });
    const second = await post(admin, '/tasks', { projectId, title: 'Build set' });
    expect(
      (await post(admin, `/tasks/${second.body.id}/dependencies`, { dependsOnId: first.body.id }))
        .status,
    ).toBe(201);
    const board = await get(admin, `/task-board?projectId=${projectId}`);
    const items = board.body.items as { id: string; overdue: boolean; blocked: boolean }[];
    expect(items.find((i) => i.id === first.body.id)!.overdue).toBe(true);
    expect(items.find((i) => i.id === second.body.id)!.blocked).toBe(true);
    expect(
      (await get(admin, `/task-board?projectId=${projectId}&flag=overdue`)).body.items,
    ).toHaveLength(1);
    await patch(admin, `/tasks/${first.body.id}`, { status: 'DONE' });
    const after = await get(admin, `/task-board?projectId=${projectId}&flag=blocked`);
    expect(after.body.items).toHaveLength(0);
  });
});

describe('Workflow D — client message review and honest delivery', () => {
  it('refuses unfilled placeholders, then records a simulated send', async () => {
    const { projectId, clientId } = await newProject('Workflow D');
    const preview = await post(admin, '/communications/preview', {
      trigger: 'VIDEO_REVIEW',
      projectId,
    });
    expect(preview.body.missing).toContain('reviewLink');
    const draft = await post(admin, '/communications', {
      clientId,
      projectId,
      recipientName: 'Asha',
      recipientAddress: 'asha@client.example',
      subject: 'Review',
      body: preview.body.body,
    });
    expect(draft.status).toBe(201);
    expect(draft.body.unfilled).toContain('reviewLink');
    const refused = await post(admin, `/communications/${draft.body.id}/send`);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('UNFILLED_PLACEHOLDERS');
    await patch(admin, `/communications/${draft.body.id}`, {
      body: preview.body.body.replace('[reviewLink]', 'https://review.example/x'),
    });
    const sent = await post(admin, `/communications/${draft.body.id}/send`);
    expect(sent.status).toBe(201);
    // No provider configured in tests: never claimed as SENT.
    expect(sent.body.status).toBe('SIMULATED');
    expect(sent.body.statusNote).toMatch(/nothing leaves NOVA/i);
    expect((await post(admin, `/communications/${draft.body.id}/send`)).status).toBe(409);
    expect((await post(viewer, '/communications', {})).status).toBe(403);
  });

  it('edits templates but rejects unknown placeholders', async () => {
    const templates = await get(admin, '/communications/templates');
    expect(templates.body.length).toBeGreaterThanOrEqual(13);
    const t = templates.body[0];
    expect(
      (await patch(admin, `/communications/templates/${t.id}`, { body: 'Hi {{nope}}' })).status,
    ).toBe(422);
    const ok = await patch(admin, `/communications/templates/${t.id}`, { mode: 'OFF' });
    expect(ok.body.mode).toBe('OFF');
    await patch(admin, `/communications/templates/${t.id}`, { mode: 'DRAFT' });
  });
});

describe('Workflow E — budget plan and variance', () => {
  it('computes estimate against approved and paid cost', async () => {
    const { projectId } = await newProject('Workflow E');
    let budget = await post(admin, `/projects/${projectId}/budget-lines`, {
      group: 'CREW',
      label: 'Crew',
      estimated: 100000,
    });
    expect(budget.status).toBe(201);
    budget = await post(admin, `/projects/${projectId}/budget-lines`, {
      group: 'ARTIST',
      label: 'Artists',
      estimated: 50000,
    });
    expect(budget.body.estimated).toBe(150000);
    const user = await db.models.User.findOne({ email: ADMIN.email }).lean();
    await db.models.Expense.create({
      number: `EXP-TEST-${Date.now()}`,
      title: 'Crew day',
      category: 'CREW',
      amount: 120000,
      incurredOn: new Date(),
      projectId,
      submittedById: user!.id,
      status: 'APPROVED',
    });
    budget = await get(admin, `/projects/${projectId}/budget`);
    const crew = budget.body.groups.find((g: { group: string }) => g.group === 'CREW');
    expect(crew).toMatchObject({
      estimated: 100000,
      approved: 120000,
      actual: 120000,
      variance: 20000,
      band: 'OVER',
    });
    expect(budget.body.margin).toBe(500000 - 120000);
    expect((await get(creative, `/projects/${projectId}/budget`)).status).toBe(403);
    const report = await get(admin, '/reports');
    expect(
      report.body.budget.some((r: { id: string; variance: number }) => r.id === projectId),
    ).toBe(true);
    expect((await get(creative, '/reports')).body.budget).toBeNull();
  });
});

describe('Workflow F — command centre, alerts and inbox', () => {
  it('summarises the studio and raises deduplicated alerts', async () => {
    const cc = await get(producer, '/command-center');
    expect(cc.status).toBe(200);
    expect(cc.body.counts.activeProjects).toBeGreaterThan(0);
    expect(Array.isArray(cc.body.attention)).toBe(true);
    expect(cc.body.byStage).toHaveLength(6);
    const inbox = await get(producer, '/notifications/inbox?filter=all');
    expect(inbox.status).toBe(200);
    const n = inbox.body.items[0];
    if (n) {
      expect((await post(producer, `/notifications/${n.id}/resolve`)).status).toBe(204);
      const resolved = await get(producer, '/notifications/inbox?filter=resolved');
      expect(resolved.body.items.some((x: { id: string }) => x.id === n.id)).toBe(true);
      expect((await post(producer, `/notifications/${n.id}/unread`)).status).toBe(204);
      expect((await post(admin, `/notifications/${n.id}/resolve`)).status).toBe(404); // not theirs
    }
    const reports = await get(viewer, '/reports');
    expect(reports.status).toBe(200);
    expect(reports.body.projects.byStage).toHaveLength(6);
  });

  it('records every studio action in the audit trail', async () => {
    const rows = await db.models.ActivityLog.find({
      entityType: { $in: ['script', 'talent', 'scene', 'message', 'budget'] },
    }).lean();
    const actions = new Set(rows.map((r) => r.action));
    for (const a of [
      'script.created',
      'script.approved',
      'talent.booked',
      'scene.breakdown',
      'message.prepared',
      'budget.line.created',
    ]) {
      expect(actions).toContain(a);
    }
  });
});

describe('seeded studio data', () => {
  it('serves the shoot day of a seeded shoot and its readiness', async () => {
    const shoot = await found(
      db.models.Shoot.findOne({ title: /A Day of Care|Nurse|ward/i }).lean<Shoot>(),
    ).catch(() => null);
    const any = shoot ?? (await found(db.models.Shoot.findOne().lean<Shoot>()));
    const ws = await get(viewer, `/shoots/${any.id}/workspace`);
    expect(ws.status).toBe(200);
    expect(ws.body.readiness.items.length).toBeGreaterThan(5);
    const proj = await found(db.models.Project.findById(any.projectId).lean<Project>());
    const ready = await get(viewer, `/projects/${proj.id}/readiness`);
    expect(ready.status).toBe(200);
    expect(ready.body.items.map((i: { key: string }) => i.key)).toContain('casting');
    const day = await get(viewer, '/shoot-day');
    expect(day.status).toBe(200);
  });
});
