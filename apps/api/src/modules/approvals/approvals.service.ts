import { Injectable } from '@nestjs/common';
import type { Prisma } from '@nova/db';
import {
  APPROVAL_SUBJECT_LABELS,
  cannotDecide,
  planApprovalSteps,
  type ApprovalInboxQuery,
  type ApprovalInboxView,
  type ApprovalRequestView,
  type ApprovalSubject,
  type DecideApproval,
  type SessionUser,
} from '@nova/shared';
import { conflict, forbidden, notFound } from '../../common/errors';
import { PrismaService, type Db } from '../../database/prisma.service';
import { ActivityService, type ActivityInput } from '../activity/activity.service';
import { NotificationsService } from '../activity/notifications.service';
import { iso, isoOrNull } from '../projects/project.mapper';

export const approvalInclude = {
  requestedBy: { select: { id: true, name: true } },
  project: { select: { id: true, code: true, title: true } },
  steps: { orderBy: { order: 'asc' }, include: { decider: { select: { id: true, name: true } } } },
  // Subject owners: nobody may approve something that is theirs, whoever opened the request.
  expense: { select: { submittedById: true } },
  purchaseRequest: { select: { requestedById: true } },
  leaveRequest: { select: { teamMember: { select: { userId: true } } } },
} satisfies Prisma.ApprovalRequestInclude;

export type ApprovalRow = Prisma.ApprovalRequestGetPayload<{ include: typeof approvalInclude }>;

/** Who the request belongs to: the opener and the owner of the expense, purchase or leave. */
const ownerIds = (r: ApprovalRow) => [
  r.requestedById,
  r.expense?.submittedById,
  r.purchaseRequest?.requestedById,
  r.leaveRequest?.teamMember.userId,
];

/** Deciders of steps before `order`: one person may not approve two steps of a chain. */
const priorDeciderIds = (r: ApprovalRow, order: number) =>
  r.steps.filter((s) => s.order < order && s.status === 'APPROVED').map((s) => s.deciderId);

/** What a subject module does when its request is decided. Runs inside the decision transaction. */
export interface ApprovalHandler {
  onApproved(tx: Db, request: ApprovalRow, user: SessionUser): Promise<void>;
  onRejected(tx: Db, request: ApprovalRow, user: SessionUser, reason: string): Promise<void>;
}

type Link = { expenseId?: string; purchaseRequestId?: string; leaveRequestId?: string };

const subjectId = (r: {
  expenseId: string | null;
  purchaseRequestId: string | null;
  leaveRequestId: string | null;
}) => r.expenseId ?? r.purchaseRequestId ?? r.leaveRequestId ?? '';

/**
 * Generic approval engine (ADR-0010). Subject modules open requests and register a handler;
 * deciding a step enforces the rules (permission, no self-approval, order) on the server.
 */
@Injectable()
export class ApprovalsService {
  private readonly handlers = new Map<ApprovalSubject, ApprovalHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  register(subject: ApprovalSubject, handler: ApprovalHandler) {
    this.handlers.set(subject, handler);
  }

  toView(r: ApprovalRow, user: SessionUser): ApprovalRequestView {
    const current = r.steps.find((s) => s.order === r.currentStep);
    const blocked =
      r.status !== 'PENDING' || !current
        ? 'This request is closed.'
        : cannotDecide({
            stepPermission: current.permission,
            stepStatus: current.status,
            userPermissions: user.permissions,
            userId: user.id,
            ownerIds: ownerIds(r),
            priorDeciderIds: priorDeciderIds(r, current.order),
          });
    return {
      id: r.id,
      subject: r.subject,
      subjectId: subjectId(r),
      status: r.status,
      title: r.title,
      amount: r.amount,
      currentStep: r.currentStep,
      requestedBy: r.requestedBy,
      project: r.project,
      createdAt: iso(r.createdAt),
      decidedAt: isoOrNull(r.decidedAt),
      steps: r.steps.map((s) => ({
        id: s.id,
        order: s.order,
        label: s.label,
        permission: s.permission,
        status: s.status,
        decider: s.decider,
        reason: s.reason,
        decidedAt: isoOrNull(s.decidedAt),
      })),
      canDecide: blocked === null,
      blockedReason: r.status === 'PENDING' ? blocked : null,
    };
  }

