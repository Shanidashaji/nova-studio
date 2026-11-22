import { Injectable } from '@nestjs/common';
import type {
  Script,
  Talent,
  TalentBooking,
  Shoot,
  TeamMember,
  LeaveRequest,
  CrewCall,
} from '@nova/db';
import {
  DAY_MS,
  istDayKey,
  istDayStart,
  leaveOverlaps,
  rangesOverlap,
  SHOOT_STATUS_LABELS,
  TALENT_KIND_LABELS,
} from '@nova/shared';
import { DatabaseService } from '../../database/database.service';
import { OperationsService } from '../studio/operations.service';
import { ShootDayService } from '../studio/shoot-day.service';
import type { AssistantContext, ToolResult } from './assistant.types';

const fmt = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

/**
 * Read-only assistant tools over the production-studio layer. Every answer is computed from live
 * records; nothing here changes data.
 */
@Injectable()
export class StudioTools {
  constructor(
    private readonly database: DatabaseService,
    private readonly ops: OperationsService,
    private readonly shootDay: ShootDayService,
  ) {}

  async shootsToday(): Promise<ToolResult> {
    const day = await this.shootDay.day(undefined);
    if (day.shoots.length === 0) {
      return {
        text: `No shoot is scheduled today.${day.next ? ` The next is **${day.next.title}** on ${fmt(day.next.startsAt)}.` : ''}`,
        references: day.next ? [{ type: 'shoot', id: day.next.id, label: day.next.title }] : [],
      };
    }
    const lines = day.shoots.map(
      (s) =>
        `- **${s.title}** (${s.project.title})${s.day.of > 1 ? `, day ${s.day.day} of ${s.day.of}` : ''} — ${SHOOT_STATUS_LABELS[s.status].toLowerCase()}, call ${s.callTime ?? '—'} at ${s.location}; ${s.crew} crew, ${s.talent} artists; ${s.scenesShot}/${s.scenesToday} scenes shot${s.openIssues ? `; **${s.openIssues} open issue(s)**` : ''}${s.delayMinutes ? `; ${s.delayMinutes} min delay` : ''}.`,
    );
    return {
      text: `${day.shoots.length} shoot(s) today:\n${lines.join('\n')}`,
      references: day.shoots.map((s) => ({ type: 'shoot' as const, id: s.id, label: s.title })),
    };
  }

  /** Who is free on a day (default today): crew not called and not on leave, artists not booked. */
  async availability(kind: 'crew' | 'talent', inDays = 0): Promise<ToolResult> {
    const key = istDayKey(new Date(Date.now() + inDays * DAY_MS));
    const window = {
      startsAt: istDayStart(key),
      endsAt: new Date(istDayStart(key).getTime() + DAY_MS),
    };
    const shoots = await this.database.models.Shoot.find({
      startsAt: { $lt: window.endsAt },
      endsAt: { $gt: window.startsAt },
      status: { $ne: 'CANCELLED' },
    }).lean<Shoot[]>();
    const ids = shoots.map((s) => s.id);
    const when = inDays === 0 ? 'today' : `on ${fmt(window.startsAt)}`;
    if (kind === 'crew') {
      const [members, calls, leaves] = await Promise.all([
        this.database.models.TeamMember.find({ isActive: true }).lean<TeamMember[]>(),
        this.database.models.CrewCall.find({ shootId: { $in: ids } }).lean<CrewCall[]>(),
        this.database.models.LeaveRequest.find({ status: 'APPROVED' }).lean<LeaveRequest[]>(),
      ]);
      const busy = new Set(calls.map((c) => c.teamMemberId));
      const away = new Set(
        leaves.filter((l) => leaveOverlaps(l, window)).map((l) => l.teamMemberId),
      );
      const free = members.filter((m) => !busy.has(m.id) && !away.has(m.id));
      return {
        text: `${free.length} of ${members.length} crew are free ${when} (not on a shoot, not on leave):\n${free.map((m) => `- ${m.name} — ${m.title}`).join('\n')}${
          away.size
            ? `\nOn leave: ${members
                .filter((m) => away.has(m.id))
                .map((m) => m.name)
                .join(', ')}.`
            : ''
        }`,
        references: free
          .slice(0, 8)
          .map((m) => ({ type: 'member' as const, id: m.id, label: m.name })),
      };
    }
    const [roster, bookings] = await Promise.all([
      this.database.models.Talent.find({ isActive: true }).lean<Talent[]>(),
      this.database.models.TalentBooking.find({
        shootId: { $in: ids },
        status: { $ne: 'RELEASED' },
      }).lean<TalentBooking[]>(),
    ]);
    const busy = new Set(bookings.map((b) => b.talentId));
    const blocked = (t: Talent) =>
      (t.unavailable ?? []).some((u) =>
        rangesOverlap({ startsAt: u.from, endsAt: new Date(u.to.getTime() + DAY_MS) }, window),
      );
    const free = roster.filter((t) => !busy.has(t.id) && !blocked(t));
    return {
      text: `${free.length} of ${roster.length} artists are free ${when}:\n${free.map((t) => `- ${t.name} — ${TALENT_KIND_LABELS[t.kind]}, ${t.baseCity}; ${t.skills.slice(0, 3).join(', ')}`).join('\n')}`,
      references: free
        .slice(0, 8)
        .map((t) => ({ type: 'talent' as const, id: t.id, label: t.name })),
    };
  }

