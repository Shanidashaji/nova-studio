/**
 * Workflow transition rules. Pure functions: the API enforces them,
 * the web app uses them to explain why a stage cannot advance yet.
 */
import type { ProjectStatus, StageKey, StageStatus, TaskStatus } from '../constants/enums';

export interface StageSnapshot {
  id: string;
  key: StageKey;
  label: string;
  order: number;
  status: StageStatus;
  requiresApproval: boolean;
  /** True when an APPROVED approval exists for this project stage. */
  approved: boolean;
}

export interface TaskSnapshot {
  id: string;
  title: string;
  status: TaskStatus;
  projectStageId: string | null;
  isStageBlocking: boolean;
}

export type TransitionBlocker =
  | { code: 'PROJECT_NOT_ACTIVE'; message: string }
  | { code: 'NO_ACTIVE_STAGE'; message: string }
  | { code: 'ALREADY_FINAL_STAGE'; message: string }
  | { code: 'NOT_NEXT_STAGE'; message: string; expectedStageId: string }
  | { code: 'OPEN_BLOCKING_TASKS'; message: string; taskIds: string[] }
  | { code: 'APPROVAL_MISSING'; message: string; stageId: string }
  | { code: 'REASON_REQUIRED'; message: string }
  | { code: 'NOT_EARLIER_STAGE'; message: string };

export type TransitionEvaluation =
  | { ok: true; from: StageSnapshot; to: StageSnapshot | null }
  | { ok: false; blockers: TransitionBlocker[] };

const sortStages = (stages: readonly StageSnapshot[]) =>
  [...stages].sort((a, b) => a.order - b.order);

/** The stage the project is currently working in (ACTIVE or BLOCKED). */
export function currentStage(stages: readonly StageSnapshot[]): StageSnapshot | null {
  return sortStages(stages).find((s) => s.status === 'ACTIVE' || s.status === 'BLOCKED') ?? null;
}

/** The next stage after `from` that has not been skipped, or null at the end of the pipeline. */
export function nextStage(
  stages: readonly StageSnapshot[],
  from: StageSnapshot,
): StageSnapshot | null {
  return sortStages(stages).find((s) => s.order > from.order && s.status !== 'SKIPPED') ?? null;
}

/**
 * Can the project leave its current stage? When `targetStageId` is given it must be the next stage.
 * Completing the final stage (Delivery) is a valid transition with `to: null`.
 */
export function evaluateForwardTransition(input: {
  projectStatus: ProjectStatus;
  stages: readonly StageSnapshot[];
  tasks: readonly TaskSnapshot[];
  targetStageId?: string;
}): TransitionEvaluation {
  const blockers: TransitionBlocker[] = [];

  if (input.projectStatus !== 'ACTIVE') {
    blockers.push({
      code: 'PROJECT_NOT_ACTIVE',
      message: `The project is ${input.projectStatus.toLowerCase().replace('_', ' ')}.`,
    });
  }

  const from = currentStage(input.stages);
  if (!from) {
    blockers.push({ code: 'NO_ACTIVE_STAGE', message: 'The project has no active stage.' });
    return { ok: false, blockers };
  }

  const to = nextStage(input.stages, from);
  if (input.targetStageId !== undefined) {
    if (!to) {
      blockers.push({
        code: 'ALREADY_FINAL_STAGE',
        message: `${from.label} is the final stage.`,
      });
    } else if (to.id !== input.targetStageId) {
      blockers.push({
        code: 'NOT_NEXT_STAGE',
        message: `Projects move one stage at a time; the next stage is ${to.label}.`,
        expectedStageId: to.id,
      });
    }
  }

  const openBlocking = input.tasks.filter(
    (t) => t.projectStageId === from.id && t.isStageBlocking && t.status !== 'DONE',
  );
  if (openBlocking.length > 0) {
    const names = openBlocking.map((t) => t.title);
    blockers.push({
      code: 'OPEN_BLOCKING_TASKS',
      message: `${openBlocking.length} blocking task${openBlocking.length > 1 ? 's' : ''} still open: ${names.join(', ')}.`,
      taskIds: openBlocking.map((t) => t.id),
    });
  }

  if (from.requiresApproval && !from.approved) {
    blockers.push({
      code: 'APPROVAL_MISSING',
      message: `${from.label} needs an approval before the project can move on.`,
      stageId: from.id,
    });
  }

  return blockers.length > 0 ? { ok: false, blockers } : { ok: true, from, to };
}

/** Sending work back to an earlier stage (e.g. Review → Edit) requires a reason. */
export function evaluateBackwardTransition(input: {
  /** When given, the project must be active — the same rule as moving forward. */
  projectStatus?: ProjectStatus;
  stages: readonly StageSnapshot[];
  targetStageId: string;
  reason: string | undefined;
}): TransitionEvaluation {
  const blockers: TransitionBlocker[] = [];
  if (input.projectStatus && input.projectStatus !== 'ACTIVE') {
    blockers.push({
      code: 'PROJECT_NOT_ACTIVE',
      message: `The project is ${input.projectStatus.toLowerCase().replace('_', ' ')}.`,
    });
  }
  const from = currentStage(input.stages);
  if (!from) {
    return {
      ok: false,
      blockers: [{ code: 'NO_ACTIVE_STAGE', message: 'The project has no active stage.' }],
    };
  }
  const to = input.stages.find((s) => s.id === input.targetStageId);
  if (!to || to.order >= from.order || to.status === 'SKIPPED') {
    blockers.push({
      code: 'NOT_EARLIER_STAGE',
      message: 'Work can only be sent back to an earlier, non-skipped stage.',
    });
  }
  if (!input.reason || input.reason.trim().length < 3) {
    blockers.push({
      code: 'REASON_REQUIRED',
      message: 'Explain why the work is being sent back.',
    });
  }
  return blockers.length > 0 || !to ? { ok: false, blockers } : { ok: true, from, to };
}

/**
 * Overall progress between 0 and 1: completed stages count fully, the current stage counts
 * by the share of its tasks that are done.
 */
export function computeProgress(
  stages: readonly StageSnapshot[],
  tasks: readonly TaskSnapshot[],
): number {
  const counted = stages.filter((s) => s.status !== 'SKIPPED');
  if (counted.length === 0) return 0;
  let units = counted.filter((s) => s.status === 'DONE').length;
  const active = currentStage(stages);
  if (active) {
    const stageTasks = tasks.filter((t) => t.projectStageId === active.id);
    if (stageTasks.length > 0) {
      units += stageTasks.filter((t) => t.status === 'DONE').length / stageTasks.length;
    }
  }
  return Math.min(1, units / counted.length);
}

/** Detects whether adding `taskId → dependsOnId` would create a dependency cycle. */
export function wouldCreateCycle(
  edges: readonly { taskId: string; dependsOnId: string }[],
  taskId: string,
  dependsOnId: string,
): boolean {
  if (taskId === dependsOnId) return true;
  const graph = new Map<string, string[]>();
  for (const e of edges) graph.set(e.taskId, [...(graph.get(e.taskId) ?? []), e.dependsOnId]);
  // A cycle appears if `taskId` is reachable from `dependsOnId`.
  const stack = [dependsOnId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === taskId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(graph.get(node) ?? []));
  }
  return false;
}
