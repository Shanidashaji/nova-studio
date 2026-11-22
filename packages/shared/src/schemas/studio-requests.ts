/** Request schemas of the production-studio layer (validated by the API, reused by web forms). */
import { z } from 'zod';
import { Priority, TaskStatus } from '../constants/enums';
import {
  AutomationMode,
  BudgetGroup,
  CreativeKind,
  FeedbackSource,
  FootageStatus,
  MessageChannel,
  MessageStatus,
  MessageTrigger,
  SceneSetting,
  SceneStatus,
  SceneTime,
  ShootLogKind,
  TalentBookingStatus,
  TalentKind,
} from '../constants/studio-enums';
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

/** A list typed as one comma-separated string in a form, or sent as an array. */
const tagList = (maxItems = 20) =>
  z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')))
    .pipe(
      z
        .array(z.string().trim().max(60))
        .transform((a) => [...new Set(a.filter(Boolean))])
        .pipe(z.array(z.string()).max(maxItems, `Use ${maxItems} items or fewer.`)),
    );

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const optionalEmail = z
  .union([
    z.literal('').transform(() => undefined),
    z.string().trim().email('Enter a valid email.'),
  ])
  .optional();
const optionalUrl = z
  .union([z.literal('').transform(() => undefined), z.string().trim().url('Enter a full URL.')])
  .optional();
const optionalWhole = (min: number, max: number) =>
  z.union([z.literal('').transform(() => undefined), wholeNumber(min, max)]).optional();

// ── Talent ────────────────────────────────────────────────────────────────────

const TalentFields = z.object({
  name: text(120),
  kind: TalentKind,
  email: optionalEmail,
  phone: optionalText(30),
  agency: optionalText(120),
  skills: tagList(),
  languages: tagList(10),
  playingAgeMin: optionalWhole(0, 99),
  playingAgeMax: optionalWhole(0, 99),
  experienceYears: wholeNumber(0, 70),
  baseCity: text(60),
  willTravel: z.boolean().default(true),
  dayRate: rupees(),
  portfolioUrl: optionalUrl,
  notes: optionalText(1000),
});
const ageRange = (v: { playingAgeMin?: number; playingAgeMax?: number }) =>
  v.playingAgeMin === undefined ||
  v.playingAgeMax === undefined ||
  v.playingAgeMax >= v.playingAgeMin;

export const CreateTalent = TalentFields.refine(ageRange, {
  message: 'The upper age must not be below the lower age.',
  path: ['playingAgeMax'],
});
export type CreateTalent = z.infer<typeof CreateTalent>;

export const UpdateTalent = TalentFields.partial()
  .extend({ isActive: z.boolean().optional() })
  .refine(ageRange, {
    message: 'The upper age must not be below the lower age.',
    path: ['playingAgeMax'],
  });
export type UpdateTalent = z.infer<typeof UpdateTalent>;

export const TalentQuery = z.object({
  q: z.string().trim().max(100).optional(),
  kind: TalentKind.optional(),
  /** Only artists free for the whole window. */
  freeFrom: optionalDate,
  freeTo: optionalDate,
  includeInactive: z.enum(['true', 'false']).optional(),
});
export type TalentQuery = z.infer<typeof TalentQuery>;

export const AddUnavailability = z
  .object({ from: date, to: date, reason: optionalText(200) })
  .refine((v) => v.to >= v.from, {
    message: 'The end must be on or after the start.',
    path: ['to'],
  });
export type AddUnavailability = z.infer<typeof AddUnavailability>;

export const BookTalent = z.object({
  talentId: Id,
  character: text(80),
  fee: rupees().optional(),
  status: z.enum(['HOLD', 'CONFIRMED']).default('HOLD'),
  note: optionalText(300),
  allowOverlap: z.boolean().default(false),
});
export type BookTalent = z.infer<typeof BookTalent>;

export const UpdateTalentBooking = z
  .object({
    status: TalentBookingStatus,
    character: text(80),
    fee: rupees(),
    note: optionalText(300),
  })
  .partial();
export type UpdateTalentBooking = z.infer<typeof UpdateTalentBooking>;

// ── Recommendations ───────────────────────────────────────────────────────────

export const TalentRecommendationQuery = z.object({
  shootId: Id,
  role: text(80),
  description: optionalText(300),
  age: optionalWhole(0, 99),
  language: optionalText(30),
});
export type TalentRecommendationQuery = z.infer<typeof TalentRecommendationQuery>;

