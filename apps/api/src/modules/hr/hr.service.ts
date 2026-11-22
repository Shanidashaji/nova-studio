import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@nova/db';
import {
  leaveDays,
  leaveOverlaps,
  type AttendanceQuery,
  type AttendanceView,
  type CreateLeave,
  type DepartmentView,
  type EmployeeView,
  type LeaveView,
  type RecordAttendance,
  type SessionUser,
  type UpdateEmployment,
  type UpsertDepartment,
  type UpsertEmployeeRecord,
} from '@nova/shared';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { iso, isoOrNull } from '../projects/project.mapper';

const DAY = 86_400_000;
/** UTC midnight for a calendar date (matches @db.Date columns). */
/**
 * The calendar day a moment falls on in India (the studio's time zone), as UTC midnight to match
 * @db.Date columns. Independent of the server's own time zone.
 */
const dateOnly = (d: Date) => {
  const [y, m, day] = d
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .split('-')
    .map(Number);
  return new Date(Date.UTC(y!, m! - 1, day));
};
/** How far back leave can be requested without `hr:write`. */
const MAX_BACKDATE_DAYS = 30;

const leaveInclude = {
  teamMember: {
    select: {
      id: true,
      name: true,
      crewCalls: {
        where: { shoot: { status: { not: 'CANCELLED' } } },
        select: { shoot: { select: { id: true, title: true, startsAt: true, endsAt: true } } },
      },
    },
  },
  approvalRequests: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true } },
} satisfies Prisma.LeaveRequestInclude;

type LeaveRow = Prisma.LeaveRequestGetPayload<{ include: typeof leaveInclude }>;

const toLeave = (l: LeaveRow): LeaveView => ({
  id: l.id,
  member: { id: l.teamMember.id, name: l.teamMember.name },
  type: l.type,
  startDate: iso(l.startDate),
  endDate: iso(l.endDate),
  days: leaveDays(l.startDate, l.endDate),
  reason: l.reason,
  status: l.status,
  createdAt: iso(l.createdAt),
  approval: l.approvalRequests[0] ?? null,
  clashes: l.teamMember.crewCalls
    .filter((c) => leaveOverlaps(l, c.shoot))
    .map((c) => ({ shootId: c.shoot.id, title: c.shoot.title, startsAt: iso(c.shoot.startsAt) })),
});

/**
 * People operations. Restricted employee details are returned only to `hr:read` (ADR-0009);
 * leave runs through the approval engine (ADR-0010) and approved leave blocks crew calls.
 */
