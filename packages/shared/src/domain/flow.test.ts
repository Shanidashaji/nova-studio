import { describe, expect, it } from 'vitest';
import { attentionScore, urgencyFromAge, urgencyFromDaysLeft } from './attention';
import { computeFlow } from './flow';
import { DAY_MS } from './time';

const now = new Date('2026-06-30T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);

describe('computeFlow', () => {
  it('computes dwell, throughput and the constraint stage', () => {
    const result = computeFlow({
      stages: ['EDIT', 'REVIEW'],
      now,
      wip: { EDIT: 3, REVIEW: 1 },
      visits: [
        { stageKey: 'EDIT', enteredAt: daysAgo(20), exitedAt: daysAgo(10) },
        { stageKey: 'EDIT', enteredAt: daysAgo(14), exitedAt: daysAgo(8) },
        { stageKey: 'EDIT', enteredAt: daysAgo(3), exitedAt: null },
        { stageKey: 'REVIEW', enteredAt: daysAgo(10), exitedAt: daysAgo(6) },
        { stageKey: 'REVIEW', enteredAt: daysAgo(8), exitedAt: daysAgo(5) },
        { stageKey: 'REVIEW', enteredAt: daysAgo(6), exitedAt: daysAgo(2) },
      ],
    });
    const edit = result.stages.find((s) => s.key === 'EDIT')!;
    expect(edit.avgDwellDays).toBe(8);
    expect(edit.throughputPerWeek).toBe(0.5);
    // EDIT: 3 / 0.5 = 6 weeks; REVIEW: 1 / 0.75 ≈ 1.3 weeks.
    expect(result.constraint).toBe('EDIT');
  });

  it('treats a stage with waiting work and no exits as the constraint', () => {
    const result = computeFlow({
      stages: ['SHOOT', 'EDIT'],
      now,
      wip: { SHOOT: 1, EDIT: 2 },
      visits: [{ stageKey: 'EDIT', enteredAt: daysAgo(9), exitedAt: daysAgo(1) }],
    });
    expect(result.stages.find((s) => s.key === 'SHOOT')!.clearanceWeeks).toBe(Infinity);
    expect(result.constraint).toBe('SHOOT');
  });

  it('has no constraint when the pipeline is empty', () => {
    expect(computeFlow({ stages: ['BRIEF'], now, wip: {}, visits: [] }).constraint).toBeNull();
  });
});

describe('attention scoring', () => {
  it('ranks late, critical, urgent work highest', () => {
    const top = attentionScore({
      severity: 'critical',
      urgency: urgencyFromDaysLeft(-2),
      priority: 'URGENT',
    });
    const mid = attentionScore({
      severity: 'warning',
      urgency: urgencyFromDaysLeft(5),
      priority: 'MEDIUM',
    });
    const low = attentionScore({ severity: 'info', urgency: urgencyFromAge(0), priority: 'LOW' });
    expect(top).toBe(100);
    expect(top).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(low);
  });
});
