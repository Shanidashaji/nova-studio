/**
 * DEMONSTRATION DATA for the ERP expansion: departments, employee records, attendance, leave,
 * vendors, approval rules and requests, expenses, invoices and payments (posted to the ledger),
 * milestones, risks, contacts, procurement, inventory, studios and documents.
 *
 * Runs after buildDemoWorld() and looks records up by their natural keys, so the two seeds stay
 * independent. Every person and company here is fictional.
 *
 * Reads that used to rely on PostgreSQL's heap order (no ORDER BY) read in insertion order
 * (`$natural`); ties on a sorted timestamp keep insertion order too, so the world is stable.
 */
import {
  invoiceStatusAfterPayments,
  invoiceTotals,
  nextNumber,
  planApprovalSteps,
  type ApprovalRuleInput,
} from '@nova/shared';
import type { Database } from '../database';
import type {
  ApprovalSubject,
  DocumentCategory,
  FinanceCategory,
  StockCategory,
  VendorCategory,
} from '../models/enums';
import type {
  Asset,
  Client,
  CrewCall,
  FinancialRecord,
  Lead,
  Project,
  Shoot,
  Task,
  TeamMember,
} from '../models/types';
import { putObject } from '../storage';

const DAY = 24 * 60 * 60 * 1000;
const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();
const at = (dayOffset: number, hour = 9) =>
  new Date(TODAY.getTime() + dayOffset * DAY + hour * 3600 * 1000);
/** Calendar date (UTC midnight) for the date-only fields (former @db.Date columns). */
const dateOnly = (dayOffset: number) => {
  const d = new Date(TODAY.getTime() + dayOffset * DAY);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

/** Stable sort by a timestamp: rows that tie keep the order they were read in. */
function byTime<T>(rows: T[], key: (row: T) => Date): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => key(a.row).getTime() - key(b.row).getTime() || a.i - b.i)
    .map((x) => x.row);
}

interface Users {
  adminId: string;
  producerUserId: string;
  financeUserId: string;
  hrUserId: string;
  creativeUserId: string;
}

