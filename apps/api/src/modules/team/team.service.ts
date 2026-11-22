import { Injectable } from '@nestjs/common';
import {
  DAY_MS,
  utilisationBand,
  type MemberDetail,
  type MemberView,
  type WorkloadWeek,
} from '@nova/shared';
import type { Prisma } from '@nova/db';
import { notFound } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { iso, memberRef, toTaskView } from '../projects/project.mapper';

const WEEKS = 4;
const SHOOT_DAY_HOURS = 10;

/** Today at 00:00 — workload windows are rolling 7-day periods starting today. */
function startOfToday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Calendar days of a shoot that fall inside a window. A 14-hour shoot is one day, and a shoot
 * spanning two windows contributes to each only the days it spends there.
 */
export function shootDaysWithin(
  shoot: { startsAt: Date; endsAt: Date },
  windowStart: Date,
  windowEnd: Date,
): number {
  const from = Math.max(shoot.startsAt.getTime(), windowStart.getTime());
  // Both ends are exclusive upper bounds; step back 1 ms to land on the last covered day.
  const to = Math.min(shoot.endsAt.getTime(), windowEnd.getTime()) - 1;
  if (to < from) return shoot.endsAt.getTime() === shoot.startsAt.getTime() ? 1 : 0;
  const days =
    Math.round(
      (startOfToday(new Date(to)).getTime() - startOfToday(new Date(from)).getTime()) / DAY_MS,
    ) + 1;
  return Math.max(1, days);
}

const memberInclude = {
  tasks: {
    where: { status: { not: 'DONE' }, project: { status: { in: ['ACTIVE', 'ON_HOLD'] } } },
    include: {
      assignee: true,
      dependsOn: { select: { dependsOnId: true } },
      project: { select: { id: true, code: true, title: true } },
    },
    orderBy: { dueDate: 'asc' },
  },
  projectRoles: {
    include: { project: { select: { id: true, code: true, title: true, status: true } } },
  },
  crewCalls: { include: { shoot: true } },
} satisfies Prisma.TeamMemberInclude;

type MemberRow = Prisma.TeamMemberGetPayload<{ include: typeof memberInclude }>;

/**
 * Workload over four rolling 7-day windows starting today = estimated hours of open tasks due in
 * the window (overdue work counts in the first window) + shoot days on crew calls, ÷ capacity.
 */
export function computeWeeks(m: MemberRow, now: Date): WorkloadWeek[] {
  const first = startOfToday(now);
  return Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(first.getTime() + i * 7 * DAY_MS);
    const end = new Date(start.getTime() + 7 * DAY_MS);
    const taskHours = m.tasks
      .filter((t) => {
        const due = t.dueDate ?? now;
        return i === 0 ? due < end : due >= start && due < end;
      })
      .reduce((n, t) => n + (t.estimateHours ?? 4), 0);
    const shootHours = m.crewCalls
      .filter(
        (c) => c.shoot.status !== 'CANCELLED' && c.shoot.startsAt < end && c.shoot.endsAt >= start,
      )
      .reduce((n, c) => n + shootDaysWithin(c.shoot, start, end) * SHOOT_DAY_HOURS, 0);
    const hours = taskHours + shootHours;
    // No capacity (e.g. a member on a zero-hour arrangement) with work booked is overload, not a
    // division by zero.
    const ratio =
      m.weeklyCapacityHours > 0
        ? Math.round((hours / m.weeklyCapacityHours) * 100) / 100
        : hours > 0
          ? 2
          : 0;
    return {
      weekStart: iso(start),
      hours,
      capacity: m.weeklyCapacityHours,
      ratio,
      band: utilisationBand(ratio),
    };
  });
}

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  private toView(m: MemberRow, now: Date): MemberView {
    return {
      ...memberRef(m),
      email: m.email,
      skills: m.skills,
      baseLocation: m.baseLocation,
      weeklyCapacityHours: m.weeklyCapacityHours,
      openTasks: m.tasks.length,
      overdueTasks: m.tasks.filter((t) => t.dueDate && t.dueDate < now).length,
      projects: m.projectRoles
        .filter((r) => r.project.status === 'ACTIVE' || r.project.status === 'ON_HOLD')
        .map((r) => ({
          id: r.project.id,
          code: r.project.code,
          title: r.project.title,
          role: r.role,
        })),
      weeks: computeWeeks(m, now),
      upcomingShoots: m.crewCalls
        .filter((c) => c.shoot.endsAt >= now && c.shoot.status !== 'CANCELLED')
        .sort((a, b) => a.shoot.startsAt.getTime() - b.shoot.startsAt.getTime())
        .map((c) => ({
          id: c.shoot.id,
          title: c.shoot.title,
          startsAt: iso(c.shoot.startsAt),
          role: c.role,
        })),
    };
  }

  async list(): Promise<MemberView[]> {
    const members = await this.prisma.db.teamMember.findMany({
      where: { isActive: true },
      include: memberInclude,
      orderBy: { name: 'asc' },
    });
    const now = new Date();
    return members.map((m) => this.toView(m, now));
  }

  async get(id: string): Promise<MemberDetail> {
    const m = await this.prisma.db.teamMember.findUnique({ where: { id }, include: memberInclude });
    if (!m) throw notFound('Team member');
    return {
      ...this.toView(m, new Date()),
      tasks: m.tasks.map((t) => ({ ...toTaskView(t), project: t.project })),
    };
  }
}