export const CrewRecommendationQuery = z.object({ shootId: Id, role: text(80) });
export type CrewRecommendationQuery = z.infer<typeof CrewRecommendationQuery>;

// ── Creative documents and scenes ─────────────────────────────────────────────

export const ScriptQuery = z.object({
  projectId: Id.optional(),
  kind: CreativeKind.optional(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED']).optional(),
});
export type ScriptQuery = z.infer<typeof ScriptQuery>;

export const CreateScript = z.object({
  projectId: Id,
  kind: CreativeKind.default('SCRIPT'),
  title: text(140),
  body: text(200_000),
  fileName: optionalText(200),
  clientInstructions: optionalText(2000),
  notes: optionalText(2000),
});
export type CreateScript = z.infer<typeof CreateScript>;

export const UpdateScript = z
  .object({
    title: text(140),
    clientInstructions: optionalText(2000),
    notes: optionalText(2000),
  })
  .partial();
export type UpdateScript = z.infer<typeof UpdateScript>;

export const AddScriptVersion = z.object({
  body: text(200_000),
  changeNote: optionalText(300),
  fileName: optionalText(200),
});
export type AddScriptVersion = z.infer<typeof AddScriptVersion>;

export const SubmitScript = z.object({ note: optionalText(500) });
export type SubmitScript = z.infer<typeof SubmitScript>;

export const DecideScript = z.object({
  status: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']),
  note: optionalText(1000),
  /** Who decided, e.g. the client contact who replied (defaults to the signed-in user). */
  decidedBy: optionalText(120),
});
export type DecideScript = z.infer<typeof DecideScript>;

const SceneFields = z.object({
  number: text(10),
  heading: text(200),
  description: optionalText(1000),
  setting: SceneSetting.default('INT'),
  timeOfDay: SceneTime.default('DAY'),
  location: optionalText(200),
  characters: tagList(),
  props: tagList(30),
  wardrobe: tagList(),
  equipment: tagList(),
  requirements: optionalText(1000),
  estimatedMinutes: wholeNumber(0, 1440).default(60),
  notes: optionalText(1000),
});

export const CreateScene = SceneFields.extend({
  projectId: Id,
  scriptId: optionalId,
});
export type CreateScene = z.infer<typeof CreateScene>;

export const UpdateScene = SceneFields.partial().extend({
  /** null unschedules the scene. */
  shootId: z.union([Id, z.null(), z.literal('').transform(() => null)]).optional(),
  shootDate: z.union([date, z.null(), z.literal('').transform(() => null)]).optional(),
  plannedStart: z.union([hhmm, z.null(), z.literal('').transform(() => null)]).optional(),
  status: SceneStatus.optional(),
  sortOrder: wholeNumber(0, 10_000).optional(),
});
export type UpdateScene = z.infer<typeof UpdateScene>;

export const SceneQuery = z.object({ projectId: Id.optional(), shootId: Id.optional() });
export type SceneQuery = z.infer<typeof SceneQuery>;

export const ApplyBreakdown = z.object({
  /** Replace the scenes of this script that came from an earlier rule-based breakdown. */
  replace: z.boolean().default(false),
  scenes: z
    .array(
      SceneFields.pick({
        number: true,
        heading: true,
        description: true,
        setting: true,
        timeOfDay: true,
        location: true,
        characters: true,
        props: true,
        equipment: true,
        requirements: true,
        estimatedMinutes: true,
      }),
    )
    .min(1, 'Choose at least one scene.')
    .max(200),
});
export type ApplyBreakdown = z.infer<typeof ApplyBreakdown>;

// ── Shoot day ─────────────────────────────────────────────────────────────────

export const UpdateShootProduction = z
  .object({
    productionManagerId: z.union([Id, z.null(), z.literal('').transform(() => null)]),
    crewCallTime: z.union([hhmm, z.null(), z.literal('').transform(() => null)]),
    callSheetNotes: optionalText(2000),
    footageStatus: FootageStatus,
    wrapNotes: optionalText(2000),
  })
  .partial();
export type UpdateShootProduction = z.infer<typeof UpdateShootProduction>;

export const AddChecklistItem = z.object({ label: text(120) });
export type AddChecklistItem = z.infer<typeof AddChecklistItem>;

export const ToggleChecklistItem = z.object({ done: z.boolean() });
export type ToggleChecklistItem = z.infer<typeof ToggleChecklistItem>;

export const AddShootLog = z.object({
  kind: ShootLogKind,
  body: text(1000),
  minutesLost: wholeNumber(0, 1440).default(0),
});
export type AddShootLog = z.infer<typeof AddShootLog>;

export const ResolveShootLog = z.object({ resolved: z.boolean() });
export type ResolveShootLog = z.infer<typeof ResolveShootLog>;

export const ShootDayQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
});
export type ShootDayQuery = z.infer<typeof ShootDayQuery>;

