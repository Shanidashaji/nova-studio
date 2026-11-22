/** Scheduling rules: booking conflicts and crew utilisation. */
import { rangesOverlap } from './time';

export interface Booking {
  id: string;
  /** The asset or team member being booked. */
  resourceId: string;
  startsAt: Date | string;
  endsAt: Date | string;
}

export interface Conflict {
  resourceId: string;
  bookingIds: [string, string];
}

/** All pairs of bookings that reserve the same resource at overlapping times. */
export function findConflicts(bookings: readonly Booking[]): Conflict[] {
  const byResource = new Map<string, Booking[]>();
  for (const b of bookings)
    byResource.set(b.resourceId, [...(byResource.get(b.resourceId) ?? []), b]);

  const conflicts: Conflict[] = [];
  for (const [resourceId, list] of byResource) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (rangesOverlap(list[i]!, list[j]!)) {
          conflicts.push({ resourceId, bookingIds: [list[i]!.id, list[j]!.id] });
        }
      }
    }
  }
  return conflicts;
}

/** Bookings that would clash with a proposed new booking. */
export function clashesWith(
  existing: readonly Booking[],
  proposed: Omit<Booking, 'id'>,
): Booking[] {
  return existing.filter((b) => b.resourceId === proposed.resourceId && rangesOverlap(b, proposed));
}

export type UtilisationBand = 'AVAILABLE' | 'BALANCED' | 'STRETCHED' | 'OVERLOADED';

export function utilisationBand(ratio: number): UtilisationBand {
  if (ratio > 1) return 'OVERLOADED';
  if (ratio > 0.85) return 'STRETCHED';
  if (ratio >= 0.4) return 'BALANCED';
  return 'AVAILABLE';
}
