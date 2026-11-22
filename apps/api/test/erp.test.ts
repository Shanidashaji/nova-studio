import type { INestApplication } from '@nestjs/common';
import type {
  Client,
  CrewCall,
  Database,
  Document,
  Expense,
  FinancialRecord,
  Lead,
  LeaveRequest,
  Permission,
  Project,
  Role,
  RolePermission,
  Shoot,
  StockItem,
  StudioBooking,
  Task,
  TeamMember,
  User,
  Vendor,
  VendorQuote,
  WorkflowTemplate,
} from '@nova/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN,
  CREATIVE,
  FINANCE,
  HR,
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
let finance: Agent;
let hr: Agent;
let creative: Agent;
let viewer: Agent;

beforeAll(async () => {
  app = await bootApp();
  db = await testDb();
  await setKnownPasswords(db);
  admin = await signIn(app, ADMIN);
  producer = await signIn(app, PRODUCER);
  finance = await signIn(app, FINANCE);
  hr = await signIn(app, HR);
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
const get = (a: Agent, url: string) => a.get(`/api/v1${url}`);
const project = (code: string) =>
  found(db.models.Project.findOne({ code }).lean<Project>(), `Project ${code}`);
const role = (key: string) => found(db.models.Role.findOne({ key }).lean<Role>(), `Role ${key}`);
const userByEmail = (email: string) =>
  found(db.models.User.findOne({ email }).lean<User>(), `User ${email}`);
const stockItem = (sku: string) =>
  found(db.models.StockItem.findOne({ sku }).lean<StockItem>(), `Stock item ${sku}`);
const vendorNamed = (name: string) =>
  found(db.models.Vendor.findOne({ name }).lean<Vendor>(), `Vendor ${name}`);
const quoteFor = (requestId: string) =>
  found(
    db.models.VendorQuote.findOne({ requestId }).sort({ $natural: 1 }).lean<VendorQuote>(),
    'Vendor quote',
  );

describe('administration and configurable roles (ADR-0009)', () => {
  it('lists roles and users only for user managers', async () => {
    const roles = await get(admin, '/admin/roles');
    expect(roles.status).toBe(200);
    expect(roles.body.map((r: { key: string }) => r.key)).toEqual(
      expect.arrayContaining(['SUPER_ADMIN', 'PRODUCTION_MANAGER', 'FINANCE', 'HR', 'CREATIVE']),
    );
    expect((await get(finance, '/admin/users')).status).toBe(403);
    expect((await get(viewer, '/admin/roles')).status).toBe(403);
  });

  it('keeps the Super Admin role locked', async () => {
    const sa = await role('SUPER_ADMIN');
    const res = await patch(admin, `/admin/roles/${sa.id}`, { permissions: ['workspace:read'] });
    expect(res.status).toBe(403);
  });

  it('applies permission changes on the very next request', async () => {
    const viewerRole = await found(
      db.models.Role.findOne({ key: 'VIEWER' })
        .populate({ path: 'permissions', populate: { path: 'permission' } })
        .lean<Role & { permissions: (RolePermission & { permission: Permission })[] }>(),
    );
    const original = viewerRole.permissions.map((p) => p.permission.key);
    expect((await get(viewer, '/invoices')).status).toBe(200); // finance:read
    await patch(admin, `/admin/roles/${viewerRole.id}`, {
      permissions: original.filter((p) => p !== 'finance:read'),
    }).expect(200);
    expect((await get(viewer, '/invoices')).status).toBe(403);
    await patch(admin, `/admin/roles/${viewerRole.id}`, { permissions: original }).expect(200);
  });

  it('creates a custom role and refuses to delete it while in use', async () => {
    const created = await post(admin, '/admin/roles', {
      key: 'COLORIST',
      name: 'Colourist',
      permissions: ['workspace:read', 'task:write'],
    });
    expect(created.status).toBe(201);
    const user = await post(admin, '/admin/users', {
      email: 'colour@test.local',
      name: 'Test Colourist',
      roleId: created.body.id,
      password: 'colourist-password-1',
    });
    expect(user.status).toBe(201);
    const del = await admin.delete(`/api/v1/admin/roles/${created.body.id}`).set('origin', ORIGIN);
    expect(del.status).toBe(409);
  });

  it('stops users from changing their own access and only lets a super admin grant it', async () => {
    const me = await userByEmail(ADMIN.email);
    const viewerRole = await role('VIEWER');
    expect((await patch(admin, `/admin/users/${me.id}`, { roleId: viewerRole.id })).status).toBe(
      403,
    );
    const sa = await role('SUPER_ADMIN');
    // A plain Admin cannot create a Super Admin.
    const adminRole = await role('ADMIN');
    await post(admin, '/admin/users', {
      email: 'plainadmin@test.local',
      name: 'Plain Admin',
      roleId: adminRole.id,
      password: 'plain-admin-password',
    }).expect(201);
    const plain = await signIn(app, {
      email: 'plainadmin@test.local',
      password: 'plain-admin-password',
    });
    const res = await post(plain, '/admin/users', {
      email: 'sneaky@test.local',
      name: 'Sneaky',
      roleId: sa.id,
      password: 'sneaky-password-123',
    });
    expect(res.status).toBe(403);
  });

  it('deactivation ends the user’s sessions immediately', async () => {
    const target = await userByEmail('colour@test.local');
    const agent = await signIn(app, {
      email: 'colour@test.local',
      password: 'colourist-password-1',
    });
    expect((await get(agent, '/auth/me')).status).toBe(200);
    await patch(admin, `/admin/users/${target.id}`, { isActive: false }).expect(200);
    expect((await get(agent, '/auth/me')).status).toBe(401);
  });

  it('hides security audit records from roles without audit:read', async () => {
    const mine = await get(admin, '/activity?entityType=auth');
    expect(mine.body.items.length).toBeGreaterThan(0);
    const theirs = await get(creative, '/activity?entityType=auth');
    expect(theirs.status).toBe(200);
    expect(theirs.body.items).toHaveLength(0);
  });

  it('saves notification preferences per user', async () => {
    const res = await creative
      .put('/api/v1/me/notification-preferences')
      .set('origin', ORIGIN)
      .send({ preferences: [{ kind: 'stock', inApp: false }] });
    expect(res.status).toBe(200);
    expect(res.body.find((p: { kind: string }) => p.kind === 'stock').inApp).toBe(false);
  });
});

describe('expenses through a two-step approval chain (ADR-0010, ADR-0011)', () => {
  let expenseId: string;
  let approvalId: string;

  it('opens a two-step chain for an amount above the finance threshold', async () => {
    const p = await project('NM-26-033');
    const res = await post(creative, '/expenses', {
      title: 'Test jib rental',
      category: 'EQUIPMENT_RENTAL',
      amount: 60_000,
      incurredOn: new Date().toISOString(),
      projectId: p.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.approval.steps).toBe(2);
    expenseId = res.body.id;
    approvalId = res.body.approval.id;
  });

  it('does not let the requester approve or a role without permission decide', async () => {
    const self = await post(creative, `/approval-requests/${approvalId}/decision`, {
      decision: 'APPROVE',
    });
    expect(self.status).toBe(403);
    const hrTry = await post(hr, `/approval-requests/${approvalId}/decision`, {
      decision: 'APPROVE',
    });
    expect(hrTry.status).toBe(403);
  });

  it('requires a reason to reject', async () => {
    const res = await post(producer, `/approval-requests/${approvalId}/decision`, {
      decision: 'REJECT',
    });
    expect(res.status).toBe(400);
  });

  it('advances step by step, then marks the expense approved', async () => {
    const one = await post(producer, `/approval-requests/${approvalId}/decision`, {
      decision: 'APPROVE',
    });
    expect(one.status).toBe(201);
    expect(one.body).toMatchObject({ status: 'PENDING', currentStep: 2 });
    // Step 2 needs finance:write — the production manager cannot decide it.
    expect(
      (await post(producer, `/approval-requests/${approvalId}/decision`, { decision: 'APPROVE' }))
        .status,
    ).toBe(403);
    const two = await post(finance, `/approval-requests/${approvalId}/decision`, {
      decision: 'APPROVE',
    });
    expect(two.body.status).toBe('APPROVED');
    const e = await found(db.models.Expense.findById(expenseId).lean<Expense>());
    expect(e.status).toBe('APPROVED');
    // A decided request cannot be decided again.
    expect(
      (await post(finance, `/approval-requests/${approvalId}/decision`, { decision: 'APPROVE' }))
        .status,
    ).toBe(409);
  });

  it('paying posts exactly one ledger entry linked to the expense', async () => {
    const res = await post(finance, `/expenses/${expenseId}/pay`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PAID');
    const ledger = await db.models.FinancialRecord.find({ expenseId }).lean<FinancialRecord[]>();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: 'EXPENSE', amount: 60_000 });
    expect((await post(finance, `/expenses/${expenseId}/pay`)).status).toBe(409);
  });

  it('shows other people’s expenses only to finance readers', async () => {
    const mine = await get(creative, '/expenses');
    expect(
      mine.body.every(
        (e: { submittedBy: { name: string } }) => e.submittedBy.name === 'Arjun Nair',
      ),
    ).toBe(true);
    const all = await get(finance, '/expenses');
    expect((all.body as unknown[]).length).toBeGreaterThan((mine.body as unknown[]).length);
  });
});

describe('invoices and payments', () => {
  let invoiceId: string;

  it('computes totals on the server and numbers invoices', async () => {
    const p = await project('NM-26-040');
    const res = await post(finance, '/invoices', {
      clientId: p.clientId,
      projectId: p.id,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 15 * 86_400_000).toISOString(),
      taxPercent: 18,
      lines: [
        { description: 'Edit days', quantity: 3, unitPrice: 10_000 },
        { description: 'Motion graphics', quantity: 1, unitPrice: 5_000 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      subtotal: 35_000,
      tax: 6_300,
      total: 41_300,
      status: 'DRAFT',
    });
    expect(res.body.number).toMatch(/^NM-INV-\d{4}-\d{3}$/);
    invoiceId = res.body.id;
  });

  it('rejects a project that belongs to another client', async () => {
    const a = await project('NM-26-040');
    const other = await found(
      db.models.Client.findOne({ _id: { $ne: a.clientId } })
        .sort({ $natural: 1 })
        .lean<Client>(),
    );
    const res = await post(finance, '/invoices', {
      clientId: other.id,
      projectId: a.id,
      issueDate: new Date().toISOString(),
      dueDate: new Date().toISOString(),
      lines: [{ description: 'x', quantity: 1, unitPrice: 1 }],
    });
    expect(res.status).toBe(422);
  });

  it('only accepts payments on sent invoices, never above the balance', async () => {
    const pay = { amount: 20_000, receivedOn: new Date().toISOString(), method: 'UPI' };
    expect((await post(finance, `/invoices/${invoiceId}/payments`, pay)).status).toBe(409);
    await post(finance, `/invoices/${invoiceId}/send`).expect(201);
    const part = await post(finance, `/invoices/${invoiceId}/payments`, pay);
    expect(part.body).toMatchObject({ status: 'PARTIALLY_PAID', paid: 20_000, balance: 21_300 });
    const over = await post(finance, `/invoices/${invoiceId}/payments`, { ...pay, amount: 30_000 });
    expect(over.status).toBe(422);
    const rest = await post(finance, `/invoices/${invoiceId}/payments`, { ...pay, amount: 21_300 });
    expect(rest.body.status).toBe('PAID');
    const ledger = await db.models.FinancialRecord.find({
      paymentId: { $in: await db.models.Payment.distinct('_id', { invoiceId }) },
    }).lean<FinancialRecord[]>();
    expect(ledger.reduce((n, r) => n + r.amount, 0)).toBe(41_300);
    expect((await post(finance, `/invoices/${invoiceId}/void`, { reason: 'x' })).status).toBe(409);
  });

  it('keeps invoice writing away from roles without invoice:write', async () => {
    expect((await post(producer, '/invoices', {})).status).toBe(403);
  });

  it('reports receivables with computed overdue amounts', async () => {
    const res = await get(finance, '/finance/overview');
    expect(res.status).toBe(200);
    expect(res.body.isDemo).toBe(true);
    expect(res.body.receivables.overdue).toBeGreaterThan(0);
    expect(res.body.receivables.ageing.D1_30 + res.body.receivables.ageing.CURRENT).toBeGreaterThan(
      0,
    );
  });
});

describe('procurement into inventory', () => {
  it('runs request → approval → order → receipt → stock → vendor bill', async () => {
    const item = await stockItem('BAT-AA-PRO');
    const vendor = await vendorNamed('MediaVault Supplies');
    const pr = await post(creative, '/purchase-requests', {
      title: 'AA batteries',
      items: [
        {
          description: 'AA rechargeable (4-pack)',
          quantity: 5,
          estimatedUnitCost: 1_250,
          stockItemId: item.id,
        },
      ],
    });
    expect(pr.status).toBe(201);
    expect(pr.body).toMatchObject({ status: 'SUBMITTED', estimatedTotal: 6_250 });
    // Ordering before approval is refused.
    expect(
      (await post(finance, '/purchase-orders', { requestId: pr.body.id, vendorId: vendor.id }))
        .status,
    ).toBe(409);
    await post(finance, `/purchase-requests/${pr.body.id}/quotes`, {
      vendorId: vendor.id,
      amount: 6_000,
    }).expect(201);
    const quote = await quoteFor(String(pr.body.id));
    await post(finance, `/purchase-requests/${pr.body.id}/quotes/${quote.id}/select`).expect(201);
    await post(producer, `/approval-requests/${pr.body.approval.id}/decision`, {
      decision: 'APPROVE',
    }).expect(201);

    const po = await post(finance, '/purchase-orders', { requestId: pr.body.id });
    expect(po.status).toBe(201);
    expect(po.body).toMatchObject({ total: 6_000, status: 'ISSUED' });
    const line = po.body.lines[0];
    const over = await post(finance, `/purchase-orders/${po.body.id}/receive`, {
      lines: [{ lineId: line.id, quantity: 9 }],
    });
    expect(over.status).toBe(422);
    const partial = await post(finance, `/purchase-orders/${po.body.id}/receive`, {
      lines: [{ lineId: line.id, quantity: 2 }],
    });
    expect(partial.body.status).toBe('PARTIALLY_RECEIVED');
    const done = await post(finance, `/purchase-orders/${po.body.id}/receive`, {
      lines: [{ lineId: line.id, quantity: 3 }],
    });
    expect(done.body.status).toBe('RECEIVED');
    expect(done.body.bill).toMatchObject({ status: 'SUBMITTED' });
    const after = await found(db.models.StockItem.findById(item.id).lean<StockItem>());
    expect(after.onHand).toBe(item.onHand + 5);
  });

  it('never issues more stock than is on hand', async () => {
    const item = await stockItem('CLN-LENS-WP');
    const res = await post(producer, `/stock/${item.id}/movements`, {
      type: 'ISSUED',
      quantity: item.onHand + 1,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(
      (await post(creative, `/stock/${item.id}/movements`, { type: 'ISSUED', quantity: 1 })).status,
    ).toBe(403);
  });

  it('records a recount as a signed adjustment', async () => {
    const item = await stockItem('GRP-SAND-10');
    const res = await post(producer, `/stock/${item.id}/movements`, {
      type: 'ADJUSTED',
      countedOnHand: item.onHand - 2,
      note: 'Two torn bags',
    });
    expect(res.status).toBe(201);
    expect(res.body.movements[0]).toMatchObject({
      type: 'ADJUSTED',
      quantity: -2,
      balanceAfter: item.onHand - 2,
    });
  });
});

describe('studios, leave and scheduling constraints', () => {
  it('rejects an overlapping studio booking', async () => {
    const b = await found(
      db.models.StudioBooking.findOne({ status: 'CONFIRMED' })
        .sort({ $natural: 1 })
        .lean<StudioBooking>(),
    );
    const res = await post(producer, '/studio-bookings', {
      studioId: b.studioId,
      title: 'Clash',
      startsAt: new Date(b.startsAt.getTime() + 3600_000).toISOString(),
      endsAt: new Date(b.endsAt.getTime() + 3600_000).toISOString(),
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STUDIO_CONFLICT');
    const ok = await post(producer, '/studio-bookings', {
      studioId: b.studioId,
      title: 'Back-to-back',
      startsAt: b.endsAt.toISOString(),
      endsAt: new Date(b.endsAt.getTime() + 2 * 3600_000).toISOString(),
    });
    expect(ok.status).toBe(201);
  });

  it('approved leave blocks a crew call for that member', async () => {
    const shoot = await found(
      db.models.Shoot.findOne({ startsAt: { $gt: new Date() }, status: { $ne: 'CANCELLED' } })
        .sort({ startsAt: -1 })
        .populate('crew')
        .lean<Shoot & { crew: CrewCall[] }>(),
    );
    const onLeave = await db.models.LeaveRequest.distinct('teamMemberId', {
      status: { $in: ['PENDING', 'APPROVED'] },
    });
    const member = await found(
      db.models.TeamMember.findOne({
        _id: { $nin: [...shoot.crew.map((c) => c.teamMemberId), ...onLeave] },
        userId: null,
      })
        .sort({ $natural: 1 })
        .lean<TeamMember>(),
    );
    // HR files the leave on the member's behalf; HR cannot approve its own request.
    const leave = await post(hr, '/hr/leave', {
      teamMemberId: member.id,
      type: 'ANNUAL',
      startDate: shoot.startsAt.toISOString(),
      endDate: shoot.startsAt.toISOString(),
    });
    expect(leave.status).toBe(201);
    expect(leave.body.status).toBe('PENDING');
    expect(
      (
        await post(hr, `/approval-requests/${leave.body.approval.id}/decision`, {
          decision: 'APPROVE',
        })
      ).status,
    ).toBe(403);
    await post(producer, `/approval-requests/${leave.body.approval.id}/decision`, {
      decision: 'APPROVE',
    }).expect(201);
    expect(
      (await found(db.models.LeaveRequest.findById(leave.body.id).lean<LeaveRequest>())).status,
    ).toBe('APPROVED');

    const call = await post(producer, `/shoots/${shoot.id}/crew`, {
      teamMemberId: member.id,
      role: 'Assistant',
    });
    expect(call.status).toBe(409);
    expect(call.body.error.code).toBe('CREW_ON_LEAVE');
  });

  it('shows restricted HR fields only to hr:read', async () => {
    const withRecord = await get(hr, '/hr/employees');
    expect(withRecord.body[0].record).toBeDefined();
    const without = await get(creative, '/hr/employees');
    expect(without.body[0]).not.toHaveProperty('record');
    const someone = without.body[0].id as string;
    expect(
      (
        await creative
          .put(`/api/v1/hr/employees/${someone}/record`)
          .set('origin', ORIGIN)
          .send({ phone: '1' })
      ).status,
    ).toBe(403);
  });
});

describe('documents (ADR-0012)', () => {
  it('uploads, versions and downloads a file through the API', async () => {
    const p = await project('NM-26-031');
    const up = await producer
      .post('/api/v1/documents')
      .set('origin', ORIGIN)
      .field('title', 'Call sheet')
      .field('category', 'BRIEF')
      .field('projectId', p.id)
      .attach('file', Buffer.from('# Call sheet\nCrew call 06:00\n'), {
        filename: 'call-sheet.md',
        contentType: 'text/markdown',
      });
    expect(up.status).toBe(201);
    expect(up.body.latest).toMatchObject({ version: 1, mimeType: 'text/markdown' });
    expect(up.body.latest.sha256).toMatch(/^[a-f0-9]{64}$/);

    const v2 = await producer
      .post(`/api/v1/documents/${up.body.id}/versions`)
      .set('origin', ORIGIN)
      .field('note', 'Later call time')
      .attach('file', Buffer.from('# Call sheet\nCrew call 07:00\n'), {
        filename: 'call-sheet.md',
        contentType: 'text/markdown',
      });
    expect(v2.body.currentVersion).toBe(2);

    const file = await producer.get(`/api/v1/documents/${up.body.id}/versions/1/file`);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toMatch(/^attachment;/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.text).toContain('06:00');
  });

  it('rejects a file whose bytes do not match its declared type', async () => {
    const res = await producer
      .post('/api/v1/documents')
      .set('origin', ORIGIN)
      .field('title', 'Not a PDF')
      .field('category', 'OTHER')
      .attach('file', Buffer.from('MZ\x90\x00 pretend executable'), {
        filename: 'contract.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FILE_REJECTED');
  });

  it('hides confidential documents as if they did not exist', async () => {
    const contract = await found(
      db.models.Document.findOne({ confidential: true, category: 'CONTRACT' })
        .sort({ $natural: 1 })
        .lean<Document>(),
    );
    expect((await get(finance, `/documents/${contract.id}`)).status).toBe(200);
    expect((await get(creative, `/documents/${contract.id}`)).status).toBe(404);
    expect((await get(creative, `/documents/${contract.id}/versions/1/file`)).status).toBe(404);
    const list = await get(creative, '/documents');
    expect(list.body.some((d: { confidential: boolean }) => d.confidential)).toBe(false);
  });
});

describe('CRM and project plan', () => {
  it('converts a prospect lead into a client and a project', async () => {
    const lead = await found(
      db.models.Lead.findOne({ clientId: null, convertedProjectId: null, stage: { $ne: 'LOST' } })
        .sort({ $natural: 1 })
        .lean<Lead>(),
    );
    const template = await found(
      db.models.WorkflowTemplate.findOne({ isDefault: true })
        .sort({ $natural: 1 })
        .lean<WorkflowTemplate>(),
    );
    const start = new Date();
    const res = await post(producer, `/leads/${lead.id}/convert`, {
      newClient: { industry: 'Hospitality', city: 'Kozhikode' },
      title: lead.title,
      type: lead.projectType,
      workflowTemplateId: template.id,
      location: 'KOZHIKODE',
      startDate: start.toISOString(),
      dueDate: new Date(start.getTime() + 30 * 86_400_000).toISOString(),
      budget: lead.estimatedValue,
    });
    expect(res.status).toBe(201);
    const after = await found(db.models.Lead.findById(lead.id).lean<Lead>());
    expect(after).toMatchObject({ stage: 'WON', convertedProjectId: res.body.id });
    expect(after.clientId).not.toBeNull();
    expect((await post(producer, `/leads/${lead.id}/convert`, {})).status).toBe(400);
  });

  it('adds subtasks one level deep only', async () => {
    const campus = await project('NM-26-033');
    const parent = await found(
      db.models.Task.findOne({ parentId: null, projectId: campus.id })
        .sort({ $natural: 1 })
        .lean<Task>(),
    );
    const sub = await post(producer, '/tasks', {
      projectId: parent.projectId,
      title: 'Sub step',
      parentId: parent.id,
    });
    expect(sub.status).toBe(201);
    expect(sub.body.parentId).toBe(parent.id);
    const nested = await post(producer, '/tasks', {
      projectId: parent.projectId,
      title: 'Too deep',
      parentId: sub.body.id,
    });
    expect(nested.status).toBe(422);
  });

  it('scores and orders project risks', async () => {
    const p = await project('NM-26-031');
    const res = await get(admin, `/projects/${p.id}/risks`);
    expect(res.status).toBe(200);
    const scores = (res.body as { score: number }[]).map((r) => r.score);
    expect(scores[0]).toBeGreaterThanOrEqual(scores.at(-1)!);
  });
});

describe('database integrity constraints', () => {
  it('rejects an approval request without exactly one subject', async () => {
    const user = await found(db.models.User.findOne().sort({ $natural: 1 }).lean<User>());
    await expect(
      db.models.ApprovalRequest.create({
        subject: 'EXPENSE',
        title: 'orphan',
        requestedById: user.id,
      }),
    ).rejects.toThrow();
  });

  it('rejects negative stock', async () => {
    const item = await found(db.models.StockItem.findOne().sort({ $natural: 1 }).lean<StockItem>());
    await expect(
      db.models.StockItem.updateOne({ _id: item.id }, { $set: { onHand: -1 } }).exec(),
    ).rejects.toThrow();
  });
});

describe('review fixes (audit findings)', () => {
  it('PATCH on a draft invoice keeps the tax rate when it is not sent', async () => {
    const p = await project('NM-26-040');
    const created = await post(finance, '/invoices', {
      clientId: p.clientId,
      projectId: p.id,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
      taxPercent: 18,
      lines: [{ description: 'Edit', quantity: 1, unitPrice: 10_000 }],
    });
    const res = await patch(finance, `/invoices/${created.body.id}`, { notes: 'Updated note' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ taxPercent: 18, tax: 1_800, total: 11_800 });
  });

  it('refuses to send a zero-total invoice', async () => {
    const p = await project('NM-26-040');
    const created = await post(finance, '/invoices', {
      clientId: p.clientId,
      issueDate: new Date().toISOString(),
      dueDate: new Date().toISOString(),
      lines: [{ description: 'Courtesy', quantity: 1, unitPrice: 0 }],
    });
    expect((await post(finance, `/invoices/${created.body.id}/send`)).status).toBe(422);
  });

  it('stops the owner approving an expense someone else submitted for them', async () => {
    const draft = await post(producer, '/expenses', {
      title: 'Owner check',
      category: 'TRAVEL',
      amount: 900,
      incurredOn: new Date().toISOString(),
      submit: false,
    });
    // Finance edits and submits it on the producer's behalf; the producer still cannot approve.
    const submitted = await post(finance, `/expenses/${draft.body.id}/submit`);
    expect(submitted.status).toBe(201);
    const res = await post(producer, `/approval-requests/${submitted.body.approval.id}/decision`, {
      decision: 'APPROVE',
    });
    expect(res.status).toBe(403);
  });

  it('does not let one person approve two steps of the same chain', async () => {
    const created = await post(creative, '/expenses', {
      title: 'Two-step check',
      category: 'EQUIPMENT_RENTAL',
      amount: 70_000,
      incurredOn: new Date().toISOString(),
    });
    const id = created.body.approval.id as string;
    await post(finance, `/approval-requests/${id}/decision`, { decision: 'APPROVE' }).expect(201);
    // Finance holds finance:write for step 2 too, but already decided step 1.
    const second = await post(finance, `/approval-requests/${id}/decision`, {
      decision: 'APPROVE',
    });
    expect(second.status).toBe(403);
    await post(admin, `/approval-requests/${id}/decision`, { decision: 'APPROVE' }).expect(201);
  });

  it('will not issue an order above the approved amount', async () => {
    const vendor = await vendorNamed('Lenswala Rentals');
    const pr = await post(creative, '/purchase-requests', {
      title: 'Cheap estimate',
      items: [{ description: 'Filter', quantity: 1, estimatedUnitCost: 1_000 }],
    });
    await post(finance, `/purchase-requests/${pr.body.id}/quotes`, {
      vendorId: vendor.id,
      amount: 90_000,
    }).expect(201);
    const quote = await quoteFor(String(pr.body.id));
    await post(finance, `/purchase-requests/${pr.body.id}/quotes/${quote.id}/select`).expect(201);
    await post(producer, `/approval-requests/${pr.body.approval.id}/decision`, {
      decision: 'APPROVE',
    }).expect(201);
    const po = await post(finance, '/purchase-orders', { requestId: pr.body.id });
    expect(po.status).toBe(409);
    expect(po.body.error.code).toBe('OVER_APPROVED_AMOUNT');
  });

  it('limits self-service attendance to today and never over an HR record', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const past = await post(creative, '/hr/attendance', { date: yesterday, status: 'PRESENT' });
    expect(past.status).toBe(403);
    const absent = await post(creative, '/hr/attendance', {
      date: new Date().toISOString(),
      status: 'ABSENT',
    });
    expect(absent.status).toBe(403);
    const backwards = await post(creative, '/hr/attendance', {
      date: new Date().toISOString(),
      status: 'PRESENT',
      checkIn: new Date().toISOString(),
      checkOut: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(backwards.status).toBe(400);
  });

  it('caps leave length and back-dating', async () => {
    const long = await post(creative, '/hr/leave', {
      type: 'ANNUAL',
      startDate: new Date(Date.now() + 86_400_000).toISOString(),
      endDate: new Date(Date.now() + 120 * 86_400_000).toISOString(),
    });
    expect(long.status).toBe(400);
    const old = await post(creative, '/hr/leave', {
      type: 'SICK',
      startDate: '2000-01-01T00:00:00Z',
      endDate: '2000-01-02T00:00:00Z',
    });
    expect(old.status).toBe(422);
    expect(old.body.error.code).toBe('LEAVE_TOO_OLD');
  });

  it('rejects a mismatched extension and finance documents from non-finance roles', async () => {
    const bat = await producer
      .post('/api/v1/documents')
      .set('origin', ORIGIN)
      .field('title', 'Script')
      .field('category', 'OTHER')
      .attach('file', Buffer.from('echo hi'), {
        filename: 'payroll.bat',
        contentType: 'text/plain',
      });
    expect(bat.status).toBe(422);
    const receipt = await creative
      .post('/api/v1/documents')
      .set('origin', ORIGIN)
      .field('title', 'Taxi receipt')
      .field('category', 'RECEIPT')
      .attach('file', Buffer.from('receipt'), {
        filename: 'receipt.txt',
        contentType: 'text/plain',
      });
    expect(receipt.status).toBe(422);
    expect(receipt.body.error.code).toBe('FINANCE_ONLY');
  });

  it('stops a user manager granting a role with permissions they lack', async () => {
    const limited = await post(admin, '/admin/roles', {
      key: 'PEOPLE_ADMIN',
      name: 'People admin',
      permissions: ['workspace:read', 'user:manage'],
    });
    await post(admin, '/admin/users', {
      email: 'peopleadmin@test.local',
      name: 'People Admin',
      roleId: limited.body.id,
      password: 'people-admin-password',
    }).expect(201);
    const agent = await signIn(app, {
      email: 'peopleadmin@test.local',
      password: 'people-admin-password',
    });
    const adminRole = await role('ADMIN');
    const res = await post(agent, '/admin/users', {
      email: 'escalate@test.local',
      name: 'Escalation',
      roleId: adminRole.id,
      password: 'escalation-password',
    });
    expect(res.status).toBe(403);
  });

  it('parses boolean query flags strictly', async () => {
    const all = await get(finance, '/invoices');
    const notOverdue = await get(finance, '/invoices?overdue=false');
    expect((notOverdue.body as unknown[]).length).toBe((all.body as unknown[]).length);
  });
});
