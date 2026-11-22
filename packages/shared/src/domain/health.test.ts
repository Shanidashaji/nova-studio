import { describe, expect, it } from 'vitest';
import { bandFor, computeHealth, type HealthInput } from './health';
import { findConflicts, clashesWith, utilisationBand } from './schedule';

const base: HealthInput = {
  now: new Date('2026-03-10'),
  startDate: new Date('2026-03-01'),
  dueDate: new Date('2026-03-21'),
  delivered: false,
  progress: 0.5,
  blockedTaskCount: 0,
  pendingClientApprovalAges: [],
  budget: 100_000,
  spent: 40_000,
  revisionsBeyondScope: 0,
};

describe('computeHealth', () => {
  it('scores a healthy project at 100', () => {
    expect(computeHealth(base)).toEqual({ score: 100, band: 'ON_TRACK', deductions: [] });
  });

  it('deducts 15 plus 5 per overdue day, capped at 45', () => {
    const twoDays = computeHealth({ ...base, now: new Date('2026-03-23') });
    expect(twoDays.deductions[0]).toMatchObject({ code: 'OVERDUE', points: 25 });
    const result = computeHealth({ ...base, now: new Date('2026-04-30') });
    expect(result.deductions[0]).toMatchObject({ code: 'OVERDUE', points: 45 });
    expect(result.score).toBe(55);
  });

  it('counts a few hours late as one day', () => {
    const result = computeHealth({
      ...base,
      now: new Date('2026-03-21T06:00:00Z'),
      dueDate: new Date('2026-03-21T00:00:00Z'),
    });
    expect(result.deductions[0]).toMatchObject({
      code: 'OVERDUE',
      label: '1 day past the due date',
    });
  });

  it('weighs waiting approvals double close to the due date', () => {
    const far = computeHealth({ ...base, pendingClientApprovalAges: [4] });
    const near = computeHealth({
      ...base,
      pendingClientApprovalAges: [4],
      now: new Date('2026-03-19'),
      progress: 0.9,
    });
    expect(far.deductions.find((d) => d.code === 'APPROVAL_WAITING')!.points).toBe(10);
    expect(near.deductions.find((d) => d.code === 'APPROVAL_WAITING')!.points).toBe(20);
  });

  it('explains every deduction and combines them', () => {
    const result = computeHealth({
      ...base,
      progress: 0.1,
      blockedTaskCount: 2,
      pendingClientApprovalAges: [1, 4],
      spent: 70_000,
    });
    expect(result.deductions.map((d) => d.code)).toEqual([
      'SCHEDULE_SLIP',
      'BLOCKED_TASKS',
      'APPROVAL_WAITING',
      'BUDGET_BURN',
    ]);
    // slip min(20, 0.35×50=18) + blocked 16 + approval (6 + 2×2 = 10) + burn min(20, 45) = 64
    expect(result.score).toBe(36);
    expect(result.band).toBe('CRITICAL');
  });

  it('treats delivered projects as healthy', () => {
    expect(computeHealth({ ...base, delivered: true, now: new Date('2027-01-01') }).score).toBe(
      100,
    );
  });

  it('maps scores to bands at the documented thresholds', () => {
    expect(bandFor(75)).toBe('ON_TRACK');
    expect(bandFor(74)).toBe('AT_RISK');
    expect(bandFor(50)).toBe('AT_RISK');
    expect(bandFor(49)).toBe('CRITICAL');
  });
});

describe('scheduling', () => {
  const bookings = [
    {
      id: '1',
      resourceId: 'cam-a',
      startsAt: '2026-03-10T06:00:00Z',
      endsAt: '2026-03-10T18:00:00Z',
    },
    {
      id: '2',
      resourceId: 'cam-a',
      startsAt: '2026-03-10T17:00:00Z',
      endsAt: '2026-03-11T02:00:00Z',
    },
    {
      id: '3',
      resourceId: 'cam-a',
      startsAt: '2026-03-11T02:00:00Z',
      endsAt: '2026-03-11T08:00:00Z',
    },
    {
      id: '4',
      resourceId: 'cam-b',
      startsAt: '2026-03-10T06:00:00Z',
      endsAt: '2026-03-10T18:00:00Z',
    },
  ];

  it('finds overlapping bookings of the same resource only', () => {
    expect(findConflicts(bookings)).toEqual([{ resourceId: 'cam-a', bookingIds: ['1', '2'] }]);
  });

  it('treats touching ranges as free', () => {
    expect(
      clashesWith(bookings, {
        resourceId: 'cam-a',
        startsAt: '2026-03-11T08:00:00Z',
        endsAt: '2026-03-11T10:00:00Z',
      }),
    ).toEqual([]);
  });

  it('classifies utilisation', () => {
    expect(utilisationBand(0.2)).toBe('AVAILABLE');
    expect(utilisationBand(0.7)).toBe('BALANCED');
    expect(utilisationBand(0.9)).toBe('STRETCHED');
    expect(utilisationBand(1.2)).toBe('OVERLOADED');
  });
});
