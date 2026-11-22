import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  Approval,
  ClientMessage,
  Deliverable,
  MessageTemplate,
  ProjectStage,
  Script,
  Shoot,
  StageDefinition,
} from '@nova/db';
import { DatabaseService } from '../../database/database.service';
import { ACTIVITY_EVENT, type ActivityEvent } from '../activity/activity.service';
import { CommsService } from './comms.service';

const HOUR = 3600 * 1000;

/**
 * Communication automation rules. Listens to committed activity and reconciles each affected
 * record with the messages it should have: a confirmed shoot gets a confirmation, instructions
 * and a reminder; a moved shoot gets a schedule-change notice; a project entering Edit or Review,
 * a deliverable sent for approval, changes requested, a script sent for review and a delivery
 * each prepare their message. Templates decide whether a message is a draft or queued (AUTO).
 *
 * State-based and idempotent: every prepared message carries a dedupe key, so replaying an event
 * never prepares the same message twice.
 */
@Injectable()
export class CommsAutomation {
  private readonly logger = new Logger('CommsAutomation');

  constructor(
    private readonly database: DatabaseService,
    private readonly comms: CommsService,
  ) {}

  @OnEvent(ACTIVITY_EVENT, { async: true })
  async onActivity(event: ActivityEvent) {
    try {
      await this.handle(event);
    } catch (error) {
      // Automation must never break the change that triggered it.
      this.logger.warn(
        `Automation for ${event.action} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async handle(e: ActivityEvent) {
    if (e.action.startsWith('message.') || e.action.startsWith('template.')) return;
    if (e.action === 'project.created') {
      await this.comms.prepare(
        'PROJECT_CONFIRMED',
        { projectId: e.entityId },
        { dedupeKey: `PROJECT_CONFIRMED:${e.entityId}` },
      );
      return;
    }
    if (e.entityType === 'shoot' && /^shoot\.(created|updated|cancelled)$/.test(e.action)) {
      await this.reconcileShoot(e.entityId);
      return;
    }
    if (e.action === 'project.transitioned') {
      await this.reconcileStage(e.entityId);
      return;
    }
    if (e.action === 'project.delivered') {
      await this.comms.prepare(
        'FINAL_DELIVERY',
        { projectId: e.entityId },
        { dedupeKey: `FINAL_DELIVERY:${e.entityId}` },
      );
      const t = await this.template('FEEDBACK_REQUEST');
      await this.comms.prepare(
        'FEEDBACK_REQUEST',
        { projectId: e.entityId },
        {
          dedupeKey: `FEEDBACK_REQUEST:${e.entityId}`,
          scheduledFor: new Date(Date.now() + (t?.offsetHours ?? 72) * HOUR),
        },
      );
      return;
    }
    if (e.action === 'approval.requested' && e.entityType === 'deliverable') {
      const d = await this.database.models.Deliverable.findById(e.entityId).lean<Deliverable>();
      if (d) {
        await this.comms.prepare(
          'APPROVAL_REQUEST',
          { deliverableId: d.id },
          { dedupeKey: `APPROVAL_REQUEST:${d.id}:v${d.currentVersion}` },
        );
      }
      return;
    }
    if (e.action === 'approval.decided' && e.entityType === 'deliverable') {
      const latest = await this.database.models.Approval.findOne({
        deliverableId: e.entityId,
        status: { $ne: 'PENDING' },
      })
        .sort({ decidedAt: -1 })
        .lean<Approval>();
      if (latest?.status === 'CHANGES_REQUESTED') {
        await this.comms.prepare(
          'REVISION_RECEIVED',
          { deliverableId: e.entityId },
          { dedupeKey: `REVISION_RECEIVED:${latest.id}` },
        );
      }
      return;
    }
    if (e.action === 'script.submitted') {
      const s = await this.database.models.Script.findById(e.entityId).lean<Script>();
      if (s) {
        await this.comms.prepare(
          'SCRIPT_REVIEW',
          { scriptId: s.id },
          { dedupeKey: `SCRIPT_REVIEW:${s.id}:v${s.currentVersion}` },
        );
      }
    }
  }

  private template(trigger: MessageTemplate['trigger']) {
    return this.database.models.MessageTemplate.findOne({ trigger }).lean<MessageTemplate>();
  }

  /** Brings a shoot's client messages in line with its status and schedule. */
  async reconcileShoot(shootId: string) {
    const shoot = await this.database.models.Shoot.findById(shootId).lean<Shoot>();
    if (!shoot) return;
    if (shoot.status === 'CANCELLED') {
      await this.comms.cancelOpenForShoot(
        shootId,
        'Cancelled automatically: the shoot was cancelled.',
      );
      return;
    }
    if (shoot.status === 'WRAPPED') {
      await this.comms.prepare(
        'SHOOT_UPDATE',
        { shootId },
        { dedupeKey: `SHOOT_UPDATE:${shootId}` },
      );
      return;
    }
    if (shoot.status !== 'CONFIRMED' && shoot.status !== 'IN_PROGRESS') return;
    const stamp = shoot.startsAt.toISOString();

    // Schedule change: the last message written for this shoot was for another start time.
    const last = await this.database.models.ClientMessage.findOne({
      shootId,
      scheduleStamp: { $ne: null },
      status: { $ne: 'CANCELLED' },
    })
      .sort({ createdAt: -1 })
      .lean<ClientMessage>();
    if (last?.scheduleStamp && last.scheduleStamp.getTime() !== shoot.startsAt.getTime()) {
      await this.comms.cancelOpenForShoot(shootId, 'Superseded: the shoot moved to another time.', {
        trigger: { $in: ['PRE_SHOOT_INSTRUCTIONS', 'SHOOT_REMINDER', 'SHOOT_CONFIRMED'] },
        scheduleStamp: { $ne: shoot.startsAt },
      });
      await this.comms.prepare(
        'SCHEDULE_CHANGED',
        { shootId, oldDate: last.scheduleStamp },
        { dedupeKey: `SCHEDULE_CHANGED:${shootId}:${stamp}`, scheduleStamp: shoot.startsAt },
      );
    } else {
      await this.comms.prepare(
        'SHOOT_CONFIRMED',
        { shootId },
        { dedupeKey: `SHOOT_CONFIRMED:${shootId}`, scheduleStamp: shoot.startsAt },
      );
    }
    if (shoot.startsAt.getTime() <= Date.now()) return;
    for (const trigger of ['PRE_SHOOT_INSTRUCTIONS', 'SHOOT_REMINDER'] as const) {
      const t = await this.template(trigger);
      const at = new Date(shoot.startsAt.getTime() + (t?.offsetHours ?? -24) * HOUR);
      await this.comms.prepare(
        trigger,
        { shootId },
        {
          dedupeKey: `${trigger}:${shootId}:${stamp}`,
          scheduledFor: at.getTime() < Date.now() ? new Date() : at,
          scheduleStamp: shoot.startsAt,
        },
      );
    }
  }

  /** Edit stage entered → editing update; Review stage entered → video review. */
  async reconcileStage(projectId: string) {
    const active = await this.database.models.ProjectStage.findOne({
      projectId,
      status: { $in: ['ACTIVE', 'BLOCKED'] },
    })
      .populate({ path: 'stageDefinition', select: { key: 1 } })
      .lean<ProjectStage & { stageDefinition: Pick<StageDefinition, 'key'> | null }>();
    const key = active?.stageDefinition?.key;
    if (key === 'EDIT') {
      await this.comms.prepare(
        'EDITING_UPDATE',
        { projectId },
        { dedupeKey: `EDITING_UPDATE:${projectId}` },
      );
    } else if (key === 'REVIEW') {
      await this.comms.prepare(
        'VIDEO_REVIEW',
        { projectId },
        { dedupeKey: `VIDEO_REVIEW:${projectId}` },
      );
    }
  }
}
