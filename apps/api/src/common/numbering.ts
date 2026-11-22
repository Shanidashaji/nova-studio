import { Prisma } from '@nova/db';
import { nextNumber } from '@nova/shared';
import type { Db } from '../database/prisma.service';

const SEQUENCES = {
  expense: { table: 'Expense', prefix: () => 'EXP-', width: 4 },
  invoice: { table: 'Invoice', prefix: () => `NM-INV-${studioYear()}-`, width: 3 },
  purchaseRequest: { table: 'PurchaseRequest', prefix: () => 'PR-', width: 4 },
  purchaseOrder: { table: 'PurchaseOrder', prefix: () => 'PO-', width: 4 },
} as const;

/** The calendar year in the studio's timezone (IST), whatever the server's own clock zone is. */
function studioYear(now = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(
    now,
  );
}

export type Sequence = keyof typeof SEQUENCES;

/**
 * Next human-readable document number (EXP-0042, NM-INV-2026-014…). Must run inside a
 * transaction: a transaction-scoped advisory lock serialises concurrent creators so two requests
 * never read the same "last" number. "Last" is the highest number, not the last in text order:
 * once a sequence outgrows its padding (…-999 → …-1000) the longer number must win, so rows are
 * ordered by length first.
 */
export async function allocateNumber(tx: Db, sequence: Sequence): Promise<string> {
  const { table, prefix, width } = SEQUENCES[sequence];
  const p = prefix();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nova-seq-${sequence}`}))`;
  const rows = await tx.$queryRaw<{ number: string }[]>(
    Prisma.sql`SELECT "number" FROM ${Prisma.raw(`"${table}"`)} WHERE "number" LIKE ${`${p}%`} ORDER BY length("number") DESC, "number" DESC LIMIT 1`,
  );
  return nextNumber(p, rows[0]?.number, width);
}
