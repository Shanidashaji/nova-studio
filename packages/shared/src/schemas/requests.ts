/** Request schemas: validated by the API (ZodValidationPipe) and reused by web forms. */
import { z } from 'zod';
import {
  ApprovalStatus,
  AssetStatus,
  FinanceCategory,
  FinanceKind,
  InteractionType,
  LeadSource,
  LeadStage,
  Priority,
  ProjectStatus,
  ProjectType,
  ShootStatus,
  StageKey,
  StudioLocation,
  TaskStatus,
} from '../constants/enums';
import {
  Id,
  date,
  optionalDate,
  optionalId,
  optionalText,
  rupees,
  text,
  wholeNumber,
} from './common';

// ── Projects ──────────────────────────────────────────────────────────────────

export const ProjectListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  stage: StageKey.optional(),
  clientId: Id.optional(),
  memberId: Id.optional(),
  status: z.enum(['ACTIVE', 'DELIVERED', 'ALL']).default('ACTIVE'),
  health: z.enum(['ON_TRACK', 'AT_RISK', 'CRITICAL']).optional(),
  sort: z.enum(['due', 'health', 'progress', 'title', 'budget']).default('due'),
});
export type ProjectListQuery = z.infer<typeof ProjectListQuery>;

export const CreateProject = z
  .object({
    title: text(120),
    logline: optionalText(300),
    clientId: Id,
    type: ProjectType,
    workflowTemplateId: Id,
    priority: Priority.default('MEDIUM'),
    location: StudioLocation,
    startDate: date,
    dueDate: date,
    budget: rupees(),
    includedRevisions: z.coerce.number().int().min(0).max(10).default(2),
    aiAssisted: z.boolean().default(false),
  })
  .refine((v) => v.dueDate > v.startDate, {
    message: 'The due date must be after the start date.',
    path: ['dueDate'],
  });
export type CreateProject = z.infer<typeof CreateProject>;

export const UpdateProject = z
  .object({
    title: text(120),
    logline: optionalText(300),
    /** DELIVERED is reached only by completing the last workflow stage, never by an edit. */
    status: ProjectStatus.exclude(['DELIVERED']),
    priority: Priority,
    dueDate: date,
    budget: rupees(),
  })
  .partial();
export type UpdateProject = z.infer<typeof UpdateProject>;

export const TransitionRequest = z.discriminatedUnion('direction', [
  z.object({ direction: z.literal('FORWARD'), targetStageId: Id.optional() }),
  z.object({ direction: z.literal('BACKWARD'), targetStageId: Id, reason: text(300) }),
]);
export type TransitionRequest = z.infer<typeof TransitionRequest>;

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const CreateTask = z.object({
  projectId: Id,
  projectStageId: optionalId,
  title: text(160),
  description: optionalText(2000),
  assigneeId: optionalId,
  priority: Priority.default('MEDIUM'),
  dueDate: optionalDate,
  estimateHours: z
    .union([z.literal('').transform(() => undefined), wholeNumber(0, 200)])
    .optional(),
  isStageBlocking: z.boolean().default(false),
  /** Makes this a subtask (one level deep). */
  parentId: optionalId,
  /** The shoot this task prepares for or follows up (same project). */
  shootId: optionalId,
});
export type CreateTask = z.infer<typeof CreateTask>;

export const UpdateTask = z
  .object({
    title: text(160),
    description: optionalText(2000),
    assigneeId: Id.nullable(),
    status: TaskStatus,
    priority: Priority,
    dueDate: date.nullable(),
    estimateHours: z.coerce.number().int().min(0).max(200).nullable(),
    isStageBlocking: z.boolean(),
    blockedReason: optionalText(300),
    shootId: Id.nullable(),
  })
  .partial();
export type UpdateTask = z.infer<typeof UpdateTask>;

export const AddDependency = z.object({ dependsOnId: Id });
export type AddDependency = z.infer<typeof AddDependency>;

// ── Deliverables & approvals ──────────────────────────────────────────────────

export const SendForReview = z.object({
  note: optionalText(300),
  /** Review deadline for the client (default: three days). */
  dueAt: optionalDate,
});
export type SendForReview = z.infer<typeof SendForReview>;

