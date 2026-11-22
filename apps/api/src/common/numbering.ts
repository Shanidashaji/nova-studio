import type { Model } from '@nova/db';
import type { DatabaseService } from '../database/database.service';

const SEQUENCES = {
  expense: { model: 'Expense', prefix: () => 'EXP-', width: 4 },
  invoice: { model: 'Invoice', prefix: () => `NM-INV-${studioYear()}-`, width: 3 },
  purchaseRequest: { model: 'PurchaseRequest', prefix: () => 'PR-', width: 4 },
  purchaseOrder: { model: 'PurchaseOrder', prefix: () => 'PO-', width: 4 },
} as const;

/** The calendar year in the studio's timezone (IST), whatever the server's own clock zone is. */
function studioYear(now = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(
    now,
  );
}

export type Sequence = keyof typeof SEQUENCES;

/** The numeric tail of the highest existing number with this prefix (0 when there is none). */
async function highestExisting(
  database: DatabaseService,
  model: (typeof SEQUENCES)[Sequence]['model'],
  prefix: string,
): Promise<number> {
  // The four numbered collections share the `number` field; one model type covers them.
  const rows = await (database.models[model] as unknown as Model<{ number: string }>)
    .find(
      { number: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } },
      { number: 1 },
    )
    .lean<{ number: string }[]>();
  let max = 0;
  for (const { number } of rows) {
    const n = Number(number.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

/**
 * Next human-readable document number (EXP-0042, NM-INV-2026-014…). An atomic counter per
 * prefix serialises concurrent creators, so two requests never get the same number; it never
 * falls below the highest number already stored (numeric order, so …-999 is followed by …-1000).
 * Call it inside the transaction that inserts the record.
 */
export async function allocateNumber(
  database: DatabaseService,
  sequence: Sequence,
): Promise<string> {
  const { model, prefix, width } = SEQUENCES[sequence];
  const p = prefix();
  const floor = await highestExisting(database, model, p);
  const value = await database.nextSequence(`number:${p}`, floor);
  return `${p}${String(value).padStart(width, '0')}`;
}

/** Project codes follow NM-YY-NNN; the sequence continues from the highest existing code. */
export async function allocateProjectCode(database: DatabaseService, now: Date): Promise<string> {
  const year = String(now.getFullYear()).slice(2);
  const codes = await database.models.Project.find({}, { code: 1 }).lean<{ code: string }[]>();
  const max = codes.reduce((n, { code }) => Math.max(n, Number(/(\d+)$/.exec(code)?.[1] ?? 0)), 0);
  const value = await database.nextSequence('project-code', max);
  return `NM-${year}-${String(value).padStart(3, '0')}`;
}
