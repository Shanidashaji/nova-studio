import type {
  Expense,
  PopulateOptions,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequest,
  StockItem,
  User,
  Vendor,
} from '@nova/db';
import type { PurchaseOrderDetail, PurchaseOrderSummary } from '@nova/shared';
import { iso, isoOrNull } from '../projects/project.mapper';

export const orderSummaryPopulate: PopulateOptions[] = [
  { path: 'vendor', select: { name: 1 } },
  { path: 'request', select: { number: 1, title: 1 } },
];

export type OrderSummaryRow = PurchaseOrder & {
  vendor: Pick<Vendor, '_id' | 'id' | 'name'>;
  request: Pick<PurchaseRequest, '_id' | 'id' | 'number' | 'title'> | null;
};

export const orderDetailPopulate: PopulateOptions[] = [
  ...orderSummaryPopulate,
  { path: 'createdBy', select: { name: 1 } },
  { path: 'lines', populate: { path: 'stockItem', select: { sku: 1, name: 1 } } },
  // Keyed by the expense's purchaseOrderId: Mongoose needs it selected to match the bill back.
  { path: 'bill', select: { number: 1, status: 1, purchaseOrderId: 1 } },
];

export type OrderDetailRow = OrderSummaryRow & {
  createdBy: Pick<User, '_id' | 'id' | 'name'>;
  lines: (PurchaseOrderLine & {
    stockItem: Pick<StockItem, '_id' | 'id' | 'sku' | 'name'> | null;
  })[];
  bill: Pick<Expense, '_id' | 'id' | 'number' | 'status'> | null;
};

export const toOrderSummary = (o: OrderSummaryRow): PurchaseOrderSummary => ({
  id: o.id,
  number: o.number,
  status: o.status,
  vendor: { id: o.vendor.id, name: o.vendor.name },
  issuedOn: iso(o.issuedOn),
  expectedOn: isoOrNull(o.expectedOn),
  total: o.total,
  request: o.request
    ? { id: o.request.id, number: o.request.number, title: o.request.title }
    : null,
});

export const toOrderDetail = (o: OrderDetailRow): PurchaseOrderDetail => ({
  ...toOrderSummary(o),
  notes: o.notes,
  createdBy: { id: o.createdBy.id, name: o.createdBy.name },
  lines: o.lines.map((l) => ({
    id: l.id,
    description: l.description,
    quantity: l.quantity,
    unitCost: l.unitCost,
    receivedQty: l.receivedQty,
    stockItem: l.stockItem
      ? { id: l.stockItem.id, sku: l.stockItem.sku, name: l.stockItem.name }
      : null,
  })),
  bill: o.bill ? { id: o.bill.id, number: o.bill.number, status: o.bill.status } : null,
});
