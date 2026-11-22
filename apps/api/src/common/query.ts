/** Small query helpers shared by the MongoDB services. */

/** Escapes a user string for literal use inside a regular expression. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" filter (the former Prisma `{ contains, mode: 'insensitive' }`). */
export function containsI(value: string): { $regex: string; $options: 'i' } {
  return { $regex: escapeRegex(value), $options: 'i' };
}

/** Case-insensitive exact match (the former `{ equals, mode: 'insensitive' }`). */
export function equalsI(value: string): { $regex: string; $options: 'i' } {
  return { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
}

/** Sums one numeric field over rows (the former `aggregate({ _sum })`, done in memory). */
export function sumOf<T>(rows: readonly T[], pick: (row: T) => number | null | undefined): number {
  let total = 0;
  for (const row of rows) total += pick(row) ?? 0;
  return total;
}

/** Groups rows by a key (the former `groupBy`, done in memory for the small working set). */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
