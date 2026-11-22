/**
 * Domain enumerations shared by the API, the web app and the database seed.
 * Each list mirrors a Prisma enum of the same name in packages/db/prisma/schema.prisma.
 */
import { z } from 'zod';

/** Ties a label map to its value list so a missing or extra key is a type error. */
const labels = <const T extends readonly string[]>(_values: T, map: Record<T[number], string>) =>
  map;

// ── Production lifecycle ───────────────────────────────────────────────────────

export const STAGE_KEYS = [
  'BRIEF',
  'PRE_PRODUCTION',
  'SHOOT',
  'EDIT',
  'REVIEW',
  'DELIVERY',
] as const;
export const StageKey = z.enum(STAGE_KEYS);
export type StageKey = z.infer<typeof StageKey>;
export const STAGE_LABELS = labels(STAGE_KEYS, {
  BRIEF: 'Brief',
  PRE_PRODUCTION: 'Pre-production',
  SHOOT: 'Shoot',
  EDIT: 'Edit',
  REVIEW: 'Review',
  DELIVERY: 'Delivery',
});

export const STAGE_STATUSES = ['PENDING', 'ACTIVE', 'BLOCKED', 'DONE', 'SKIPPED'] as const;
export const StageStatus = z.enum(STAGE_STATUSES);
export type StageStatus = z.infer<typeof StageStatus>;

export const TRANSITION_DIRECTIONS = ['FORWARD', 'BACKWARD'] as const;
export const TransitionDirection = z.enum(TRANSITION_DIRECTIONS);
export type TransitionDirection = z.infer<typeof TransitionDirection>;

// ── Projects ──────────────────────────────────────────────────────────────────

/** Project types use the vocabulary published on neonmindsproduction.com (services + contact form). */
export const PROJECT_TYPES = [
  'PRODUCT_VIDEO',
  'BRAND_FILM',
  'STORYTELLING_AD',
  'CORPORATE_VIDEO',
  'SOCIAL_REEL',
  'PRODUCT_DEMO',
  'EXPLAINER',
  'EVENT_COVERAGE',
  'AERIAL',
  'MOTION_GRAPHICS',
  'REAL_ESTATE',
  'CAMPAIGN',
  'STUDIO_GREEN_SCREEN',
  'PODCAST',
] as const;
export const ProjectType = z.enum(PROJECT_TYPES);
export type ProjectType = z.infer<typeof ProjectType>;
export const PROJECT_TYPE_LABELS = labels(PROJECT_TYPES, {
  PRODUCT_VIDEO: 'Product Video',
  BRAND_FILM: 'Brand Film',
  STORYTELLING_AD: 'Storytelling Ad',
  CORPORATE_VIDEO: 'Corporate Video',
  SOCIAL_REEL: 'Social Media / Reels',
  PRODUCT_DEMO: 'Product Demo',
  EXPLAINER: 'Explainer',
  EVENT_COVERAGE: 'Event Coverage',
  AERIAL: 'Aerial / Drone',
  MOTION_GRAPHICS: 'Motion Graphics',
  REAL_ESTATE: 'Real Estate',
  CAMPAIGN: 'Campaign Video',
  STUDIO_GREEN_SCREEN: 'Studio / Green Screen',
  PODCAST: 'Podcast',
});

export const PROJECT_STATUSES = ['ACTIVE', 'ON_HOLD', 'DELIVERED', 'CANCELLED'] as const;
export const ProjectStatus = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const Priority = z.enum(PRIORITIES);
export type Priority = z.infer<typeof Priority>;
export const PRIORITY_WEIGHT: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE'] as const;
export const TaskStatus = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatus>;
export const TASK_STATUS_LABELS = labels(TASK_STATUSES, {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  IN_REVIEW: 'In review',
  DONE: 'Done',
});

// ── Deliverables & approvals ──────────────────────────────────────────────────

export const DELIVERABLE_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'DELIVERED',
] as const;
export const DeliverableStatus = z.enum(DELIVERABLE_STATUSES);
export type DeliverableStatus = z.infer<typeof DeliverableStatus>;

export const APPROVAL_KINDS = ['INTERNAL', 'CLIENT'] as const;
export const ApprovalKind = z.enum(APPROVAL_KINDS);
export type ApprovalKind = z.infer<typeof ApprovalKind>;

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'CHANGES_REQUESTED'] as const;
export const ApprovalStatus = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const FEEDBACK_STATUSES = ['OPEN', 'RESOLVED'] as const;
export const FeedbackStatus = z.enum(FEEDBACK_STATUSES);
export type FeedbackStatus = z.infer<typeof FeedbackStatus>;

