import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  newId,
  type ApprovalRequest,
  type AttendanceRecord,
  type CrewCall,
  type Department,
  type EmployeeRecord,
  type LeaveRequest,
  type PopulateOptions,
  type Shoot,
  type TeamMember,
} from '@nova/db';
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
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { iso, isoOrNull } from '../projects/project.mapper';

const DAY = 86_400_000;
/**
 * The calendar day a moment falls on in India (the studio's time zone), as UTC midnight: leave
 * and attendance dates (formerly Postgres DATE columns) are stored as UTC-midnight dates.
 * Independent of the server's own time zone.
 */
const dateOnly = (d: Date) => {
  const [y, m, day] = d
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .split('-')
    .map(Number);
  return new Date(Date.UTC(y!, m! - 1, day));
};
/** UTC midnight of a stored date-only value (guards against a stray time of day). */
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
/** How far back leave can be requested without `hr:write`. */
const MAX_BACKDATE_DAYS = 30;

/**
 * The member with their crew calls on shoots that are not cancelled (to show clashes), and the
 * leave's approval requests, newest first (the view shows only the latest).
 */
const leavePopulate = (cancelledShootIds: string[]): PopulateOptions[] => [
  {
    path: 'teamMember',
    select: { name: 1 },
    populate: {
      path: 'crewCalls',
      match: { shootId: { $nin: cancelledShootIds } },
      // teamMemberId is the virtual's foreign field, shootId the nested populate's local field.
      select: { teamMemberId: 1, shootId: 1 },
      populate: { path: 'shoot', select: { title: 1, startsAt: 1, endsAt: 1 } },
    },
  },
  {
    path: 'approvalRequests',
    select: { status: 1, leaveRequestId: 1 },
    options: { sort: { createdAt: -1 } },
  },
];

type LeaveRow = LeaveRequest & {
  teamMember: Pick<TeamMember, '_id' | 'id' | 'name'> & {
    crewCalls: (Pick<CrewCall, '_id' | 'id' | 'teamMemberId' | 'shootId'> & {
      shoot: Pick<Shoot, '_id' | 'id' | 'title' | 'startsAt' | 'endsAt'>;
    })[];
  };
  approvalRequests: Pick<ApprovalRequest, '_id' | 'id' | 'status'>[];
};