  async conflicts(): Promise<ToolResult> {
    const cap = await this.ops.capacity({ days: 21 });
    const shootIds = new Set<string>();
    const view = await this.database.models.Shoot.find(
      { status: { $ne: 'CANCELLED' }, endsAt: { $gte: new Date() } },
      { title: 1 },
    ).lean();
    if (cap.conflicts === 0 && cap.overlaps.length === 0) {
      return {
        text: 'No double bookings and no overlapping shoots in the next three weeks.',
        references: [],
      };
    }
    const overlapLines = cap.overlaps.map((o) => {
      shootIds.add(o.a.id);
      shootIds.add(o.b.id);
      return `- ${o.date}: **${o.a.title}** and **${o.b.title}** run at the same time`;
    });
    return {
      text: `${cap.conflicts} double booking(s) of crew, artists or equipment in the next three weeks. Overlapping shoots (allowed if they do not share people or kit):\n${overlapLines.join('\n') || '- none'}\nOpen the Shoot Calendar to see which resource is double-booked.`,
      references: view
        .filter((s) => shootIds.has(s._id))
        .map((s) => ({ type: 'shoot' as const, id: s._id, label: s.title })),
    };
  }

  async overdueTasks(): Promise<ToolResult> {
    const board = await this.ops.taskBoard({ flag: 'overdue' });
    if (board.items.length === 0) return { text: 'No task is overdue.', references: [] };
    const lines = board.items
      .slice(0, 12)
      .map(
        (t) =>
          `- **${t.title}** (${t.project.title}) — due ${fmt(t.dueDate!)}, ${t.assignee?.name ?? 'unassigned'}${t.blocked ? ', blocked' : ''}`,
      );
    return {
      text: `${board.items.length} overdue task(s)${board.counts.blocked ? `; ${board.counts.blocked} blocked overall` : ''}:\n${lines.join('\n')}`,
      references: board.items
        .slice(0, 8)
        .map((t) => ({ type: 'task' as const, id: t.id, label: t.title })),
    };
  }

  async scriptApprovals(): Promise<ToolResult> {
    const scripts = await this.database.models.Script.find({ status: 'IN_REVIEW' })
      .populate({ path: 'project', select: { title: 1 } })
      .lean<(Script & { project: { title: string } | null })[]>();
    if (scripts.length === 0) return { text: 'No script is waiting for approval.', references: [] };
    return {
      text: scripts
        .map(
          (s) =>
            `- **${s.title}** v${s.currentVersion} (${s.project?.title ?? ''}) — in review since ${s.submittedAt ? fmt(s.submittedAt) : '—'}`,
        )
        .join('\n'),
      references: scripts.map((s) => ({ type: 'script' as const, id: s.id, label: s.title })),
    };
  }

  /** The command centre's attention list, phrased as a morning brief. */
  async focus(ctx: AssistantContext): Promise<ToolResult> {
    const cc = await this.ops.commandCenter(ctx.user);
    const lines = cc.attention
      .slice(0, 8)
      .map(
        (a) =>
          `- ${a.severity === 'critical' ? '**Critical:** ' : a.severity === 'warning' ? '**Warning:** ' : ''}${a.title} — ${a.detail}`,
      );
    const head = `Today: ${cc.today.length} shoot(s), ${cc.counts.overdueTasks} overdue task(s), ${cc.counts.pendingClientApprovals} client approval(s) open (${cc.counts.overdueReviews} overdue), ${cc.counts.pendingScriptApprovals} script(s) in review, ${cc.counts.messagesAwaitingReview} client message(s) to review.`;
    return {
      text: `${head}\n${lines.length ? `Focus on, in order:\n${lines.join('\n')}` : 'Nothing needs immediate action.'}`,
      references: cc.attention
        .filter((a) => a.target.kind === 'inspect' || a.target.kind === 'shoot-day')
        .slice(0, 6)
        .map((a) =>
          a.target.kind === 'shoot-day'
            ? { type: 'shoot' as const, id: a.target.shootId, label: a.title }
            : {
                type: (a.target as { type: 'project' | 'task' }).type,
                id: (a.target as { id: string }).id,
                label: a.title,
              },
        ),
    };
  }
}