// ── Shoots & resources ────────────────────────────────────────────────────────

export const STUDIO_LOCATIONS = ['KOZHIKODE', 'CHENNAI'] as const;
export const StudioLocation = z.enum(STUDIO_LOCATIONS);
export type StudioLocation = z.infer<typeof StudioLocation>;
export const STUDIO_LOCATION_LABELS = labels(STUDIO_LOCATIONS, {
  KOZHIKODE: 'Kozhikode',
  CHENNAI: 'Chennai',
});

export const SHOOT_STATUSES = ['PLANNED', 'CONFIRMED', 'WRAPPED', 'CANCELLED'] as const;
export const ShootStatus = z.enum(SHOOT_STATUSES);
export type ShootStatus = z.infer<typeof ShootStatus>;

export const ASSET_CATEGORIES = [
  'CAMERA',
  'LENS',
  'LIGHTING',
  'AUDIO',
  'GRIP',
  'DRONE',
  'STORAGE',
  'COMPUTE',
] as const;
export const AssetCategory = z.enum(ASSET_CATEGORIES);
export type AssetCategory = z.infer<typeof AssetCategory>;

export const ASSET_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'RETIRED'] as const;
export const AssetStatus = z.enum(ASSET_STATUSES);
export type AssetStatus = z.infer<typeof AssetStatus>;

// ── Clients & sales ───────────────────────────────────────────────────────────

export const CLIENT_STATUSES = ['LEAD', 'ACTIVE', 'DORMANT'] as const;
export const ClientStatus = z.enum(CLIENT_STATUSES);
export type ClientStatus = z.infer<typeof ClientStatus>;

export const INTERACTION_TYPES = ['CALL', 'EMAIL', 'MEETING', 'WHATSAPP', 'FEEDBACK'] as const;
export const InteractionType = z.enum(INTERACTION_TYPES);
export type InteractionType = z.infer<typeof InteractionType>;

export const LEAD_STAGES = [
  'INQUIRY',
  'DISCOVERY',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;
export const LeadStage = z.enum(LEAD_STAGES);
export type LeadStage = z.infer<typeof LeadStage>;

export const LEAD_SOURCES = ['WEBSITE', 'WHATSAPP', 'REFERRAL', 'INSTAGRAM', 'LINKEDIN'] as const;
export const LeadSource = z.enum(LEAD_SOURCES);
export type LeadSource = z.infer<typeof LeadSource>;

// ── Finance (demonstration data) ──────────────────────────────────────────────

export const FINANCE_KINDS = ['INCOME', 'EXPENSE'] as const;
export const FinanceKind = z.enum(FINANCE_KINDS);
export type FinanceKind = z.infer<typeof FinanceKind>;

export const FINANCE_CATEGORIES = [
  'ADVANCE',
  'MILESTONE',
  'FINAL_PAYMENT',
  'CREW',
  'EQUIPMENT_RENTAL',
  'LOCATION',
  'TRAVEL',
  'SOFTWARE',
  'MARKETING',
  'OVERHEAD',
  'CONSUMABLES',
  'POST_PRODUCTION',
  'MAINTENANCE',
] as const;
export const FinanceCategory = z.enum(FINANCE_CATEGORIES);
export type FinanceCategory = z.infer<typeof FinanceCategory>;

// ── System ────────────────────────────────────────────────────────────────────

export const ACTIVITY_SOURCES = ['UI', 'ASSISTANT', 'SYSTEM'] as const;
export const ActivitySource = z.enum(ACTIVITY_SOURCES);
export type ActivitySource = z.infer<typeof ActivitySource>;

export const ENTITY_TYPES = [
  'project',
  'task',
  'deliverable',
  'approval',
  'shoot',
  'asset',
  'member',
  'client',
  'lead',
  'finance',
  'workflow',
  'user',
  'role',
  'approval_request',
  'expense',
  'invoice',
  'payment',
  'vendor',
  'purchase_request',
  'purchase_order',
  'stock',
  'studio',
  'studio_booking',
  'document',
  'leave',
  'attendance',
  'employee',
  'department',
  'milestone',
  'risk',
  'contact',
] as const;
export const EntityType = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityType>;

export const ASSISTANT_ACTION_STATUSES = [
  'PROPOSED',
  'CONFIRMED',
  'CANCELLED',
  'FAILED',
  'STALE',
] as const;
export const AssistantActionStatus = z.enum(ASSISTANT_ACTION_STATUSES);
export type AssistantActionStatus = z.infer<typeof AssistantActionStatus>;
