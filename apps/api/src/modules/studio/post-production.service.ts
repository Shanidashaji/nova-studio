import { Injectable } from '@nestjs/common';
import type {
  Approval,
  Client,
  Deliverable,
  FeedbackItem,
  Project,
  ProjectStage,
  RevisionRound,
  Shoot,
  StageDefinition,
  TeamMember,
} from '@nova/db';
import type {
  InternalReviewAction,
  PostProductionItem,
  PostProductionView,
  SessionUser,
  UpdatePostProduction,
} from '@nova/shared';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../activity/notifications.service';
import { iso, isoOrNull, memberRef } from '../projects/project.mapper';

type Row = Deliverable & {
  editor: TeamMember | null;
  project:
    | (Project & {
        client: Pick<Client, 'name'> | null;
        stages: (ProjectStage & { stageDefinition: Pick<StageDefinition, 'key'> | null })[];
        includedRevisions: number;
      })
    | null;
  rounds: (RevisionRound & { feedback: FeedbackItem[] })[];
  approvals: Approval[];
};

/**
 * Post-production board: who is cutting what, how far along it is, where each cut is in review
 * (internal first, then client), what feedback is open and which revisions exceed scope.
 */
@Injectable()
export class PostProductionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async board(): Promise<PostProductionView> {
    const projects = await this.database.models.Project.find(
      { status: { $in: ['ACTIVE', 'ON_HOLD'] } },
      { _id: 1 },
    ).lean();
    const rows = await this.database.models.Deliverable.find({
      projectId: { $in: projects.map((p) => p._id) },
    })
      .populate([
        { path: 'editor' },
        {
          path: 'project',
          populate: [
            { path: 'client', select: { name: 1 } },
            { path: 'stages', populate: { path: 'stageDefinition', select: { key: 1 } } },
          ],
        },
        { path: 'rounds', options: { sort: { number: 1 } }, populate: { path: 'feedback' } },
        { path: 'approvals', options: { sort: { requestedAt: -1 } } },
      ])
      .lean<Row[]>();
    const shoots = await this.database.models.Shoot.find(
      {
        projectId: { $in: projects.map((p) => p._id) },
        status: { $in: ['WRAPPED', 'IN_PROGRESS'] },
      },
      { title: 1, projectId: 1, footageStatus: 1 },
    ).lean<Pick<Shoot, '_id' | 'id' | 'title' | 'projectId' | 'footageStatus'>[]>();
    const now = Date.now();
    const items: PostProductionItem[] = rows
      .filter((d) => d.project)
      .map((d) => {
        const p = d.project!;
        const stage =
          p.stages.find((s) => s.status === 'ACTIVE' || s.status === 'BLOCKED')?.stageDefinition
            ?.key ?? null;
        const approval = d.approvals.find((a) => a.kind === 'CLIENT') ?? null;
        const overdue =
          approval?.status === 'PENDING' && !!approval.dueAt && approval.dueAt.getTime() < now;
        const feedback = d.rounds.flatMap((r) => r.feedback);
        const internalReview = d.internalReviewStatus ?? 'NOT_STARTED';
        const reviewState: PostProductionItem['reviewState'] =
          d.status === 'DELIVERED'
            ? 'DELIVERED'
            : d.status === 'APPROVED'
              ? 'APPROVED'
              : d.status === 'CHANGES_REQUESTED'
                ? 'REVISION_REQUESTED'
                : approval?.status === 'PENDING'
                  ? overdue
                    ? 'OVERDUE'
                    : 'PENDING_CLIENT'
                  : internalReview === 'PENDING'
                    ? 'INTERNAL_REVIEW'
                    : 'EDITING';
        return {
          deliverableId: d.id,
          name: d.name,
          project: {
            id: p.id,
            code: p.code,
            title: p.title,
            clientName: p.client?.name ?? '',
            stage,
          },
          status: d.status,
          version: d.currentVersion,
          dueDate: isoOrNull(d.dueDate),
          editor: d.editor ? memberRef(d.editor) : null,
          editProgress: d.editProgress ?? 0,
          internalReview,
          internalReviewNote: d.internalReviewNote ?? null,
          clientApproval: approval
            ? {
                id: approval.id,
                status: approval.status,
                requestedAt: iso(approval.requestedAt),
                dueAt: isoOrNull(approval.dueAt ?? null),
                overdue,
              }
            : null,
          reviewState,
          feedback: {
            client: feedback.filter((f) => (f.source ?? 'CLIENT') === 'CLIENT').length,
            internal: feedback.filter((f) => f.source === 'INTERNAL').length,
            open: feedback.filter((f) => f.status === 'OPEN').length,
          },
          rounds: d.rounds.length,
          roundsBeyondScope: d.rounds.filter((r) => !r.includedInScope).length,
          footage: shoots
            .filter((s) => s.projectId === p.id)
            .map((s) => ({ shootId: s.id, title: s.title, status: s.footageStatus ?? 'PENDING' })),
        };
      });
    const editors = await this.database.models.TeamMember.find({
      isActive: true,
      $or: [
        { title: { $regex: 'edit|colou?r|motion|post', $options: 'i' } },
        { _id: { $in: rows.map((r) => r.editorId).filter(Boolean) } },
      ],
    }).lean<TeamMember[]>();
    return {
      items,
      editors: editors.map((e) => ({
        ...memberRef(e),
        assigned: items.filter(
          (i) =>
            i.editor?.id === e.id && i.reviewState !== 'DELIVERED' && i.reviewState !== 'APPROVED',
        ).length,
      })),
    };
  }

  async update(id: string, input: UpdatePostProduction, user: SessionUser) {
    const d = await this.database.models.Deliverable.findById(id).lean<Deliverable>();
    if (!d) throw notFound('Deliverable');
    let editor: TeamMember | null = null;
    if (input.editorId) {
      editor = await this.database.models.TeamMember.findById(input.editorId).lean<TeamMember>();
      if (!editor || !editor.isActive)
        throw unprocessable('INVALID_MEMBER', 'Choose an active team member.');
    }
    if (input.editProgress !== undefined && (d.status === 'APPROVED' || d.status === 'DELIVERED')) {
      throw conflict('DELIVERABLE_APPROVED', `${d.name} is approved; its edit is finished.`);
    }
    await this.activity.transaction(async (log) => {
      await this.database.models.Deliverable.updateOne({ _id: id }, { $set: input });
      await log({
        actorId: user.id,
        action: input.editorId !== undefined ? 'deliverable.editor' : 'deliverable.progress',
        entityType: 'deliverable',
        entityId: id,
        projectId: d.projectId,
        summary:
          input.editorId !== undefined
            ? editor
              ? `${user.name} assigned ${editor.name} to edit ${d.name}`
              : `${user.name} unassigned the editor of ${d.name}`
            : `${user.name} set editing of ${d.name} to ${input.editProgress}%`,
      });
      if (editor?.userId && editor.userId !== user.id) {
        await this.notifications.notifyUsers([editor.userId], {
          kind: 'task.edit',
          title: `You are editing ${d.name}`,
          body: `Assigned by ${user.name}.`,
          entityType: 'project',
          entityId: d.projectId,
        });
      }
    });
    return { ok: true };
  }

  /** Internal review gate before the client sees a cut. */
  async internalReview(id: string, input: InternalReviewAction, user: SessionUser) {
    const d = await this.database.models.Deliverable.findById(id).lean<Deliverable>();
    if (!d) throw notFound('Deliverable');
    if (d.status === 'APPROVED' || d.status === 'DELIVERED') {
      throw conflict('DELIVERABLE_APPROVED', `${d.name} is already approved by the client.`);
    }
    const status = d.internalReviewStatus ?? 'NOT_STARTED';
    if (input.action === 'REQUEST') {
      if (status === 'PENDING')
        throw conflict('ALREADY_PENDING', `${d.name} is already waiting for internal review.`);
    } else {
      if (!user.permissions.includes('approval:decide'))
        throw forbidden('Only reviewers can decide internal reviews.');
      if (status !== 'PENDING')
        throw conflict('NOT_PENDING', `Request internal review of ${d.name} first.`);
      if (input.action === 'CHANGES' && !input.note)
        throw unprocessable('NOTE_REQUIRED', 'Say what needs to change.');
    }
    const next =
      input.action === 'REQUEST'
        ? 'PENDING'
        : input.action === 'APPROVE'
          ? 'APPROVED'
          : 'CHANGES_REQUESTED';
    await this.activity.transaction(async (log) => {
      const res = await this.database.models.Deliverable.updateOne(
        {
          _id: id,
          $or: [
            { internalReviewStatus: status },
            ...(status === 'NOT_STARTED' ? [{ internalReviewStatus: { $exists: false } }] : []),
          ],
        },
        {
          $set: {
            internalReviewStatus: next,
            internalReviewNote: input.note ?? null,
            internalReviewedAt: input.action === 'REQUEST' ? null : new Date(),
            internalReviewedBy: input.action === 'REQUEST' ? null : user.name,
            ...(input.action === 'REQUEST' && (d.editProgress ?? 0) < 100
              ? { editProgress: 100 }
              : {}),
          },
        },
      );
      if (res.matchedCount === 0)
        throw conflict('REVIEW_CHANGED', 'The review changed meanwhile; reload.');
      await log({
        actorId: user.id,
        action: `deliverable.internal.${next.toLowerCase()}`,
        entityType: 'deliverable',
        entityId: id,
        projectId: d.projectId,
        summary:
          input.action === 'REQUEST'
            ? `${user.name} sent ${d.name} for internal review`
            : input.action === 'APPROVE'
              ? `${user.name} passed ${d.name} in internal review — ready for the client`
              : `${user.name} asked for changes to ${d.name} in internal review: ${input.note}`,
      });
      if (input.action === 'REQUEST') {
        await this.notifications.notifyPermission(
          'approval:decide',
          {
            kind: 'approval.internal',
            title: `Internal review: ${d.name}`,
            body: `Requested by ${user.name}.`,
            entityType: 'project',
            entityId: d.projectId,
          },
          user.id,
        );
      }
    });
    return { ok: true };
  }
}
