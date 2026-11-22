# NOVA — Project Status

Living progress record. A phase is marked **Done** only after typecheck, lint, tests and a build
passed and the feature was exercised in the running app. Plan and gap analysis:
[docs/development/erp-expansion-plan.md](docs/development/erp-expansion-plan.md).

## Phases

| Phase | Scope                                                                                                                                                                                                  | Status                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1–8   | Research, architecture, design system, foundation, unified workspace, production core, NOVA AI (demo + Claude, multilingual, voice), tests, polish                                                     | Done (2026-11-22). See [roadmap](docs/development/roadmap.md) |
| 9     | Access & administration: 9 seeded roles over a fixed permission vocabulary, role ↔ permission matrix, users, sessions, password change, notification preferences, security records behind `audit:read` | Done                                                          |
| 10    | Approval engine (rules → multi-step chains); expenses, invoices, payments, receivables ageing, ledger postings; vendors                                                                                | Done                                                          |
| 11    | Procurement (requests, quotations, approval, purchase orders, receipt into stock, vendor bill) and inventory (stock ledger, equipment condition/custody/maintenance)                                   | Done                                                          |
| 12    | HR (departments, restricted records, attendance, leave through approval; leave blocks crew calls) and studio bookings with conflict refusal                                                            | Done                                                          |
| 13    | Documents (private versioned storage), CRM (contacts, owner/follow-up, lead conversion), milestones, risks, subtasks                                                                                   | Done                                                          |
| 14    | ERP signals in the Pulse attention queue, NOVA AI tools for the new modules, analytics additions, screenshots                                                                                          | **Not started**                                               |

## What is implemented where

- **API:** `apps/api/src/modules/{admin,approvals,finance,procurement,inventory,hr,studios,documents}`, `projects/project-plan.*`, `clients/crm.service.ts`, wired in `erp.module.ts`.
- **Data:** migration `20261122180000_erp_expansion` (models plus CHECK constraints) and demo seed `packages/db/src/seed/erp.ts`.
- **Web:** lenses Finance, Procurement, Inventory, Approvals, Documents and Settings, plus Studios (in Resources) and People ops (in Creative Team) panels. The sidebar is grouped and filtered by permission.

## Quality gate log

| Date       | Scope                                                            | typecheck           | lint | tests                                                        | build                               | e2e                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------- | ------------------- | ---- | ------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-22 | Baseline before Phase 9                                          | pass                | —    | —                                                            | —                                   | —                                                                                                                                                                 |
| 2026-11-22 | Phases 9–13                                                      | pass (all packages) | pass | shared 76 · web 28 · API 86 (incl. 43 ERP integration tests) | API pass; web production build pass | `erp.spec.ts` 7/7 (desktop, against a production build)                                                                                                           |
| 2026-11-22 | Full audit and fix pass ([report](ERP_COMPLETE_AUDIT_REPORT.md)) | pass (all packages) | pass | shared 87 · web 28 · API 104                                 | API pass; web production build pass | 72/76 on a production build without re-seeding (3 voice tests failing before the audit; journey 2 needs a fresh seed); axe 0 violations on 13 lenses, both themes |

Notes on the e2e run: it ran against the integration-test database on separate ports (web :3200, API :4100), so it did not touch the development database or the servers on :3100/:4000. The full a11y suite was failing on colour contrast in the restyled theme. The sidebar parts were fixed here; the theme tokens belong to the parallel audit pass (`ERP_COMPLETE_AUDIT_REPORT.md`).

## Known gaps (honest list)

- No payment reversal: a mis-keyed payment cannot be corrected yet (ADR-0011).
- A vendor bill skipped at final receipt cannot be raised later; draft-invoice links and notes cannot be cleared to empty.
- No dedicated inspectors for invoices, expenses or purchase orders. Those lenses act inline.
- The NOVA assistant has no tools for the ERP modules yet (Phase 14), and the Pulse attention queue does not yet show overdue invoices, low stock or waiting approvals.
- Studio utilisation is computed only over the requested window. Session lists ignore the idle timeout, and password change is not rate-limited.
- Single API instance assumed (SSE, lead-conversion guard). See ADR-0006.