export const ApprovalDecision = z.object({
  status: ApprovalStatus.exclude(['PENDING']),
  note: optionalText(500),
  decidedBy: optionalText(120),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export const AddFeedback = z.object({
  timecode: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{2}:\d{2}$/, 'Use HH:MM:SS:FF')
    .optional(),
  body: text(1000),
  author: text(120),
  /** Client note or internal review note. */
  source: z.enum(['CLIENT', 'INTERNAL']).default('CLIENT'),
});
export type AddFeedback = z.infer<typeof AddFeedback>;

export const ResolveFeedback = z.object({ status: z.enum(['OPEN', 'RESOLVED']) });

// ── Shoots & resources ────────────────────────────────────────────────────────

export const RangeQuery = z
  .object({ from: optionalDate, to: optionalDate })
  .refine((v) => !v.from || !v.to || v.to >= v.from, {
    message: 'The range must end after it starts.',
    path: ['to'],
  });

/** A 24-hour clock time, 00:00–23:59. */
const callTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
export type RangeQuery = z.infer<typeof RangeQuery>;

export const CreateShoot = z
  .object({
    projectId: Id,
    title: text(120),
    location: text(200),
    city: StudioLocation,
    startsAt: date,
    endsAt: date,
    callTime: callTime.optional().or(z.literal('').transform(() => undefined)),
    notes: optionalText(1000),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'The shoot must end after it starts.',
    path: ['endsAt'],
  });
export type CreateShoot = z.infer<typeof CreateShoot>;

export const UpdateShoot = z
  .object({
    title: text(120),
    location: text(200),
    startsAt: date,
    endsAt: date,
    callTime,
    status: ShootStatus,
    notes: optionalText(1000),
  })
  .partial();
export type UpdateShoot = z.infer<typeof UpdateShoot>;

export const BookAsset = z.object({ assetId: Id, allowOverlap: z.boolean().default(false) });
export type BookAsset = z.infer<typeof BookAsset>;

export const CallCrew = z.object({
  teamMemberId: Id,
  role: text(60),
  allowOverlap: z.boolean().default(false),
});
export type CallCrew = z.infer<typeof CallCrew>;

export const UpdateAsset = z.object({ status: AssetStatus, notes: optionalText(300) }).partial();
export type UpdateAsset = z.infer<typeof UpdateAsset>;

// ── Clients & sales ───────────────────────────────────────────────────────────

export const CreateClient = z.object({
  name: text(120),
  industry: text(80),
  city: text(80),
  contactName: optionalText(120),
  contactEmail: z
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  contactPhone: optionalText(40),
});
export type CreateClient = z.infer<typeof CreateClient>;

export const LogInteraction = z.object({
  type: InteractionType,
  summary: text(1000),
  projectId: optionalId,
  occurredAt: optionalDate,
});
export type LogInteraction = z.infer<typeof LogInteraction>;

export const CreateLead = z
  .object({
    title: text(120),
    clientId: optionalId,
    prospectName: optionalText(120),
    projectType: ProjectType,
    estimatedValue: rupees(),
    source: LeadSource,
    expectedCloseDate: optionalDate,
  })
  .refine((v) => v.clientId || v.prospectName, {
    message: 'Choose a client or enter a prospect name.',
    path: ['prospectName'],
  });
export type CreateLead = z.infer<typeof CreateLead>;

export const UpdateLead = z
  .object({
    stage: LeadStage,
    estimatedValue: rupees(),
    expectedCloseDate: date.nullable(),
    notes: optionalText(1000),
  })
  .partial();
export type UpdateLead = z.infer<typeof UpdateLead>;

// ── Finance ───────────────────────────────────────────────────────────────────

export const CreateFinanceRecord = z.object({
  projectId: optionalId,
  kind: FinanceKind,
  category: FinanceCategory,
  amount: rupees(1),
  occurredOn: date,
  note: optionalText(300),
});
export type CreateFinanceRecord = z.infer<typeof CreateFinanceRecord>;

// ── Workflow templates ────────────────────────────────────────────────────────

export const UpdateStageDefinition = z
  .object({
    label: text(40),
    expectedDays: wholeNumber(1, 120),
    requiresApproval: z.boolean(),
    skippable: z.boolean(),
    exitCriteria: z.array(text(160)).max(8),
  })
  .partial();
export type UpdateStageDefinition = z.infer<typeof UpdateStageDefinition>;

export const CreateWorkflowTemplate = z.object({
  name: text(60),
  description: optionalText(200),
  basedOnId: Id,
});
export type CreateWorkflowTemplate = z.infer<typeof CreateWorkflowTemplate>;

// ── Activity & search ─────────────────────────────────────────────────────────

export const ActivityQuery = z.object({
  projectId: Id.optional(),
  entityType: z.string().max(30).optional(),
  entityId: Id.optional(),
  source: z.enum(['UI', 'ASSISTANT', 'SYSTEM']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
export type ActivityQuery = z.infer<typeof ActivityQuery>;

export const SearchQuery = z.object({ q: z.string().trim().min(1).max(100) });
export type SearchQuery = z.infer<typeof SearchQuery>;

// ── Assistant ─────────────────────────────────────────────────────────────────

export const FocusContext = z
  .object({
    lens: z.string().max(30).optional(),
    focus: z
      .object({ type: z.string().max(20), id: z.string().max(64) })
      .nullable()
      .optional(),
    /** The entity open in the inspector, if any — "this project" refers to it. */
    inspect: z
      .object({ type: z.string().max(20), id: z.string().max(64) })
      .nullable()
      .optional(),
  })
  .optional();

export const AssistantMessageRequest = z.object({
  message: text(1000),
  context: FocusContext,
  /** How the message arrived: voice replies are kept shorter and easy to listen to. */
  channel: z.enum(['text', 'voice']).optional(),
  /**
   * BCP-47 tag of the speech recogniser's language, for voice messages. A hint only: the reply
   * follows the language the user actually used.
   */
  speechLanguage: z
    .string()
    .regex(/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*$/)
    .optional(),
});
export type AssistantMessageRequest = z.infer<typeof AssistantMessageRequest>;
