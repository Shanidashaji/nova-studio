/**
 * Enumerations for the production-studio layer: talent, creative documents and scene breakdown,
 * the shoot-day log, client communication automation and project budget plans.
 * Each list mirrors the database enum of the same name (packages/db/src/models/enums.ts).
 */
import { z } from 'zod';

const labels = <const T extends readonly string[]>(_values: T, map: Record<T[number], string>) =>
  map;

// ── Talent (artists) ──────────────────────────────────────────────────────────

export const TALENT_KINDS = [
  'ACTOR',
  'MODEL',
  'VOICE_ARTIST',
  'ANCHOR',
  'DANCER',
  'INFLUENCER',
  'CHILD_ARTIST',
  'OTHER',
] as const;
export const TalentKind = z.enum(TALENT_KINDS);
export type TalentKind = z.infer<typeof TalentKind>;
export const TALENT_KIND_LABELS = labels(TALENT_KINDS, {
  ACTOR: 'Actor',
  MODEL: 'Model',
  VOICE_ARTIST: 'Voice artist',
  ANCHOR: 'Anchor / presenter',
  DANCER: 'Dancer',
  INFLUENCER: 'Influencer',
  CHILD_ARTIST: 'Child artist',
  OTHER: 'Other',
});

export const TALENT_BOOKING_STATUSES = ['HOLD', 'CONFIRMED', 'RELEASED'] as const;
export const TalentBookingStatus = z.enum(TALENT_BOOKING_STATUSES);
export type TalentBookingStatus = z.infer<typeof TalentBookingStatus>;

// ── Creative documents and scenes ─────────────────────────────────────────────

export const CREATIVE_KINDS = ['BRIEF', 'CONCEPT', 'SCRIPT', 'STORYBOARD', 'SHOT_LIST'] as const;
export const CreativeKind = z.enum(CREATIVE_KINDS);
export type CreativeKind = z.infer<typeof CreativeKind>;
export const CREATIVE_KIND_LABELS = labels(CREATIVE_KINDS, {
  BRIEF: 'Creative brief',
  CONCEPT: 'Creative concept',
  SCRIPT: 'Script',
  STORYBOARD: 'Storyboard',
  SHOT_LIST: 'Shot list',
});