  /** Opens a request with steps planned from the active rules. Call inside the subject's transaction. */
  async open(
    tx: Db,
    log: (input: ActivityInput) => Promise<void>,
    input: {
      subject: ApprovalSubject;
      title: string;
      amount: number | null;
      requester: SessionUser;
      projectId?: string | null;
      link: Link;
    },
  ) {
    const rules = await tx.approvalRule.findMany({ where: { subject: input.subject } });
    const steps = planApprovalSteps(rules, input.subject, input.amount);
    const request = await tx.approvalRequest.create({
      data: {
        subject: input.subject,
        title: input.title,
        amount: input.amount,
        requestedById: input.requester.id,
        projectId: input.projectId ?? null,
        ...input.link,
        steps: {
          create: steps.map((s) => ({ ...s, status: s.order === 1 ? 'PENDING' : 'WAITING' })),
        },
      },
      include: approvalInclude,
    });
    await this.notifyStep(tx, request, steps[0]!.permission, steps[0]!.label);
    await log({
      actorId: input.requester.id,
      action: 'approval.requested',
      entityType: 'approval_request',
      entityId: request.id,
      projectId: input.projectId ?? null,
      summary: `${input.requester.name} requested approval: ${input.title}${steps.length > 1 ? ` (${steps.length} steps)` : ''}`,
    });
    return request;
  }

  private notifyStep(tx: Db, r: ApprovalRow, permission: string, label: string) {
    return this.notifications.notifyPermission(
      tx,
      permission,
      {
        kind: 'approval.requested',
        title: `${APPROVAL_SUBJECT_LABELS[r.subject]} needs your approval`,
        body: `${r.title} — ${label}`,
        entityType: 'approval_request',
        entityId: r.id,
      },
      r.requestedById,
    );
  }

  /** Withdraws an open request (requester cancels or edits the subject). */
  async cancelOpen(tx: Db, link: Link) {
    await tx.approvalRequest.updateMany({
      where: { ...link, status: 'PENDING' },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });
  }

  async decide(id: string, input: DecideApproval, user: SessionUser): Promise<ApprovalRequestView> {
    const result = await this.activity.transaction(async (tx, log) => {
      // Row lock: two approvers clicking at once cannot both decide the same step.
      await tx.$queryRaw`SELECT id FROM "ApprovalRequest" WHERE id = ${id} FOR UPDATE`;
      const r = await tx.approvalRequest.findUnique({ where: { id }, include: approvalInclude });
      if (!r) throw notFound('Approval request');
      if (r.status !== 'PENDING') {
        throw conflict('APPROVAL_CLOSED', 'This request has already been decided.');
      }
      const step = r.steps.find((s) => s.order === r.currentStep)!;
      const why = cannotDecide({
        stepPermission: step.permission,
        stepStatus: step.status,
        userPermissions: user.permissions,
        userId: user.id,
        ownerIds: ownerIds(r),
        priorDeciderIds: priorDeciderIds(r, step.order),
      });
      if (why) throw forbidden(why);

      const now = new Date();
      const handler = this.handlers.get(r.subject);
      const isLast = step.order === r.steps.length;

      if (input.decision === 'APPROVE') {
        await tx.approvalStep.update({
          where: { id: step.id },
          data: { status: 'APPROVED', deciderId: user.id, decidedAt: now, reason: input.reason },
        });
        if (isLast) {
          await tx.approvalRequest.update({
            where: { id },
            data: { status: 'APPROVED', decidedAt: now },
          });
        } else {
          const next = r.steps.find((s) => s.order === step.order + 1)!;
          await tx.approvalStep.update({ where: { id: next.id }, data: { status: 'PENDING' } });
          await tx.approvalRequest.update({ where: { id }, data: { currentStep: next.order } });
          await this.notifyStep(tx, r, next.permission, next.label);
        }
      } else {
        await tx.approvalStep.update({
          where: { id: step.id },
          data: { status: 'REJECTED', deciderId: user.id, decidedAt: now, reason: input.reason },
        });
        await tx.approvalStep.updateMany({
          where: { requestId: id, order: { gt: step.order } },
          data: { status: 'SKIPPED' },
        });
        await tx.approvalRequest.update({
          where: { id },
          data: { status: 'REJECTED', decidedAt: now },
        });
      }

      const fresh = await tx.approvalRequest.findUniqueOrThrow({
        where: { id },
        include: approvalInclude,
      });
      if (fresh.status === 'APPROVED') await handler?.onApproved(tx, fresh, user);
      if (fresh.status === 'REJECTED') await handler?.onRejected(tx, fresh, user, input.reason!);

      if (fresh.status !== 'PENDING') {
        await this.notifications.notifyUsers(tx, [r.requestedById], {
          kind: 'approval.decided',
          title: `${APPROVAL_SUBJECT_LABELS[r.subject]} ${fresh.status === 'APPROVED' ? 'approved' : 'rejected'}`,
          body:
            fresh.status === 'APPROVED'
              ? r.title
              : `${r.title} — ${input.reason ?? 'no reason given'}`,
          entityType: 'approval_request',
          entityId: r.id,
        });
      }
      await log({
        actorId: user.id,
        action: input.decision === 'APPROVE' ? 'approval.approved' : 'approval.rejected',
        entityType: 'approval_request',
        entityId: id,
        projectId: r.projectId,
        summary:
          input.decision === 'APPROVE'
            ? `${user.name} approved “${r.title}” (${step.label})${isLast ? '' : ' — sent to the next step'}`
            : `${user.name} rejected “${r.title}” (${step.label}): ${input.reason}`,
      });
      return fresh;
    });
    return this.toView(result, user);
  }

