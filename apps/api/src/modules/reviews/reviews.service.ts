import { Injectable } from '@nestjs/common';
import type { AddFeedback, ApprovalDecision, SendForReview, SessionUser } from '@nova/shared';
import { conflict, notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { stageApproved } from '../projects/project.mapper';

/**
 * Review loop for deliverables: send a new version → client feedback → approve or request changes.
 * Each send opens a revision round; rounds beyond the project's included revisions are flagged.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async sendForReview(deliverableId: string, input: SendForReview, user: SessionUser) {
    const d = await this.prisma.db.deliverable.findUnique({
      where: { id: deliverableId },
      include: {
        project: { include: { stages: { include: { stageDefinition: true } }, client: true } },
        approvals: { where: { status: 'PENDING' } },
      },
    });
    if (!d) throw notFound('Deliverable');
    if (d.status === 'DELIVERED' || d.status === 'APPROVED') {
      throw conflict('ALREADY_APPROVED', `${d.name} is already approved.`);
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

    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.revisionRound.updateMany({
        where: { deliverableId, closedAt: null },
        data: { closedAt: new Date() },
      });
      await tx.revisionRound.create({
        data: { deliverableId, number: version, sentAt: new Date(), includedInScope: inScope },
      });
      await tx.deliverable.update({
        where: { id: deliverableId },
        data: { status: 'IN_REVIEW', currentVersion: version },
      });
      await tx.approval.create({
        data: {
          kind: 'CLIENT',
          deliverableId,
          projectStageId: reviewStage?.id ?? null,
          title: `Client approval — ${d.name} v${version}`,
          note: input.note,
        },
      });
      return this.activity.record(tx, {
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
    const approval = await this.prisma.db.approval.findUnique({
      where: { id: approvalId },
      include: {
        deliverable: { include: { project: true } },
        projectStage: { include: { project: true, stageDefinition: true } },
      },
    });
    if (!approval) throw notFound('Approval');
    if (approval.status !== 'PENDING')
      throw conflict('ALREADY_DECIDED', 'This approval has already been decided.');
    const project = approval.deliverable?.project ?? approval.projectStage?.project;
    if (!project)
      throw unprocessable('ORPHAN_APPROVAL', 'This approval is not linked to a project.');

    const row = await this.prisma.db.$transaction(async (tx) => {
      // Guarded write: of two simultaneous decisions only the first is recorded.
      const decided = await tx.approval.updateMany({
        where: { id: approvalId, status: 'PENDING' },
        data: {
          status: input.status,
          note: input.note,
          decidedAt: new Date(),
          decidedBy: input.decidedBy ?? user.name,
        },
      });
      if (decided.count === 0) {
        throw conflict('ALREADY_DECIDED', 'This approval has already been decided.');
      }
      if (approval.deliverableId) {
        await tx.deliverable.update({
          where: { id: approval.deliverableId },
          data: { status: input.status === 'APPROVED' ? 'APPROVED' : 'CHANGES_REQUESTED' },
        });
        await tx.revisionRound.updateMany({
          where: { deliverableId: approval.deliverableId, closedAt: null },
          data: { closedAt: new Date() },
        });
      }
      const verb = input.status === 'APPROVED' ? 'approved' : 'requested changes on';
      return this.activity.record(tx, {
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
    const stage = await this.prisma.db.projectStage.findUnique({
      where: { id: stageId },
      include: { stageDefinition: true, project: { include: { client: true } }, approvals: true },
    });
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
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.approval.create({
        data: {
          kind: 'CLIENT',
          projectStageId: stageId,
          title: `${stage.stageDefinition.label} sign-off`,
          note: input.note,
        },
      });
      return this.activity.record(tx, {
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
    const round = await this.prisma.db.revisionRound.findFirst({
      where: { deliverableId },
      orderBy: { number: 'desc' },
      include: { deliverable: { include: { project: true } } },
    });
    if (!round)
      throw unprocessable('NO_ROUND', 'Send a version for review before adding feedback.');
    if (round.deliverable.status === 'APPROVED' || round.deliverable.status === 'DELIVERED') {
      throw conflict(
        'ALREADY_APPROVED',
        `${round.deliverable.name} is approved; send a new version to reopen feedback.`,
      );
    }
    const row = await this.prisma.db.$transaction(async (tx) => {
      const item = await tx.feedbackItem.create({ data: { revisionRoundId: round.id, ...input } });
      return this.activity.record(tx, {
        actorId: user.id,
        action: 'feedback.added',
        entityType: 'deliverable',
        entityId: deliverableId,
        projectId: round.deliverable.projectId,
        summary: `${input.author} left feedback on ${round.deliverable.name} v${round.number}${item.timecode ? ` at ${item.timecode}` : ''}`,
      });
    });
    this.activity.publish(row);
    return { ok: true };
  }

  async setFeedbackStatus(feedbackId: string, status: 'OPEN' | 'RESOLVED', user: SessionUser) {
    const item = await this.prisma.db.feedbackItem.findUnique({
      where: { id: feedbackId },
      include: { revisionRound: { include: { deliverable: true } } },
    });
    if (!item) throw notFound('Feedback');
    const row = await this.prisma.db.$transaction(async (tx) => {
      await tx.feedbackItem.update({ where: { id: feedbackId }, data: { status } });
      return this.activity.record(tx, {
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
