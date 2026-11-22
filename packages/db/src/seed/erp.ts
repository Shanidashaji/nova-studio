/**
 * DEMONSTRATION DATA for the ERP expansion: departments, employee records, attendance, leave,
 * vendors, approval rules and requests, expenses, invoices and payments (posted to the ledger),
 * milestones, risks, contacts, procurement, inventory, studios and documents.
 *
 * Runs after buildDemoWorld() and looks records up by their natural keys, so the two seeds stay
 * independent. Every person and company here is fictional.
 */
import {
  invoiceStatusAfterPayments,
  invoiceTotals,
  nextNumber,
  planApprovalSteps,
  type ApprovalRuleInput,
} from '@nova/shared';
import type { ApprovalSubject, Prisma, PrismaClient } from '../generated/prisma/client';
import { putObject, resolveStorageDir } from '../storage';

const DAY = 24 * 60 * 60 * 1000;
const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();
const at = (dayOffset: number, hour = 9) =>
  new Date(TODAY.getTime() + dayOffset * DAY + hour * 3600 * 1000);
/** Calendar date (UTC midnight) for @db.Date columns. */
const dateOnly = (dayOffset: number) => {
  const d = new Date(TODAY.getTime() + dayOffset * DAY);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

interface Users {
  adminId: string;
  producerUserId: string;
  financeUserId: string;
  hrUserId: string;
  creativeUserId: string;
}

export async function buildErpWorld(prisma: PrismaClient, users: Users) {
  const members = new Map(
    (await prisma.teamMember.findMany({ select: { id: true, name: true } })).map((m) => [
      m.name,
      m.id,
    ]),
  );
  const member = (name: string) => {
    const id = members.get(name);
    if (!id) throw new Error(`Seed: unknown team member ${name}`);
    return id;
  };
  const projects = new Map(
    (
      await prisma.project.findMany({
        select: { id: true, code: true, title: true, clientId: true, budget: true, status: true },
      })
    ).map((p) => [p.code, p]),
  );
  const project = (code: string) => {
    const p = projects.get(code);
    if (!p) throw new Error(`Seed: unknown project ${code}`);
    return p;
  };

  // ── People ────────────────────────────────────────────────────────────────

  // The creative demo account is the DOP's login; finance and HR staff join the team.
  await prisma.teamMember.update({
    where: { id: member('Arjun Nair') },
    data: { userId: users.creativeUserId },
  });
  for (const [name, title, userId] of [
    ['Lakshmi Pillai', 'Accounts Executive', users.financeUserId],
    ['Sameera Thomas', 'HR & Admin Executive', users.hrUserId],
  ] as const) {
    const m = await prisma.teamMember.create({
      data: {
        name,
        title,
        skills: title.startsWith('Accounts') ? ['Invoicing', 'Vendor payments'] : ['Onboarding', 'Leave & attendance'],
        baseLocation: 'KOZHIKODE',
        weeklyCapacityHours: 0,
        email: `${name.split(' ')[0]!.toLowerCase()}@studio.demo`,
        userId,
      },
    });
    members.set(name, m.id);
  }

  const departments: [string, string, string, string[]][] = [
    ['Production', 'Producers and coordinators who run projects end to end', 'Karthik Subramanian', ['Karthik Subramanian', 'Meera Krishnan']],
    ['Direction & Camera', 'Direction, cinematography and camera operation', 'Riya Menon', ['Riya Menon', 'Arjun Nair', 'Vishnu Prasad']],
    ['Post-production', 'Editing, colour, sound and motion', 'Fathima Rahman', ['Fathima Rahman', 'Divya Raghavan', 'Sreejith Kumar', 'Naseeh Ali']],
    ['AI & VFX', 'AI-integrated workflows, previs and compositing', 'Ananya Iyer', ['Ananya Iyer']],
    ['Operations & Finance', 'Accounts, HR and administration', 'Lakshmi Pillai', ['Lakshmi Pillai', 'Sameera Thomas']],
  ];
  for (const [name, description, lead, list] of departments) {
    await prisma.department.create({
      data: {
        name,
        description,
        leadId: member(lead),
        members: { connect: list.map((n) => ({ id: member(n) })) },
      },
    });
  }
  await prisma.teamMember.updateMany({
    where: { name: { in: ['Sreejith Kumar'] } },
    data: { employmentType: 'PART_TIME' },
  });
  await prisma.teamMember.updateMany({
    where: { name: { in: ['Naseeh Ali'] } },
    data: { employmentType: 'FREELANCE' },
  });

  const allMembers = await prisma.teamMember.findMany({ orderBy: { createdAt: 'asc' } });
  let code = 0;
  for (const m of allMembers) {
    code += 1;
    await prisma.teamMember.update({
      where: { id: m.id },
      data: { joinedOn: at(-300 + code * 11) },
    });
    await prisma.employeeRecord.create({
      data: {
        teamMemberId: m.id,
        employeeCode: `NM-E${String(code).padStart(3, '0')}`,
        phone: `+91 90000 ${String(10000 + code).slice(1)}`,
        emergencyContact: 'Demo emergency contact',
        address: m.baseLocation === 'CHENNAI' ? 'Chennai (demo address)' : 'Kozhikode (demo address)',
        notes: 'Demonstration HR record — fictional person.',
      },
    });
  }

  // Attendance for the last ten weekdays.
  const attendance: Prisma.AttendanceRecordCreateManyInput[] = [];
  for (let offset = -14; offset <= 0; offset++) {
    const day = new Date(TODAY.getTime() + offset * DAY);
    if (day.getDay() === 0) continue;
    allMembers.forEach((m, i) => {
      const roll = (i * 7 + offset * 3 + 100) % 19;
      const status =
        roll === 0 ? 'REMOTE' : roll === 5 ? 'ON_SHOOT' : roll === 9 && offset < 0 ? 'HALF_DAY' : 'PRESENT';
      attendance.push({
        teamMemberId: m.id,
        date: dateOnly(offset),
        status,
        checkIn: status === 'REMOTE' ? null : at(offset, 9),
        checkOut: offset === 0 ? null : at(offset, status === 'HALF_DAY' ? 13 : 18),
      });
    });
  }
  await prisma.attendanceRecord.createMany({ data: attendance });

  // ── Approval rules (ADR-0010) ─────────────────────────────────────────────

  const rules: ApprovalRuleInput[] = [
    { subject: 'EXPENSE', name: 'Production manager', minAmount: 0, stepOrder: 1, permission: 'expense:approve', isActive: true },
    { subject: 'EXPENSE', name: 'Finance review (₹50,000+)', minAmount: 50_000, stepOrder: 2, permission: 'finance:write', isActive: true },
    { subject: 'PURCHASE_REQUEST', name: 'Production manager', minAmount: 0, stepOrder: 1, permission: 'procurement:approve', isActive: true },
    { subject: 'PURCHASE_REQUEST', name: 'Finance sign-off (₹1,00,000+)', minAmount: 100_000, stepOrder: 2, permission: 'finance:write', isActive: true },
    { subject: 'LEAVE', name: 'HR', minAmount: 0, stepOrder: 1, permission: 'leave:approve', isActive: true },
  ];
  await prisma.approvalRule.createMany({ data: rules });

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
      input.outcome === 'APPROVED' ? steps.length : input.outcome === 'REJECTED' ? (input.decided ?? 0) : (input.decided ?? 0);
    const currentStep = Math.min(steps.length, approvedSteps + 1);
    const decidedAt = new Date(input.createdAt.getTime() + DAY);
    return prisma.approvalRequest.create({
      data: {
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
        steps: {
          create: steps.map((s) => {
            const done = s.order <= approvedSteps;
            const rejectedHere = input.outcome === 'REJECTED' && s.order === approvedSteps + 1;
            const pendingHere = input.outcome === 'PENDING' && s.order === approvedSteps + 1;
            return {
              order: s.order,
              label: s.label,
              permission: s.permission,
              status: done ? 'APPROVED' : rejectedHere ? 'REJECTED' : pendingHere ? 'PENDING' : input.outcome === 'REJECTED' ? 'SKIPPED' : 'WAITING',
              deciderId: done || rejectedHere ? input.deciderId : null,
              reason: rejectedHere ? (input.reason ?? 'Not approved') : null,
              decidedAt: done || rejectedHere ? decidedAt : null,
            };
          }),
        },
      },
    });
  }

  // ── Vendors ───────────────────────────────────────────────────────────────

  const vendorDefs: [string, Prisma.VendorCreateInput['category'], string, string][] = [
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
    const v = await prisma.vendor.create({
      data: {
        name,
        category,
        city,
        contactName,
        email: `${name.split(' ')[0]!.toLowerCase()}@vendor.demo`,
        notes: 'Demonstration vendor — fictional company.',
      },
    });
    vendor.set(name, v.id);
  }

  // ── Expenses (submitted → approved → paid, posted to the ledger) ─────────

  let lastExpense: string | null = null;
  const expenseDefs: {
    title: string;
    category: Prisma.ExpenseCreateInput['category'];
    amount: number;
    offset: number;
    project?: string;
    vendor?: string;
    by: string;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID';
    decided?: number;
    reason?: string;
  }[] = [
    { title: 'Gaffer and spark — Woven Light day 1', category: 'CREW', amount: 18_000, offset: -20, project: 'NM-26-031', vendor: 'Rohan Das (freelance gaffer)', by: users.producerUserId, status: 'PAID' },
    { title: 'Grip truck rental — Woven Light', category: 'EQUIPMENT_RENTAL', amount: 64_000, offset: -19, project: 'NM-26-031', vendor: 'Malabar Grip & Lighting', by: users.producerUserId, status: 'PAID' },
    { title: 'Crew lunch — Feel the Sound macro day', category: 'OVERHEAD', amount: 7_400, offset: -9, project: 'NM-26-032', vendor: 'Coastal Catering Co.', by: users.creativeUserId, status: 'APPROVED' },
    { title: 'Resort location fee — Monsoon Escape', category: 'LOCATION', amount: 85_000, offset: -3, project: 'NM-26-036', vendor: 'Marina Location Scouts', by: users.producerUserId, status: 'SUBMITTED', decided: 1 },
    { title: 'Tempo traveller — Chennai crew transfer', category: 'TRAVEL', amount: 12_500, offset: -2, project: 'NM-26-033', vendor: 'Kerala Fleet Travels', by: users.creativeUserId, status: 'SUBMITTED' },
    { title: 'Online edit suite — Campus Stories conform', category: 'POST_PRODUCTION', amount: 38_000, offset: -1, project: 'NM-26-037', vendor: 'Pixel Forge Post', by: users.producerUserId, status: 'SUBMITTED' },
    { title: 'Drone permit consultancy', category: 'LOCATION', amount: 22_000, offset: -6, project: 'NM-26-035', by: users.creativeUserId, status: 'REJECTED', reason: 'Covered by the client’s permit — please attach their letter instead.' },
    { title: 'Editing software seats (monthly)', category: 'SOFTWARE', amount: 9_800, offset: -12, vendor: 'CloudSuite Software', by: users.financeUserId, status: 'PAID' },
    { title: 'Practical props — A Day of Care', category: 'CREW', amount: 6_300, offset: 0, project: 'NM-26-038', by: users.creativeUserId, status: 'DRAFT' },
  ];
  const expenseIds = new Map<string, string>();
  for (const e of expenseDefs) {
    lastExpense = nextNumber('EXP-', lastExpense);
    const p = e.project ? project(e.project) : null;
    const created = await prisma.expense.create({
      data: {
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
      },
    });
    expenseIds.set(e.title, created.id);
    if (e.status !== 'DRAFT') {
      await approval({
        subject: 'EXPENSE',
        title: e.title,
        amount: e.amount,
        requestedById: e.by,
        projectId: p?.id,
        link: { expenseId: created.id },
        outcome: e.status === 'SUBMITTED' ? 'PENDING' : e.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
        decided: e.decided,
        deciderId: users.producerUserId === e.by ? users.financeUserId : users.producerUserId,
        reason: e.reason,
        createdAt: at(e.offset, 18),
      });
    }
    if (e.status === 'PAID') {
      await prisma.financialRecord.create({
        data: {
          kind: 'EXPENSE',
          category: e.category,
          amount: e.amount,
          occurredOn: at(e.offset + 3),
          projectId: p?.id ?? null,
          expenseId: created.id,
          note: `Paid expense ${lastExpense}`,
        },
      });
    }
  }

  // ── Milestones, invoices and payments ─────────────────────────────────────
  // Existing income ledger rows become paid invoices so the ledger stays the single source (ADR-0011).

  const milestoneFor = new Map<string, { advance: string; shoot: string; final: string }>();
  for (const p of projects.values()) {
    const start = await prisma.project.findUniqueOrThrow({
      where: { id: p.id },
      select: { startDate: true, dueDate: true, deliveredAt: true },
    });
    const mid = new Date((start.startDate.getTime() + start.dueDate.getTime()) / 2);
    const mk = (title: string, dueDate: Date, share: number, done: boolean) =>
      prisma.milestone.create({
        data: {
          projectId: p.id,
          title,
          dueDate,
          billingAmount: Math.round(p.budget * share),
          completedAt: done ? dueDate : null,
        },
      });
    const advance = await mk('Contract signed — advance', start.startDate, 0.4, true);
    const shoot = await mk('Shoot wrapped', mid, 0.3, mid < TODAY);
    const final = await mk('Final delivery', start.dueDate, 0.3, p.status === 'DELIVERED');
    milestoneFor.set(p.id, { advance: advance.id, shoot: shoot.id, final: final.id });
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
    return prisma.invoice.create({
      data: {
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
        notes: 'Demonstration invoice. Tax shown as a simple percentage, not a compliance calculation.',
        createdById: input.createdById ?? users.financeUserId,
        createdAt: issueDate,
        lines: { create: input.lines.map((l, i) => ({ ...l, order: i + 1, amount: l.quantity * l.unitPrice })) },
      },
    });
  }

  const incomes = await prisma.financialRecord.findMany({
    where: { kind: 'INCOME', projectId: { not: null } },
    orderBy: { occurredOn: 'asc' },
    include: { project: { select: { id: true, title: true, clientId: true } } },
  });
  let paidInvoices = 0;
  for (const r of incomes) {
    const p = r.project!;
    const ms = milestoneFor.get(p.id)!;
    const milestoneId =
      r.category === 'ADVANCE' ? ms.advance : r.category === 'MILESTONE' ? ms.shoot : ms.final;
    const label =
      r.category === 'ADVANCE' ? 'Advance on signing' : r.category === 'MILESTONE' ? 'Milestone after shoot' : 'Final payment';
    const issueOffset = Math.round((r.occurredOn.getTime() - TODAY.getTime()) / DAY) - 6;
    // Received amount includes tax; the invoice line is the pre-tax portion.
    const inv = await invoice({
      projectId: p.id,
      clientId: p.clientId,
      milestoneId,
      lines: [{ description: `${label} — ${p.title}`, quantity: 1, unitPrice: Math.round(r.amount / 1.18) }],
      issueOffset,
      termDays: 15,
      status: 'SENT',
    });
    const payment = await prisma.payment.create({
      data: {
        invoiceId: inv.id,
        amount: inv.total,
        receivedOn: r.occurredOn,
        method: paidInvoices % 3 === 0 ? 'UPI' : 'BANK_TRANSFER',
        reference: `DEMO-${String(1000 + paidInvoices)}`,
        recordedById: users.financeUserId,
      },
    });
    await prisma.financialRecord.update({
      where: { id: r.id },
      data: { paymentId: payment.id, amount: inv.total, note: `Payment for ${inv.number}` },
    });
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { status: invoiceStatusAfterPayments('SENT', inv.total, inv.total) },
    });
    paidInvoices += 1;
  }

  // Open receivables: one overdue, one partly paid, one current, one draft.
  const openInvoices: { code: string; ms: 'shoot' | 'final'; issue: number; term: number; status: 'DRAFT' | 'SENT'; partial?: number }[] = [
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
        { description: `${o.ms === 'shoot' ? 'Milestone after shoot' : 'Final delivery'} — ${p.title}`, quantity: 1, unitPrice: amount },
      ],
      issueOffset: o.issue,
      termDays: o.term,
      status: o.status,
    });
    if (o.partial) {
      const paid = Math.round(inv.total * o.partial);
      const payment = await prisma.payment.create({
        data: {
          invoiceId: inv.id,
          amount: paid,
          receivedOn: at(o.issue + 10),
          method: 'BANK_TRANSFER',
          reference: 'DEMO-PART-1',
          recordedById: users.financeUserId,
        },
      });
      await prisma.financialRecord.create({
        data: {
          kind: 'INCOME',
          category: 'MILESTONE',
          amount: paid,
          occurredOn: at(o.issue + 10),
          projectId: p.id,
          paymentId: payment.id,
          note: `Part payment for ${inv.number}`,
        },
      });
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { status: invoiceStatusAfterPayments('SENT', inv.total, paid) },
      });
    }
  }

  // ── Risks, contacts, lead ownership, subtasks ─────────────────────────────

  const risks: [string, string, 'LOW' | 'MEDIUM' | 'HIGH', 'LOW' | 'MEDIUM' | 'HIGH', string, string][] = [
    ['NM-26-031', 'Monsoon rain on the exterior day', 'HIGH', 'MEDIUM', 'Hold a covered weaving-shed alternative; weather call at 06:00.', 'Karthik Subramanian'],
    ['NM-26-031', 'Spend running ahead of progress', 'HIGH', 'HIGH', 'Freeze additional rentals; review grade scope with client.', 'Karthik Subramanian'],
    ['NM-26-032', 'Client feedback slower than planned', 'MEDIUM', 'MEDIUM', 'Agree a 48-hour review window in writing.', 'Karthik Subramanian'],
    ['NM-26-036', 'Resort availability during peak season', 'MEDIUM', 'HIGH', 'Second location shortlisted by Marina Location Scouts.', 'Meera Krishnan'],
    ['NM-26-039', 'Delivery overdue', 'HIGH', 'MEDIUM', 'Prioritise vertical exports; daily check-in.', 'Divya Raghavan'],
  ];
  for (const [codeKey, title, likelihood, impact, mitigation, owner] of risks) {
    await prisma.projectRisk.create({
      data: { projectId: project(codeKey).id, title, likelihood, impact, mitigation, ownerId: member(owner) },
    });
  }

  const clients = await prisma.client.findMany();
  for (const c of clients) {
    await prisma.clientContact.create({
      data: {
        clientId: c.id,
        name: c.contactName ?? 'Primary contact',
        role: 'Marketing lead',
        email: c.contactEmail,
        isPrimary: true,
      },
    });
    await prisma.clientContact.create({
      data: {
        clientId: c.id,
        name: 'Accounts desk',
        role: 'Accounts payable',
        email: `accounts@${(c.contactEmail ?? 'client@x.demo').split('@')[1]}`,
      },
    });
  }

  const openLeads = await prisma.lead.findMany({
    where: { stage: { notIn: ['WON', 'LOST'] } },
    orderBy: { createdAt: 'asc' },
  });
  for (const [i, l] of openLeads.entries()) {
    await prisma.lead.update({
      where: { id: l.id },
      data: {
        ownerId: i % 2 === 0 ? users.producerUserId : users.adminId,
        nextFollowUpAt: at(i % 3 === 0 ? -1 : i + 1, 11),
      },
    });
  }

  const parents = await prisma.task.findMany({
    where: { title: { in: ['Colour grade', 'Location recce and permits'] }, status: { not: 'DONE' } },
    take: 3,
  });
  for (const t of parents) {
    const subs =
      t.title === 'Colour grade'
        ? ['Balance and match shots', 'Look development', 'Client grade review']
        : ['Shortlist three locations', 'Apply for permits'];
    for (const [i, title] of subs.entries()) {
      await prisma.task.create({
        data: {
          projectId: t.projectId,
          projectStageId: t.projectStageId,
          parentId: t.id,
          title,
          assigneeId: t.assigneeId,
          status: i === 0 ? 'DONE' : 'TODO',
          completedAt: i === 0 ? at(-1) : null,
          priority: t.priority,
          dueDate: t.dueDate,
        },
      });
    }
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  const stockDefs: [string, string, Prisma.StockItemCreateInput['category'], string, number, number, 'KOZHIKODE' | 'CHENNAI', number][] = [
    ['MED-CFX-160', 'CFexpress Type A 160 GB', 'MEDIA', 'card', 6, 4, 'KOZHIKODE', 14_500],
    ['MED-SSD-2TB', 'Portable SSD 2 TB (shuttle drive)', 'MEDIA', 'drive', 3, 4, 'KOZHIKODE', 13_800],
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
    const item = await prisma.stockItem.create({
      data: { sku, name, category, unit, onHand, reorderLevel, location, unitCost, notes: 'Demo stock.' },
    });
    stock.set(sku, item.id);
    await prisma.stockMovement.create({
      data: {
        stockItemId: item.id,
        type: 'ADJUSTED',
        quantity: onHand,
        balanceAfter: onHand,
        note: 'Opening count (demo)',
        actorId: users.producerUserId,
        createdAt: at(-30),
      },
    });
  }
  // A few issues to productions (balance shown is after the movement).
  for (const [sku, qty, codeKey, offset] of [
    ['GRP-TAPE-BLK', 4, 'NM-26-031', -18],
    ['BAT-AA-PRO', 3, 'NM-26-032', -9],
    ['LGT-GEL-CTO', 2, 'NM-26-031', -18],
  ] as const) {
    const item = await prisma.stockItem.findUniqueOrThrow({ where: { sku } });
    const before = item.onHand + qty;
    await prisma.stockMovement.create({
      data: {
        stockItemId: item.id,
        type: 'ISSUED',
        quantity: -qty,
        balanceAfter: item.onHand,
        projectId: project(codeKey).id,
        note: 'Issued for shoot',
        actorId: users.creativeUserId,
        createdAt: at(offset),
      },
    });
    await prisma.stockMovement.updateMany({
      where: { stockItemId: item.id, type: 'ADJUSTED' },
      data: { quantity: before, balanceAfter: before },
    });
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
    const pr = await prisma.purchaseRequest.create({
      data: {
        number: lastPr,
        title: input.title,
        justification: input.justification,
        projectId: p?.id ?? null,
        requestedById: input.by,
        neededBy: input.neededBy === undefined ? null : at(input.neededBy),
        status: input.status,
        estimatedTotal,
        createdAt: at(input.offset, 15),
        items: {
          create: input.items.map(([description, quantity, estimatedUnitCost, sku]) => ({
            description,
            quantity,
            estimatedUnitCost,
            stockItemId: sku ? stock.get(sku)! : null,
          })),
        },
      },
      include: { items: true },
    });
    if (input.status !== 'DRAFT') {
      await approval({
        subject: 'PURCHASE_REQUEST',
        title: `${pr.number} · ${input.title}`,
        amount: estimatedTotal,
        requestedById: input.by,
        projectId: p?.id,
        link: { purchaseRequestId: pr.id },
        outcome:
          input.status === 'SUBMITTED' ? 'PENDING' : input.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
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
    await prisma.vendorQuote.create({
      data: { requestId: prMedia.id, vendorId: vendor.get(name)!, amount, isSelected: selected, validUntil: at(-2), createdAt: at(-15) },
    });
  }
  lastPo = nextNumber('PO-', lastPo);
  const poMedia = await prisma.purchaseOrder.create({
    data: {
      number: lastPo,
      requestId: prMedia.id,
      vendorId: vendor.get('MediaVault Supplies')!,
      status: 'RECEIVED',
      issuedOn: at(-14),
      expectedOn: at(-10),
      total: 82_400,
      createdById: users.financeUserId,
      createdAt: at(-14),
      lines: {
        create: [
          { description: 'CFexpress Type A 160 GB', quantity: 4, unitCost: 14_100, receivedQty: 4, stockItemId: stock.get('MED-CFX-160')! },
          { description: 'Portable SSD 2 TB', quantity: 2, unitCost: 12_999, receivedQty: 2, stockItemId: stock.get('MED-SSD-2TB')! },
        ],
      },
    },
    include: { lines: true },
  });
  for (const line of poMedia.lines) {
    const item = await prisma.stockItem.findUniqueOrThrow({ where: { id: line.stockItemId! } });
    await prisma.stockMovement.create({
      data: {
        stockItemId: item.id,
        type: 'RECEIVED',
        quantity: line.receivedQty,
        balanceAfter: item.onHand,
        purchaseOrderLineId: line.id,
        note: `Received on ${poMedia.number}`,
        actorId: users.financeUserId,
        createdAt: at(-10),
      },
    });
    // The opening count predates the delivery.
    await prisma.stockMovement.updateMany({
      where: { stockItemId: item.id, type: 'ADJUSTED' },
      data: {
        quantity: item.onHand - line.receivedQty,
        balanceAfter: item.onHand - line.receivedQty,
      },
    });
  }
  lastExpense = nextNumber('EXP-', lastExpense);
  const bill = await prisma.expense.create({
    data: {
      number: lastExpense,
      title: `Vendor bill — ${poMedia.number} (MediaVault Supplies)`,
      category: 'CONSUMABLES',
      amount: 82_400,
      incurredOn: at(-10),
      vendorId: vendor.get('MediaVault Supplies')!,
      purchaseOrderId: poMedia.id,
      submittedById: users.financeUserId,
      status: 'PAID',
      paidAt: at(-7),
      createdAt: at(-10),
    },
  });
  await approval({
    subject: 'EXPENSE',
    title: bill.title,
    amount: bill.amount,
    requestedById: users.financeUserId,
    link: { expenseId: bill.id },
    outcome: 'APPROVED',
    deciderId: users.producerUserId,
    createdAt: at(-10),
  });
  await prisma.financialRecord.create({
    data: { kind: 'EXPENSE', category: 'CONSUMABLES', amount: 82_400, occurredOn: at(-7), expenseId: bill.id, note: `Paid expense ${bill.number}` },
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
  await prisma.vendorQuote.create({
    data: { requestId: prGels.id, vendorId: vendor.get('Malabar Grip & Lighting')!, amount: 13_600, createdAt: at(-1) },
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
  await prisma.purchaseOrder.create({
    data: {
      number: lastPo,
      requestId: prAudio.id,
      vendorId: vendor.get('Lenswala Rentals')!,
      status: 'ISSUED',
      issuedOn: at(-2),
      expectedOn: at(3),
      total: 53_000,
      createdById: users.financeUserId,
      lines: { create: [{ description: 'Wireless lavalier set', quantity: 2, unitCost: 26_500 }] },
    },
  });
  await prisma.purchaseRequest.update({ where: { id: prAudio.id }, data: { status: 'ORDERED' } });
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

  const assets = await prisma.asset.findMany();
  const assetByName = new Map(assets.map((a) => [a.name, a]));
  for (const a of assets) {
    await prisma.asset.update({
      where: { id: a.id },
      data: {
        condition: a.status === 'MAINTENANCE' ? 'NEEDS_REPAIR' : a.dailyRate > 6000 ? 'EXCELLENT' : 'GOOD',
        purchasedOn: at(-420 + (a.dailyRate % 97)),
        purchaseCost: a.dailyRate * 55,
        custodianId:
          a.category === 'CAMERA' ? member('Arjun Nair') : a.category === 'AUDIO' ? member('Sreejith Kumar') : null,
      },
    });
    if (a.status === 'MAINTENANCE') {
      await prisma.assetMaintenance.create({
        data: { assetId: a.id, kind: 'CALIBRATION', description: 'Sensor recalibration at service centre (demo).', vendorId: vendor.get('Lenswala Rentals')!, startedOn: at(-3) },
      });
    }
  }
  const fx6 = assetByName.get('Sony FX6 — A-cam');
  if (fx6) {
    await prisma.assetMaintenance.create({
      data: { assetId: fx6.id, kind: 'SERVICE', description: 'Routine sensor clean and firmware update.', cost: 4_500, vendorId: vendor.get('Lenswala Rentals')!, startedOn: at(-40), completedOn: at(-39) },
    });
  }

  // ── Studios ───────────────────────────────────────────────────────────────

  const studios = [
    { name: 'Studio A — Cyclorama', location: 'KOZHIKODE' as const, kind: 'Green-screen cyclorama', capacity: 15, hourlyRate: 3_500, features: ['Green & white cyc', 'Lighting grid', 'Make-up room'] },
    { name: 'Podcast Room', location: 'KOZHIKODE' as const, kind: 'Podcast & voice-over', capacity: 4, hourlyRate: 1_200, features: ['4 mics', 'Acoustic treatment', '3-camera switcher'] },
    { name: 'Studio C — Product Table', location: 'CHENNAI' as const, kind: 'Product & macro tabletop', capacity: 6, hourlyRate: 1_800, features: ['Motion-control slider', 'Sweep table', 'Black/white flags'] },
  ];
  const studioIds = new Map<string, string>();
  for (const s of studios) {
    const created = await prisma.studio.create({ data: s });
    studioIds.set(s.name, created.id);
  }
  const bookings: [string, string, string | null, number, number, number, number, 'CONFIRMED' | 'TENTATIVE'][] = [
    ['Studio A — Cyclorama', 'Green-screen inserts', 'NM-26-033', 1, 9, 1, 18, 'CONFIRMED'],
    ['Studio A — Cyclorama', 'Talent screen test', 'NM-26-038', 3, 10, 3, 14, 'TENTATIVE'],
    ['Studio C — Product Table', 'Macro product passes', 'NM-26-032', 2, 9, 2, 17, 'CONFIRMED'],
    ['Studio C — Product Table', 'Demo UI pick-ups', 'NM-26-040', 5, 10, 5, 16, 'CONFIRMED'],
    ['Podcast Room', 'Founder voice-over', 'NM-26-037', 0, 14, 0, 17, 'CONFIRMED'],
    ['Podcast Room', 'Studio podcast pilot (internal)', null, 4, 11, 4, 13, 'TENTATIVE'],
  ];
  for (const [studio, title, codeKey, d1, h1, d2, h2, status] of bookings) {
    await prisma.studioBooking.create({
      data: {
        studioId: studioIds.get(studio)!,
        title,
        projectId: codeKey ? project(codeKey).id : null,
        startsAt: at(d1, h1),
        endsAt: at(d2, h2),
        status,
        bookedById: users.producerUserId,
      },
    });
  }

  // ── Leave (one pending request clashes with a crew call) ──────────────────

  const nextShoot = await prisma.shoot.findFirst({
    where: { startsAt: { gt: new Date() }, status: { not: 'CANCELLED' } },
    orderBy: { startsAt: 'asc' },
    include: { crew: true },
  });
  const leaveDefs: { name: string; type: 'ANNUAL' | 'SICK' | 'CASUAL' | 'COMP_OFF'; from: number; to: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reason: string }[] = [
    { name: 'Divya Raghavan', type: 'ANNUAL', from: -12, to: -10, status: 'APPROVED', reason: 'Family function' },
    { name: 'Naseeh Ali', type: 'ANNUAL', from: 14, to: 16, status: 'APPROVED', reason: 'Travel' },
    { name: 'Sreejith Kumar', type: 'SICK', from: -5, to: -5, status: 'APPROVED', reason: 'Fever' },
    { name: 'Meera Krishnan', type: 'CASUAL', from: 20, to: 20, status: 'REJECTED', reason: 'Personal errand' },
  ];
  if (nextShoot?.crew[0]) {
    const name = allMembers.find((m) => m.id === nextShoot.crew[0]!.teamMemberId)?.name;
    const offset = Math.round((nextShoot.startsAt.getTime() - TODAY.getTime()) / DAY);
    if (name) leaveDefs.push({ name, type: 'COMP_OFF', from: Math.floor(offset), to: Math.floor(offset), status: 'PENDING', reason: 'Comp-off for the weekend shoot' });
  }
  for (const l of leaveDefs) {
    const leave = await prisma.leaveRequest.create({
      data: {
        teamMemberId: member(l.name),
        type: l.type,
        startDate: dateOnly(l.from),
        endDate: dateOnly(l.to),
        reason: l.reason,
        status: l.status,
        createdAt: at(Math.min(l.from, 0) - 4),
      },
    });
    await approval({
      subject: 'LEAVE',
      title: `${l.name} · ${l.type.toLowerCase().replace('_', '-')} leave`,
      amount: null,
      requestedById: users.adminId,
      link: { leaveRequestId: leave.id },
      outcome: l.status,
      deciderId: users.hrUserId,
      reason: l.status === 'REJECTED' ? 'Clashes with the Monsoon Escape recce.' : undefined,
      createdAt: at(Math.min(l.from, 0) - 4),
    });
    if (l.status === 'APPROVED' && l.from <= 0) {
      for (let d = l.from; d <= Math.min(l.to, 0); d++) {
        await prisma.attendanceRecord.upsert({
          where: { teamMemberId_date: { teamMemberId: member(l.name), date: dateOnly(d) } },
          create: { teamMemberId: member(l.name), date: dateOnly(d), status: 'ON_LEAVE' },
          update: { status: 'ON_LEAVE', checkIn: null, checkOut: null },
        });
      }
    }
  }

  // ── Documents (small real files in private storage, ADR-0012) ─────────────

  const storageDir = resolveStorageDir();
  async function doc(input: {
    title: string;
    category: Prisma.DocumentCreateInput['category'];
    fileName: string;
    mimeType: string;
    body: string;
    confidential?: boolean;
    link: Partial<Record<'projectId' | 'clientId' | 'vendorId' | 'teamMemberId' | 'invoiceId' | 'expenseId' | 'purchaseOrderId', string>>;
    by: string;
    offset: number;
  }) {
    const stored = await putObject(storageDir, Buffer.from(input.body, 'utf8'));
    return prisma.document.create({
      data: {
        title: input.title,
        category: input.category,
        confidential: input.confidential ?? false,
        description: 'Demonstration document.',
        currentVersion: 1,
        ...input.link,
        createdById: input.by,
        createdAt: at(input.offset),
        versions: {
          create: {
            version: 1,
            fileName: input.fileName,
            mimeType: input.mimeType,
            ...stored,
            uploadedById: input.by,
            createdAt: at(input.offset),
          },
        },
      },
    });
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
    link: { purchaseOrderId: poMedia.id, vendorId: vendor.get('MediaVault Supplies')! },
    by: users.financeUserId,
    offset: -10,
  });

  // ── Notifications for the new flows ───────────────────────────────────────

  const pending = await prisma.approvalRequest.count({ where: { status: 'PENDING' } });
  await prisma.notification.createMany({
    data: [
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
        entityId: (await prisma.invoice.findFirstOrThrow({ where: { projectId: zen.id, status: 'SENT' } })).id,
        createdAt: at(0, 8),
      },
    ],
  });

  const [expenses, invoices, payments, approvals, purchaseRequests, orders, stockItems, studioBookings, documents, leave] =
    await Promise.all([
      prisma.expense.count(),
      prisma.invoice.count(),
      prisma.payment.count(),
      prisma.approvalRequest.count(),
      prisma.purchaseRequest.count(),
      prisma.purchaseOrder.count(),
      prisma.stockItem.count(),
      prisma.studioBooking.count(),
      prisma.document.count(),
      prisma.leaveRequest.count(),
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
