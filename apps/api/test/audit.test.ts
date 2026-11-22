/**
 * Regression tests for defects found in the November 2026 audit (ERP_COMPLETE_AUDIT_REPORT.md).
 * They create their own records where they write, so the seeded scenarios other suites rely on
 * are left as they were.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@nova/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stageApproved } from '../src/modules/projects/project.mapper';
import { shootDaysWithin } from '../src/modules/team/team.service';
import { ADMIN, CREATIVE, ORIGIN, bootApp, setKnownPasswords, signIn, testDb } from './helpers';

type Agent = Awaited<ReturnType<typeof signIn>>;

let app: INestApplication;
let db: PrismaClient;
let admin: Agent;
let creative: Agent;

beforeAll(async () => {
  app = await bootApp();
  db = testDb();
  await setKnownPasswords(db);
  admin = await signIn(app, ADMIN);
  creative = await signIn(app, CREATIVE);
});

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
});

const post = (a: Agent, url: string, body?: object) =>
  a
    .post(`/api/v1${url}`)
    .set('origin', ORIGIN)
    .send(body ?? {});
const patch = (a: Agent, url: string, body: object) =>
  a.patch(`/api/v1${url}`).set('origin', ORIGIN).send(body);
const get = (a: Agent, url: string) => a.get(`/api/v1${url}`);
const project = (code: string) => db.project.findUniqueOrThrow({ where: { code } });
const day = (offset: number, hour = 9) => {
  const d = new Date(Date.UTC(2031, 0, 10 + offset, hour));
  return d.toISOString();
};

describe('audit trail visibility', () => {
  const SENSITIVE = ['auth', 'user', 'role', 'finance', 'invoice', 'expense'];

  it('hides security and finance rows from roles that cannot read those records', async () => {
    const p = await project('NM-26-033');
    const record = await post(admin, '/finance/records', {
      projectId: p.id,
      kind: 'INCOME',
      category: 'ADVANCE',
      amount: 12_345,
      occurredOn: new Date().toISOString(),
      note: 'Audit visibility test',
    });
    expect(record.status).toBe(201);

    const seenByAdmin = await get(admin, '/activity?limit=100');
    expect(seenByAdmin.status).toBe(200);
    const adminTypes = seenByAdmin.body.items.map((a: { entityType: string }) => a.entityType);
    expect(adminTypes).toContain('finance');
    expect(adminTypes).toContain('auth');

    const seenByCreative = await get(creative, '/activity?limit=100');
    expect(seenByCreative.status).toBe(200);
    const creativeTypes = seenByCreative.body.items.map(
      (a: { entityType: string }) => a.entityType,
    );
    expect(creativeTypes.filter((t: string) => SENSITIVE.includes(t))).toEqual([]);
  });

  it('returns nothing when a restricted area is asked for by name', async () => {
    const res = await get(creative, '/activity?entityType=finance');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('sends the live stream a bare refresh instead of a row the user may not read', async () => {
    const server = app.getHttpServer() as http.Server;
    if (!server.listening) await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;

    const login = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(CREATIVE),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie()[0]!.split(';')[0]!;

    let received = '';
    const stream = http.get({ port, path: '/api/v1/events', headers: { cookie } }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (received += chunk));
    });
    try {
      await expect.poll(() => received, { timeout: 5000 }).toContain('event: ready');
      const p = await project('NM-26-033');
      const record = await post(admin, '/finance/records', {
        projectId: p.id,
        kind: 'EXPENSE',
        category: 'ADVANCE',
        amount: 54_321,
        occurredOn: new Date().toISOString(),
        note: 'Stream visibility test',
      });
      expect(record.status).toBe(201);
      await expect.poll(() => received, { timeout: 5000 }).toContain('event: refresh');
      expect(received).not.toContain('event: activity');
      expect(received).not.toContain('54,321');
      expect(received).not.toContain('54321');
    } finally {
      stream.destroy();
    }
  });
});

describe('request validation', () => {
  it('treats blank optional form fields as "not set" when creating a task', async () => {
    const p = await project('NM-26-033');
    const res = await post(admin, '/tasks', {
      projectId: p.id,
      title: 'Audit: blank optional fields',
      assigneeId: '',
      dueDate: '',
      estimateHours: '',
    });
    expect(res.status).toBe(201);
    expect(res.body.assignee).toBeNull();
    expect(res.body.dueDate).toBeNull();
    await db.task.delete({ where: { id: res.body.id } });
  });

  it('rejects null, numbers and booleans where a date is required', async () => {
    const p = await project('NM-26-033');
    for (const startsAt of [null, 5, true]) {
      const res = await post(admin, '/shoots', {
        projectId: p.id,
        title: 'Audit: bad date',
        location: 'Studio A',
        city: 'KOZHIKODE',
        startsAt,
        endsAt: day(1),
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('rejects an impossible crew call time', async () => {
    const p = await project('NM-26-033');
    const res = await post(admin, '/shoots', {
      projectId: p.id,
      title: 'Audit: bad call time',
      location: 'Studio A',
      city: 'KOZHIKODE',
      startsAt: day(0),
      endsAt: day(0, 18),
      callTime: '99:99',
    });
    expect(res.status).toBe(400);
  });

  it('does not turn an empty amount into zero rupees', async () => {
    const res = await post(admin, '/leads', {
      title: 'Audit: blank value',
      prospectName: 'Audit Prospect',
      projectType: 'BRAND_FILM',
      source: 'WEBSITE',
      estimatedValue: '',
    });
    expect(res.status).toBe(400);
  });
});

describe('project status rules', () => {
  it('cannot mark a project delivered by editing it', async () => {
    const p = await project('NM-26-033');
    const res = await patch(admin, `/projects/${p.id}`, { status: 'DELIVERED' });
    expect(res.status).toBe(400);
    expect((await project('NM-26-033')).status).toBe(p.status);
  });

  it('cannot reopen a delivered project by editing it', async () => {
    const delivered = await db.project.findFirstOrThrow({ where: { status: 'DELIVERED' } });
    const res = await patch(admin, `/projects/${delivered.id}`, { status: 'ACTIVE' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PROJECT_DELIVERED');
  });

  it('keeps the due date after the start date', async () => {
    const p = await project('NM-26-033');
    const before = new Date(p.startDate.getTime() - 86_400_000).toISOString();
    const res = await patch(admin, `/projects/${p.id}`, { dueDate: before });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_DUE_DATE');
  });
});

describe('approval gate (stageApproved)', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
  const approval = (deliverableId: string | null, status: string, requested: number) => ({
    deliverableId,
    status,
    requestedAt: at(requested),
    decidedAt: status === 'PENDING' ? null : at(requested + 1),
  });

  it('stays closed while any deliverable sent for review is undecided or needs changes', () => {
    expect(
      stageApproved({
        startedAt: at(0),
        approvals: [approval('d1', 'APPROVED', 1), approval('d2', 'PENDING', 2)],
      }),
    ).toBe(false);
    expect(
      stageApproved({
        startedAt: at(0),
        approvals: [approval('d1', 'APPROVED', 1), approval('d2', 'CHANGES_REQUESTED', 2)],
      }),
    ).toBe(false);
  });

  it('judges each deliverable by its latest version', () => {
    expect(
      stageApproved({
        startedAt: at(0),
        approvals: [approval('d1', 'CHANGES_REQUESTED', 1), approval('d1', 'APPROVED', 3)],
      }),
    ).toBe(true);
    expect(
      stageApproved({
        startedAt: at(0),
        approvals: [approval('d1', 'APPROVED', 1), approval('d1', 'PENDING', 3)],
      }),
    ).toBe(false);
  });

  it('ignores a stage sign-off from before the stage was sent back and restarted', () => {
    const signOff = approval(null, 'APPROVED', 1);
    expect(stageApproved({ startedAt: at(0), approvals: [signOff] })).toBe(true);
    expect(stageApproved({ startedAt: at(10), approvals: [signOff] })).toBe(false);
  });

  it('is closed when nothing has been approved', () => {
    expect(stageApproved({ startedAt: at(0), approvals: [] })).toBe(false);
  });
});

describe('workload: shoot days inside a window', () => {
  const d = (dayOfMonth: number, hour = 0) => new Date(2026, 10, dayOfMonth, hour);

  it('counts a long single-day shoot as one day', () => {
    expect(shootDaysWithin({ startsAt: d(23, 6), endsAt: d(23, 20) }, d(22), d(29))).toBe(1);
  });

  it('counts only the days a multi-day shoot spends in the window', () => {
    const shoot = { startsAt: d(27, 8), endsAt: d(30, 18) };
    expect(shootDaysWithin(shoot, d(22), d(29))).toBe(2);
    expect(shootDaysWithin(shoot, d(29), d(36))).toBe(2);
  });
});

describe('scheduling integrity', () => {
  it('refuses to move a shoot onto a time that double-books its equipment', async () => {
    const p = await project('NM-26-033');
    const shoot = (title: string, from: string, to: string) =>
      post(admin, '/shoots', {
        projectId: p.id,
        title,
        location: 'Audit location',
        city: 'KOZHIKODE',
        startsAt: from,
        endsAt: to,
      });
    const a = await shoot('Audit shoot A', day(0), day(0, 18));
    const b = await shoot('Audit shoot B', day(5), day(5, 18));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const asset = await db.asset.findFirstOrThrow({ where: { status: 'AVAILABLE' } });
    for (const s of [a, b]) {
      const booked = await post(admin, `/shoots/${s.body.id}/bookings`, { assetId: asset.id });
      expect(booked.status).toBe(201);
    }

    const moved = await patch(admin, `/shoots/${b.body.id}`, {
      startsAt: day(0, 10),
      endsAt: day(0, 16),
    });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe('SHOOT_CONFLICT');
    expect(moved.body.error.details.resources).toContain(asset.name);

    // A move that creates no new overlap is still allowed.
    const ok = await patch(admin, `/shoots/${b.body.id}`, { startsAt: day(6), endsAt: day(6, 18) });
    expect(ok.status).toBe(200);

    // Nothing more can be booked for a cancelled shoot.
    expect((await patch(admin, `/shoots/${a.body.id}`, { status: 'CANCELLED' })).status).toBe(200);
    const other = await db.asset.findFirstOrThrow({
      where: { status: 'AVAILABLE', id: { not: asset.id } },
    });
    const late = await post(admin, `/shoots/${a.body.id}/bookings`, { assetId: other.id });
    expect(late.status).toBe(422);
    expect(late.body.error.code).toBe('SHOOT_CLOSED');

    await db.shoot.deleteMany({ where: { id: { in: [a.body.id, b.body.id] } } });
  });
});

describe('clients', () => {
  it('refuses a second client with the same name, whatever the capitalisation', async () => {
    const existing = await db.client.findFirstOrThrow();
    const res = await post(admin, '/clients', {
      name: existing.name.toUpperCase(),
      industry: 'Audit',
      city: 'Kozhikode',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CLIENT_EXISTS');
  });
});