export const SCRIPT_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
] as const;
export const ScriptStatus = z.enum(SCRIPT_STATUSES);
export type ScriptStatus = z.infer<typeof ScriptStatus>;
export const SCRIPT_STATUS_LABELS = labels(SCRIPT_STATUSES, {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

export const SCENE_STATUSES = ['PLANNED', 'SCHEDULED', 'SHOT', 'DROPPED'] as const;
export const SceneStatus = z.enum(SCENE_STATUSES);
export type SceneStatus = z.infer<typeof SceneStatus>;

export const SCENE_SETTINGS = ['INT', 'EXT', 'INT_EXT'] as const;
export const SceneSetting = z.enum(SCENE_SETTINGS);
export type SceneSetting = z.infer<typeof SceneSetting>;
export const SCENE_SETTING_LABELS = labels(SCENE_SETTINGS, {
  INT: 'Interior',
  EXT: 'Exterior',
  INT_EXT: 'Int./Ext.',
});

export const SCENE_TIMES = ['DAY', 'NIGHT', 'DAWN', 'DUSK'] as const;
export const SceneTime = z.enum(SCENE_TIMES);
export type SceneTime = z.infer<typeof SceneTime>;

export const BREAKDOWN_SOURCES = ['MANUAL', 'RULE_BASED'] as const;
export const BreakdownSource = z.enum(BREAKDOWN_SOURCES);
export type BreakdownSource = z.infer<typeof BreakdownSource>;

// ── Shoot day ─────────────────────────────────────────────────────────────────

export const SHOOT_LOG_KINDS = ['NOTE', 'ISSUE', 'DELAY', 'SCHEDULE_CHANGE'] as const;
export const ShootLogKind = z.enum(SHOOT_LOG_KINDS);
export type ShootLogKind = z.infer<typeof ShootLogKind>;
export const SHOOT_LOG_KIND_LABELS = labels(SHOOT_LOG_KINDS, {
  NOTE: 'Note',
  ISSUE: 'Issue',
  DELAY: 'Delay',
  SCHEDULE_CHANGE: 'Schedule change',
});

export const FOOTAGE_STATUSES = ['PENDING', 'INGESTED', 'BACKED_UP', 'WITH_EDITOR'] as const;
export const FootageStatus = z.enum(FOOTAGE_STATUSES);
export type FootageStatus = z.infer<typeof FootageStatus>;
export const FOOTAGE_STATUS_LABELS = labels(FOOTAGE_STATUSES, {
  PENDING: 'Not ingested',
  INGESTED: 'Ingested',
  BACKED_UP: 'Backed up (2 copies)',
  WITH_EDITOR: 'With editor',
});

// ── Post-production ───────────────────────────────────────────────────────────

export const INTERNAL_REVIEW_STATUSES = [
  'NOT_STARTED',
  'PENDING',
  'APPROVED',
  'CHANGES_REQUESTED',
] as const;
export const InternalReviewStatus = z.enum(INTERNAL_REVIEW_STATUSES);
export type InternalReviewStatus = z.infer<typeof InternalReviewStatus>;

export const FEEDBACK_SOURCES = ['CLIENT', 'INTERNAL'] as const;
export const FeedbackSource = z.enum(FEEDBACK_SOURCES);
export type FeedbackSource = z.infer<typeof FeedbackSource>;

// ── Client communication ──────────────────────────────────────────────────────

export const MESSAGE_CHANNELS = ['EMAIL', 'WHATSAPP'] as const;
export const MessageChannel = z.enum(MESSAGE_CHANNELS);
export type MessageChannel = z.infer<typeof MessageChannel>;

/**
 * DRAFT: prepared, waiting for a person to review it. QUEUED: approved and waiting for its send
 * time. SIMULATED: "sent" with no provider configured — nothing left NOVA. SENT: accepted by a
 * configured provider. FAILED: the provider refused it. CANCELLED: discarded.
 */
export const MESSAGE_STATUSES = [
  'DRAFT',
  'QUEUED',
  'SIMULATED',
  'SENT',
  'FAILED',
  'CANCELLED',
] as const;
export const MessageStatus = z.enum(MESSAGE_STATUSES);
export type MessageStatus = z.infer<typeof MessageStatus>;
export const MESSAGE_STATUS_LABELS = labels(MESSAGE_STATUSES, {
  DRAFT: 'Draft — needs review',
  QUEUED: 'Queued',
  SIMULATED: 'Simulated (not sent)',
  SENT: 'Sent',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
});

export const MESSAGE_TRIGGERS = [
  'PROJECT_CONFIRMED',
  'SHOOT_CONFIRMED',
  'PRE_SHOOT_INSTRUCTIONS',
  'SHOOT_REMINDER',
  'SCHEDULE_CHANGED',
  'SHOOT_UPDATE',
  'SCRIPT_REVIEW',
  'APPROVAL_REQUEST',
  'EDITING_UPDATE',
  'VIDEO_REVIEW',
  'REVISION_RECEIVED',
  'FINAL_DELIVERY',
  'FEEDBACK_REQUEST',
  'MANUAL',
] as const;
export const MessageTrigger = z.enum(MESSAGE_TRIGGERS);
export type MessageTrigger = z.infer<typeof MessageTrigger>;
export const MESSAGE_TRIGGER_LABELS = labels(MESSAGE_TRIGGERS, {
  PROJECT_CONFIRMED: 'Project confirmation',
  SHOOT_CONFIRMED: 'Shoot confirmation',
  PRE_SHOOT_INSTRUCTIONS: 'Pre-shoot instructions',
  SHOOT_REMINDER: 'Shoot reminder',
  SCHEDULE_CHANGED: 'Schedule change',
  SHOOT_UPDATE: 'Shoot wrap update',
  SCRIPT_REVIEW: 'Script review',
  APPROVAL_REQUEST: 'Client approval request',
  EDITING_UPDATE: 'Editing update',
  VIDEO_REVIEW: 'Video review',
  REVISION_RECEIVED: 'Revision request received',
  FINAL_DELIVERY: 'Final delivery',
  FEEDBACK_REQUEST: 'Feedback collection',
  MANUAL: 'Manual message',
});
/** When each automation fires, in words (shown on the automation settings screen). */
export const MESSAGE_TRIGGER_EVENTS = labels(MESSAGE_TRIGGERS, {
  PROJECT_CONFIRMED: 'A project is created for a client',
  SHOOT_CONFIRMED: 'A shoot is marked confirmed',
  PRE_SHOOT_INSTRUCTIONS: 'Before a confirmed shoot (offset in hours)',
  SHOOT_REMINDER: 'Before a confirmed shoot (offset in hours)',
  SCHEDULE_CHANGED: 'A confirmed shoot is moved to another time',
  SHOOT_UPDATE: 'A shoot is wrapped',
  SCRIPT_REVIEW: 'A script is sent for client review',
  APPROVAL_REQUEST: 'A deliverable version is sent for client approval',
  EDITING_UPDATE: 'A project enters the Edit stage',
  VIDEO_REVIEW: 'A project enters the Review stage (editing complete)',
  REVISION_RECEIVED: 'The client requests changes on a deliverable',
  FINAL_DELIVERY: 'A project is marked delivered',
  FEEDBACK_REQUEST: 'After delivery (offset in hours)',
  MANUAL: 'Written by hand',
});

/** OFF: never prepared. DRAFT: prepared for review before sending. AUTO: queued to send itself. */
export const AUTOMATION_MODES = ['OFF', 'DRAFT', 'AUTO'] as const;
export const AutomationMode = z.enum(AUTOMATION_MODES);
export type AutomationMode = z.infer<typeof AutomationMode>;
export const AUTOMATION_MODE_LABELS = labels(AUTOMATION_MODES, {
  OFF: 'Off',
  DRAFT: 'Prepare a draft for review',
  AUTO: 'Queue and send automatically',
});

// ── Budget plan ───────────────────────────────────────────────────────────────

export const BUDGET_GROUPS = [
  'PRODUCTION',
  'CREW',
  'ARTIST',
  'EQUIPMENT',
  'POST_PRODUCTION',
  'OTHER',
] as const;
export const BudgetGroup = z.enum(BUDGET_GROUPS);
export type BudgetGroup = z.infer<typeof BudgetGroup>;
export const BUDGET_GROUP_LABELS = labels(BUDGET_GROUPS, {
  PRODUCTION: 'Production (location, travel, consumables)',
  CREW: 'Crew',
  ARTIST: 'Artists',
  EQUIPMENT: 'Equipment',
  POST_PRODUCTION: 'Post-production',
  OTHER: 'Other',
});
