import type { Prisma } from '@nova/db';
import type { PurchaseOrderDetail, PurchaseOrderSummary } from '@nova/shared';
import { iso, isoOrNull } from '../projects/project.mapper';

export const orderSummaryInclude = {
  vendor: { select: { id: true, name: true } },
  request: { select: { id: true, number: true, title: true } },
} satisfies Prisma.PurchaseOrderInclude;

export const orderDetailInclude = {
  ...orderSummaryInclude,
  createdBy: { select: { id: true, name: true } },
  lines: { include: { stockItem: { select: { id: true, sku: true, name: true } } } },
  bill: { select: { id: true, number: true, status: true } },
} satisfies Prisma.PurchaseOrderInclude;

export const toOrderSummary = (
  o: Prisma.PurchaseOrderGetPayload<{ include: typeof orderSummaryInclude }>,
): PurchaseOrderSummary => ({
  id: o.id,
  number: o.number,
  status: o.status,
  vendor: o.vendor,
  issuedOn: iso(o.issuedOn),
  expectedOn: isoOrNull(o.expectedOn),
  total: o.total,
  request: o.request,
});

export const toOrderDetail = (
  o: Prisma.PurchaseOrderGetPayload<{ include: typeof orderDetailInclude }>,
): PurchaseOrderDetail => ({
  ...toOrderSummary(o),
  notes: o.notes,
  createdBy: o.createdBy,
  lines: o.lines.map((l) => ({
    id: l.id,
    description: l.description,
    quantity: l.quantity,
    unitCost: l.unitCost,
    receivedQty: l.receivedQty,
    stockItem: l.stockItem,
  })),
  bill: o.bill,
});
