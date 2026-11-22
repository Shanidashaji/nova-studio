import type { ModelName } from './relations';

/**
 * Collection validators: the former PostgreSQL CHECK constraints, enforced by MongoDB itself on
 * every insert and update (validationLevel "strict"), whoever writes. Applied by `syncIndexes()`.
 * A violation fails with code 121 (DocumentValidationFailure).
 */
const isSet = (field: string) => ({
  $cond: [{ $eq: [{ $ifNull: [field, null] }, null] }, 0, 1],
});

export const COLLECTION_VALIDATORS: Partial<Record<ModelName, Record<string, unknown>>> = {
  // Exactly one subject reference per approval request.
  ApprovalRequest: {
    $expr: {
      $eq: [
        { $add: [isSet('$expenseId'), isSet('$purchaseRequestId'), isSet('$leaveRequestId')] },
        1,
      ],
    },
  },
  // A ledger entry is posted by a payment or an expense, never both.
  FinancialRecord: {
    $expr: { $lte: [{ $add: [isSet('$paymentId'), isSet('$expenseId')] }, 1] },
  },
  Expense: { amount: { $gt: 0 } },
  Payment: { amount: { $gt: 0 } },
  InvoiceLine: { quantity: { $gt: 0 }, unitPrice: { $gte: 0 } },
  Invoice: {
    taxPercent: { $gte: 0, $lte: 40 },
    $expr: { $gte: ['$dueDate', '$issueDate'] },
  },
  PurchaseOrderLine: {
    receivedQty: { $gte: 0 },
    $expr: { $lte: ['$receivedQty', '$quantity'] },
  },
  StockItem: { onHand: { $gte: 0 } },
  LeaveRequest: { $expr: { $gte: ['$endDate', '$startDate'] } },
  StudioBooking: { $expr: { $gt: ['$endsAt', '$startsAt'] } },
};

/** True for a write rejected by a collection validator. */
export function isValidationFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 121;
}
