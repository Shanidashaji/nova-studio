import type { AutomationMode, MessageChannel, MessageTrigger } from '@nova/shared';

export interface DefaultTemplate {
  trigger: Exclude<MessageTrigger, 'MANUAL'>;
  name: string;
  channel: MessageChannel;
  subject: string;
  body: string;
  mode: AutomationMode;
  offsetHours: number;
}

/** Triggers that fire at a time relative to an event rather than at the event itself. */
export const TIME_BASED: ReadonlySet<MessageTrigger> = new Set([
  'PRE_SHOOT_INSTRUCTIONS',
  'SHOOT_REMINDER',
  'FEEDBACK_REQUEST',
]);

/**
 * The studio's starting templates. Created on first use when missing, so a database that was
 * never seeded still has a working automation set; the studio edits them in Communications.
 * Modes default to DRAFT: a person reviews every message before it goes out.
 */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    trigger: 'PROJECT_CONFIRMED',
    name: 'Project confirmation',
    channel: 'EMAIL',
    subject: '{{project}} is confirmed — {{studio}}',
    body: 'Hi {{contact}},\n\nThank you for choosing {{studio}}. We have opened {{project}} ({{projectCode}}) and are planning towards delivery on {{dueDate}}.\n\nWe will share the creative brief and the shoot plan for your review shortly.\n\nWarm regards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'SHOOT_CONFIRMED',
    name: 'Shoot confirmation',
    channel: 'EMAIL',
    subject: 'Shoot confirmed: {{shoot}} on {{shootDate}}',
    body: 'Hi {{contact}},\n\nThe shoot for {{project}} is confirmed.\n\nShoot: {{shoot}}\nDate: {{shootDate}}\nCall time: {{callTime}}\nLocation: {{location}}\n\nWe will send pre-shoot instructions two days before.\n\nRegards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'PRE_SHOOT_INSTRUCTIONS',
    name: 'Pre-shoot instructions',
    channel: 'EMAIL',
    subject: 'Before the shoot: {{shoot}}',
    body: 'Hi {{contact}},\n\nA few things before {{shootDate}}:\n\n• Please have the products / samples ready at {{location}} by {{callTime}}.\n• Share brand guidelines and any must-have shots by tomorrow.\n• One person from your team who can approve on set, please.\n\nThank you,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: -48,
  },
  {
    trigger: 'SHOOT_REMINDER',
    name: 'Shoot reminder (day before)',
    channel: 'WHATSAPP',
    subject: 'Reminder: {{shoot}} tomorrow',
    body: 'Hi {{contact}}, a reminder that {{shoot}} for {{project}} is on {{shootDate}}, call time {{callTime}} at {{location}}. — {{studio}}',
    mode: 'AUTO',
    offsetHours: -24,
  },
  {
    trigger: 'SCHEDULE_CHANGED',
    name: 'Schedule change',
    channel: 'EMAIL',
    subject: 'Schedule change: {{shoot}} moved to {{shootDate}}',
    body: 'Hi {{contact}},\n\nThe shoot {{shoot}} for {{project}} has moved from {{oldDate}} to {{shootDate}} (call time {{callTime}}, {{location}}).\n\nPlease let us know if the new date does not work for your team.\n\nRegards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'SHOOT_UPDATE',
    name: 'Shoot wrap update',
    channel: 'EMAIL',
    subject: '{{shoot}} is wrapped',
    body: 'Hi {{contact}},\n\nWe wrapped {{shoot}} for {{project}}. The footage is being backed up and moves to editing next. We will share the first cut for review.\n\nRegards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'SCRIPT_REVIEW',
    name: 'Script review',
    channel: 'EMAIL',
    subject: 'Script for your review: {{script}}',
    body: 'Hi {{contact}},\n\nThe script “{{script}}” for {{project}} is ready for your review. Please reply with your approval or the changes you would like.\n\nRegards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'APPROVAL_REQUEST',
    name: 'Client approval request',
    channel: 'EMAIL',
    subject: 'Ready for approval: {{deliverable}}',
    body: 'Hi {{contact}},\n\n{{deliverable}} for {{project}} is ready for your approval.\n\nReview link: {{reviewLink}}\n\nPlease share feedback with timecodes, or approve, within three days so we stay on track for {{dueDate}}.\n\nRegards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'EDITING_UPDATE',
    name: 'Editing update',
    channel: 'EMAIL',
    subject: '{{project}} is in editing',
    body: 'Hi {{contact}},\n\n{{project}} has moved into editing. We expect to share the first cut for review soon and remain on track for {{dueDate}}.\n\nRegards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'VIDEO_REVIEW',
    name: 'Video review (editing complete)',
    channel: 'EMAIL',
    subject: 'Your video is ready to review: {{project}}',
    body: 'Hi {{contact}},\n\nEditing on {{project}} is complete and the cut is ready for your review.\n\nReview link: {{reviewLink}}\n\nRegards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'REVISION_RECEIVED',
    name: 'Revision request received',
    channel: 'EMAIL',
    subject: 'We have your changes: {{deliverable}}',
    body: 'Hi {{contact}},\n\nThank you for the feedback on {{deliverable}}. The team is working on the changes and we will send the next version for review.\n\nRegards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'FINAL_DELIVERY',
    name: 'Final delivery',
    channel: 'EMAIL',
    subject: 'Delivered: {{project}}',
    body: 'Hi {{contact}},\n\nThe final files for {{project}} have been delivered. Thank you for working with {{studio}}.\n\nRegards,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 0,
  },
  {
    trigger: 'FEEDBACK_REQUEST',
    name: 'Feedback collection',
    channel: 'EMAIL',
    subject: 'How did we do on {{project}}?',
    body: 'Hi {{contact}},\n\nNow that {{project}} is delivered, we would value two minutes of your feedback: what worked, and what we should do better next time.\n\nThank you,\n{{sender}}\n{{studio}}',
    mode: 'DRAFT',
    offsetHours: 72,
  },
];
