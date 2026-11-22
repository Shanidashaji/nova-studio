# ERP Expansion Plan (Phases 9–14)

> Written 2026-11-22 after re-inspecting the repository and re-checking https://neonmindsproduction.com/.
> The first build (Phases 1–8, see [roadmap](roadmap.md)) delivered the production core. The expanded
> product brief asks for a complete ERP: CRM, projects, production, workflows, HR, finance, assets,
> inventory, procurement, studio scheduling, documents, approvals, analytics, notifications and
> administration — still inside **one** workspace. This document is the gap analysis and the plan.

## 1. Website re-check (2026-11-22)

The site content matches [01-company-analysis](../research/01-company-analysis.md). New details recorded there:
service descriptions (e.g. Product Videos: "Macro-cinematography highlighting industrial design details"),
the label "Operating Globally", and a third portfolio title. `/about`, `/services`, `/case-studies`,
`/careers` and `/blog` return 404, so there is still no published process, team, client list or figures.
The finance, HR, procurement and inventory workflows below are therefore **proposed workflows for a
studio of this shape**, not documented Neon Minds processes.

## 2. Gap analysis

| Brief module                 | Already in NOVA                                                                 | Gap                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1 CRM                        | Clients, interaction history, leads with stages, lead sources                   | Multiple contacts per client, lead owner, follow-up dates, lead → client + project conversion        |
| 2 Projects                   | Projects, templates, budgets, priority, team, tasks, dependencies, history      | Milestones, subtasks, risk register                                                                  |
| 3 Creative production        | Stage workflow, deliverables, revision rounds, timecoded feedback, approvals    | Briefs / scripts / storyboards as versioned documents (→ module 10)                                  |
| 4 Tasks & workflows          | Configurable templates, transitions with blockers, dependency graph (React Flow) | — (covered)                                                                                          |
| 5 HR                         | Team members, capacity, workload                                                | Departments, employee records (restricted), attendance, leave with approval, leave-aware availability |
| 6 Finance                    | Demo ledger (`FinancialRecord`), budget burn, margin                            | Invoices + lines, payments, receivables ageing, expense submission and approval, vendor expenses     |
| 7 Assets & inventory         | Equipment, bookings, conflicts, maintenance status                              | Condition, maintenance log, consumable stock with movements and reorder levels                      |
| 8 Procurement & vendors      | —                                                                               | Vendors, purchase requests, quotations, approval, purchase orders, receiving into stock              |
| 9 Studio & scheduling        | Shoots, crew calls, equipment conflicts, calendar                               | Studio spaces and studio bookings with conflict prevention                                          |
| 10 Documents                 | —                                                                               | Repository, categories, entity links, versions, private storage, confidential access                 |
| 11 Approvals                 | Deliverable and stage approvals (client/internal decisions)                     | Generic approval engine: rules, multi-step chains, history, rejection reasons, approvals inbox        |
| 12 Analytics                 | Revenue/expense trend, burn vs progress, flow metrics                           | Receivables ageing, expense analysis, budget vs actual, pipeline conversion                          |
| 13 Notifications             | Notification centre, SSE live updates                                           | Approval notifications to approvers, per-user preferences                                            |
| 14 Settings, security, audit | Sessions, RBAC guard, activity trail                                            | Configurable roles (8 initial roles), user management, permission matrix, session list/revoke, audit view |
| AI                           | Demo + Claude providers, confirm-before-write, multilingual, voice              | Tools for invoices, approvals, expenses, stock, studios                                              |

## 3. Design decisions

| Decision | Summary | Record |
| --- | --- | --- |
| Configurable roles | Role keys become data, not a TypeScript enum. Permissions stay a fixed vocabulary (they are checked in code); which role holds which permission is editable in Settings. `SUPER_ADMIN` is locked so an admin cannot lock everyone out. | [ADR-0009](../decisions/0009-configurable-roles.md) |
| Approval engine | One `ApprovalRequest` per subject (expense, purchase request, leave) with ordered steps produced by `ApprovalRule`s (by subject and amount threshold). Existing deliverable/stage approvals stay: they record a **client's** decision, a different concept. The inbox shows both. | [ADR-0010](../decisions/0010-approval-engine.md) |
| Ledger postings | `FinancialRecord` becomes the cash ledger. A recorded payment posts an income entry; a paid expense posts an expense entry, each linked back to its source. Reports read one table; no figure is stored twice. | [ADR-0011](../decisions/0011-ledger-postings.md) |
| Document storage | Files go to a private directory outside the web root (`NOVA_STORAGE_DIR`), named by random key, checked by type and size, hashed (SHA-256), and only streamed through the API after a permission check. Confidential documents need `document:confidential`. | [ADR-0012](../decisions/0012-document-storage.md) |
| Leave-aware scheduling | Approved leave is a scheduling constraint: calling crew who are on leave is a conflict, the same way a double-booked camera is. | — |

## 4. One workspace, more lenses

Modules remain **lenses** of one workspace (same shell, spine, inspector, command palette and NOVA).
The sidebar groups them so it stays short:

- **Operate** — Overview, Projects, Resources (shoots, studios, equipment), Team, Clients
- **Business** — Finance, Procurement, Inventory, Approvals
- **Knowledge** — Documents, Intelligence, Activity
- **Settings** (bottom, permission-gated)

Lenses the user's role cannot read are hidden (the API enforces the same rule). Phones get the four
primary lenses in the tab bar plus a "More" sheet.

## 5. Phases

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 9 Access & administration | Permission vocabulary, 8 roles + read-only guest, user management, role/permission matrix, sessions, audit filter | Typecheck/lint/tests green; API tests prove backend enforcement |
| 10 Approvals + Finance + Vendors | Approval engine, expenses, invoices, payments, ledger postings, receivables, vendors | Expense → approval → paid → ledger; invoice → payment → status, tested |
| 11 Procurement + Inventory | Purchase requests, quotations, POs, receiving, stock items and movements, asset condition and maintenance | PR → approval → PO → receive → stock, tested |
| 12 HR + Studios | Departments, employee records (restricted), attendance, leave + approval, studios and bookings, leave-aware conflicts | Leave blocks crew call; studio double-booking rejected, tested |
| 13 Documents + CRM/Project gaps | Document repository with versions, contacts, lead conversion, milestones, subtasks, risks | Upload/download with permission checks, tested |
| 14 Intelligence, AI, polish | Analytics additions, attention-queue signals, NOVA tools, notifications, e2e, docs, screenshots | Full quality gates; README updated |

Each phase ends with `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and a browser check,
recorded in [PROJECT_STATUS.md](../../PROJECT_STATUS.md).

## 6. Non-goals (stated, not implied)

- No certified accounting, GST filing or tax computation. Invoices carry an optional tax percentage
  as a plain calculation; NOVA is not an accounting system of record.
- No payroll. HR records hold demonstration employment details only; salary data is not stored.
- No real company figures. All operational records are seeded demonstration data.
- No deployment without the owner's approval.
