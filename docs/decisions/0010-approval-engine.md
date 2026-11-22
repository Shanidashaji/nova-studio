# ADR-0010 — A generic approval engine alongside deliverable approvals

**Status:** Accepted (2026-11-22)

## Context

Expenses, purchase requests and leave all need "submit → one or more approvers decide → act on the outcome", with history and rejection reasons. The existing `Approval` model records a **client's** (or the studio's internal) sign-off on a deliverable or a workflow stage, tied to revision rounds.

## Decision

- New models: `ApprovalRule` (subject, minimum amount, step order, required permission), `ApprovalRequest` (subject type + id, status, current step, requester) and `ApprovalStep` (one per required step: status, decider, reason, time).
- When a subject is submitted, the engine selects every rule for that subject whose threshold the amount meets and creates the steps in order. With no matching rule, one default step requiring the subject's approve permission is created.
- A decider must hold the step's permission and cannot approve their own request. Rejection requires a reason and closes the request. Approving the last step marks the request approved and calls the subject's handler (expense → approved, purchase request → approved, leave → approved) inside the same transaction.
- Approvers are notified when a step becomes theirs; the requester is notified of the outcome.
- Deliverable/stage approvals are left as they are. The Approvals lens shows both kinds, clearly labelled.

## Alternatives

- Reusing `Approval` for everything: it would mix client sign-off (no NOVA user decides) with internal authorisation (a NOVA user with a permission decides).
- A workflow-engine library: heavyweight for three subject types.

## Consequences

- Rules are editable in Settings (e.g. "expenses ≥ ₹50,000 also need Finance").
- Each subject type needs a small handler; adding a fourth is a contained change.