export async function buildErpWorld(db: Database, users: Users) {
  const m = db.models;
  const members = new Map(
    (await m.TeamMember.find().select({ name: 1 }).lean<Pick<TeamMember, '_id' | 'name'>[]>()).map(
      (t) => [t.name, t._id],
    ),
  );
  const member = (name: string) => {
    const id = members.get(name);
    if (!id) throw new Error(`Seed: unknown team member ${name}`);
    return id;
  };
  type ProjectRef = Pick<
    Project,
    '_id' | 'id' | 'code' | 'title' | 'clientId' | 'budget' | 'status'
  >;
  const projects = new Map(
    (
      await m.Project.find()
        .select({ code: 1, title: 1, clientId: 1, budget: 1, status: 1 })
        .sort({ $natural: 1 })
        .lean<ProjectRef[]>()
    ).map((p) => [p.code, p]),
  );
  const project = (code: string) => {
    const p = projects.get(code);
    if (!p) throw new Error(`Seed: unknown project ${code}`);
    return p;
  };

  // ── People ────────────────────────────────────────────────────────────────

  // The creative demo account is the DOP's login; finance and HR staff join the team.
  await m.TeamMember.updateOne(
    { _id: member('Arjun Nair') },
    { $set: { userId: users.creativeUserId } },
  );
  for (const [name, title, userId] of [
    ['Lakshmi Pillai', 'Accounts Executive', users.financeUserId],
    ['Sameera Thomas', 'HR & Admin Executive', users.hrUserId],
  ] as const) {
    const created = await m.TeamMember.create({
      name,
      title,
      skills: title.startsWith('Accounts')
        ? ['Invoicing', 'Vendor payments']
        : ['Onboarding', 'Leave & attendance'],
      baseLocation: 'KOZHIKODE',
      weeklyCapacityHours: 0,
      email: `${name.split(' ')[0]!.toLowerCase()}@studio.demo`,
      userId,
    });
    members.set(name, created._id);
  }

  const departments: [string, string, string, string[]][] = [
    [
      'Production',
      'Producers and coordinators who run projects end to end',
      'Karthik Subramanian',
      ['Karthik Subramanian', 'Meera Krishnan'],
    ],
    [
      'Direction & Camera',
      'Direction, cinematography and camera operation',
      'Riya Menon',
      ['Riya Menon', 'Arjun Nair', 'Vishnu Prasad'],
    ],
    [
      'Post-production',
      'Editing, colour, sound and motion',
      'Fathima Rahman',
      ['Fathima Rahman', 'Divya Raghavan', 'Sreejith Kumar', 'Naseeh Ali'],
    ],
    ['AI & VFX', 'AI-integrated workflows, previs and compositing', 'Ananya Iyer', ['Ananya Iyer']],
    [
      'Operations & Finance',
      'Accounts, HR and administration',
      'Lakshmi Pillai',
      ['Lakshmi Pillai', 'Sameera Thomas'],
    ],
  ];
  for (const [name, description, lead, list] of departments) {
    const department = await m.Department.create({ name, description, leadId: member(lead) });
    await m.TeamMember.updateMany(
      { _id: { $in: list.map((n) => member(n)) } },
      { $set: { departmentId: department._id } },
    );
  }
  await m.TeamMember.updateMany(
    { name: { $in: ['Sreejith Kumar'] } },
    { $set: { employmentType: 'PART_TIME' } },
  );
  await m.TeamMember.updateMany(
    { name: { $in: ['Naseeh Ali'] } },
    { $set: { employmentType: 'FREELANCE' } },
  );

  const allMembers = byTime(
    await m.TeamMember.find().sort({ $natural: 1 }).lean<TeamMember[]>(),
    (t) => t.createdAt,
  );
  let code = 0;
  for (const t of allMembers) {
    code += 1;
    await m.TeamMember.updateOne({ _id: t._id }, { $set: { joinedOn: at(-300 + code * 11) } });
    await m.EmployeeRecord.create({
      teamMemberId: t._id,
      employeeCode: `NM-E${String(code).padStart(3, '0')}`,
      phone: `+91 90000 ${String(10000 + code).slice(1)}`,
      emergencyContact: 'Demo emergency contact',
      address: t.baseLocation === 'CHENNAI' ? 'Chennai (demo address)' : 'Kozhikode (demo address)',
      notes: 'Demonstration HR record — fictional person.',
    });
  }

  // Attendance for the last ten weekdays.
  const attendance: {
    teamMemberId: string;
    date: Date;
    status: 'REMOTE' | 'ON_SHOOT' | 'HALF_DAY' | 'PRESENT';
    checkIn: Date | null;
    checkOut: Date | null;
  }[] = [];
  for (let offset = -14; offset <= 0; offset++) {
    const day = new Date(TODAY.getTime() + offset * DAY);
    if (day.getDay() === 0) continue;
    allMembers.forEach((t, i) => {
      const roll = (i * 7 + offset * 3 + 100) % 19;
      const status =
        roll === 0
          ? 'REMOTE'
          : roll === 5
            ? 'ON_SHOOT'
            : roll === 9 && offset < 0
              ? 'HALF_DAY'
              : 'PRESENT';
      attendance.push({
        teamMemberId: t._id,
        date: dateOnly(offset),
        status,
        checkIn: status === 'REMOTE' ? null : at(offset, 9),
        checkOut: offset === 0 ? null : at(offset, status === 'HALF_DAY' ? 13 : 18),
      });
    });
  }
  await m.AttendanceRecord.insertMany(attendance);

  // ── Approval rules (ADR-0010) ─────────────────────────────────────────────

  const rules: ApprovalRuleInput[] = [
    {
      subject: 'EXPENSE',
      name: 'Production manager',
      minAmount: 0,
      stepOrder: 1,
      permission: 'expense:approve',
      isActive: true,
    },
    {
      subject: 'EXPENSE',
      name: 'Finance review (₹50,000+)',
      minAmount: 50_000,
      stepOrder: 2,
      permission: 'finance:write',
      isActive: true,
    },
    {
      subject: 'PURCHASE_REQUEST',
      name: 'Production manager',
      minAmount: 0,
      stepOrder: 1,
      permission: 'procurement:approve',
      isActive: true,
    },
    {
      subject: 'PURCHASE_REQUEST',
      name: 'Finance sign-off (₹1,00,000+)',
      minAmount: 100_000,
      stepOrder: 2,
      permission: 'finance:write',
      isActive: true,
    },
    {
      subject: 'LEAVE',
      name: 'HR',
      minAmount: 0,
      stepOrder: 1,
      permission: 'leave:approve',
      isActive: true,
    },
  ];
  await m.ApprovalRule.insertMany(rules.map((r) => ({ ...r })));

  /** Creates an approval request with its planned steps, decided up to `decided` steps. */
  async function approval(input: {
    subject: ApprovalSubject;
    title: string;
    amount: number | null;
    requestedById: string;
    projectId?: string | null;
    link: { expenseId?: string; purchaseRequestId?: string; leaveRequestId?: string };
    outcome: 'PENDING' | 'APPROVED' | 'REJECTED';
    /** Steps approved before the outcome (for PENDING: how far it got). */
    decided?: number;
    deciderId: string;
    reason?: string;
    createdAt: Date;
  }) {
    const steps = planApprovalSteps(rules, input.subject, input.amount);
    const approvedSteps =
      input.outcome === 'APPROVED'
        ? steps.length
        : input.outcome === 'REJECTED'
          ? (input.decided ?? 0)
          : (input.decided ?? 0);
    const currentStep = Math.min(steps.length, approvedSteps + 1);
    const decidedAt = new Date(input.createdAt.getTime() + DAY);
    const request = await m.ApprovalRequest.create({
      subject: input.subject,
      title: input.title,
      amount: input.amount,
      status: input.outcome,
      currentStep,
      requestedById: input.requestedById,
      projectId: input.projectId ?? null,
      ...input.link,
      createdAt: input.createdAt,
      decidedAt: input.outcome === 'PENDING' ? null : decidedAt,
    });
    await m.ApprovalStep.insertMany(
      steps.map((s) => {
        const done = s.order <= approvedSteps;
        const rejectedHere = input.outcome === 'REJECTED' && s.order === approvedSteps + 1;
        const pendingHere = input.outcome === 'PENDING' && s.order === approvedSteps + 1;
        return {
          requestId: request._id,
          order: s.order,
          label: s.label,
          permission: s.permission,
          status: done
            ? 'APPROVED'
            : rejectedHere
              ? 'REJECTED'
              : pendingHere
                ? 'PENDING'
                : input.outcome === 'REJECTED'
                  ? 'SKIPPED'
                  : 'WAITING',
          deciderId: done || rejectedHere ? input.deciderId : null,
          reason: rejectedHere ? (input.reason ?? 'Not approved') : null,
          decidedAt: done || rejectedHere ? decidedAt : null,
        };
      }),
    );
    return request;
  }

  // ── Vendors ───────────────────────────────────────────────────────────────

  const vendorDefs: [string, VendorCategory, string, string][] = [
    ['Lenswala Rentals', 'EQUIPMENT_RENTAL', 'Kochi', 'Anil Joseph'],
    ['Malabar Grip & Lighting', 'EQUIPMENT_RENTAL', 'Kozhikode', 'Suresh Babu'],
    ['Coastal Catering Co.', 'CATERING', 'Kozhikode', 'Reshma P.'],
    ['Kerala Fleet Travels', 'TRANSPORT', 'Kozhikode', 'Biju Mathew'],
    ['Pixel Forge Post', 'POST_PRODUCTION', 'Chennai', 'Vikram S.'],
    ['Marina Location Scouts', 'LOCATION', 'Chennai', 'Kavya R.'],
    ['MediaVault Supplies', 'SUPPLIES', 'Chennai', 'Imran Sheikh'],
    ['Rohan Das (freelance gaffer)', 'FREELANCE_CREW', 'Kozhikode', 'Rohan Das'],
    ['CloudSuite Software', 'SOFTWARE', 'Bengaluru', 'Accounts desk'],
  ];
  const vendor = new Map<string, string>();
  for (const [name, category, city, contactName] of vendorDefs) {
    const v = await m.Vendor.create({
      name,
      category,
      city,
      contactName,
      email: `${name.split(' ')[0]!.toLowerCase()}@vendor.demo`,
      notes: 'Demonstration vendor — fictional company.',
    });
    vendor.set(name, v._id);
  }

  // ── Expenses (submitted → approved → paid, posted to the ledger) ─────────

  let lastExpense: string | null = null;
  const expenseDefs: {
    title: string;
    category: FinanceCategory;
    amount: number;
    offset: number;
    project?: string;
    vendor?: string;
    by: string;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID';
    decided?: number;
    reason?: string;
  }[] = [
    {
      title: 'Gaffer and spark — Woven Light day 1',
      category: 'CREW',
      amount: 18_000,
      offset: -20,
      project: 'NM-26-031',
      vendor: 'Rohan Das (freelance gaffer)',
      by: users.producerUserId,
      status: 'PAID',
    },
    {
      title: 'Grip truck rental — Woven Light',
      category: 'EQUIPMENT_RENTAL',
      amount: 64_000,
      offset: -19,
      project: 'NM-26-031',
      vendor: 'Malabar Grip & Lighting',
      by: users.producerUserId,
      status: 'PAID',
    },
    {
      title: 'Crew lunch — Feel the Sound macro day',
      category: 'OVERHEAD',
      amount: 7_400,
      offset: -9,
      project: 'NM-26-032',
      vendor: 'Coastal Catering Co.',
      by: users.creativeUserId,
      status: 'APPROVED',
    },
    {
      title: 'Resort location fee — Monsoon Escape',
      category: 'LOCATION',
      amount: 85_000,
      offset: -3,
      project: 'NM-26-036',
      vendor: 'Marina Location Scouts',
      by: users.producerUserId,
      status: 'SUBMITTED',
      decided: 1,
    },
    {
      title: 'Tempo traveller — Chennai crew transfer',
      category: 'TRAVEL',
      amount: 12_500,
      offset: -2,
      project: 'NM-26-033',
      vendor: 'Kerala Fleet Travels',
      by: users.creativeUserId,
      status: 'SUBMITTED',
    },
    {
      title: 'Online edit suite — Campus Stories conform',
      category: 'POST_PRODUCTION',
      amount: 38_000,
      offset: -1,
      project: 'NM-26-037',
      vendor: 'Pixel Forge Post',
      by: users.producerUserId,
      status: 'SUBMITTED',
    },
    {
      title: 'Drone permit consultancy',
      category: 'LOCATION',
      amount: 22_000,
      offset: -6,
      project: 'NM-26-035',
      by: users.creativeUserId,
      status: 'REJECTED',
      reason: 'Covered by the client’s permit — please attach their letter instead.',
    },
    {
      title: 'Editing software seats (monthly)',
      category: 'SOFTWARE',
      amount: 9_800,
      offset: -12,
      vendor: 'CloudSuite Software',
      by: users.financeUserId,
      status: 'PAID',
    },
    {
      title: 'Practical props — A Day of Care',
      category: 'CREW',
      amount: 6_300,
      offset: 0,
      project: 'NM-26-038',
      by: users.creativeUserId,
      status: 'DRAFT',
    },
  ];
  const expenseIds = new Map<string, string>();
  for (const e of expenseDefs) {
    lastExpense = nextNumber('EXP-', lastExpense);
    const p = e.project ? project(e.project) : null;
    const created = await m.Expense.create({
      number: lastExpense,
      title: e.title,
      category: e.category,
      amount: e.amount,
      incurredOn: at(e.offset),
      projectId: p?.id ?? null,
      vendorId: e.vendor ? vendor.get(e.vendor)! : null,
      submittedById: e.by,
      status: e.status,
      paidAt: e.status === 'PAID' ? at(e.offset + 3) : null,
      notes: 'Demonstration expense.',
      createdAt: at(e.offset, 18),
    });
    expenseIds.set(e.title, created._id);
    if (e.status !== 'DRAFT') {
      await approval({
        subject: 'EXPENSE',
        title: e.title,
        amount: e.amount,
        requestedById: e.by,
        projectId: p?.id,
        link: { expenseId: created._id },
        outcome:
          e.status === 'SUBMITTED' ? 'PENDING' : e.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
        decided: e.decided,
        deciderId: users.producerUserId === e.by ? users.financeUserId : users.producerUserId,
        reason: e.reason,
        createdAt: at(e.offset, 18),
      });
    }
    if (e.status === 'PAID') {
      await m.FinancialRecord.create({
        kind: 'EXPENSE',
        category: e.category,
        amount: e.amount,
        occurredOn: at(e.offset + 3),
        projectId: p?.id ?? null,
        expenseId: created._id,
        note: `Paid expense ${lastExpense}`,
      });
    }
  }

  // ── Milestones, invoices and payments ─────────────────────────────────────
  // Existing income ledger rows become paid invoices so the ledger stays the single source (ADR-0011).

  const milestoneFor = new Map<string, { advance: string; shoot: string; final: string }>();
  for (const p of projects.values()) {
    const start = await m.Project.findById(p.id)
      .select({ startDate: 1, dueDate: 1, deliveredAt: 1 })
      .lean<Pick<Project, '_id' | 'startDate' | 'dueDate' | 'deliveredAt'>>();
    if (!start) throw new Error(`Seed: unknown project ${p.code}`);
    const mid = new Date((start.startDate.getTime() + start.dueDate.getTime()) / 2);
    const mk = (title: string, dueDate: Date, share: number, done: boolean) =>
      m.Milestone.create({
        projectId: p.id,
        title,
        dueDate,
        billingAmount: Math.round(p.budget * share),
        completedAt: done ? dueDate : null,
      });
    const advance = await mk('Contract signed — advance', start.startDate, 0.4, true);
    const shoot = await mk('Shoot wrapped', mid, 0.3, mid < TODAY);
    const final = await mk('Final delivery', start.dueDate, 0.3, p.status === 'DELIVERED');
    milestoneFor.set(p.id, { advance: advance._id, shoot: shoot._id, final: final._id });
  }

  let lastInvoice: string | null = null;
  const invoicePrefix = `NM-INV-${TODAY.getFullYear()}-`;
  async function invoice(input: {
    projectId: string;
    clientId: string;
    milestoneId?: string;
    lines: { description: string; quantity: number; unitPrice: number }[];
    issueOffset: number;
    termDays: number;
    status: 'DRAFT' | 'SENT';
    taxPercent?: number;
    createdById?: string;
  }) {
    lastInvoice = nextNumber(invoicePrefix, lastInvoice, 3);
    const taxPercent = input.taxPercent ?? 18;
    const totals = invoiceTotals(input.lines, taxPercent);
    const issueDate = at(input.issueOffset);
    const created = await m.Invoice.create({
      number: lastInvoice,
      clientId: input.clientId,
      projectId: input.projectId,
      milestoneId: input.milestoneId ?? null,
      status: input.status,
      issueDate,
      dueDate: new Date(issueDate.getTime() + input.termDays * DAY),
      taxPercent,
      ...totals,
      sentAt: input.status === 'SENT' ? issueDate : null,
      notes:
        'Demonstration invoice. Tax shown as a simple percentage, not a compliance calculation.',
      createdById: input.createdById ?? users.financeUserId,
      createdAt: issueDate,
    });
    await m.InvoiceLine.insertMany(
      input.lines.map((l, i) => ({
        ...l,
        invoiceId: created._id,
        order: i + 1,
        amount: l.quantity * l.unitPrice,
      })),
    );
    return created;
  }

  type IncomeRow = FinancialRecord & {
    project: Pick<Project, '_id' | 'id' | 'title' | 'clientId'> | null;
  };
  const incomes = byTime(
    await m.FinancialRecord.find({ kind: 'INCOME', projectId: { $ne: null } })
      .sort({ $natural: 1 })
      .populate({ path: 'project', select: { title: 1, clientId: 1 } })
      .lean<IncomeRow[]>(),
    (r) => r.occurredOn,
  );
  let paidInvoices = 0;
  for (const r of incomes) {
    const p = r.project!;
    const ms = milestoneFor.get(p.id)!;
    const milestoneId =
      r.category === 'ADVANCE' ? ms.advance : r.category === 'MILESTONE' ? ms.shoot : ms.final;
    const label =
      r.category === 'ADVANCE'
        ? 'Advance on signing'
        : r.category === 'MILESTONE'
          ? 'Milestone after shoot'
          : 'Final payment';
    const issueOffset = Math.round((r.occurredOn.getTime() - TODAY.getTime()) / DAY) - 6;
    // Received amount includes tax; the invoice line is the pre-tax portion.
    const inv = await invoice({
      projectId: p.id,
      clientId: p.clientId,
      milestoneId,
      lines: [
        {
          description: `${label} — ${p.title}`,
          quantity: 1,
          unitPrice: Math.round(r.amount / 1.18),
        },
      ],
      issueOffset,
      termDays: 15,
      status: 'SENT',
    });
    const payment = await m.Payment.create({
      invoiceId: inv._id,
      amount: inv.total,
      receivedOn: r.occurredOn,
      method: paidInvoices % 3 === 0 ? 'UPI' : 'BANK_TRANSFER',
      reference: `DEMO-${String(1000 + paidInvoices)}`,
      recordedById: users.financeUserId,
    });
    await m.FinancialRecord.updateOne(
      { _id: r._id },
      { $set: { paymentId: payment._id, amount: inv.total, note: `Payment for ${inv.number}` } },
    );
    await m.Invoice.updateOne(
      { _id: inv._id },
      { $set: { status: invoiceStatusAfterPayments('SENT', inv.total, inv.total) } },
    );
    paidInvoices += 1;
  }

  // Open receivables: one overdue, one partly paid, one current, one draft.
  const openInvoices: {
    code: string;
    ms: 'shoot' | 'final';
    issue: number;
    term: number;
    status: 'DRAFT' | 'SENT';
    partial?: number;
  }[] = [
    { code: 'NM-26-032', ms: 'shoot', issue: -34, term: 15, status: 'SENT' },
    { code: 'NM-26-033', ms: 'shoot', issue: -20, term: 15, status: 'SENT', partial: 0.5 },
    { code: 'NM-26-037', ms: 'shoot', issue: -4, term: 15, status: 'SENT' },
    { code: 'NM-26-038', ms: 'shoot', issue: 0, term: 15, status: 'DRAFT' },
  ];
  for (const o of openInvoices) {
    const p = project(o.code);
    const ms = milestoneFor.get(p.id)!;
    const amount = Math.round(p.budget * 0.3);
    const inv = await invoice({
      projectId: p.id,
      clientId: p.clientId,
      milestoneId: ms[o.ms],
      lines: [
        {
          description: `${o.ms === 'shoot' ? 'Milestone after shoot' : 'Final delivery'} — ${p.title}`,
          quantity: 1,
          unitPrice: amount,
        },
      ],
      issueOffset: o.issue,
      termDays: o.term,
      status: o.status,
    });
    if (o.partial) {
      const paid = Math.round(inv.total * o.partial);
      const payment = await m.Payment.create({
        invoiceId: inv._id,
        amount: paid,
        receivedOn: at(o.issue + 10),
        method: 'BANK_TRANSFER',
        reference: 'DEMO-PART-1',
        recordedById: users.financeUserId,
      });
      await m.FinancialRecord.create({
        kind: 'INCOME',
        category: 'MILESTONE',
        amount: paid,
        occurredOn: at(o.issue + 10),
        projectId: p.id,
        paymentId: payment._id,
        note: `Part payment for ${inv.number}`,
      });
      await m.Invoice.updateOne(
        { _id: inv._id },
        { $set: { status: invoiceStatusAfterPayments('SENT', inv.total, paid) } },
      );
    }
  }

  // ── Risks, contacts, lead ownership, subtasks ─────────────────────────────

  const risks: [
    string,
    string,
    'LOW' | 'MEDIUM' | 'HIGH',
    'LOW' | 'MEDIUM' | 'HIGH',
    string,
    string,
  ][] = [
    [
      'NM-26-031',
      'Monsoon rain on the exterior day',
      'HIGH',
      'MEDIUM',
      'Hold a covered weaving-shed alternative; weather call at 06:00.',
      'Karthik Subramanian',
    ],
    [
      'NM-26-031',
      'Spend running ahead of progress',
      'HIGH',
      'HIGH',
      'Freeze additional rentals; review grade scope with client.',
      'Karthik Subramanian',
    ],
    [
      'NM-26-032',
      'Client feedback slower than planned',
      'MEDIUM',
      'MEDIUM',
      'Agree a 48-hour review window in writing.',
      'Karthik Subramanian',
    ],
    [
      'NM-26-036',
      'Resort availability during peak season',
      'MEDIUM',
      'HIGH',
      'Second location shortlisted by Marina Location Scouts.',
      'Meera Krishnan',
    ],
    [
      'NM-26-039',
      'Delivery overdue',
      'HIGH',
      'MEDIUM',
      'Prioritise vertical exports; daily check-in.',
      'Divya Raghavan',
    ],
  ];
  for (const [codeKey, title, likelihood, impact, mitigation, owner] of risks) {
    await m.ProjectRisk.create({
      projectId: project(codeKey).id,
      title,
      likelihood,
      impact,
      mitigation,
      ownerId: member(owner),
    });
  }

  const clients = await m.Client.find().sort({ $natural: 1 }).lean<Client[]>();
  for (const c of clients) {
    await m.ClientContact.create({
      clientId: c._id,
      name: c.contactName ?? 'Primary contact',
      role: 'Marketing lead',
      email: c.contactEmail,
      isPrimary: true,
    });
    await m.ClientContact.create({
      clientId: c._id,
      name: 'Accounts desk',
      role: 'Accounts payable',
      email: `accounts@${(c.contactEmail ?? 'client@x.demo').split('@')[1]}`,
    });
  }

  const openLeads = byTime(
    await m.Lead.find({ stage: { $nin: ['WON', 'LOST'] } })
      .sort({ $natural: 1 })
      .lean<Lead[]>(),
    (l) => l.createdAt,
  );
  for (const [i, l] of openLeads.entries()) {
    await m.Lead.updateOne(
      { _id: l._id },
      {
        $set: {
          ownerId: i % 2 === 0 ? users.producerUserId : users.adminId,
          nextFollowUpAt: at(i % 3 === 0 ? -1 : i + 1, 11),
        },
      },
    );
  }

  const parents = await m.Task.find({
    title: { $in: ['Colour grade', 'Location recce and permits'] },
    status: { $ne: 'DONE' },
  })
    .sort({ $natural: 1 })
    .limit(3)
    .lean<Task[]>();
  for (const t of parents) {
    const subs =
      t.title === 'Colour grade'
        ? ['Balance and match shots', 'Look development', 'Client grade review']
        : ['Shortlist three locations', 'Apply for permits'];
    for (const [i, title] of subs.entries()) {
      await m.Task.create({
        projectId: t.projectId,
        projectStageId: t.projectStageId,
        parentId: t._id,
        title,
        assigneeId: t.assigneeId,
        status: i === 0 ? 'DONE' : 'TODO',
        completedAt: i === 0 ? at(-1) : null,
        priority: t.priority,
        dueDate: t.dueDate,
      });
    }
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  const stockDefs: [
    string,
    string,
    StockCategory,
    string,
    number,
    number,
    'KOZHIKODE' | 'CHENNAI',
    number,
  ][] = [
    ['MED-CFX-160', 'CFexpress Type A 160 GB', 'MEDIA', 'card', 6, 4, 'KOZHIKODE', 14_500],
    [
      'MED-SSD-2TB',
      'Portable SSD 2 TB (shuttle drive)',
      'MEDIA',
      'drive',
      3,
      4,
      'KOZHIKODE',
      13_800,
    ],
    ['MED-HDD-8TB', 'Archive HDD 8 TB', 'MEDIA', 'drive', 5, 2, 'CHENNAI', 16_200],
    ['BAT-NPF-970', 'NP-F970 battery', 'BATTERIES', 'unit', 10, 6, 'KOZHIKODE', 3_900],
    ['BAT-AA-PRO', 'AA rechargeable (4-pack)', 'BATTERIES', 'pack', 0, 3, 'KOZHIKODE', 1_250],
    ['LGT-GEL-CTO', 'CTO gel sheet, full', 'LIGHTING_SUPPLIES', 'sheet', 4, 6, 'KOZHIKODE', 850],
    ['LGT-DIF-216', 'Diffusion 216, roll', 'LIGHTING_SUPPLIES', 'roll', 2, 1, 'CHENNAI', 5_400],
    ['GRP-TAPE-BLK', 'Gaffer tape 2", black', 'GRIP_SUPPLIES', 'roll', 14, 8, 'KOZHIKODE', 950],
    ['GRP-SAND-10', 'Sandbag 10 kg', 'GRIP_SUPPLIES', 'bag', 12, 6, 'KOZHIKODE', 700],
    ['CBL-XLR-10M', 'XLR cable 10 m', 'CABLES', 'cable', 9, 4, 'KOZHIKODE', 1_100],
    ['CLN-LENS-WP', 'Lens wipes (box of 100)', 'CLEANING', 'box', 2, 2, 'CHENNAI', 600],
    ['PRP-TABLE-AC', 'Acrylic product riser set', 'PROPS', 'set', 3, 1, 'CHENNAI', 2_400],
  ];
  const stock = new Map<string, string>();
  for (const [sku, name, category, unit, onHand, reorderLevel, location, unitCost] of stockDefs) {
    const item = await m.StockItem.create({
      sku,
      name,
      category,
      unit,
      onHand,
      reorderLevel,
      location,
      unitCost,
      notes: 'Demo stock.',
    });
    stock.set(sku, item._id);
    await m.StockMovement.create({
      stockItemId: item._id,
      type: 'ADJUSTED',
      quantity: onHand,
      balanceAfter: onHand,
      note: 'Opening count (demo)',
      actorId: users.producerUserId,
      createdAt: at(-30),
    });
  }
  // A few issues to productions (balance shown is after the movement).
  for (const [sku, qty, codeKey, offset] of [
    ['GRP-TAPE-BLK', 4, 'NM-26-031', -18],
    ['BAT-AA-PRO', 3, 'NM-26-032', -9],
    ['LGT-GEL-CTO', 2, 'NM-26-031', -18],
  ] as const) {
    const item = await m.StockItem.findOne({ sku }).lean<{ _id: string; onHand: number }>();
    if (!item) throw new Error(`Seed: unknown stock item ${sku}`);
    const before = item.onHand + qty;
    await m.StockMovement.create({
      stockItemId: item._id,
      type: 'ISSUED',
      quantity: -qty,
      balanceAfter: item.onHand,
      projectId: project(codeKey).id,
      note: 'Issued for shoot',
      actorId: users.creativeUserId,
      createdAt: at(offset),
    });
    await m.StockMovement.updateMany(
      { stockItemId: item._id, type: 'ADJUSTED' },
      { $set: { quantity: before, balanceAfter: before } },
    );
  }

  // ── Procurement ───────────────────────────────────────────────────────────

  let lastPr: string | null = null;
  let lastPo: string | null = null;
  async function purchaseRequest(input: {
    title: string;
    justification: string;
    projectCode?: string;
    by: string;
    neededBy?: number;
    items: [string, number, number, string?][];
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ORDERED';
    offset: number;
    decided?: number;
    reason?: string;
  }) {
    lastPr = nextNumber('PR-', lastPr);
    const estimatedTotal = input.items.reduce((n, [, q, c]) => n + q * c, 0);
    const p = input.projectCode ? project(input.projectCode) : null;
    const pr = await m.PurchaseRequest.create({
      number: lastPr,
      title: input.title,
      justification: input.justification,
      projectId: p?.id ?? null,
      requestedById: input.by,
      neededBy: input.neededBy === undefined ? null : at(input.neededBy),
      status: input.status,
      estimatedTotal,
      createdAt: at(input.offset, 15),
    });
    await m.PurchaseRequestItem.insertMany(
      input.items.map(([description, quantity, estimatedUnitCost, sku]) => ({
        requestId: pr._id,
        description,
        quantity,
        estimatedUnitCost,
        stockItemId: sku ? stock.get(sku)! : null,
      })),
    );
    if (input.status !== 'DRAFT') {
      await approval({
        subject: 'PURCHASE_REQUEST',
        title: `${pr.number} · ${input.title}`,
        amount: estimatedTotal,
        requestedById: input.by,
        projectId: p?.id,
        link: { purchaseRequestId: pr._id },
        outcome:
          input.status === 'SUBMITTED'
            ? 'PENDING'
            : input.status === 'REJECTED'
              ? 'REJECTED'
              : 'APPROVED',
        decided: input.decided,
        deciderId: input.by === users.producerUserId ? users.financeUserId : users.producerUserId,
        reason: input.reason,
        createdAt: at(input.offset, 15),
      });
    }
    return pr;
  }

  const prMedia = await purchaseRequest({
    title: 'Media for the monsoon shoots',
    justification: 'Two back-to-back shoots need double card sets and shuttle drives.',
    by: users.creativeUserId,
    neededBy: -8,
    items: [
      ['CFexpress Type A 160 GB', 4, 14_500, 'MED-CFX-160'],
      ['Portable SSD 2 TB', 2, 13_800, 'MED-SSD-2TB'],
    ],
    status: 'ORDERED',
    offset: -16,
  });
  for (const [name, amount, selected] of [
    ['MediaVault Supplies', 82_400, true],
    ['Lenswala Rentals', 86_900, false],
  ] as const) {
    await m.VendorQuote.create({
      requestId: prMedia._id,
      vendorId: vendor.get(name)!,
      amount,
      isSelected: selected,
      validUntil: at(-2),
      createdAt: at(-15),
    });
  }
  lastPo = nextNumber('PO-', lastPo);
  const poMedia = await m.PurchaseOrder.create({
    number: lastPo,
    requestId: prMedia._id,
    vendorId: vendor.get('MediaVault Supplies')!,
    status: 'RECEIVED',
    issuedOn: at(-14),
    expectedOn: at(-10),
    total: 82_400,
    createdById: users.financeUserId,
    createdAt: at(-14),
  });
  const poMediaLines = await m.PurchaseOrderLine.insertMany([
    {
      orderId: poMedia._id,
      description: 'CFexpress Type A 160 GB',
      quantity: 4,
      unitCost: 14_100,
      receivedQty: 4,
      stockItemId: stock.get('MED-CFX-160')!,
    },
    {
      orderId: poMedia._id,
      description: 'Portable SSD 2 TB',
      quantity: 2,
      unitCost: 12_999,
      receivedQty: 2,
      stockItemId: stock.get('MED-SSD-2TB')!,
    },
  ]);
  for (const line of poMediaLines) {
    const item = await m.StockItem.findById(line.stockItemId).lean<{
      _id: string;
      onHand: number;
    }>();
    if (!item) throw new Error('Seed: stock item missing for a purchase order line');
    await m.StockMovement.create({
      stockItemId: item._id,
      type: 'RECEIVED',
      quantity: line.receivedQty,
      balanceAfter: item.onHand,
      purchaseOrderLineId: line._id,
      note: `Received on ${poMedia.number}`,
      actorId: users.financeUserId,
      createdAt: at(-10),
    });
    // The opening count predates the delivery.
    await m.StockMovement.updateMany(
      { stockItemId: item._id, type: 'ADJUSTED' },
      {
        $set: {
          quantity: item.onHand - line.receivedQty,
          balanceAfter: item.onHand - line.receivedQty,
        },
      },
    );
  }
  lastExpense = nextNumber('EXP-', lastExpense);
  const bill = await m.Expense.create({
    number: lastExpense,
    title: `Vendor bill — ${poMedia.number} (MediaVault Supplies)`,
    category: 'CONSUMABLES',
    amount: 82_400,
    incurredOn: at(-10),
    vendorId: vendor.get('MediaVault Supplies')!,
    purchaseOrderId: poMedia._id,
    submittedById: users.financeUserId,
    status: 'PAID',
    paidAt: at(-7),
    createdAt: at(-10),
  });
  await approval({
    subject: 'EXPENSE',
    title: bill.title,
    amount: bill.amount,
    requestedById: users.financeUserId,
    link: { expenseId: bill._id },
    outcome: 'APPROVED',
    deciderId: users.producerUserId,
    createdAt: at(-10),
  });
  await m.FinancialRecord.create({
    kind: 'EXPENSE',
    category: 'CONSUMABLES',
    amount: 82_400,
    occurredOn: at(-7),
    expenseId: bill._id,
    note: `Paid expense ${bill.number}`,
  });

  const prGels = await purchaseRequest({
    title: 'Gels and diffusion restock',
    justification: 'CTO gels below reorder level before the Chennai product shoots.',
    by: users.creativeUserId,
    neededBy: 6,
    items: [
      ['CTO gel sheet, full', 10, 850, 'LGT-GEL-CTO'],
      ['Diffusion 216, roll', 1, 5_400, 'LGT-DIF-216'],
    ],
    status: 'SUBMITTED',
    offset: -1,
  });
  await m.VendorQuote.create({
    requestId: prGels._id,
    vendorId: vendor.get('Malabar Grip & Lighting')!,
    amount: 13_600,
    createdAt: at(-1),
  });
  await purchaseRequest({
    title: 'Drone batteries and ND filter kit',
    justification: 'Aerial work for Skyline Residences needs a full day of flight time.',
    projectCode: 'NM-26-035',
    by: users.producerUserId,
    neededBy: 10,
    items: [
      ['Intelligent flight battery', 4, 21_000],
      ['ND/PL filter kit', 1, 24_000],
    ],
    status: 'SUBMITTED',
    offset: -2,
    decided: 1,
  });
  const prAudio = await purchaseRequest({
    title: 'Lavalier kit for interviews',
    justification: 'Campus Stories interviews need two more wireless lavs.',
    projectCode: 'NM-26-037',
    by: users.producerUserId,
    items: [['Wireless lavalier set', 2, 26_500]],
    status: 'APPROVED',
    offset: -4,
  });
  lastPo = nextNumber('PO-', lastPo);
  const poAudio = await m.PurchaseOrder.create({
    number: lastPo,
    requestId: prAudio._id,
    vendorId: vendor.get('Lenswala Rentals')!,
    status: 'ISSUED',
    issuedOn: at(-2),
    expectedOn: at(3),
    total: 53_000,
    createdById: users.financeUserId,
  });
  await m.PurchaseOrderLine.create({
    orderId: poAudio._id,
    description: 'Wireless lavalier set',
    quantity: 2,
    unitCost: 26_500,
  });
  await m.PurchaseRequest.updateOne({ _id: prAudio._id }, { $set: { status: 'ORDERED' } });
  await purchaseRequest({
    title: 'Second gimbal',
    justification: 'Nice to have for two-camera walk-and-talks.',
    by: users.creativeUserId,
    items: [['Gimbal stabiliser', 1, 68_000]],
    status: 'REJECTED',
    offset: -9,
    reason: 'Rent per shoot for now; revisit next quarter.',
  });
  await purchaseRequest({
    title: 'Cleaning supplies',
    justification: 'Lens wipes and sensor swabs.',
    by: users.creativeUserId,
    items: [['Lens wipes (box of 100)', 4, 600, 'CLN-LENS-WP']],
    status: 'DRAFT',
    offset: 0,
  });

  // ── Assets: condition, custody, maintenance ───────────────────────────────

  const assets = await m.Asset.find().sort({ $natural: 1 }).lean<Asset[]>();
  const assetByName = new Map(assets.map((a) => [a.name, a]));
  for (const a of assets) {
    await m.Asset.updateOne(
      { _id: a._id },
      {
        $set: {
          condition:
            a.status === 'MAINTENANCE' ? 'NEEDS_REPAIR' : a.dailyRate > 6000 ? 'EXCELLENT' : 'GOOD',
          purchasedOn: at(-420 + (a.dailyRate % 97)),
          purchaseCost: a.dailyRate * 55,
          custodianId:
            a.category === 'CAMERA'
              ? member('Arjun Nair')
              : a.category === 'AUDIO'
                ? member('Sreejith Kumar')
                : null,
        },
      },
    );
    if (a.status === 'MAINTENANCE') {
      await m.AssetMaintenance.create({
        assetId: a._id,
        kind: 'CALIBRATION',
        description: 'Sensor recalibration at service centre (demo).',
        vendorId: vendor.get('Lenswala Rentals')!,
        startedOn: at(-3),
      });
    }
  }
  const fx6 = assetByName.get('Sony FX6 — A-cam');
  if (fx6) {
    await m.AssetMaintenance.create({
      assetId: fx6._id,
      kind: 'SERVICE',
      description: 'Routine sensor clean and firmware update.',
      cost: 4_500,
      vendorId: vendor.get('Lenswala Rentals')!,
      startedOn: at(-40),
      completedOn: at(-39),
    });
  }

  // ── Studios ───────────────────────────────────────────────────────────────

  const studios = [
    {
      name: 'Studio A — Cyclorama',
      location: 'KOZHIKODE' as const,
      kind: 'Green-screen cyclorama',
      capacity: 15,
      hourlyRate: 3_500,
      features: ['Green & white cyc', 'Lighting grid', 'Make-up room'],
    },
    {
      name: 'Podcast Room',
      location: 'KOZHIKODE' as const,
      kind: 'Podcast & voice-over',
      capacity: 4,
      hourlyRate: 1_200,
      features: ['4 mics', 'Acoustic treatment', '3-camera switcher'],
    },
    {
      name: 'Studio C — Product Table',
      location: 'CHENNAI' as const,
      kind: 'Product & macro tabletop',
      capacity: 6,
      hourlyRate: 1_800,
      features: ['Motion-control slider', 'Sweep table', 'Black/white flags'],
    },
  ];
  const studioIds = new Map<string, string>();
  for (const s of studios) {
    const created = await m.Studio.create(s);
    studioIds.set(s.name, created._id);
  }
  const bookings: [
    string,
    string,
    string | null,
    number,
    number,
    number,
    number,
    'CONFIRMED' | 'TENTATIVE',
  ][] = [
    ['Studio A — Cyclorama', 'Green-screen inserts', 'NM-26-033', 1, 9, 1, 18, 'CONFIRMED'],
    ['Studio A — Cyclorama', 'Talent screen test', 'NM-26-038', 3, 10, 3, 14, 'TENTATIVE'],
    ['Studio C — Product Table', 'Macro product passes', 'NM-26-032', 2, 9, 2, 17, 'CONFIRMED'],
    ['Studio C — Product Table', 'Demo UI pick-ups', 'NM-26-040', 5, 10, 5, 16, 'CONFIRMED'],
    ['Podcast Room', 'Founder voice-over', 'NM-26-037', 0, 14, 0, 17, 'CONFIRMED'],
    ['Podcast Room', 'Studio podcast pilot (internal)', null, 4, 11, 4, 13, 'TENTATIVE'],
  ];
  for (const [studio, title, codeKey, d1, h1, d2, h2, status] of bookings) {
    await m.StudioBooking.create({
      studioId: studioIds.get(studio)!,
      title,
      projectId: codeKey ? project(codeKey).id : null,
      startsAt: at(d1, h1),
      endsAt: at(d2, h2),
      status,
      bookedById: users.producerUserId,
    });
  }

  // ── Leave (one pending request clashes with a crew call) ──────────────────

  const upcoming = byTime(
    await m.Shoot.find({ startsAt: { $gt: new Date() }, status: { $ne: 'CANCELLED' } })
      .sort({ $natural: 1 })
      .lean<Shoot[]>(),
    (s) => s.startsAt,
  );
  const nextShoot = upcoming[0]
    ? {
        ...upcoming[0],
        crew: await m.CrewCall.find({ shootId: upcoming[0]._id })
          .sort({ $natural: 1 })
          .lean<CrewCall[]>(),
      }
    : null;
  const leaveDefs: {
    name: string;
    type: 'ANNUAL' | 'SICK' | 'CASUAL' | 'COMP_OFF';
    from: number;
    to: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reason: string;
  }[] = [
    {
      name: 'Divya Raghavan',
      type: 'ANNUAL',
      from: -12,
      to: -10,
      status: 'APPROVED',
      reason: 'Family function',
    },
    { name: 'Naseeh Ali', type: 'ANNUAL', from: 14, to: 16, status: 'APPROVED', reason: 'Travel' },
    { name: 'Sreejith Kumar', type: 'SICK', from: -5, to: -5, status: 'APPROVED', reason: 'Fever' },
    {
      name: 'Meera Krishnan',
      type: 'CASUAL',
      from: 20,
      to: 20,
      status: 'REJECTED',
      reason: 'Personal errand',
    },
  ];
  if (nextShoot?.crew[0]) {
    const name = allMembers.find((t) => t._id === nextShoot.crew[0]!.teamMemberId)?.name;
    const offset = Math.round((nextShoot.startsAt.getTime() - TODAY.getTime()) / DAY);
    if (name)
      leaveDefs.push({
        name,
        type: 'COMP_OFF',
        from: Math.floor(offset),
        to: Math.floor(offset),
        status: 'PENDING',
        reason: 'Comp-off for the weekend shoot',
      });
  }
  for (const l of leaveDefs) {
    const leave = await m.LeaveRequest.create({
      teamMemberId: member(l.name),
      type: l.type,
      startDate: dateOnly(l.from),
      endDate: dateOnly(l.to),
      reason: l.reason,
      status: l.status,
      createdAt: at(Math.min(l.from, 0) - 4),
    });
    await approval({
      subject: 'LEAVE',
      title: `${l.name} · ${l.type.toLowerCase().replace('_', '-')} leave`,
      amount: null,
      requestedById: users.adminId,
      link: { leaveRequestId: leave._id },
      outcome: l.status,
      deciderId: users.hrUserId,
      reason: l.status === 'REJECTED' ? 'Clashes with the Monsoon Escape recce.' : undefined,
      createdAt: at(Math.min(l.from, 0) - 4),
    });
    if (l.status === 'APPROVED' && l.from <= 0) {
      for (let d = l.from; d <= Math.min(l.to, 0); d++) {
        // Upsert on the (teamMemberId, date) unique key; a new row gets the schema defaults.
        await m.AttendanceRecord.updateOne(
          { teamMemberId: member(l.name), date: dateOnly(d) },
          { $set: { status: 'ON_LEAVE', checkIn: null, checkOut: null } },
          { upsert: true },
        );
      }
    }
  }

  // ── Documents (small real files in private GridFS storage, ADR-0012) ──────

  async function doc(input: {
    title: string;
    category: DocumentCategory;
    fileName: string;
    mimeType: string;
    body: string;
    confidential?: boolean;
    link: Partial<
      Record<
        | 'projectId'
        | 'clientId'
        | 'vendorId'
        | 'teamMemberId'
        | 'invoiceId'
        | 'expenseId'
        | 'purchaseOrderId',
        string
      >
    >;
    by: string;
    offset: number;
  }) {
    const stored = await putObject(db, Buffer.from(input.body, 'utf8'), input.mimeType);
    const created = await m.Document.create({
      title: input.title,
      category: input.category,
      confidential: input.confidential ?? false,
      description: 'Demonstration document.',
      currentVersion: 1,
      ...input.link,
      createdById: input.by,
      createdAt: at(input.offset),
    });
    await m.DocumentVersion.create({
      documentId: created._id,
      version: 1,
      fileName: input.fileName,
      mimeType: input.mimeType,
      ...stored,
      uploadedById: input.by,
      createdAt: at(input.offset),
    });
    return created;
  }
  const woven = project('NM-26-031');
  const zen = project('NM-26-032');
  await doc({
    title: 'Creative brief — Woven Light',
    category: 'BRIEF',
    fileName: 'woven-light-brief.md',
    mimeType: 'text/markdown',
    body: '# Woven Light — creative brief (DEMO)\n\nObjective: a 90-second brand film about handloom craft.\n\nTone: warm, tactile, unhurried.\n\nDeliverables: hero film, 30s cut-down, vertical cut.\n',
    link: { projectId: woven.id, clientId: woven.clientId },
    by: users.producerUserId,
    offset: -40,
  });
  await doc({
    title: 'Shooting script v2 — Woven Light',
    category: 'SCRIPT',
    fileName: 'woven-light-script-v2.md',
    mimeType: 'text/markdown',
    body: '# Woven Light — script v2 (DEMO)\n\nSC 01 — EXT. WEAVING SHED — DAWN\nMist over the looms. A shuttle flies.\n\nSC 02 — INT. SHED — DAY\nHands set the warp. VO: “Every thread remembers.”\n',
    link: { projectId: woven.id },
    by: users.creativeUserId,
    offset: -30,
  });
  await doc({
    title: 'Storyboard notes — Feel the Sound',
    category: 'STORYBOARD',
    fileName: 'feel-the-sound-boards.txt',
    mimeType: 'text/plain',
    body: 'Feel the Sound — storyboard notes (DEMO)\n1. Macro of earbud mesh, rack focus.\n2. Liquid ripple synced to bass hit.\n3. Hero spin on black acrylic.\n',
    link: { projectId: zen.id },
    by: users.creativeUserId,
    offset: -20,
  });
  await doc({
    title: 'Production services agreement — ZenPods Audio',
    category: 'CONTRACT',
    fileName: 'zenpods-agreement.txt',
    mimeType: 'text/plain',
    body: 'DEMONSTRATION CONTRACT — not a real agreement.\nParties: Neon Minds (studio) and ZenPods Audio (fictional client).\nScope: hero product film and cut-downs.\nPayment: 40% advance, 30% after shoot, 30% on delivery.\n',
    confidential: true,
    link: { projectId: zen.id, clientId: zen.clientId },
    by: users.financeUserId,
    offset: -25,
  });
  await doc({
    title: 'Offer letter — Sameera Thomas',
    category: 'HR',
    fileName: 'offer-letter.txt',
    mimeType: 'text/plain',
    body: 'DEMONSTRATION HR DOCUMENT — fictional person, no real terms.\n',
    confidential: true,
    link: { teamMemberId: member('Sameera Thomas') },
    by: users.hrUserId,
    offset: -60,
  });
  await doc({
    title: `Delivery note — ${poMedia.number}`,
    category: 'PURCHASE',
    fileName: 'delivery-note.txt',
    mimeType: 'text/plain',
    body: `MediaVault Supplies (fictional) — delivery note for ${poMedia.number}. 4 × CFexpress 160 GB, 2 × SSD 2 TB. DEMO.\n`,
    link: { purchaseOrderId: poMedia._id, vendorId: vendor.get('MediaVault Supplies')! },
    by: users.financeUserId,
    offset: -10,
  });

  // ── Notifications for the new flows ───────────────────────────────────────

  const pending = await m.ApprovalRequest.countDocuments({ status: 'PENDING' });
  const overdueInvoice = await m.Invoice.findOne({ projectId: zen.id, status: 'SENT' })
    .sort({ $natural: 1 })
    .lean<{ _id: string }>();
  if (!overdueInvoice) throw new Error('Seed: no sent invoice for Feel the Sound');
  await m.Notification.insertMany([
    {
      userId: users.adminId,
      kind: 'approval.requested',
      title: `${pending} approvals waiting`,
      body: 'Expenses, purchase requests and leave are waiting in Approvals',
      entityType: 'approval_request',
      entityId: 'inbox',
      createdAt: at(0, 8),
    },
    {
      userId: users.financeUserId,
      kind: 'finance.overdue',
      title: 'Invoice overdue',
      body: 'Feel the Sound — milestone invoice is past its due date',
      entityType: 'invoice',
      entityId: overdueInvoice._id,
      createdAt: at(0, 8),
    },
  ]);

  const [
    expenses,
    invoices,
    payments,
    approvals,
    purchaseRequests,
    orders,
    stockItems,
    studioBookings,
    documents,
    leave,
  ] = await Promise.all([
    m.Expense.countDocuments(),
    m.Invoice.countDocuments(),
    m.Payment.countDocuments(),
    m.ApprovalRequest.countDocuments(),
    m.PurchaseRequest.countDocuments(),
    m.PurchaseOrder.countDocuments(),
    m.StockItem.countDocuments(),
    m.StudioBooking.countDocuments(),
    m.Document.countDocuments(),
    m.LeaveRequest.countDocuments(),
  ]);
  return {
    departments: departments.length,
    vendors: vendorDefs.length,
    expenses,
    invoices,
    payments,
    approvalRequests: approvals,
    purchaseRequests,
    purchaseOrders: orders,
    stockItems,
    studios: studios.length,
    studioBookings,
    documents,
    leaveRequests: leave,
  };
}