@Injectable()
export class HrService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
  ) {}

  onModuleInit() {
    this.approvals.register('LEAVE', {
      onApproved: async (tx, r) => {
        const { count } = await tx.leaveRequest.updateMany({
          where: { id: r.leaveRequestId!, status: 'PENDING' },
          data: { status: 'APPROVED' },
        });
        if (count === 0) return;
        const leave = await tx.leaveRequest.findUniqueOrThrow({ where: { id: r.leaveRequestId! } });
        // Mark past and present days of the leave in attendance — without overwriting days
        // that already have a record (someone may have worked part of it).
        const today = dateOnly(new Date());
        const days: Date[] = [];
        for (
          let t = leave.startDate.getTime();
          t <= Math.min(leave.endDate.getTime(), today.getTime());
          t += DAY
        ) {
          days.push(new Date(t));
        }
        if (days.length) {
          await tx.attendanceRecord.createMany({
            data: days.map((date) => ({
              teamMemberId: leave.teamMemberId,
              date,
              status: 'ON_LEAVE' as const,
            })),
            skipDuplicates: true,
          });
        }
      },
      onRejected: async (tx, r) => {
        await tx.leaveRequest.updateMany({
          where: { id: r.leaveRequestId!, status: 'PENDING' },
          data: { status: 'REJECTED' },
        });
      },
    });
  }

  // ── Directory ─────────────────────────────────────────────────────────────

  async employees(user: SessionUser): Promise<EmployeeView[]> {
    const canSeeRecords = user.permissions.includes('hr:read');
    const today = dateOnly(new Date());
    const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const rows = await this.prisma.db.teamMember.findMany({
      include: {
        department: { select: { id: true, name: true } },
        attendance: { where: { date: today }, select: { status: true } },
        leaveRequests: {
          where: { status: 'APPROVED', endDate: { gte: yearStart } },
          select: { startDate: true, endDate: true },
        },
        ...(canSeeRecords ? { record: true } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((m) => {
      const record = m.record;
      return {
        id: m.id,
        name: m.name,
        title: m.title,
        email: m.email,
        baseLocation: m.baseLocation,
        department: m.department,
        employmentType: m.employmentType,
        joinedOn: isoOrNull(m.joinedOn),
        weeklyCapacityHours: m.weeklyCapacityHours,
        isActive: m.isActive,
        today: m.attendance[0]?.status ?? null,
        onLeaveToday: m.leaveRequests.some((l) => l.startDate <= today && l.endDate >= today),
        leaveTakenThisYear: m.leaveRequests
          .filter((l) => l.startDate <= today)
          .reduce(
            (n, l) =>
              n +
              leaveDays(
                l.startDate < yearStart ? yearStart : l.startDate,
                l.endDate > today ? today : l.endDate,
              ),
            0,
          ),
        ...(canSeeRecords
          ? {
              record: record
                ? {
                    employeeCode: record.employeeCode,
                    phone: record.phone,
                    emergencyContact: record.emergencyContact,
                    address: record.address,
                    notes: record.notes,
                  }
                : null,
            }
          : {}),
      };
    });
  }

  async updateEmployment(id: string, input: UpdateEmployment, user: SessionUser) {
    const m = await this.prisma.db.teamMember.findUnique({ where: { id } });
    if (!m) throw notFound('Team member');
    if (
      input.departmentId &&
      !(await this.prisma.db.department.findUnique({ where: { id: input.departmentId } }))
    ) {
      throw unprocessable('INVALID_DEPARTMENT', 'Choose an existing department.');
    }
    await this.activity.transaction(async (tx, log) => {
      await tx.teamMember.update({ where: { id }, data: input });
      await log({
        actorId: user.id,
        action: 'employee.updated',
        entityType: 'employee',
        entityId: id,
        summary: `${user.name} updated employment details for ${m.name}`,
      });
    });
    return (await this.employees(user)).find((e) => e.id === id)!;
  }

  async upsertRecord(id: string, input: UpsertEmployeeRecord, user: SessionUser) {
    const m = await this.prisma.db.teamMember.findUnique({
      where: { id },
      include: { record: true },
    });
    if (!m) throw notFound('Team member');
    await this.activity.transaction(async (tx, log) => {
      // Next code after the highest existing one (a count would collide after a deletion).
      const codes = await tx.employeeRecord.findMany({ select: { employeeCode: true } });
      const highest = Math.max(
        0,
        ...codes.map((c) => Number(c.employeeCode.replace(/\D/g, '')) || 0),
      );
      await tx.employeeRecord.upsert({
        where: { teamMemberId: id },
        create: {
          teamMemberId: id,
          employeeCode: `NM-E${String(highest + 1).padStart(3, '0')}`,
          ...input,
        },
        update: input,
      });
      // The summary never contains the restricted values themselves.
      await log({
        actorId: user.id,
        action: 'employee.record_updated',
        entityType: 'employee',
        entityId: id,
        summary: `${user.name} updated the HR record for ${m.name}`,
      });
    });
    return (await this.employees(user)).find((e) => e.id === id)!;
  }

  // ── Departments ───────────────────────────────────────────────────────────

  async departments(): Promise<DepartmentView[]> {
    const rows = await this.prisma.db.department.findMany({
      include: {
        lead: { select: { id: true, name: true } },
        members: { select: { id: true, name: true, title: true }, orderBy: { name: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      lead: d.lead,
      members: d.members,
    }));
  }

  async upsertDepartment(id: string | null, input: UpsertDepartment, user: SessionUser) {
    const clash = await this.prisma.db.department.findUnique({ where: { name: input.name } });
    if (clash && clash.id !== id)
      throw conflict('DEPARTMENT_EXISTS', 'That department already exists.');
    if (id && !(await this.prisma.db.department.findUnique({ where: { id } }))) {
      throw notFound('Department');
    }
    await this.activity.transaction(async (tx, log) => {
      const d = id
        ? await tx.department.update({ where: { id }, data: input })
        : await tx.department.create({ data: input });
      await log({
        actorId: user.id,
        action: id ? 'department.updated' : 'department.created',
        entityType: 'department',
        entityId: d.id,
        summary: `${user.name} ${id ? 'updated' : 'created'} the ${d.name} department`,
      });
    });
    return this.departments();
  }

  // ── Leave ─────────────────────────────────────────────────────────────────

  private async ownMemberId(user: SessionUser) {
    const m = await this.prisma.db.teamMember.findUnique({ where: { userId: user.id } });
    return m?.id ?? null;
  }

  async leave(user: SessionUser): Promise<LeaveView[]> {
    const mine = await this.ownMemberId(user);
    const seeAll =
      user.permissions.includes('leave:approve') || user.permissions.includes('hr:read');
    // Everyone can see who is away (for planning); reasons are only for HR, approvers and the person.
    const rows = await this.prisma.db.leaveRequest.findMany({
      where: seeAll ? {} : { OR: [{ teamMemberId: mine ?? '__none__' }, { status: 'APPROVED' }] },
      include: leaveInclude,
      orderBy: { startDate: 'desc' },
      take: 200,
    });
    return rows.map((l) => {
      const v = toLeave(l);
      return seeAll || l.teamMemberId === mine ? v : { ...v, reason: null };
    });
  }

  async requestLeave(input: CreateLeave, user: SessionUser): Promise<LeaveView> {
    const own = await this.ownMemberId(user);
    const teamMemberId = input.teamMemberId ?? own;
    if (!teamMemberId) {
      throw unprocessable('NO_TEAM_PROFILE', 'Your account is not linked to a team profile.');
    }
    if (teamMemberId !== own && !user.permissions.includes('hr:write')) {
      throw forbidden('You can only request leave for yourself.');
    }
    const member = await this.prisma.db.teamMember.findUnique({ where: { id: teamMemberId } });
    if (!member) throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    const startDate = dateOnly(input.startDate);
    const endDate = dateOnly(input.endDate);
    const earliest = dateOnly(new Date(Date.now() - MAX_BACKDATE_DAYS * DAY));
    if (startDate < earliest && !user.permissions.includes('hr:write')) {
      throw unprocessable(
        'LEAVE_TOO_OLD',
        `Leave more than ${MAX_BACKDATE_DAYS} days in the past has to be recorded by HR.`,
      );
    }
    const overlap = await this.prisma.db.leaveRequest.findFirst({
      where: {
        teamMemberId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap)
      throw conflict('LEAVE_OVERLAP', 'This overlaps leave that is already requested or approved.');
    const id = await this.activity.transaction(async (tx, log) => {
      const leave = await tx.leaveRequest.create({
        data: { teamMemberId, type: input.type, startDate, endDate, reason: input.reason },
      });
      const days = leaveDays(startDate, endDate);
      await this.approvals.open(tx, log, {
        subject: 'LEAVE',
        title: `${member.name} · ${days} day${days === 1 ? '' : 's'} ${input.type.toLowerCase().replace('_', '-')} leave`,
        amount: null,
        requester: user,
        link: { leaveRequestId: leave.id },
      });
      return leave.id;
    });
    const row = await this.prisma.db.leaveRequest.findUniqueOrThrow({
      where: { id },
      include: leaveInclude,
    });
    return toLeave(row);
  }

  async cancelLeave(id: string, user: SessionUser): Promise<LeaveView> {
    const l = await this.prisma.db.leaveRequest.findUnique({
      where: { id },
      include: { teamMember: true },
    });
    if (!l) throw notFound('Leave request');
    const own = await this.ownMemberId(user);
    if (l.teamMemberId !== own && !user.permissions.includes('hr:write')) {
      throw forbidden('You can only cancel your own leave.');
    }
    if (l.status === 'CANCELLED' || l.status === 'REJECTED') {
      throw conflict('LEAVE_CLOSED', 'This leave request is already closed.');
    }
    await this.activity.transaction(async (tx, log) => {
      await this.approvals.cancelOpen(tx, { leaveRequestId: id });
      await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
      if (l.status === 'APPROVED') {
        await tx.attendanceRecord.deleteMany({
          where: {
            teamMemberId: l.teamMemberId,
            status: 'ON_LEAVE',
            date: { gte: l.startDate, lte: l.endDate },
          },
        });
      }
      await log({
        actorId: user.id,
        action: 'leave.cancelled',
        entityType: 'leave',
        entityId: id,
        summary: `${user.name} cancelled leave for ${l.teamMember.name}`,
      });
    });
    const row = await this.prisma.db.leaveRequest.findUniqueOrThrow({
      where: { id },
      include: leaveInclude,
    });
    return toLeave(row);
  }

  // ── Attendance ────────────────────────────────────────────────────────────

  async attendance(q: AttendanceQuery, user: SessionUser): Promise<AttendanceView> {
    const canSeeNotes =
      user.permissions.includes('attendance:write') || user.permissions.includes('hr:read');
    const to = dateOnly(q.to ?? new Date());
    const from = dateOnly(q.from ?? new Date(to.getTime() - 13 * DAY));
    if (to.getTime() - from.getTime() > 62 * DAY) {
      throw unprocessable('RANGE_TOO_LONG', 'Choose a range of at most two months.');
    }
    const [members, records] = await Promise.all([
      this.prisma.db.teamMember.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.db.attendanceRecord.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
    ]);
    return {
      from: iso(from),
      to: iso(to),
      members,
      records: records.map((r) => ({
        id: r.id,
        memberId: r.teamMemberId,
        date: iso(r.date),
        status: r.status,
        checkIn: isoOrNull(r.checkIn),
        checkOut: isoOrNull(r.checkOut),
        note: canSeeNotes ? r.note : null,
      })),
    };
  }

  /** Self check-in for anyone with a team profile; recording for others needs `attendance:write`. */
  async recordAttendance(input: RecordAttendance, user: SessionUser) {
    const own = await this.ownMemberId(user);
    const teamMemberId = input.teamMemberId ?? own;
    if (!teamMemberId) {
      throw unprocessable('NO_TEAM_PROFILE', 'Your account is not linked to a team profile.');
    }
    if (teamMemberId !== own && !user.permissions.includes('attendance:write')) {
      throw forbidden('You can only record your own attendance.');
    }
    const date = dateOnly(input.date);
    const today = dateOnly(new Date());
    if (date.getTime() > today.getTime()) {
      throw unprocessable('FUTURE_DATE', 'Attendance cannot be recorded for a future day.');
    }
    const manager = user.permissions.includes('attendance:write');
    if (!manager) {
      // Self-service: today only, and never over a record someone else set (absence, leave).
      if (date.getTime() !== today.getTime()) {
        throw forbidden('You can record your own attendance for today only.');
      }
      if (input.status === 'ON_LEAVE' || input.status === 'ABSENT') {
        throw forbidden('Leave and absence are recorded by HR.');
      }
      const existing = await this.prisma.db.attendanceRecord.findUnique({
        where: { teamMemberId_date: { teamMemberId, date } },
      });
      if (existing && (existing.status === 'ON_LEAVE' || existing.status === 'ABSENT')) {
        throw conflict(
          'ATTENDANCE_LOCKED',
          'Today is already recorded by HR. Ask HR to change it.',
        );
      }
    }
    const member = await this.prisma.db.teamMember.findUnique({ where: { id: teamMemberId } });
    if (!member) throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    const data = {
      status: input.status,
      checkIn: input.checkIn ?? null,
      checkOut: input.checkOut ?? null,
      note: input.note ?? null,
    };
    await this.activity.transaction(async (tx, log) => {
      await tx.attendanceRecord.upsert({
        where: { teamMemberId_date: { teamMemberId, date } },
        create: { teamMemberId, date, ...data },
        update: data,
      });
      await log({
        actorId: user.id,
        action: 'attendance.recorded',
        entityType: 'attendance',
        entityId: teamMemberId,
        summary: `${user.name} recorded ${member.name} as ${input.status.toLowerCase().replace('_', ' ')} on ${date.toISOString().slice(0, 10)}`,
      });
    });
    return this.attendance({ from: date, to: date }, user);
  }
}
