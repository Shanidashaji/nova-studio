/**
 * Attention ranking: severity × urgency × impact, scaled to 0–100.
 * Each surfaced item also carries a plain-language reason built by the API.
 */
import { PRIORITY_WEIGHT, type Priority } from '../constants/enums';

export type Severity = 'critical' | 'warning' | 'info';

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 1, warning: 0.65, info: 0.35 };

/** 1 when already late, rising as a deadline approaches within two weeks. */
export function urgencyFromDaysLeft(daysLeft: number): number {
  if (daysLeft <= 0) return 1;
  if (daysLeft >= 14) return 0.2;
  return Math.max(0.2, 1 - daysLeft / 14);
}

/** Older open items are more urgent; saturates after a week. */
export function urgencyFromAge(ageDays: number): number {
  return Math.min(1, 0.3 + Math.max(0, ageDays) / 10);
}

export function attentionScore(input: {
  severity: Severity;
  urgency: number;
  priority: Priority;
}): number {
  const impact = 0.55 + (PRIORITY_WEIGHT[input.priority] / 4) * 0.45;
  return Math.round(100 * SEVERITY_WEIGHT[input.severity] * input.urgency * impact);
}