// ── Client communication ──────────────────────────────────────────────────────

export const MessageQuery = z.object({
  status: MessageStatus.optional(),
  clientId: Id.optional(),
  projectId: Id.optional(),
  trigger: MessageTrigger.optional(),
});
export type MessageQuery = z.infer<typeof MessageQuery>;

export const ComposeMessage = z.object({
  clientId: Id,
  projectId: optionalId,
  shootId: optionalId,
  /** Start from this template's text; subject/body below override it. */
  trigger: MessageTrigger.default('MANUAL'),
  channel: MessageChannel.default('EMAIL'),
  recipientName: text(120),
  recipientAddress: optionalText(200),
  subject: text(200),
  body: text(10_000),
  scheduledFor: optionalDate,
});
export type ComposeMessage = z.infer<typeof ComposeMessage>;

export const UpdateMessage = z
  .object({
    channel: MessageChannel,
    recipientName: text(120),
    recipientAddress: optionalText(200),
    subject: text(200),
    body: text(10_000),
    scheduledFor: z.union([date, z.null(), z.literal('').transform(() => null)]),
  })
  .partial();
export type UpdateMessage = z.infer<typeof UpdateMessage>;

export const PreviewMessage = z.object({
  trigger: MessageTrigger,
  clientId: optionalId,
  projectId: optionalId,
  shootId: optionalId,
  /** Preview unsaved template text instead of the stored template. */
  subject: optionalText(200),
  body: optionalText(10_000),
});
export type PreviewMessage = z.infer<typeof PreviewMessage>;

export const UpdateTemplate = z
  .object({
    name: text(120),
    channel: MessageChannel,
    subject: text(200),
    body: text(10_000),
    mode: AutomationMode,
    offsetHours: wholeNumber(-720, 720),
  })
  .partial();
export type UpdateTemplate = z.infer<typeof UpdateTemplate>;

// ── Budget plan ───────────────────────────────────────────────────────────────

export const CreateBudgetLine = z.object({
  group: BudgetGroup,
  label: text(120),
  estimated: rupees(),
  note: optionalText(300),
});
export type CreateBudgetLine = z.infer<typeof CreateBudgetLine>;

export const UpdateBudgetLine = CreateBudgetLine.partial();
export type UpdateBudgetLine = z.infer<typeof UpdateBudgetLine>;

// ── Post-production ───────────────────────────────────────────────────────────

export const UpdatePostProduction = z
  .object({
    editorId: z.union([Id, z.null(), z.literal('').transform(() => null)]),
    editProgress: wholeNumber(0, 100),
  })
  .partial();
export type UpdatePostProduction = z.infer<typeof UpdatePostProduction>;

export const InternalReviewAction = z.object({
  action: z.enum(['REQUEST', 'APPROVE', 'CHANGES']),
  note: optionalText(1000),
});
export type InternalReviewAction = z.infer<typeof InternalReviewAction>;

/** Feedback with its origin (the existing AddFeedback plus `source`). */
export const FeedbackSourceField = z.object({ source: FeedbackSource.default('CLIENT') });

// ── Tasks board, capacity, reports ────────────────────────────────────────────

export const TaskBoardQuery = z.object({
  projectId: Id.optional(),
  assigneeId: Id.optional(),
  status: TaskStatus.optional(),
  priority: Priority.optional(),
  q: z.string().trim().max(100).optional(),
  /** Only overdue or blocked tasks. */
  flag: z.enum(['overdue', 'blocked']).optional(),
  includeDone: z.enum(['true', 'false']).optional(),
});
export type TaskBoardQuery = z.infer<typeof TaskBoardQuery>;

export const CapacityQuery = z.object({ from: optionalDate, days: wholeNumber(7, 90).optional() });
export type CapacityQuery = z.infer<typeof CapacityQuery>;

export const NotificationListQuery = z.object({
  filter: z.enum(['all', 'unread', 'resolved', 'open']).default('all'),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuery>;
