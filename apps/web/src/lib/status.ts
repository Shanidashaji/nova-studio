/** Maps domain states to visual tones and labels, in one place. */
import type {
  ApprovalStatus,
  DeliverableStatus,
  HealthBand,
  LeadStage,
  ShootStatus,
  StageStatus,
  TaskStatus,
  UtilisationBand,
} from '@nova/shared';
import type { Tone } from '@/components/ui/badge';

export const healthTone: Record<HealthBand, Tone> = {
  ON_TRACK: 'signal',
  AT_RISK: 'attention',
  CRITICAL: 'critical',
};

export const taskTone: Record<TaskStatus, Tone> = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  BLOCKED: 'critical',
  IN_REVIEW: 'attention',
  DONE: 'signal',
};

export const stageTone: Record<StageStatus, Tone> = {
  PENDING: 'neutral',
  ACTIVE: 'signal',
  BLOCKED: 'critical',
  DONE: 'signal',
  SKIPPED: 'neutral',
};

export const deliverableTone: Record<DeliverableStatus, Tone> = {
  PLANNED: 'neutral',
  IN_PROGRESS: 'info',
  IN_REVIEW: 'attention',
  CHANGES_REQUESTED: 'critical',
  APPROVED: 'signal',
  DELIVERED: 'signal',
};

export const approvalTone: Record<ApprovalStatus, Tone> = {
  PENDING: 'attention',
  APPROVED: 'signal',
  CHANGES_REQUESTED: 'critical',
};

export const shootTone: Record<ShootStatus, Tone> = {
  PLANNED: 'info',
  CONFIRMED: 'signal',
  WRAPPED: 'neutral',
  CANCELLED: 'neutral',
};

export const leadTone: Record<LeadStage, Tone> = {
  INQUIRY: 'neutral',
  DISCOVERY: 'info',
  PROPOSAL: 'info',
  NEGOTIATION: 'attention',
  WON: 'signal',
  LOST: 'neutral',
};

export const utilTone: Record<UtilisationBand, Tone> = {
  AVAILABLE: 'info',
  BALANCED: 'signal',
  STRETCHED: 'attention',
  OVERLOADED: 'critical',
};

export const toneText: Record<Tone, string> = {
  neutral: 'text-text-2',
  signal: 'text-signal',
  attention: 'text-attention',
  critical: 'text-critical',
  info: 'text-info',
  ai: 'text-ai',
};

export const toneBg: Record<Tone, string> = {
  neutral: 'bg-text-3',
  signal: 'bg-signal',
  attention: 'bg-attention',
  critical: 'bg-critical',
  info: 'bg-info',
  ai: 'bg-ai',
};
