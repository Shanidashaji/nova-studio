import { describe, expect, it } from 'vitest';
import {
  computeProgress,
  evaluateBackwardTransition,
  evaluateForwardTransition,
  wouldCreateCycle,
  type StageSnapshot,
  type TaskSnapshot,
} from './workflow';

const stage = (
  id: string,
  order: number,
  status: StageSnapshot['status'],
  extra: Partial<StageSnapshot> = {},
): StageSnapshot => ({
  id,
  key: 'EDIT',
  label: id,
  order,
  status,
  requiresApproval: false,
  approved: false,
  ...extra,
});

const task = (id: string, stageId: string, status: TaskSnapshot['status'], blocking = true) => ({
  id,
  title: id,
  status,
  projectStageId: stageId,
  isStageBlocking: blocking,
});

describe('evaluateForwardTransition', () => {
  const stages = [
    stage('brief', 1, 'DONE'),
    stage('edit', 2, 'ACTIVE'),
    stage('review', 3, 'PENDING'),
  ];

  it('allows moving to the next stage when nothing blocks it', () => {
    const result = evaluateForwardTransition({
      projectStatus: 'ACTIVE',
      stages,
      tasks: [task('grade', 'edit', 'DONE')],
      targetStageId: 'review',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.to?.id).toBe('review');
  });

  it('names the open blocking tasks', () => {
    const result = evaluateForwardTransition({
      projectStatus: 'ACTIVE',
      stages,
      tasks: [task('grade', 'edit', 'IN_PROGRESS'), task('notes', 'edit', 'TODO', false)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.blockers).toHaveLength(1);
      expect(result.blockers[0]).toMatchObject({ code: 'OPEN_BLOCKING_TASKS', taskIds: ['grade'] });
    }
  });

  it('requires an approval when the stage demands one', () => {
    const result = evaluateForwardTransition({
      projectStatus: 'ACTIVE',
      stages: [
        stage('review', 1, 'ACTIVE', { requiresApproval: true }),
        stage('delivery', 2, 'PENDING'),
      ],
      tasks: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockers.map((b) => b.code)).toEqual(['APPROVAL_MISSING']);
  });

  it('rejects skipping ahead and skips SKIPPED stages when finding the next one', () => {
    const withSkip = [
      stage('a', 1, 'ACTIVE'),
      stage('b', 2, 'SKIPPED'),
      stage('c', 3, 'PENDING'),
      stage('d', 4, 'PENDING'),
    ];
    expect(
      evaluateForwardTransition({
        projectStatus: 'ACTIVE',
        stages: withSkip,
        tasks: [],
        targetStageId: 'c',
      }).ok,
    ).toBe(true);
    const jump = evaluateForwardTransition({
      projectStatus: 'ACTIVE',
      stages: withSkip,
      tasks: [],
      targetStageId: 'd',
    });
    expect(jump.ok).toBe(false);
    if (!jump.ok)
      expect(jump.blockers[0]).toMatchObject({ code: 'NOT_NEXT_STAGE', expectedStageId: 'c' });
  });

  it('blocks projects that are on hold', () => {
    const result = evaluateForwardTransition({ projectStatus: 'ON_HOLD', stages, tasks: [] });
    expect(result.ok).toBe(false);
  });

  it('completes the final stage with no target', () => {
    const result = evaluateForwardTransition({
      projectStatus: 'ACTIVE',
      stages: [stage('delivery', 1, 'ACTIVE')],
      tasks: [],
    });
    expect(result).toMatchObject({ ok: true, to: null });
  });
});

describe('evaluateBackwardTransition', () => {
  const stages = [stage('edit', 1, 'DONE'), stage('review', 2, 'ACTIVE')];

  it('requires a reason', () => {
    const result = evaluateBackwardTransition({ stages, targetStageId: 'edit', reason: ' ' });
    expect(result.ok).toBe(false);
  });

  it('allows sending work back with a reason', () => {
    const result = evaluateBackwardTransition({
      stages,
      targetStageId: 'edit',
      reason: 'Client asked for a new opening',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects moving "back" to a later stage', () => {
    const result = evaluateBackwardTransition({
      stages: [stage('edit', 1, 'ACTIVE'), stage('review', 2, 'PENDING')],
      targetStageId: 'review',
      reason: 'test',
    });
    expect(result.ok).toBe(false);
  });
});

describe('computeProgress', () => {
  it('counts done stages and the share of finished tasks in the active stage', () => {
    const stages = [
      stage('a', 1, 'DONE'),
      stage('b', 2, 'ACTIVE'),
      stage('c', 3, 'PENDING'),
      stage('d', 4, 'SKIPPED'),
    ];
    const tasks = [task('t1', 'b', 'DONE'), task('t2', 'b', 'TODO')];
    expect(computeProgress(stages, tasks)).toBeCloseTo(0.5);
  });
});

describe('wouldCreateCycle', () => {
  const edges = [
    { taskId: 'b', dependsOnId: 'a' },
    { taskId: 'c', dependsOnId: 'b' },
  ];
  it('detects direct and indirect cycles', () => {
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(true);
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
  });
  it('allows acyclic edges', () => {
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(false);
  });
});
