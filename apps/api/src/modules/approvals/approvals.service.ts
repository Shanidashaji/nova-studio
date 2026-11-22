import { Injectable } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  RecordNotFoundError,
  type Approval,
  type ApprovalRequest,
  type ApprovalStep,
  type Deliverable,
  type Expense,
  type LeaveRequest,
  type PopulateOptions,
  type Project,
  type ProjectStage,
  type PurchaseRequest,
  type QueryFilter,
  type TeamMember,
  type User,
} from '@nova/db';
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
import { DatabaseService } from '../../database/database.service';
import { ActivityService, type ActivityInput } from '../activity/activity.service';
import { NotificationsService } from '../activity/notifications.service';
import { iso, isoOrNull } from '../projects/project.mapper';

export const approvalPopulate: PopulateOptions[] = [
  { path: 'requestedBy', select: { name: 1 } },
  { path: 'project', select: { code: 1, title: 1 } },
  {
    path: 'steps',
    options: { sort: { order: 1 } },
    populate: { path: 'decider', select: { name: 1 } },
  },
  // Subject owners: nobody may approve something that is theirs, whoever opened the request.
  { path: 'expense', select: { submittedById: 1 } },
  { path: 'purchaseRequest', select: { requestedById: 1 } },
  {
    path: 'leaveRequest',
    select: { teamMemberId: 1 },
    populate: { path: 'teamMember', select: { userId: 1 } },
  },
];

type UserRef = Pick<User, '_id' | 'id' | 'name'>;
type ProjectRef = Pick<Project, '_id' | 'id' | 'code' | 'title'>;

export type ApprovalRow = ApprovalRequest & {
  requestedBy: UserRef;
  project: ProjectRef | null;
  steps: (ApprovalStep & { decider: UserRef | null })[];
  expense: Pick<Expense, '_id' | 'id' | 'submittedById'> | null;
  purchaseRequest: Pick<PurchaseRequest, '_id' | 'id' | 'requestedById'> | null;
  leaveRequest:
    | (Pick<LeaveRequest, '_id' | 'id' | 'teamMemberId'> & {
        teamMember: Pick<TeamMember, '_id' | 'id' | 'userId'>;
      })
    | null;
};

const userRef = (u: UserRef) => ({ id: u.id, name: u.name });
const projectRef = (p: ProjectRef) => ({ id: p.id, code: p.code, title: p.title });

/** Who the request belongs to: the opener and the owner of the expense, purchase or leave. */
const ownerIds = (r: ApprovalRow) => [
  r.requestedById,
  r.expense?.submittedById,
  r.purchaseRequest?.requestedById,
  r.leaveRequest?.teamMember?.userId,
];

/** Deciders of steps before `order`: one person may not approve two steps of a chain. */
const priorDeciderIds = (r: ApprovalRow, order: number) =>
  r.steps.filter((s) => s.order < order && s.status === 'APPROVED').map((s) => s.deciderId);

/**
 * What a subject module does when its request is decided. Runs inside the decision transaction
 * (model calls made by the handler join it automatically).
 */
export interface ApprovalHandler {
  onApproved(request: ApprovalRow, user: SessionUser): Promise<void>;
  onRejected(request: ApprovalRow, user: SessionUser, reason: string): Promise<void>;
}

type Link = { expenseId?: string; purchaseRequestId?: string; leaveRequestId?: string };

const subjectId = (r: {
  expenseId: string | null;
  purchaseRequestId: string | null;
  leaveRequestId: string | null;
}) => r.expenseId ?? r.purchaseRequestId ?? r.leaveRequestId ?? '';

/** Request statuses in their former enum order (PENDING first), used to sort the inbox. */
const STATUS_ORDER = Object.values(ApprovalRequestStatus);

