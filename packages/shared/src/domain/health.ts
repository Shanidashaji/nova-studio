/**
 * Project health — a deterministic, explainable heuristic (labelled "NOVA estimate" in the UI).
 * See docs/architecture/02-domain-model.md for the rationale behind each deduction.
 */
import { daysBetween, daysOverdue } from './time';

export interface HealthInput {
  now: Date;
  startDate: Date;
  dueDate: Date;
  delivered: boolean;
  /** 0..1 — from computeProgress(). */
  progress: number;
  blockedTaskCount: number;
  /** Age in days of each pending client approval. */
  pendingClientApprovalAges: number[];
  budget: number;
  spent: number;
  revisionsBeyondScope: number;
}

export type HealthBand = 'ON_TRACK' | 'AT_RISK' | 'CRITICAL';

export interface HealthDeduction {
  code:
    | 'OVERDUE'
    | 'SCHEDULE_SLIP'
    | 'BLOCKED_TASKS'
    | 'APPROVAL_WAITING'
    | 'BUDGET_BURN'
    | 'EXTRA_REVISIONS';
  label: string;
  points: number;
}

export interface HealthResult {
  score: number;
  band: HealthBand;
  deductions: HealthDeduction[];
}

export const HEALTH_BAND_LABELS: Record<HealthBand, string> = {
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  CRITICAL: 'Critical',
};

export function bandFor(score: number): HealthBand {
  if (score >= 75) return 'ON_TRACK';
  if (score >= 50) return 'AT_RISK';
  return 'CRITICAL';
}

const pct = (n: number) => Math.round(n * 100);

export function computeHealth(input: HealthInput): HealthResult {
  if (input.delivered) return { score: 100, band: 'ON_TRACK', deductions: [] };

  const deductions: HealthDeduction[] = [];
  const daysLate = daysOverdue(input.dueDate, input.now);
  const daysLeft = daysBetween(input.now, input.dueDate);

  if (daysLate > 0) {
    deductions.push({
      code: 'OVERDUE',
      label: `${daysLate} day${daysLate > 1 ? 's' : ''} past the due date`,
      points: Math.min(45, 15 + daysLate * 5),
    });
  } else {
    const total = Math.max(1, daysBetween(input.startDate, input.dueDate));
    const elapsed = Math.min(1, Math.max(0, daysBetween(input.startDate, input.now) / total));
    const gap = elapsed - input.progress;
    if (gap > 0.15) {
      deductions.push({
        code: 'SCHEDULE_SLIP',
        label: `${pct(elapsed)}% of the schedule used, ${pct(input.progress)}% of the work done`,
        points: Math.min(20, Math.round(gap * 50)),
      });
    }
  }

  if (input.blockedTaskCount > 0) {
    deductions.push({
      code: 'BLOCKED_TASKS',
      label: `${input.blockedTaskCount} blocked task${input.blockedTaskCount > 1 ? 's' : ''}`,
      points: Math.min(24, input.blockedTaskCount * 8),
    });
  }

  const stale = input.pendingClientApprovalAges.filter((age) => age > 2);
  if (stale.length > 0) {
    const oldest = Math.max(...stale);
    // Waiting matters more when delivery is close: points double within three days of the due date.
    const base = stale.reduce((n, age) => n + 6 + 2 * (age - 2), 0);
    const nearDue = daysLeft <= 3;
    deductions.push({
      code: 'APPROVAL_WAITING',
      label: `${stale.length} client approval${stale.length > 1 ? 's' : ''} waiting (oldest ${oldest} days)${nearDue ? ' with delivery due soon' : ''}`,
      points: Math.min(30, nearDue ? base * 2 : base),
    });
  }

  if (input.budget > 0) {
    const burn = input.spent / input.budget;
    const overshoot = burn - input.progress;
    if (overshoot > 0.15) {
      deductions.push({
        code: 'BUDGET_BURN',
        label: `${pct(burn)}% of budget spent at ${pct(input.progress)}% progress`,
        points: Math.min(20, Math.round((overshoot - 0.15) * 100)),
      });
    }
  }

  if (input.revisionsBeyondScope > 0) {
    deductions.push({
      code: 'EXTRA_REVISIONS',
      label: `${input.revisionsBeyondScope} revision round${input.revisionsBeyondScope > 1 ? 's' : ''} beyond scope`,
      points: input.revisionsBeyondScope * 5,
    });
  }

  const score = Math.max(0, 100 - deductions.reduce((sum, d) => sum + d.points, 0));
  return { score, band: bandFor(score), deductions };
}
