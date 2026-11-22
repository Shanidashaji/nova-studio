/**
 * Flow metrics for the Pipeline Spine (Lean/Kanban practice):
 *  - WIP: projects currently in a stage;
 *  - dwell time: how long projects stayed in a stage on completed visits;
 *  - throughput: stage exits per week over a recent window;
 *  - constraint: the stage whose queue would take longest to clear at its current pace
 *    (Theory of Constraints — the pipeline moves at the speed of this stage).
 */
import type { StageKey } from '../constants/enums';
import { DAY_MS } from './time';

export interface StageVisit {
  stageKey: StageKey;
  enteredAt: Date;
  exitedAt: Date | null;
}

export interface StageFlow {
  key: StageKey;
  wip: number;
  avgDwellDays: number | null;
  throughputPerWeek: number;
  /** WIP ÷ throughput, in weeks; Infinity when work is waiting and nothing has left recently. */
  clearanceWeeks: number;
}

export function computeFlow(input: {
  stages: readonly StageKey[];
  visits: readonly StageVisit[];
  wip: Partial<Record<StageKey, number>>;
  now: Date;
  windowWeeks?: number;
}): { stages: StageFlow[]; constraint: StageKey | null } {
  const windowWeeks = input.windowWeeks ?? 4;
  const windowStart = input.now.getTime() - windowWeeks * 7 * DAY_MS;

  const stages = input.stages.map((key): StageFlow => {
    const done = input.visits.filter((v) => v.stageKey === key && v.exitedAt);
    const dwell = done.map((v) => (v.exitedAt!.getTime() - v.enteredAt.getTime()) / DAY_MS);
    const exits = done.filter((v) => v.exitedAt!.getTime() >= windowStart).length;
    const throughputPerWeek = exits / windowWeeks;
    const wip = input.wip[key] ?? 0;
    return {
      key,
      wip,
      avgDwellDays: dwell.length
        ? Math.round((dwell.reduce((a, b) => a + b, 0) / dwell.length) * 10) / 10
        : null,
      throughputPerWeek: Math.round(throughputPerWeek * 100) / 100,
      clearanceWeeks: wip === 0 ? 0 : throughputPerWeek === 0 ? Infinity : wip / throughputPerWeek,
    };
  });

  // Highest clearance time wins; ties go to the stage holding more work.
  const candidates = stages.filter((s) => s.wip > 0);
  const constraint =
    candidates.sort((a, b) => b.clearanceWeeks - a.clearanceWeeks || b.wip - a.wip)[0]?.key ?? null;
  return { stages, constraint };
}