type SignOffRow = Approval & {
  deliverable: (Pick<Deliverable, '_id' | 'id' | 'projectId'> & { project: ProjectRef }) | null;
  projectStage: (Pick<ProjectStage, '_id' | 'id' | 'projectId'> & { project: ProjectRef }) | null;
};

/**
 * Generic approval engine (ADR-0010). Subject modules open requests and register a handler;
 * deciding a step enforces the rules (permission, no self-approval, order) on the server.
 */
@Injectable()
export class ApprovalsService {
  private readonly handlers = new Map<ApprovalSubject, ApprovalHandler>();

  constructor(
    private readonly database: DatabaseService,
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
      requestedBy: userRef(r.requestedBy),
      project: r.project ? projectRef(r.project) : null,
      createdAt: iso(r.createdAt),
      decidedAt: isoOrNull(r.decidedAt),
      steps: r.steps.map((s) => ({
        id: s.id,
        order: s.order,
        label: s.label,
        permission: s.permission,
        status: s.status,
        decider: s.decider ? userRef(s.decider) : null,
        reason: s.reason,
        decidedAt: isoOrNull(s.decidedAt),
      })),
      canDecide: blocked === null,
      blockedReason: r.status === 'PENDING' ? blocked : null,
    };
  }

  private async load(id: string): Promise<ApprovalRow | null> {
    return this.database.models.ApprovalRequest.findById(id)
      .populate(approvalPopulate)
      .lean<ApprovalRow>();
  }

  /** Opens a request with steps planned from the active rules. Call inside the subject's transaction. */
  async open(
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
    const { ApprovalRule, ApprovalRequest, ApprovalStep } = this.database.models;
    const rules = await ApprovalRule.find({ subject: input.subject }).lean();
    const steps = planApprovalSteps(rules, input.subject, input.amount);
    const created = await ApprovalRequest.create({
      subject: input.subject,
      title: input.title,
      amount: input.amount,
      requestedById: input.requester.id,
      projectId: input.projectId ?? null,
      ...input.link,
    });
    await ApprovalStep.insertMany(
      steps.map((s) => ({
        ...s,
        requestId: created._id,
        status: s.order === 1 ? 'PENDING' : 'WAITING',
      })),
    );
    const request = await this.load(created._id);
    if (!request) throw new RecordNotFoundError('ApprovalRequest');
    await this.notifyStep(request, steps[0]!.permission, steps[0]!.label);
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

  private notifyStep(r: ApprovalRow, permission: string, label: string) {
    return this.notifications.notifyPermission(
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
  async cancelOpen(link: Link) {
    await this.database.models.ApprovalRequest.updateMany(
      { ...link, status: 'PENDING' },
      { $set: { status: 'CANCELLED', decidedAt: new Date() } },
    );
  }

  async decide(id: string, input: DecideApproval, user: SessionUser): Promise<ApprovalRequestView> {
    const { ApprovalRequest, ApprovalStep } = this.database.models;
    const result = await this.activity.transaction(async (log) => {
      // Row lock: two approvers clicking at once cannot both decide the same step.
      await this.database.lock('ApprovalRequest', id);
      const r = await this.load(id);
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
        await ApprovalStep.updateOne(
          { _id: step.id },
          {
            $set: { status: 'APPROVED', deciderId: user.id, decidedAt: now, reason: input.reason },
          },
        );
        if (isLast) {
          await ApprovalRequest.updateOne(
            { _id: id },
            { $set: { status: 'APPROVED', decidedAt: now } },
          );
        } else {
          const next = r.steps.find((s) => s.order === step.order + 1)!;
          await ApprovalStep.updateOne({ _id: next.id }, { $set: { status: 'PENDING' } });
          await ApprovalRequest.updateOne({ _id: id }, { $set: { currentStep: next.order } });
          await this.notifyStep(r, next.permission, next.label);
        }
      } else {
        await ApprovalStep.updateOne(
          { _id: step.id },
          {
            $set: { status: 'REJECTED', deciderId: user.id, decidedAt: now, reason: input.reason },
          },
        );
        await ApprovalStep.updateMany(
          { requestId: id, order: { $gt: step.order } },
          { $set: { status: 'SKIPPED' } },
        );
        await ApprovalRequest.updateOne(
          { _id: id },
          { $set: { status: 'REJECTED', decidedAt: now } },
        );
      }

      const fresh = await this.load(id);
      if (!fresh) throw new RecordNotFoundError('ApprovalRequest');
      if (fresh.status === 'APPROVED') await handler?.onApproved(fresh, user);
      if (fresh.status === 'REJECTED') await handler?.onRejected(fresh, user, input.reason!);

      if (fresh.status !== 'PENDING') {
        await this.notifications.notifyUsers([r.requestedById], {
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
    const r = await this.load(id);
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
    const { ApprovalRequest, ApprovalStep, Approval: SignOff } = this.database.models;
    const perms = user.permissions as string[];
    // Former relation filters `steps: { some: … }`, resolved to request ids first.
    const [withMyPermission, pendingForMe] = await Promise.all([
      ApprovalStep.distinct('requestId', { permission: { $in: perms } }),
      ApprovalStep.distinct('requestId', { status: 'PENDING', permission: { $in: perms } }),
    ]);
    const relevant = {
      $or: [{ requestedById: user.id }, { _id: { $in: withMyPermission } }],
    };
    const waitingOnMeFilter: QueryFilter<ApprovalRequest> = {
      status: 'PENDING',
      requestedById: { $ne: user.id },
      _id: { $in: pendingForMe },
    };
    const where: Record<string, unknown> = {
      ...(q.subject ? { subject: q.subject } : {}),
      ...(q.scope === 'requested'
        ? { requestedById: user.id }
        : q.scope === 'waiting'
          ? waitingOnMeFilter
          : user.permissions.includes('audit:read')
            ? {}
            : relevant),
    };
    const [ordered, waitingOnMe, myOpenRequests, signOffs] = await Promise.all([
      // Status sorts in its former enum order (open requests first), then newest first.
      ApprovalRequest.aggregate<{ _id: string }>([
        { $match: where },
        { $addFields: { _statusRank: { $indexOfArray: [STATUS_ORDER, '$status'] } } },
        { $sort: { _statusRank: 1, createdAt: -1, _id: 1 } },
        { $limit: 100 },
        { $project: { _id: 1 } },
      ]),
      ApprovalRequest.countDocuments(waitingOnMeFilter),
      ApprovalRequest.countDocuments({ status: 'PENDING', requestedById: user.id }),
      user.permissions.includes('approval:decide')
        ? SignOff.find({ status: 'PENDING' })
            .populate([
              {
                path: 'deliverable',
                select: { projectId: 1 },
                populate: { path: 'project', select: { code: 1, title: 1 } },
              },
              {
                path: 'projectStage',
                select: { projectId: 1 },
                populate: { path: 'project', select: { code: 1, title: 1 } },
              },
            ])
            .sort({ requestedAt: 1 })
            .lean<SignOffRow[]>()
        : Promise.resolve([] as SignOffRow[]),
    ]);
    const ids = ordered.map((o) => o._id);
    const loaded = await ApprovalRequest.find({ _id: { $in: ids } })
      .populate(approvalPopulate)
      .lean<ApprovalRow[]>();
    const byId = new Map(loaded.map((r) => [r.id, r]));
    const rows = ids.map((i) => byId.get(i)).filter((r): r is ApprovalRow => r !== undefined);
    return {
      requests: rows.map((r) => this.toView(r, user)),
      signOffs: signOffs.map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        requestedAt: iso(a.requestedAt),
        project: projectRef((a.deliverable?.project ?? a.projectStage?.project)!),
        deliverableId: a.deliverable?.id ?? null,
      })),
      counts: { waitingOnMe, myOpenRequests },
    };
  }
}
