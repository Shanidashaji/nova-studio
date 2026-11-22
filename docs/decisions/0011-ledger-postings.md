# ADR-0011 — The ledger is derived from invoices, payments and expenses

**Status:** Accepted (2026-11-22)

## Context

The first build had a demonstration ledger (`FinancialRecord`) used for revenue, expense and margin charts. Adding invoices, payments and expenses risks storing the same money twice.

## Decision

- `FinancialRecord` is the cash ledger and keeps powering the trend charts.
- Recording a payment against an invoice posts an `INCOME` entry linked by `paymentId`. Marking an approved expense as paid posts an `EXPENSE` entry linked by `expenseId`. A paid invoice or a payment cannot be voided or deleted once posted. **Payment correction (a reversing entry for a mis-keyed payment) is not implemented yet**; it is listed in the roadmap.
- Invoice status is derived from payments (`SENT` → `PARTIALLY_PAID` → `PAID`); "overdue" is computed from the due date, not stored.
- Project spend = ledger expenses for the project, so budget burn reflects real approved and paid costs.

## Consequences

- One source of truth for reports; every ledger line can be traced to the document that created it.
- Manual ledger entries remain possible (for opening balances and demo history) and are labelled.
- Not an accounting system: no double-entry, chart of accounts or tax filing (stated in the README).