const latestApproval = (l: LeaveRow) => {
  const a = l.approvalRequests[0];
  return a ? { id: a.id, status: a.status } : null;
};

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
  approval: latestApproval(l),
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
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
  ) {}

  onModuleInit() {
    // Both handlers run inside the approval's transaction (every model call joins it). Models
    // are looked up when a handler runs: the connection may not be open yet at registration.
    this.approvals.register('LEAVE', {
      onApproved: async (r) => {
        const { LeaveRequest, AttendanceRecord } = this.database.models;
        const { matchedCount } = await LeaveRequest.updateMany(
          { _id: r.leaveRequestId!, status: 'PENDING' },
          { $set: { status: 'APPROVED' } },
        );
        if (matchedCount === 0) return;
        const leave = await LeaveRequest.findById(r.leaveRequestId!).lean<LeaveRequest>();
        if (!leave) throw notFound('Leave request');
        // Mark past and present days of the leave in attendance — without overwriting days
        // that already have a record (someone may have worked part of it).
        const today = dateOnly(new Date());
        const days: Date[] = [];
        for (
          let t = utcDay(leave.startDate).getTime();
          t <= Math.min(utcDay(leave.endDate).getTime(), today.getTime());
          t += DAY
        ) {
          days.push(new Date(t));
        }
        // Insert-if-missing one day at a time: a duplicate-key insert would abort the whole
        // transaction, so an existing day is left untouched by an upsert that only sets on insert.
        for (const date of days) {
          await AttendanceRecord.updateOne(
            { teamMemberId: leave.teamMemberId, date },
            {
              $setOnInsert: {
                _id: newId(),
                status: 'ON_LEAVE',
                checkIn: null,
                checkOut: null,
                note: null,
                createdAt: new Date(),
              },
            },
            { upsert: true },
          );
        }
      },
      onRejected: async (r) => {
        await this.database.models.LeaveRequest.updateMany(
          { _id: r.leaveRequestId!, status: 'PENDING' },
          { $set: { status: 'REJECTED' } },
        );
      },
    });
  }

  private async cancelledShootIds(): Promise<string[]> {
    return await this.database.models.Shoot.distinct('_id', { status: 'CANCELLED' });
  }

  private async leaveRow(id: string): Promise<LeaveRow> {
    const row = await this.database.models.LeaveRequest.findById(id)
      .populate(leavePopulate(await this.cancelledShootIds()))
      .lean<LeaveRow>();
    if (!row) throw notFound('Leave request');
    return row;
  }

  // ── Directory ─────────────────────────────────────────────────────────────

  async employees(user: SessionUser): Promise<EmployeeView[]> {
    const canSeeRecords = user.permissions.includes('hr:read');
    const today = dateOnly(new Date());
    const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const rows = await this.database.models.TeamMember.find()
      .sort({ name: 1 })
      .populate([
        { path: 'department', select: { name: 1 } },
        // The foreign field (teamMemberId) must be selected for list virtuals.
        { path: 'attendance', match: { date: today }, select: { status: 1, teamMemberId: 1 } },
        {
          path: 'leaveRequests',
          match: { status: 'APPROVED', endDate: { $gte: yearStart } },
          select: { startDate: 1, endDate: 1, teamMemberId: 1 },
        },
        ...(canSeeRecords ? [{ path: 'record' }] : []),
      ])
      .lean<
        (TeamMember & {
          department: Pick<Department, '_id' | 'id' | 'name'> | null;
          attendance: Pick<AttendanceRecord, 'status'>[];
          leaveRequests: Pick<LeaveRequest, 'startDate' | 'endDate'>[];
          record?: EmployeeRecord | null;
        })[]
      >();
    return rows.map((m) => {
      const record = m.record;
      return {
        id: m.id,
        name: m.name,
        title: m.title,
        email: m.email,
        baseLocation: m.baseLocation,
        department: m.department ? { id: m.department.id, name: m.department.name } : null,
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
    const { TeamMember, Department } = this.database.models;
    const m = await TeamMember.findById(id).lean<TeamMember>();
    if (!m) throw notFound('Team member');
    if (input.departmentId && !(await Department.exists({ _id: input.departmentId }))) {
      throw unprocessable('INVALID_DEPARTMENT', 'Choose an existing department.');
    }
    await this.activity.transaction(async (log) => {
      const { matchedCount } = await TeamMember.updateOne({ _id: id }, { $set: input });
      if (matchedCount === 0) throw notFound('Team member');
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
    const { TeamMember, EmployeeRecord } = this.database.models;
    const m = await TeamMember.findById(id).lean<TeamMember>();
    if (!m) throw notFound('Team member');
    await this.activity.transaction(async (log) => {
      // Next code after the highest existing one (a count would collide after a deletion).
      const codes = await EmployeeRecord.find()
        .select({ employeeCode: 1 })
        .lean<Pick<EmployeeRecord, 'employeeCode'>[]>();
      const highest = Math.max(
        0,
        ...codes.map((c) => Number(c.employeeCode.replace(/\D/g, '')) || 0),
      );
      // The code is assigned only when the record is created; an update keeps it.
      await EmployeeRecord.updateOne(
        { teamMemberId: id },
        {
          $set: input,
          $setOnInsert: {
            _id: newId(),
            employeeCode: `NM-E${String(highest + 1).padStart(3, '0')}`,
          },
        },
        { upsert: true },
      );
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
    const rows = await this.database.models.Department.find()
      .sort({ name: 1 })
      .populate([
        { path: 'lead', select: { name: 1 } },
        {
          path: 'members',
          select: { name: 1, title: 1, departmentId: 1 },
          options: { sort: { name: 1 } },
        },
      ])
      .lean<
        (Department & {
          lead: Pick<TeamMember, '_id' | 'id' | 'name'> | null;
          members: Pick<TeamMember, '_id' | 'id' | 'name' | 'title'>[];
        })[]
      >();
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      lead: d.lead ? { id: d.lead.id, name: d.lead.name } : null,
      members: d.members.map((t) => ({ id: t.id, name: t.name, title: t.title })),
    }));
  }

  async upsertDepartment(id: string | null, input: UpsertDepartment, user: SessionUser) {
    const { Department } = this.database.models;
    const clash = await Department.findOne({ name: input.name }).lean<Department>();
    if (clash && clash.id !== id)
      throw conflict('DEPARTMENT_EXISTS', 'That department already exists.');
    if (id && !(await Department.exists({ _id: id }))) {
      throw notFound('Department');
    }
    await this.activity.transaction(async (log) => {
      const d = id
        ? await Department.findByIdAndUpdate(id, { $set: input }, { new: true }).lean<Department>()
        : (await Department.create(input)).toObject<Department>();
      if (!d) throw notFound('Department');
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
    const m = await this.database.models.TeamMember.findOne({ userId: user.id }).lean<TeamMember>();
    return m?.id ?? null;
  }

  async leave(user: SessionUser): Promise<LeaveView[]> {
    const mine = await this.ownMemberId(user);
    const seeAll =
      user.permissions.includes('leave:approve') || user.permissions.includes('hr:read');
    // Everyone can see who is away (for planning); reasons are only for HR, approvers and the person.
    const rows = await this.database.models.LeaveRequest.find(
      seeAll ? {} : { $or: [{ teamMemberId: mine ?? '__none__' }, { status: 'APPROVED' }] },
    )
      .sort({ startDate: -1 })
      .limit(200)
      .populate(leavePopulate(await this.cancelledShootIds()))
      .lean<LeaveRow[]>();
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
    const { TeamMember, LeaveRequest } = this.database.models;
    const member = await TeamMember.findById(teamMemberId).lean<TeamMember>();
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
    const overlap = await LeaveRequest.findOne({
      teamMemberId,
      status: { $in: ['PENDING', 'APPROVED'] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    }).lean<LeaveRequest>();
    if (overlap)
      throw conflict('LEAVE_OVERLAP', 'This overlaps leave that is already requested or approved.');
    const id = await this.activity.transaction(async (log) => {
      const leave = await LeaveRequest.create({
        teamMemberId,
        type: input.type,
        startDate,
        endDate,
        reason: input.reason,
      });
      const days = leaveDays(startDate, endDate);
      await this.approvals.open(log, {
        subject: 'LEAVE',
        title: `${member.name} · ${days} day${days === 1 ? '' : 's'} ${input.type.toLowerCase().replace('_', '-')} leave`,
        amount: null,
        requester: user,
        link: { leaveRequestId: leave.id },
      });
      return leave.id;
    });
    return toLeave(await this.leaveRow(id));
  }

  async cancelLeave(id: string, user: SessionUser): Promise<LeaveView> {
    const { LeaveRequest, AttendanceRecord } = this.database.models;
    const l = await LeaveRequest.findById(id)
      .populate('teamMember')
      .lean<LeaveRequest & { teamMember: TeamMember }>();
    if (!l) throw notFound('Leave request');
    const own = await this.ownMemberId(user);
    if (l.teamMemberId !== own && !user.permissions.includes('hr:write')) {
      throw forbidden('You can only cancel your own leave.');
    }
    if (l.status === 'CANCELLED' || l.status === 'REJECTED') {
      throw conflict('LEAVE_CLOSED', 'This leave request is already closed.');
    }
    await this.activity.transaction(async (log) => {
      await this.approvals.cancelOpen({ leaveRequestId: id });
      const { matchedCount } = await LeaveRequest.updateOne(
        { _id: id },
        { $set: { status: 'CANCELLED' } },
      );
      if (matchedCount === 0) throw notFound('Leave request');
      if (l.status === 'APPROVED') {
        await AttendanceRecord.deleteMany({
          teamMemberId: l.teamMemberId,
          status: 'ON_LEAVE',
          date: { $gte: utcDay(l.startDate), $lte: utcDay(l.endDate) },
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
    return toLeave(await this.leaveRow(id));
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
      this.database.models.TeamMember.find({ isActive: true })
        .select({ name: 1 })
        .sort({ name: 1 })
        .lean<Pick<TeamMember, '_id' | 'id' | 'name'>[]>(),
      this.database.models.AttendanceRecord.find({ date: { $gte: from, $lte: to } })
        .sort({ date: 1 })
        .lean<AttendanceRecord[]>(),
    ]);
    return {
      from: iso(from),
      to: iso(to),
      members: members.map((m) => ({ id: m.id, name: m.name })),
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
      const existing = await this.database.models.AttendanceRecord.findOne({
        teamMemberId,
        date,
      }).lean<AttendanceRecord>();
      if (existing && (existing.status === 'ON_LEAVE' || existing.status === 'ABSENT')) {
        throw conflict(
          'ATTENDANCE_LOCKED',
          'Today is already recorded by HR. Ask HR to change it.',
        );
      }
    }
    const member = await this.database.models.TeamMember.findById(teamMemberId).lean<TeamMember>();
    if (!member) throw unprocessable('INVALID_MEMBER', 'Choose an existing team member.');
    const data = {
      status: input.status,
      checkIn: input.checkIn ?? null,
      checkOut: input.checkOut ?? null,
      note: input.note ?? null,
    };
    await this.activity.transaction(async (log) => {
      // One record per member and day (unique index); teamMemberId and date come from the filter.
      await this.database.models.AttendanceRecord.updateOne(
        { teamMemberId, date },
        { $set: data, $setOnInsert: { _id: newId(), createdAt: new Date() } },
        { upsert: true },
      );
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
