export const DAY_MS = 24 * 60 * 60 * 1000;

const toTime = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d).getTime();

/** Whole days from `a` to `b` (positive when `b` is later), rounded down. */
export function daysBetween(a: Date | string, b: Date | string): number {
  return Math.floor((toTime(b) - toTime(a)) / DAY_MS);
}

/** Whole days `due` is overdue at `now`, rounded up (a few hours late counts as one day); 0 if not late. */
export function daysOverdue(due: Date | string, now: Date | string): number {
  const late = toTime(now) - toTime(due);
  return late > 0 ? Math.ceil(late / DAY_MS) : 0;
}

/** True when two half-open time ranges [start, end) overlap. */
export function rangesOverlap(
  a: { startsAt: Date | string; endsAt: Date | string },
  b: { startsAt: Date | string; endsAt: Date | string },
): boolean {
  return toTime(a.startsAt) < toTime(b.endsAt) && toTime(b.startsAt) < toTime(a.endsAt);
}
