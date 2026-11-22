import { Injectable } from '@nestjs/common';
import type { AddFeedback, ApprovalDecision, SendForReview, SessionUser } from '@nova/shared';
import type {
  Approval,
  Client,
  Deliverable,
  FeedbackItem,
  Project,
  ProjectStage,
  RevisionRound,
  StageDefinition,
} from '@nova/db';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { stageApproved } from '../projects/project.mapper';

/**
 * Review loop for deliverables: send a new version → client feedback → approve or request changes.
 * Each send opens a revision round; rounds beyond the project's included revisions are flagged.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly activity: ActivityService,
  ) {}

  async sendForReview(deliverableId: string, input: SendForReview, user: SessionUser) {
    const { Deliverable, RevisionRound, Approval } = this.database.models;
    const d = await Deliverable.findById(deliverableId)
      .populate([
        {
          path: 'project',
          populate: [{ path: 'stages', populate: { path: 'stageDefinition' } }, { path: 'client' }],
        },
        { path: 'approvals', match: { status: 'PENDING' } },
      ])
      .lean<
        Deliverable & {
          project: Project & {
            stages: (ProjectStage & { stageDefinition: StageDefinition })[];
            client: Client;
          };
          approvals: Approval[];
        }
      >();
    if (!d) throw notFound('Deliverable');
    if (d.status === 'DELIVERED' || d.status === 'APPROVED') {
      throw conflict('ALREADY_APPROVED', `${d.name} is already approved.`);
    }
    // Internal review comes before the client: a cut still in (or sent back by) internal review
    // must not reach the client.
    if ((d.internalReviewStatus ?? 'NOT_STARTED') !== 'APPROVED') {
      throw conflict(
        'INTERNAL_REVIEW_OPEN',
        d.internalReviewStatus === 'PENDING'
          ? `${d.name} is waiting for internal review. Approve it internally before sending it to the client.`
          : d.internalReviewStatus === 'CHANGES_REQUESTED'
            ? `Internal review asked for changes on ${d.name}. Address them and pass internal review first.`
            : `${d.name} has not been through internal review. Request and pass it before the client sees this cut.`,
      );
    }
    if (d.approvals.length > 0) {
      throw conflict(
        'REVIEW_PENDING',
        `${d.name} v${d.currentVersion} is still waiting for a decision.`,
      );
    }
    const version = d.currentVersion + 1;
    const reviewStage = d.project.stages.find((s) => s.stageDefinition.key === 'REVIEW');
    const inScope = version <= d.project.includedRevisions;

    const row = await this.database.transaction(async () => {
      await RevisionRound.updateMany(
        { deliverableId, closedAt: null },
        { $set: { closedAt: new Date() } },
      );
      await RevisionRound.create({
        deliverableId,
        number: version,
        sentAt: new Date(),
        includedInScope: inScope,
      });
      const updated = await Deliverable.updateOne(
        { _id: deliverableId },
        { $set: { status: 'IN_REVIEW', currentVersion: version } },
      );
      if (updated.matchedCount === 0) throw notFound('Deliverable');
      await Approval.create({
        kind: 'CLIENT',
        deliverableId,
        projectStageId: reviewStage?.id ?? null,
        title: `Client approval — ${d.name} v${version}`,
        note: input.note,
        dueAt: input.dueAt ?? new Date(Date.now() + 3 * 24 * 3600 * 1000),
      });
      return this.activity.record({
        actorId: user.id,
        action: 'approval.requested',
        entityType: 'deliverable',
        entityId: deliverableId,
        projectId: d.projectId,
        summary: `${user.name} sent ${d.name} v${version} to ${d.project.client.name} for approval${inScope ? '' : ' (beyond included revisions)'}`,
      });
    });
    this.activity.publish(row);
    return { deliverableId, version };
  }

  async decide(approvalId: string, input: ApprovalDecision, user: SessionUser) {
    const { Approval, Deliverable, RevisionRound } = this.database.models;
    const approval = await Approval.findById(approvalId)
      .populate([
        { path: 'deliverable', populate: { path: 'project' } },
        { path: 'projectStage', populate: [{ path: 'project' }, { path: 'stageDefinition' }] },
      ])
      .lean<
        Approval & {
          deliverable: (Deliverable & { project: Project | null }) | null;
          projectStage:
            (ProjectStage & { project: Project | null; stageDefinition: StageDefinition }) | null;
        }
      >();
    if (!approval) throw notFound('Approval');
    if (approval.status !== 'PENDING')
      throw conflict('ALREADY_DECIDED', 'This approval has already been decided.');
    const project = approval.deliverable?.project ?? approval.projectStage?.project;
    if (!project)
      throw unprocessable('ORPHAN_APPROVAL', 'This approval is not linked to a project.');

    const row = await this.database.transaction(async () => {
      // Guarded write: of two simultaneous decisions only the first is recorded.
      const decided = await Approval.updateMany(
        { _id: approvalId, status: 'PENDING' },
        {
          $set: {
            status: input.status,
            note: input.note,
            decidedAt: new Date(),
            decidedBy: input.decidedBy ?? user.name,
          },
        },
      );
      if (decided.matchedCount === 0) {
        throw conflict('ALREADY_DECIDED', 'This approval has already been decided.');
      }
      if (approval.deliverableId) {
        const updated = await Deliverable.updateOne(
          { _id: approval.deliverableId },
          {
            $set: {
              status: input.status === 'APPROVED' ? 'APPROVED' : 'CHANGES_REQUESTED',
              // The next cut goes through internal review again before the client sees it.
              ...(input.status === 'APPROVED'
                ? {}
                : { internalReviewStatus: 'NOT_STARTED', editProgress: 50 }),
            },
          },
        );
        if (updated.matchedCount === 0) throw notFound('Deliverable');
        await RevisionRound.updateMany(
          { deliverableId: approval.deliverableId, closedAt: null },
          { $set: { closedAt: new Date() } },
        );
      }
      const verb = input.status === 'APPROVED' ? 'approved' : 'requested changes on';
      return this.activity.record({
        actorId: user.id,
        action: 'approval.decided',
        entityType: approval.deliverableId ? 'deliverable' : 'project',
        entityId: approval.deliverableId ?? project.id,
        projectId: project.id,
        summary: `${input.decidedBy ?? user.name} ${verb} ${approval.title.replace(/^Client approval — /, '')} on ${project.title}${input.note ? ` — “${input.note}”` : ''}`,
        metadata: { status: input.status, recordedBy: user.name },
      });
    });
    this.activity.publish(row);
    return { approvalId, status: input.status };
  }

  /** Requests sign-off on a stage that requires approval (e.g. the Brief's creative treatment). */
  async requestStageApproval(stageId: string, input: SendForReview, user: SessionUser) {
    const { ProjectStage, Approval } = this.database.models;
    const stage = await ProjectStage.findById(stageId)
      .populate([
        { path: 'stageDefinition' },
        { path: 'project', populate: { path: 'client' } },
        { path: 'approvals' },
      ])
      .lean<
        ProjectStage & {
          stageDefinition: StageDefinition;
          project: Project & { client: Client };
          approvals: Approval[];
        }
      >();
    if (!stage) throw notFound('Stage');
    if (!stage.stageDefinition.requiresApproval) {
      throw unprocessable(
        'NO_APPROVAL_NEEDED',
        `${stage.stageDefinition.label} does not require approval.`,
      );
    }
    if (stage.project.status !== 'ACTIVE') {
      throw unprocessable(
        'PROJECT_NOT_ACTIVE',
        `The project is ${stage.project.status.toLowerCase().replace('_', ' ')}.`,
      );
    }
    if (stage.status !== 'ACTIVE' && stage.status !== 'BLOCKED') {
      throw unprocessable(
        'STAGE_NOT_CURRENT',
        `Sign-off can be requested once ${stage.stageDefinition.label} is the current stage.`,
      );
    }
    // A sign-off granted in an earlier pass of the stage no longer counts (see stageApproved),
    // so a stage that was sent back can be signed off again.
    const signOffs = stage.approvals.filter((a) => !a.deliverableId);
    if (signOffs.some((a) => a.status === 'PENDING')) {
      throw conflict(
        'APPROVAL_EXISTS',
        `${stage.stageDefinition.label} is already waiting for sign-off.`,
      );
    }
    if (signOffs.length > 0 && stageApproved({ startedAt: stage.startedAt, approvals: signOffs })) {
      throw conflict(
        'APPROVAL_EXISTS',
        `${stage.stageDefinition.label} has already been signed off.`,
      );
    }
    const row = await this.database.transaction(async () => {
      await Approval.create({
        kind: 'CLIENT',
        projectStageId: stageId,
        title: `${stage.stageDefinition.label} sign-off`,
        note: input.note,
      });
      return this.activity.record({
        actorId: user.id,
        action: 'approval.requested',
        entityType: 'project',
        entityId: stage.projectId,
        projectId: stage.projectId,
        summary: `${user.name} asked ${stage.project.client.name} to sign off ${stage.stageDefinition.label} on ${stage.project.title}`,
      });
    });
    this.activity.publish(row);
    return { ok: true };
  }

  async addFeedback(deliverableId: string, input: AddFeedback, user: SessionUser) {
    const { RevisionRound, FeedbackItem } = this.database.models;
    const round = await RevisionRound.findOne({ deliverableId })
      .sort({ number: -1 })
      .populate({ path: 'deliverable', populate: { path: 'project' } })
      .lean<RevisionRound & { deliverable: Deliverable & { project: Project } }>();
    if (!round)
      throw unprocessable('NO_ROUND', 'Send a version for review before adding feedback.');
    if (round.deliverable.status === 'APPROVED' || round.deliverable.status === 'DELIVERED') {
      throw conflict(
        'ALREADY_APPROVED',
        `${round.deliverable.name} is approved; send a new version to reopen feedback.`,
      );
    }
    const row = await this.database.transaction(async () => {
      const item = (
        await FeedbackItem.create({ revisionRoundId: round.id, ...input })
      ).toObject<FeedbackItem>();
      return this.activity.record({
        actorId: user.id,
        action: 'feedback.added',
        entityType: 'deliverable',
        entityId: deliverableId,
        projectId: round.deliverable.projectId,
        summary: `${input.author} left ${input.source === 'INTERNAL' ? 'internal review notes' : 'feedback'} on ${round.deliverable.name} v${round.number}${item.timecode ? ` at ${item.timecode}` : ''}`,
      });
    });
    this.activity.publish(row);
    return { ok: true };
  }

  async setFeedbackStatus(feedbackId: string, status: 'OPEN' | 'RESOLVED', user: SessionUser) {
    const { FeedbackItem } = this.database.models;
    const item = await FeedbackItem.findById(feedbackId)
      .populate({ path: 'revisionRound', populate: { path: 'deliverable' } })
      .lean<FeedbackItem & { revisionRound: RevisionRound & { deliverable: Deliverable } }>();
    if (!item) throw notFound('Feedback');
    const row = await this.database.transaction(async () => {
      const updated = await FeedbackItem.updateOne({ _id: feedbackId }, { $set: { status } });
      if (updated.matchedCount === 0) throw notFound('Feedback');
      return this.activity.record({
        actorId: user.id,
        action: 'feedback.status',
        entityType: 'deliverable',
        entityId: item.revisionRound.deliverableId,
        projectId: item.revisionRound.deliverable.projectId,
        summary: `${user.name} ${status === 'RESOLVED' ? 'resolved' : 'reopened'} a note on ${item.revisionRound.deliverable.name}`,
      });
    });
    this.activity.publish(row);
    return { ok: true };
  }
}