  async get(id: string, user: SessionUser) {
    const r = await this.prisma.db.approvalRequest.findUnique({
      where: { id },
      include: approvalInclude,
    });
    if (!r) throw notFound('Approval request');
    this.assertCanSee(r, user);
    return this.toView(r, user);
  }

  /** Requesters, eligible deciders and auditors may see a request. */
  private assertCanSee(r: ApprovalRow, user: SessionUser) {
    const visible =
      r.requestedById === user.id ||
      r.steps.some((s) => user.permissions.includes(s.permission as never)) ||
      user.permissions.includes('audit:read');
    if (!visible) throw notFound('Approval request');
  }

  async inbox(user: SessionUser, q: ApprovalInboxQuery): Promise<ApprovalInboxView> {
    const perms = user.permissions as string[];
    const relevant: Prisma.ApprovalRequestWhereInput = {
      OR: [{ requestedById: user.id }, { steps: { some: { permission: { in: perms } } } }],
    };
    const where: Prisma.ApprovalRequestWhereInput = {
      ...(q.subject ? { subject: q.subject } : {}),
      ...(q.scope === 'requested'
        ? { requestedById: user.id }
        : q.scope === 'waiting'
          ? {
              status: 'PENDING',
              requestedById: { not: user.id },
              steps: { some: { status: 'PENDING', permission: { in: perms } } },
            }
          : user.permissions.includes('audit:read')
            ? {}
            : relevant),
    };
    const [rows, waitingOnMe, myOpenRequests, signOffs] = await Promise.all([
      this.prisma.db.approvalRequest.findMany({
        where,
        include: approvalInclude,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 100,
      }),
      this.prisma.db.approvalRequest.count({
        where: {
          status: 'PENDING',
          requestedById: { not: user.id },
          steps: { some: { status: 'PENDING', permission: { in: perms } } },
        },
      }),
      this.prisma.db.approvalRequest.count({
        where: { status: 'PENDING', requestedById: user.id },
      }),
      user.permissions.includes('approval:decide')
        ? this.prisma.db.approval.findMany({
            where: { status: 'PENDING' },
            include: {
              deliverable: {
                select: { id: true, project: { select: { id: true, code: true, title: true } } },
              },
              projectStage: {
                select: { project: { select: { id: true, code: true, title: true } } },
              },
            },
            orderBy: { requestedAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);
    return {
      requests: rows.map((r) => this.toView(r, user)),
      signOffs: signOffs.map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        requestedAt: iso(a.requestedAt),
        project: (a.deliverable?.project ?? a.projectStage?.project)!,
        deliverableId: a.deliverable?.id ?? null,
      })),
      counts: { waitingOnMe, myOpenRequests },
    };
  }
}
