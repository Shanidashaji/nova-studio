# NOVA — Complete ERP Audit, QA Testing and Fix Report

**Date:** 22 November 2026 · **Application:** NOVA, the studio operating system for Neon Minds (demonstration data) · **Audited build:** working tree at the end of the audit, production builds of the API and the web app

Result labels used throughout:

- **PASS** — verified working.
- **FAIL** — failed testing.
- **FIXED** — issue found and fixed, then retested.
- **NOT TESTED** — could not be verified; the reason is given.
- **BLOCKED** — could not be completed for a reason outside the check itself; the reason is given. Used in section 22.

> **Update, 22 November 2026, evening.** A production-readiness verification was run after this audit. It fixed two of the open items (C01 and C11), found that one high-priority item (C05) is still open, and concluded that the application is **not ready for deployment**. Sections 1 to 21 are the audit as written; section 22 is the verification and supersedes them where they differ.

---

## 1. Executive Summary

The whole application was audited end to end: the source of the API, the shared contracts and the web app was reviewed, every lens (page) was opened and operated in a real browser, the main ERP workflows were run through the user interface and the API, and the layout was measured at eight widths from 320 px to 1440 px.

**71 issues were identified. 58 were fixed and retested or covered by tests. 13 remain open** and are listed in section 20; none of them blocks normal use.

The most important problems found and fixed:

| #   | Problem                                                                                   | Effect before the fix                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The **Add task** dialog could not create a task                                           | Leaving "Assignee" or "Due" empty was rejected, and a chosen due date crashed the request. No task could be added from a project.                                                            |
| 2   | **New lead** and **Log interaction** dialogs rejected their own empty optional fields     | A lead for a new prospect, or a client call not tied to a production, could not be saved.                                                                                                    |
| 3   | The **focus bar** was invisible                                                           | After focusing the workspace on a stage or client, the bar that says so (and its Clear button) had zero height.                                                                              |
| 4   | **Invoices could not be sent, paid or voided** from the screen                            | A saved draft invoice was a dead end; the API supported the steps but the UI offered none.                                                                                                   |
| 5   | The **live update stream sent every audit row to every signed-in user**                   | A user without finance or admin rights received sign-ins, password resets, invoice and payment amounts in real time. The audit list and the assistant's activity recap leaked the same rows. |
| 6   | A project could be **marked Delivered by a plain edit**, and a delivered project reopened | Skipped blocking tasks and client approval; distorted the on-time rate.                                                                                                                      |
| 7   | The **client-approval gate opened when one of several deliverables was approved**         | A project could leave Review with other deliverables still pending or with changes requested.                                                                                                |
| 8   | **Colour contrast failed WCAG AA** on 10 of 13 lenses                                     | 202 text elements (status badges, stage chips, avatar initials, dimmed cards) were below 4.5:1.                                                                                              |
| 9   | Navigation ignored **permissions** in three places                                        | The command palette, `?lens=` links and the Finance / Intelligence lenses showed restricted roles pages of "no permission" errors.                                                           |
| 10  | Several **phone-layout** defects                                                          | Masthead artwork sat behind heading text, tap targets as small as 14 px, form fields that zoom the page on iOS.                                                                              |

Final verification on the production build: **597 checks executed, 592 passed, 5 failed.** The five failures are three voice-input tests that were already failing before the audit, one end-to-end journey that uses up its fixture when the suite is run twice without re-seeding, and one assertion in my own invoice script that compared a figure the dashboard rounds to lakhs (the underlying number was then verified against the database and is correct). Details are in sections 17 and 20.

Type checking, linting and production builds pass for every package.

A second engineering session was extending the ERP modules in the same repository during the audit. Ownership of files was agreed with it at the start; findings inside its files were handed over and it fixed 22 of them. Those are reported separately in section 16 so it is clear who changed what.

---

## 2. Application Overview

NOVA is one workspace for a media production studio: production pipeline, scheduling, people, clients and sales, finance, procurement, inventory, approvals, documents, business intelligence, an audit trail, administration and an AI assistant.

| Layer      | Technology                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Web        | Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query, Zustand, Radix UI, Recharts          |
| API        | NestJS 11 (REST, prefix `/api/v1`), session-cookie authentication, Server-Sent Events for live updates  |
| Contracts  | `packages/shared`: Zod schemas and pure domain rules used by both sides                                 |
| Data       | PostgreSQL through Prisma 7 — 58 models, 3 migrations, demonstration seed                               |
| Tests      | Vitest (unit and API integration against a real test database), Playwright with system Chrome, axe-core |
| Repository | pnpm + Turborepo monorepo: `apps/web`, `apps/api`, `packages/{shared,db,config}`, `tests/e2e`           |

The web app has two routes, `/login` and `/studio`. Everything inside `/studio` is a **lens** selected from the sidebar; records open in an **inspector** panel beside the lens. The API exposes 149 routes from 24 controllers.

How it runs locally: `pnpm db:start` (embedded PostgreSQL on port 54329), `pnpm db:deploy`, `pnpm db:seed`, then the API on port 4000 and the web app on port 3100. The web app forwards `/api/*` to the API, so the browser only ever talks to one origin.

---

## 3. Audit Scope

**In scope and done**

- Source review of the API (auth, common, all 20 modules), shared contracts and the web app, by three parallel read-only reviews whose findings were then verified one by one before any fix.
- Browser testing with Playwright driving the installed Chrome: every lens, every sidebar entry, the command palette, hotkeys, dialogs, filters, sorting, view switches, pagination ("load older"), create / edit / delete flows, sign-in and sign-out.
- ERP workflow testing through the UI and the API: project pipeline, tasks, scheduling, client and lead handling, invoice → payment, expenses → approval, role-based access.
- Cross-checks of dashboard figures against the database.
- Responsive testing at 320, 375, 390, 430, 768, 1024, 1280 and 1440 px.
- Accessibility: axe-core (WCAG 2.1 A/AA) on every lens in both themes, plus keyboard and touch-target checks.
- All available automated checks: unit tests, API integration tests, end-to-end tests, lint, type checks, production builds.

**Out of scope or not possible** (each is also marked NOT TESTED where relevant)

- Real microphone and speech recognition: headless Chrome has no audio device. The voice tests use a simulated speech stack.
- The Claude-backed assistant: the environment runs the assistant in its local "demo" mode, so the external model path was not exercised.
- Browsers other than Chrome, and physical phones: widths and touch were emulated.
- Behaviour under concurrent load.
- Deployment, HTTPS and production configuration. Nothing was deployed.
- Re-seeding or resetting the demonstration database (see section 11).

---

## 4. Pages and Modules Inspected

| #   | Lens / page          | What it contains                                                                                                                   | Result                                    |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| —   | Login                | Email and password form, validation, signed-out notice                                                                             | PASS                                      |
| 1   | Home (Studio Pulse)  | Greeting, pipeline, active projects, urgent attention, team capacity, business insights, upcoming shoots                           | PASS                                      |
| 2   | Projects             | Grid / stage board / table, search, status, health and sort filters, new production                                                | PASS                                      |
| 3   | Resources (schedule) | Shoot cards, conflict banner, equipment grid, studios and bookings                                                                 | FIXED → PASS                              |
| 4   | Creative Team        | Workload by week, studio filter, attendance check-in, leave                                                                        | PASS                                      |
| 5   | Clients              | Client table, sales pipeline board, new client, new lead                                                                           | FIXED → PASS                              |
| 6   | Finance              | KPIs, receivables ageing, invoices, expenses                                                                                       | FIXED → PASS                              |
| 7   | Procurement          | Purchase requests, quotations, purchase orders, receiving                                                                          | PASS                                      |
| 8   | Inventory            | Stock issue / return, equipment register                                                                                           | PASS                                      |
| 9   | Approvals            | Inbox, my requests, all; approve / reject                                                                                          | PASS                                      |
| 10  | Documents            | Search, category filter, upload, download                                                                                          | PASS (browser upload NOT TESTED, see §17) |
| 11  | Intelligence         | Income and expense charts, budget scatter, chart / table toggle                                                                    | FIXED → PASS                              |
| 12  | Activity             | Audit trail with area and source filters, load older                                                                               | FIXED → PASS                              |
| 13  | Settings             | My account, users, roles and permissions, approval rules                                                                           | PASS                                      |
| —   | Inspectors           | Project (7 tabs), task, shoot, client, lead, asset, team member, workflow templates                                                | FIXED → PASS                              |
| —   | Shell                | Sidebar, top bar, search, theme, notifications, account menu, pipeline spine, focus bar, command palette, NOVA panel and companion | FIXED → PASS                              |

"FIXED → PASS" means at least one defect was found on that lens, fixed, and the lens then passed.

---

## 5. Button and Interaction Testing

A scripted click-through covers 59 interaction checks on the desktop layout. Final run on the production build: **59 PASS, 0 FAIL.**

| Area                                                  | Checks | What was exercised                                                                                                                                                                                                                               | Result                   |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Sidebar                                               | 13     | Each lens opens, the heading matches, the URL updates, no error panel                                                                                                                                                                            | PASS                     |
| Shell                                                 | 11     | Hotkeys, Ctrl+K palette (search, open a result, lens list, Esc), search pill, theme toggle with persistence across reload, notifications, account menu, the four spine tabs, stage focus and Clear, workflow templates, NOVA question and answer | PASS (focus bar FIXED)   |
| Home                                                  | 3      | The four panel links, a project tile, an attention item                                                                                                                                                                                          | PASS                     |
| Projects                                              | 4      | Search, status / health / sort, grid ⇄ stages ⇄ table, new production with validation, cancel and create                                                                                                                                         | PASS                     |
| Project inspector                                     | 4      | All seven tabs, priority and hold / resume, add a task then open and delete it with the confirmation dialog, send-back dialog, gated Advance button                                                                                              | PASS (task dialog FIXED) |
| Schedule                                              | 3      | Earlier / later / today, schedule a shoot with validation then cancel it, open an asset                                                                                                                                                          | PASS (navigation FIXED)  |
| Creative Team                                         | 2      | Studio filter narrows the list, member inspector, leave dialog                                                                                                                                                                                   | PASS                     |
| Clients                                               | 4      | Required-field messages, duplicate name refused, Focus and Clear, client and lead inspectors                                                                                                                                                     | PASS (messages FIXED)    |
| Finance, Procurement, Inventory, Approvals, Documents | 5      | KPIs, dialogs open and cancel, lists render, scope filters, search                                                                                                                                                                               | PASS                     |
| Intelligence, Activity                                | 2      | Charts and table toggle; area filter, source filter, load older                                                                                                                                                                                  | PASS (filters FIXED)     |
| Settings                                              | 3      | Four tabs, add-user dialog, wrong current password rejected                                                                                                                                                                                      | PASS                     |
| Persistence and links                                 | 2      | A created production survives a reload and has a shareable link; an unknown lens or inspector in the URL falls back to Home                                                                                                                      | PASS (fallback FIXED)    |
| Authentication                                        | 3      | Sign out, wrong password, redirect of a signed-out visitor                                                                                                                                                                                       | PASS                     |

No decorative or dead buttons were found in the final build. The one dead end that existed — invoice rows with no actions — was fixed (section 6).

Console and network: across the 59 checks the only non-success responses are the two the tests provoke on purpose (409 for a duplicate client, 422 for a wrong password). There are no uncaught page errors.

---

## 6. ERP Workflow Testing

| Workflow                                                                                                                                                                                                                                        | How it was tested                                          | Result                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| **Project pipeline** — a blocked stage names its blockers; finishing blocking tasks lets it advance; sending back needs a reason                                                                                                                | API integration tests and the UI                           | PASS                                                                 |
| **Delivery rule** — Delivered is reached only by completing the last stage                                                                                                                                                                      | New API tests                                              | FIXED                                                                |
| **Client approval gate** — every deliverable sent for review must be approved; a sign-off from before a send-back no longer counts                                                                                                              | New unit tests on the gate rule                            | FIXED                                                                |
| **Tasks** — create, edit, dependencies with cycle refusal, delete with confirmation                                                                                                                                                             | UI and API tests                                           | FIXED (create) → PASS                                                |
| **Scheduling** — double booking refused unless acknowledged; equipment in maintenance refused; moving a shoot onto a clash refused; nothing booked onto a cancelled shoot                                                                       | API tests and the UI                                       | FIXED → PASS                                                         |
| **Clients and sales** — add client, duplicate refused, add lead, log interaction                                                                                                                                                                | UI and API tests                                           | FIXED → PASS                                                         |
| **Invoice → payment** — draft, send, over-payment refused, part payment, full payment, void with a reason                                                                                                                                       | New UI controls, scripted in the browser                   | FIXED → PASS (6 of 7 steps; the seventh is explained in §17)         |
| **Expense → approval** — a submitted expense reaches the approvals inbox and can be approved; payment posts to the ledger once                                                                                                                  | Existing end-to-end and API tests                          | PASS                                                                 |
| **Procurement and inventory** — request, quotation, approval, order, receipt into stock                                                                                                                                                         | API tests (run, passing); UI rendering and dialogs checked | PASS at API level; the full chain was NOT TESTED through the browser |
| **Role-based access** — two temporary accounts (Creative, Employee): what the sidebar offers, that every offered lens loads without a refused request, write controls, direct API refusal, audit visibility, and loss of access on deactivation | Scripted in the browser, 18 checks                         | FIXED → PASS                                                         |
| **Data consistency** — 12 figures compared with the database (next table)                                                                                                                                                                       | Script                                                     | PASS                                                                 |
| **Persistence** — records survive a reload and are reachable by link                                                                                                                                                                            | UI                                                         | PASS                                                                 |

Dashboard figures against the database (all PASS):

| Figure                                                              | API       | Database  |
| ------------------------------------------------------------------- | --------- | --------- |
| Collected this month (₹)                                            | 15,65,760 | 15,65,760 |
| Receivables outstanding (₹)                                         | 2,90,280  | 2,90,280  |
| Receivables overdue (₹)                                             | 1,98,240  | 1,98,240  |
| Invoices whose paid amount or balance disagree with their payments  | 0         | 0         |
| Invoices whose status disagrees with what has been paid             | 0         | 0         |
| Active projects on Home                                             | 11        | 11        |
| Blocked tasks on Home                                               | 2         | 2         |
| Pipeline stage totals                                               | 11        | 11        |
| Projects listed                                                     | 17        | 17        |
| Projects whose "spent" differs from their ledger expenses           | 0         | 0         |
| Paid expenses with exactly one ledger posting                       | 4         | 4         |
| Stock items whose quantity differs from the last movement's balance | 0         | 0         |

---

## 7. UI Alignment and Design Findings

The existing "ink and vermilion" design was kept. Changes are corrections, not a redesign.

| Finding                                                                                                                                      | Status                            |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Focus bar collapsed to zero height inside the scrolling column                                                                               | FIXED                             |
| Masthead artwork overlapped the heading and description on phones; the "Create · Produce · Inspire" line sat under the artwork below 1700 px | FIXED                             |
| Validation errors showed raw schema text (for example `Invalid option: expected one of "PRODUCT_VIDEO"                                       | …`), overflowing the dialog       | FIXED — messages now read "This field is required.", "Choose an option.", "Enter a valid email address." |
| Cancelled shoots were shown at 50% opacity, making their text unreadable                                                                     | FIXED — dashed outline instead    |
| Schedule showed one fixed three-week window with no way to move                                                                              | FIXED — earlier / today / later   |
| Activity filter offered areas that never matched, and omitted the ERP areas                                                                  | FIXED                             |
| Dialogs stayed in a "saving" state until every open query had refetched                                                                      | FIXED                             |
| Project cards had no visible keyboard focus                                                                                                  | FIXED                             |
| No favicon (a 404 on every page)                                                                                                             | FIXED                             |
| On phones the pipeline spine and its tabs take the top of every lens, so content starts about half-way down                                  | Open — a design decision, see §20 |

Checked and found consistent: page headers, panel spacing, card sizes, table alignment, icon sizes, both themes.

---

## 8. Mobile Responsiveness Testing Results

Nine checks at each of the eight widths (72 in total), on the production build, with touch emulation below 768 px. **72 PASS, 0 FAIL.** The per-width table is in section 19.

What is verified at every width: no horizontal page scroll on any of the 13 lenses; the navigation reaches every lens (bottom tab bar on phones, icon rail on tablets, full sidebar from 1024 px); labels stay on one line and the heading is not under the top bar; the new-production dialog fits the screen with its buttons reachable; the inspector opens, its tabs scroll and it closes; wide tables scroll inside their own panel; charts fit their cards; the assistant opens and closes; menus fit the screen.

A separate sweep measured all 13 lenses at all 8 widths (104 states) for overflow, elements outside the viewport, clipped text and unnamed controls: **104 PASS**.

Fixed for phones: artwork behind text; a development badge that covered the Home tab; dialogs sized in `vh` (now `dvh`, so the keyboard does not hide the buttons); buttons and segmented controls grow to 36 px on touch screens; form fields use 16 px text on touch screens so iOS does not zoom; the equipment grid's name column no longer takes 70% of the width; room under the last row for the floating assistant; the approval-rules table scrolls inside its panel.

---

## 9. Frontend Audit

| Area          | Finding                                                                                                                                                                              | Status                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Forms         | Empty `<select>` and date inputs were sent as `''` and failed validation (tasks, leads, interactions)                                                                                | FIXED in the shared schemas (`optionalId`, `optionalDate`) |
| Forms         | A due date was converted with string slicing on a `Date`, producing "Invalid time value"                                                                                             | FIXED                                                      |
| Forms         | An empty amount became ₹0 without warning                                                                                                                                            | FIXED                                                      |
| State         | Re-opening the same record on another section did not switch tab                                                                                                                     | FIXED                                                      |
| State         | A crew double-booking item opened "Equipment not found"                                                                                                                              | FIXED                                                      |
| Permissions   | Palette, `?lens=` links, spine tabs, NOVA button and "Ask NOVA" ignored permissions; the assistant history was requested (and refused) on every load for roles without the assistant | FIXED                                                      |
| Permissions   | Finance lens requested figures the role cannot read; Intelligence was offered to roles that only get a "no access" line                                                              | FIXED                                                      |
| Data fetching | Project search sent a request per keystroke                                                                                                                                          | FIXED (250 ms pause)                                       |
| Data fetching | After deleting a task its inspector refetched the deleted task (404)                                                                                                                 | FIXED                                                      |
| Live updates  | The event stream was never reopened once the browser gave up                                                                                                                         | FIXED (retry with growing delay)                           |
| Keyboard      | Digit hotkeys switched lens behind an open dialog; Esc on the last inspector entry swapped it for the assistant                                                                      | FIXED                                                      |
| Errors        | A failed purchase-order load was an unhandled rejection with no message                                                                                                              | FIXED                                                      |
| Double submit | Inventory "Return" could be pressed twice                                                                                                                                            | FIXED                                                      |
| Links         | An unknown `?inspect=` type opened an empty panel                                                                                                                                    | FIXED                                                      |

Type check, lint and the 28 web unit tests pass. No React runtime errors or hydration warnings were seen in the final runs.

---

## 10. Backend and API Audit

Every state-changing route carries a permission decorator and every body and query goes through schema validation; that was confirmed by reading all 24 controllers. Defects were in the rules behind the routes:

| Area        | Finding                                                                                                                                                                                                             | Status                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Projects    | `PATCH /projects/:id` accepted any status                                                                                                                                                                           | FIXED                                              |
| Projects    | Due date could be moved before the start date                                                                                                                                                                       | FIXED                                              |
| Workflow    | Approval gate satisfied by any one approval; stale sign-off after send-back; sign-off could be requested for a stage not yet reached                                                                                | FIXED                                              |
| Workflow    | Sending back and skipping were allowed on delivered or cancelled projects                                                                                                                                           | FIXED                                              |
| Schedule    | Moving a shoot moved its bookings with no clash check; bookings onto cancelled or wrapped shoots; inactive crew; leave check looked at one row only; a running overlap dropped out of the conflict list             | FIXED                                              |
| Validation  | `z.coerce.date()` turned `null`, `true` and numbers into 1970; call time accepted `99:99`; unbounded ranges                                                                                                         | FIXED                                              |
| Numbering   | "Last number" found by text order, so invoice numbering would stick at …-1000 after …-999; invoice year taken from server time, not IST                                                                             | FIXED (see §17 for what was and was not exercised) |
| Metrics     | Shoot days over-counted (a 14-hour shoot counted as two days); division by zero capacity; Home totals mixed active and on-hold projects; on-time rate counted undated deliveries as late; unread count capped at 30 | FIXED                                              |
| Clients     | Duplicate client names; a converted lead's stage could be changed                                                                                                                                                   | FIXED                                              |
| Assistant   | Confirming a proposal twice applied it twice; internal error text returned to the user and not logged; "activity for 100000 days" loaded the whole log                                                              | FIXED                                              |
| Concurrency | Decide-approval, stage transition, stage skip and project-code allocation were check-then-write                                                                                                                     | FIXED with guarded writes and an advisory lock     |
| Audit       | Deleting a task with subtasks logged only the parent                                                                                                                                                                | FIXED                                              |

The API integration suite (104 tests against a real PostgreSQL test database, running the compiled API) passes. 18 of those tests are new and cover the fixes above; a further block was added by the ERP session for its fixes.

---

## 11. Database and Data Integrity Audit

- Schema: 58 models, 3 migrations. **No schema change and no migration was made by this audit.**
- Integrity rules that hold and were confirmed by tests: payments cannot exceed the balance; an expense posts to the ledger exactly once; stock cannot go negative; receiving cannot exceed the ordered quantity; studio bookings cannot overlap; approval steps are decided in order.
- The 12 consistency checks in section 6 compare the API with the database and all agree.
- **The demonstration database was not re-seeded or reset**, because that deletes data. Testing therefore left some clearly named records in it:
  - 5 productions titled "QA production …" (all cancelled), 4 tasks titled "QA …", 1 client "QA Client …", 1 lead, 1 logged interaction, 6 shoots titled "QA shoot …" (all cancelled), 2 invoices with a "QA …" line (one paid ₹11,800, one void), 4 user accounts `qa-…@nova.local` (all deactivated).
  - The project's own end-to-end suite also wrote its usual records (an assistant conversation, an "Archive project files" task, an expense, and it delivered "Product Demo v4").
  - `pnpm db:seed` restores the original demonstration data whenever that is wanted. It also regenerates the demo account passwords.
- One integrity improvement needs a migration and was left open: a unique constraint on (asset, shoot) for equipment bookings (§20).

---

## 12. Security and Permissions Review

| Finding                                                                                                                                                          | Severity | Status                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| Live event stream delivered every audit row to every user                                                                                                        | High     | FIXED — rows are filtered by permission; others receive a bare "refresh" signal          |
| Audit list exposed finance, HR, procurement and approval rows to roles without those permissions                                                                 | High     | FIXED                                                                                    |
| Assistant's activity recap had no permission filter                                                                                                              | High     | FIXED                                                                                    |
| The stream kept running after sign-out, deactivation or loss of permission                                                                                       | Medium   | FIXED — the session is re-checked every 25 s (the timing itself was NOT TESTED, see §17) |
| A role with only "manage users" could grant roles more powerful than its own; could sign a Super Admin out; could reset its own password without the current one | Medium   | FIXED by the ERP session                                                                 |
| Self-approval through a request submitted on someone's behalf; one person deciding consecutive steps                                                             | Medium   | FIXED by the ERP session                                                                 |
| Project budget, spend and finance breakdown are returned to roles without finance access                                                                         | Medium   | **Open** (§20)                                                                           |
| Login is rate-limited per IP address only; the general rate limit is configured but not applied                                                                  | Low      | **Open** (§20)                                                                           |

Confirmed sound: Argon2id password hashing with constant-time comparison and a timing equaliser for unknown emails; session tokens stored only as SHA-256 hashes; absolute and idle expiry; sessions revoked on deactivation and password change (the browser test confirms a deactivated account is refused at once); the origin check on every state-changing request; no state change behind a GET route; uploaded files stored under random keys with type checks and served as attachments.

---

## 13. Performance Review

- Production build of the web app compiles in about 21 s; the workspace renders from one server-rendered route.
- Fixed: a request per keystroke in project search; blocking every dialog on a refetch of the whole workspace.
- Loading, empty and error states exist on every panel through one shared component, with a retry button and a request reference on errors.
- Not fixed, low impact at demonstration size (§20): several lists are returned in full with no paging (projects, clients, leads, users), and the double-booking scan reads every booking on each schedule, project and Home request. These will need paging and a time window before real volumes.
- Load and stress behaviour: NOT TESTED.

---

## 14. Accessibility Review

axe-core, WCAG 2.1 A and AA, on all 13 lenses, the project inspector and the login page, in both themes — 30 page states.

|                                | Before                               | After |
| ------------------------------ | ------------------------------------ | ----- |
| Serious or critical violations | 202 elements on 13 of 30 page states | **0** |

What was wrong and what changed:

- Status colours are used as text on a tint of themselves (badges, alerts, table cells). In the light theme green, amber, red and blue were between 3.2:1 and 4.2:1. They are now the lightest shades of the same hues that keep 4.5:1 on a 10% tint over every paper surface.
- Avatar initials on the chart colours were as low as 2.3:1; avatars now deepen the colour in the light theme.
- Stage chips on project stills used white text on colours as low as 2.7:1; the chip colours were darkened.
- Cancelled shoots and health scores were dimmed with opacity; opacity is no longer used to show state.
- One button's accessible name did not contain its visible text.

Also verified: every interactive element has an accessible name (0 unnamed across 104 measured states); dialogs trap focus and restore it; a visible focus ring everywhere, including project cards; form fields are labelled and errors are tied to their fields; reduced-motion is respected.

The existing accessibility test audited the wrong lenses (it pressed hotkeys 6 and 7, which now open Finance and Procurement) and covered 7 lenses. It now opens all 13 by URL.

Open: the inspector sheet on narrow screens is not a focus-trapping dialog (§20). Screen-reader testing with a real reader: NOT TESTED.

---

## 15. Issues Identified

Severity: H high, M medium, L low. Status as defined at the top. "Verified by" names the evidence.

### 15.1 Fixed by this audit (36)

| ID  | Sev | Issue                                                                                                                                                                                                                                       | Verified by                                                              |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A01 | H   | Add-task dialog could not create a task                                                                                                                                                                                                     | Browser before and after; new end-to-end, API and schema tests           |
| A02 | H   | New-lead dialog rejected an empty client or close date                                                                                                                                                                                      | Schema tests; browser after the fix                                      |
| A03 | H   | Log-interaction dialog rejected "no production"                                                                                                                                                                                             | Schema tests; browser after the fix                                      |
| A04 | H   | Focus bar had zero height                                                                                                                                                                                                                   | Browser before and after; new end-to-end test                            |
| A05 | H   | Live stream sent all audit rows to all users                                                                                                                                                                                                | New API test reading the stream as a restricted user                     |
| A06 | H   | Audit list leaked finance, HR and security rows                                                                                                                                                                                             | New API tests; browser role checks                                       |
| A07 | H   | Assistant activity recap unfiltered and unbounded                                                                                                                                                                                           | Code review and assistant test suite; no dedicated test                  |
| A08 | H   | Project could be marked Delivered or reopened by an edit                                                                                                                                                                                    | New API tests                                                            |
| A09 | H   | Approval gate opened by one approved deliverable; stale sign-off counted                                                                                                                                                                    | New unit tests                                                           |
| A10 | H   | 202 colour-contrast and naming violations                                                                                                                                                                                                   | axe on 30 page states: 0                                                 |
| A11 | H   | Invoices had no send, payment or void actions                                                                                                                                                                                               | Scripted browser workflow                                                |
| A12 | M   | Raw validator text shown to users                                                                                                                                                                                                           | Browser; new end-to-end and schema tests                                 |
| A13 | M   | Empty amount became ₹0; null dates became 1970; invalid call time accepted                                                                                                                                                                  | New API and schema tests                                                 |
| A14 | M   | Moving a shoot double-booked its equipment and crew; bookings onto closed shoots                                                                                                                                                            | New API test                                                             |
| A15 | M   | Check-then-write races (approval decision, assistant confirm, transition, skip, project code)                                                                                                                                               | Existing suites pass on the normal path; the races themselves NOT TESTED |
| A16 | M   | Numbering would stick after …-999 / …-9999; invoice year from server time                                                                                                                                                                   | Code review; NOT TESTED at that volume                                   |
| A17 | M   | Workload over-counted shoot days; zero capacity divided by zero                                                                                                                                                                             | New unit tests (shoot days)                                              |
| A18 | L   | Home totals, on-time rate, conflict window and unread count inconsistencies                                                                                                                                                                 | Existing tests pass; consistency script                                  |
| A19 | L   | Duplicate clients allowed; converted lead's stage editable                                                                                                                                                                                  | API test and browser (duplicate); lead lock by code review               |
| A20 | M   | Stream not re-validated after sign-out or deactivation                                                                                                                                                                                      | Code review; timing NOT TESTED                                           |
| A21 | M   | Palette, links, tabs and NOVA controls ignored permissions                                                                                                                                                                                  | Browser role checks (18)                                                 |
| A22 | M   | Finance and Intelligence lenses showed error pages to restricted roles                                                                                                                                                                      | Browser role checks                                                      |
| A23 | M   | Crew conflict item opened "Equipment not found"                                                                                                                                                                                             | Code review; no crew conflict in the data to click                       |
| A24 | M   | Inspector did not switch section for an already open record                                                                                                                                                                                 | Code review                                                              |
| A25 | M   | Activity filters did not match recorded areas; "load older" hidden under a focus                                                                                                                                                            | Browser (invoice area returns rows; load older adds rows)                |
| A26 | M   | Schedule window could not be moved                                                                                                                                                                                                          | Browser; new end-to-end test                                             |
| A27 | M   | Notifications about expenses, purchases and leave led nowhere                                                                                                                                                                               | Code review                                                              |
| A28 | L   | Dialogs waited for a full refetch; deleted task refetched (404)                                                                                                                                                                             | Browser: the 404 no longer appears                                       |
| A29 | L   | Search per keystroke; stream never reconnected; unknown inspector type; hotkeys behind dialogs; Esc swapped inspector for the assistant                                                                                                     | Browser and end-to-end for search and links; the rest by code review     |
| A30 | L   | Task inspector could load for ever; stale due date; blank planned-days sent 0; default workflow lost on the second project                                                                                                                  | Code review                                                              |
| A31 | L   | Inventory double submit; unhandled rejection in procurement; approval-rules table overflow                                                                                                                                                  | Code review; table by the responsive checks                              |
| A32 | M   | Phone layout defects (artwork behind text, dev badge over Home tab, dialog height, touch targets, iOS zoom, grid column, floating assistant over the last row)                                                                              | 72 mobile checks; screenshots                                            |
| A33 | L   | No favicon: a 404 on every page                                                                                                                                                                                                             | Sweep shows no console errors                                            |
| A34 | L   | Tests out of date: accessibility test audited the wrong lenses; journeys and screenshots used an old panel name and old hotkeys; several tests assumed an empty assistant history; the end-to-end project could not type-check browser code | End-to-end suite: 51 → 72 passing                                        |
| A35 | L   | One lint error and three unformatted files                                                                                                                                                                                                  | Lint and format check pass                                               |
| A36 | L   | Deleting a parent task did not record its subtasks; leave check used one row; tasks could be assigned to inactive members                                                                                                                   | Code review                                                              |

### 15.2 Found by this audit, fixed by the ERP session in its files (22)

Verified by that session's regression tests, which are part of the 104-test API suite that was run here and passes.

| ID  | Sev | Issue                                                                                                                    |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------ |
| B01 | H   | Editing an invoice without sending the tax field reset its tax to 0                                                      |
| B02 | M   | A purchase order could be issued for more than the approved amount by selecting a quotation after approval               |
| B03 | M   | Self-approval when someone else submitted the request; one person deciding consecutive steps                             |
| B04 | M   | A team member could overwrite an attendance entry made by HR, for any past date                                          |
| B05 | M   | Leave had no maximum length or back-dating limit; approving a very long leave timed out and overwrote attendance history |
| B06 | M   | Cancelling approved leave left the "on leave" attendance entries                                                         |
| B07 | M   | A finance document uploaded by a non-finance role was stored but could never be seen by its uploader                     |
| B08 | M   | An invoice counted as overdue during its due day                                                                         |
| B09 | M   | Status checks outside the transaction in expenses, invoices and procurement                                              |
| B10 | M   | A role with only "manage users" could grant more powerful roles; missing Super Admin guards                              |
| B11 | M   | Converting a lead twice created two projects                                                                             |
| B12 | L   | `?mine=false` and `?overdue=false` were read as true                                                                     |
| B13 | L   | A zero-total invoice could be sent and never settled                                                                     |
| B14 | L   | Very large quantities overflowed the amount columns (500 error)                                                          |
| B15 | L   | A purchase-order bill could be withdrawn, edited or deleted by the receiver (partly fixed)                               |
| B16 | L   | Maintenance on a retired asset returned it to "available"                                                                |
| B17 | L   | Calendar dates derived from server-local time instead of IST                                                             |
| B18 | L   | Employee codes collided when a code was missing                                                                          |
| B19 | L   | Attendance notes visible to everyone                                                                                     |
| B20 | L   | A file's extension was not tied to its type                                                                              |
| B21 | L   | Vendor detail showed other people's expenses to a role without finance access                                            |
| B22 | L   | Studio bookings had no maximum length and could link a shoot to another project (partly fixed)                           |

### 15.3 Open (13)

Listed with detail in section 20: C01–C13.

---

## 16. Issues Fixed

**58 of 71.** 36 by this audit (A01–A36), 22 by the ERP session (B01–B22, two of them partly).

Files changed by this audit, by area:

- **Shared contracts:** `schemas/common.ts` (strict dates and amounts, optional form values, readable messages), `schemas/requests.ts`, `domain/workflow.ts`; new `schemas/common.test.ts`.
- **API:** `common/numbering.ts`; `modules/activity/activity-visibility.ts` (new) and `activity.controller.ts`; `modules/events/events.controller.ts`; `modules/assistant/{assistant.service,assistant.tools,claude.provider,demo.provider}.ts`; `modules/projects/{projects.service,project.mapper}.ts`; `modules/reviews/reviews.service.ts`; `modules/schedule/{schedule.service,schedule-conflicts}.ts`; `modules/clients/clients.service.ts`; `modules/tasks/tasks.service.ts`; `modules/team/team.service.ts`; `modules/insights/insights.service.ts`; `modules/domain.module.ts`; one lint fix in `modules/hr/hr.service.ts`; new `test/audit.test.ts`.
- **Web:** `styles/tokens.css`, `app/globals.css`, `app/icon.svg` (new), `next.config.ts`; `components/ui/{button,dialog,field,misc}.tsx`; `lib/{live-events,mutations,queries}.ts`; `store/workspace.ts`; `features/shell/{workspace,hero,focus-bar,top-bar,use-hotkeys,lenses,lens-canvas,notifications-menu}`; `features/command/command-palette.tsx`; `features/activity/activity-lens.tsx`; `features/schedule/schedule-lens.tsx`; `features/tasks/task-dialog.tsx`; `features/finance/{finance-lens,invoice-actions (new)}.tsx`; `features/{inventory,procurement,settings}` lenses; `features/inspector/{context-column,task-inspector,workflows-inspector}.tsx`; `features/productions/{productions-lens,production-card,new-project-dialog}.tsx`; `features/pulse/{active-projects,attention-queue,panel-link,upcoming-shoots}.tsx`; `features/spine/pipeline-spine.tsx`; `features/assistant/{nova-session,nova-companion}.tsx`.
- **End-to-end tests:** `a11y.spec.ts`, `auth.spec.ts`, `journeys.spec.ts`, `screenshots.spec.ts`, `voice.spec.ts`, `tsconfig.json`; new `regressions.spec.ts` and `responsive.spec.ts`.
- **Docs:** `docs/design/01-design-system.md` (contrast rule), `PROJECT_STATUS.md` (quality gate row), this report.

No feature was removed, no module was replaced by mock data, no dependency or framework was changed.

---

## 17. Testing Results

Final runs, all on the final production build unless noted.

| Suite                            | What it is                                                | Executed | Passed  | Failed |
| -------------------------------- | --------------------------------------------------------- | -------- | ------- | ------ |
| Shared unit tests                | Vitest, `packages/shared`                                 | 87       | 87      | 0      |
| Web unit tests                   | Vitest, `apps/web`                                        | 28       | 28      | 0      |
| API integration tests            | Vitest, compiled API against the PostgreSQL test database | 104      | 104     | 0      |
| End-to-end suite                 | Playwright, `tests/e2e` (76 tests)                        | 76       | 72      | 4      |
| Interaction click-through        | Audit script, desktop                                     | 59       | 59      | 0      |
| Mobile / tablet / desktop checks | Audit script, 9 checks × 8 widths                         | 72       | 72      | 0      |
| Responsive sweep                 | Audit script, 13 lenses × 8 widths                        | 104      | 104     | 0      |
| Role-based access                | Audit script, 2 temporary roles                           | 18       | 18      | 0      |
| Invoice workflow                 | Audit script                                              | 7        | 6       | 1      |
| Data consistency                 | Audit script, API against database                        | 12       | 12      | 0      |
| Accessibility scan               | axe-core, 30 page states                                  | 30       | 30      | 0      |
| **Total**                        |                                                           | **597**  | **592** | **5**  |

The five failures:

1. **Voice: "a speech-capture failure … retries"** — FAIL. Expects two recognition attempts, sees one. Was failing before the audit.
2. **Voice: "capture keeps failing … explains it is the speech service"** — FAIL. The message names the audio device differently from what the test expects. Was failing before the audit.
3. **Voice: "microphone disconnected while listening"** — FAIL. The "disconnected" notice does not appear with the simulated device. Was failing before the audit.
   These three exercise voice input through a simulated speech stack. The voice code was not changed by this audit, and which side is wrong (the test double or the retry and device-change handling) needs someone with a real microphone.
4. **Journey 2: "finishing the work lets it advance"** — FAIL in the final run, PASS in the run before it. The test delivers the project "Product Demo v4"; run a second time without re-seeding, that project is no longer in the active list. It is a test-isolation limit, not an application fault.
5. **Invoice step "dashboard figure moves"** — FAIL of the script's own assertion. It compared the "Collected this month" tile before and after an ₹11,800 payment; the tile shows ₹16L, rounded to lakhs, so the text did not change. The exact figure was then compared with the database (15,65,760 on both sides) and is correct.

The audit scripts (click-through, mobile, roles, invoice, consistency, sweep) are not part of the repository. Their lasting parts were added to it as `regressions.spec.ts`, `responsive.spec.ts`, the wider `a11y.spec.ts`, `apps/api/test/audit.test.ts` and `packages/shared/src/schemas/common.test.ts`.

**NOT TESTED**, with reasons:

| Item                                                           | Reason                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Voice input with a real microphone                             | Headless Chrome has no audio device                                                                   |
| The Claude-backed assistant                                    | The environment runs the assistant in demo mode                                                       |
| File upload and download through the browser                   | Only the dialog was opened in the browser; upload, versions and access rules are covered by API tests |
| Purchase request → order → receipt as one chain in the browser | Covered by API tests; the UI was checked for rendering and dialogs only                               |
| Races under concurrent requests (A15)                          | Needs a load harness; the guarded writes were reviewed and the normal paths pass                      |
| Number allocation past …-999 (A16)                             | Would need a thousand invoices; the ordering rule was reviewed                                        |
| Stream closing within 25 s of deactivation (A20)               | Timing-dependent; the session refusal itself is tested                                                |
| Safari, Firefox and physical devices                           | Only Chrome was available; widths and touch were emulated                                             |
| Screen readers                                                 | No reader in the environment; axe and role-based queries were used                                    |
| Deployment, HTTPS, secure cookies in production                | Nothing was deployed                                                                                  |
| Re-seed and reset scripts                                      | Destructive to the demonstration data                                                                 |

---

## 18. Build, Lint and Type Check Results

| Package           | Type check                                | Lint                                        | Tests        | Build                             |
| ----------------- | ----------------------------------------- | ------------------------------------------- | ------------ | --------------------------------- |
| `packages/shared` | PASS                                      | PASS                                        | 87 / 87      | PASS                              |
| `packages/db`     | PASS                                      | PASS                                        | — (no tests) | PASS (generated client)           |
| `apps/api`        | PASS                                      | FIXED → PASS (one error in `hr.service.ts`) | 104 / 104    | PASS                              |
| `apps/web`        | PASS                                      | PASS                                        | 28 / 28      | PASS (production build, 5 routes) |
| `tests/e2e`       | FIXED → PASS (browser types were missing) | NOT TESTED — the package has no lint script | 72 / 76      | —                                 |

Formatting (Prettier) was checked on the API, web, shared and end-to-end sources; three files were reformatted and the check passes.

---

## 19. Mobile Testing Results by Screen Size

Nine checks per width; ✔ is PASS. The last column is what the layout does at that width.

| Width   | No page scroll (13 lenses) | Navigation reaches all lenses | Labels and header | Dialog fits | Inspector | Tables | Charts | Assistant | Menus | Layout                                                                                     |
| ------- | -------------------------- | ----------------------------- | ----------------- | ----------- | --------- | ------ | ------ | --------- | ----- | ------------------------------------------------------------------------------------------ |
| 320 px  | ✔                          | ✔                             | ✔                 | ✔           | ✔         | ✔      | ✔      | ✔         | ✔     | Bottom tab bar (scrolls sideways), full-width inspector sheet, 16 px inputs, 36 px buttons |
| 375 px  | ✔                          | ✔                             | ✔                 | ✔           | ✔         | ✔      | ✔      | ✔         | ✔     | Same                                                                                       |
| 390 px  | ✔                          | ✔                             | ✔                 | ✔           | ✔         | ✔      | ✔      | ✔         | ✔     | Same                                                                                       |
| 430 px  | ✔                          | ✔                             | ✔                 | ✔           | ✔         | ✔      | ✔      | ✔         | ✔     | Same                                                                                       |
| 768 px  | ✔                          | ✔                             | ✔                 | ✔           | ✔         | ✔      | ✔      | ✔         | ✔     | Icon rail (72 px) with tooltips, inspector as a 460 px overlay                             |
| 1024 px | ✔                          | ✔                             | ✔                 | ✔           | ✔         | ✔      | ✔      | ✔         | ✔     | Labelled sidebar (208 px), inspector overlay                                               |
| 1280 px | ✔                          | ✔                             | ✔                 | ✔           | ✔         | ✔      | ✔      | ✔         | ✔     | Sidebar and docked inspector column (420 px)                                               |
| 1440 px | ✔                          | ✔                             | ✔                 | ✔           | ✔         | ✔      | ✔      | ✔         | ✔     | Same, wider canvas                                                                         |

72 of 72 PASS. Data tables that are wider than a phone (clients, invoices, equipment grid, users, approval rules) scroll sideways inside their own panel, which is intended.

---

## 20. Remaining Issues or Limitations

Since this table was written, **C01 and C11 have been fixed** and the items have been given deployment priorities; see section 22.1. The table below is the list as the audit left it.

| ID  | Sev | Issue                                                                                                                                                                                                                                      | Why it is open                                                                                                                    | Suggested next step                                               |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| C01 | M   | Project budget, spend and finance breakdown, and client lifetime value, are returned to every role that can open the workspace                                                                                                             | Hiding them changes the shape of shared view types used across the web app; it deserves a deliberate decision on who sees budgets | Null these fields for callers without `finance:read` and show "—" |
| C02 | M   | A recorded payment cannot be reversed                                                                                                                                                                                                      | Needs a reversing ledger entry and a new route; recorded as a known gap in ADR-0011                                               | Add "reverse payment" with a reason                               |
| C03 | M   | A won lead cannot be converted into a production from the UI, although the API supports it                                                                                                                                                 | New dialog; not started                                                                                                           | Add "Convert to production" in the lead inspector                 |
| C04 | L   | Some API operations have no screen yet: create a vendor, reset another user's password, cancel leave, edit or withdraw an expense, cancel a purchase request, create a stock item, milestones, risks, client contacts, document versions   | Features to build rather than defects                                                                                             | Prioritise password reset, vendor creation and leave cancellation |
| C05 | L   | Sign-in is rate-limited per IP address only; the general 120-per-minute limit is configured but not applied; streams per user are not capped                                                                                               | Applying a global limit needs tuning so the dashboards' own requests are not refused                                              | Per-account lockout; global guard with a higher limit             |
| C06 | L   | Lists are returned in full and the double-booking scan reads every booking per request                                                                                                                                                     | Fine at demonstration size                                                                                                        | Paging and a time window before real volumes                      |
| C07 | L   | A bill cannot be raised later if the final receipt was recorded without one; a draft invoice's project link cannot be cleared; studio utilisation ignores bookings outside the requested window; the session list ignores the idle timeout | Small ERP-module gaps left by both sessions                                                                                       | Individual small changes                                          |
| C08 | L   | No database-level uniqueness for (asset, shoot) bookings                                                                                                                                                                                   | Needs a migration, which this audit did not make                                                                                  | Add the unique index                                              |
| C09 | L   | On narrow screens the inspector sheet does not trap keyboard focus                                                                                                                                                                         | Needs the sheet rebuilt on the dialog primitive                                                                                   | Use the Radix dialog for the narrow variant                       |
| C10 | L   | Document entries in the audit trail are hidden from roles without access to confidential documents, including entries about ordinary documents                                                                                             | The audit row does not record whether its document is confidential; hiding all of them is the safe side                           | Store the flag on the row and filter precisely                    |
| C11 | —   | Three voice-input tests fail (see §17)                                                                                                                                                                                                     | Pre-existing; needs a real microphone to decide whether the code or the test double is wrong                                      | Investigate with real hardware                                    |
| C12 | L   | On phones the pipeline spine takes the top of every lens                                                                                                                                                                                   | Part of the design ("the pipeline is always visible")                                                                             | Consider collapsing it on phones outside Home                     |
| C13 | L   | The end-to-end suite is repeatable only after a re-seed (journey 2 delivers its project)                                                                                                                                                   | By design the suite re-seeds first; this audit ran it without re-seeding                                                          | Give that journey its own project                                 |

Also to know:

- The repository has no commits yet; all work is in the working tree. Nothing was committed or pushed.
- The web app now runs on port **3100** (changed during the audit at the owner's request, by the ERP session). Port 3000 is no longer used.
- The API (port 4000) and web app (port 3100) currently running were started from the final builds by this audit. If they are stopped, start them again with `pnpm --filter @nova/api start` and `pnpm --filter @nova/web start` after `pnpm build`.
- The demonstration database contains the test records listed in section 11.

---

## 21. Final Application Quality Assessment

**Overall: good, and now dependable for its core flows.** The architecture was sound before the audit — one validated contract shared by both sides, permissions on every route, transactions with an audit row for each change, consistent loading / empty / error states. The serious defects were in a narrower band: form schemas that rejected their own empty fields, rules that could be bypassed by a direct edit, an audit stream that ignored permissions, missing actions on invoices, and a colour system that had drifted below contrast requirements after a restyle.

| Area           | Assessment                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functionality  | Every lens and control works; the create, edit and delete flows tested all complete. 59 of 59 interaction checks pass.                                                                                              |
| ERP behaviour  | Pipeline, scheduling, sales, invoice-to-payment, expense approval and role-based access behave as one system; dashboard figures agree with the database. Lead conversion and payment reversal are the notable gaps. |
| Security       | Authentication and session handling are solid. The information leaks found are closed. One exposure remains (project budgets visible without finance access, C01).                                                  |
| Responsiveness | No horizontal overflow at any of eight widths; phone layout corrected and touch-friendly.                                                                                                                           |
| Accessibility  | From 202 automated violations to 0 across both themes. Manual screen-reader testing is still to do.                                                                                                                 |
| Code quality   | Type checks, lint and builds pass everywhere; 219 unit and integration tests and 72 of 76 end-to-end tests pass.                                                                                                    |
| Test suite     | Larger and more accurate than before (accessibility on all lenses, responsive widths, regressions), but the end-to-end suite still needs a re-seed between runs and three voice tests need attention.               |

**Counts, from actual results:** issues identified **71**; issues fixed **58**; open **13**; checks executed **597**; passed **592**; failed **5**; items not tested **11** (listed with reasons in section 17).

---

## 22. Production-Readiness Verification (22 November 2026, evening)

A second pass, made after the project was first pushed to GitHub and before any deployment. It classified the 13 open items, fixed the high-priority ones that could be fixed safely, investigated the three failing voice tests, re-ran every automated check, and reviewed the production configuration.

**Result: the application is not ready for deployment.** The reasons are in section 22.8.

**What was verified, and what was not.** Every result below describes the PostgreSQL and NestJS application at commit `fe65138` plus the fixes in section 22.2. While this pass was running, separate work started in the same working tree to replace PostgreSQL and Prisma with MongoDB and to move the API into the Next.js app (branch `feat/mongodb`). Nothing in this section describes that migrated application. It will need its own verification before it is deployed.

**Where the checks ran.** On a separate copy of the stack: a production build of the web app on port 3200, the compiled API on port 4100, and the integration-test database. The demonstration database and the app running on ports 3100 and 4000 were not touched. Nothing was deployed.

### 22.1 The open items, by priority

No item is critical, meaning none loses data or lets a signed-out visitor in. Three are high.

| ID  | Priority | Why                                                                                                                        | Status after this pass                  |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| C01 | High     | Budgets, spend and client value were sent to every role, including roles with no finance access                            | **FIXED** (22.2)                        |
| C05 | High     | On a public address, the only limit on requests is ten sign-in attempts per minute per client address                      | **Open — BLOCKED** (22.3)               |
| C11 | High     | Three failing tests meant voice input had a defect nobody had located                                                      | **FIXED** (22.2)                        |
| C02 | Medium   | A mis-keyed payment cannot be corrected. High as soon as real payments are recorded                                        | Open                                    |
| C03 | Medium   | A won lead cannot become a production from the screen; the API can do it                                                   | Open                                    |
| C13 | Medium   | The end-to-end suite passes only from a fresh seed, so it cannot be re-run against a database it has already used          | Open. Passes 76 of 76 from a fresh seed |
| C04 | Low      | Screens missing for existing API operations. Resetting another user's password is the one an administrator will need first | Open                                    |
| C06 | Low      | Lists are unpaged. Medium once there are thousands of records                                                              | Open                                    |
| C07 | Low      | Four small gaps in the ERP modules                                                                                         | Open                                    |
| C08 | Low      | The double-booking rule is enforced in code but not by a database constraint                                               | Open                                    |
| C09 | Low      | The inspector on phones does not trap keyboard focus                                                                       | Open                                    |
| C10 | Low      | Some harmless audit entries are hidden from roles without confidential-document access; nothing is exposed                 | Open                                    |
| C12 | Low      | Design choice about the pipeline bar on phones                                                                             | Open                                    |

### 22.2 Fixed in this pass

**C01 — who sees what a production costs.** One rule now decides it, `canSeeProjectMoney` in `packages/shared/src/schemas/auth.ts`: a caller sees the figures if their role has `finance:read` or `project:write`. For everyone else the API returns `null` for a production's budget and spend, for its finance breakdown, and for a client's lifetime value. It also replaces the budget risk signal's wording (of the form "72% of budget spent at 40% progress") with "Spending is running ahead of progress", leaves the budget item out of the Home attention queue, ignores a request to sort productions by budget, and the assistant leaves the budget line out of its answers. The web app shows "—", and hides the Budget tab and the "Sort: budget" option.

- Verified with 25 checks over HTTP, signed in as temporary users of five roles: Creative, Employee and HR receive no figures anywhere in the project list, project detail, client list, client detail or Home data, and are refused the finance overview; Project Manager and Super Admin still receive the figures. All 25 passed. They were part of a 34-check script that also covered sign-in, sign-out and sessions (22.5); all 34 passed.
- The 104 API integration tests and the 76 end-to-end tests pass with the change in place.
- **Two things to know.** First, roles with `project:write` keep the figures on purpose, because they type the budget in when they create a production; if budgets should be finance-only, change the one rule. Second, the estimated value of leads and the sales pipeline total on Home are still visible to every role that can open the workspace. That was outside C01 and needs the owner's decision.
- **Not done:** no automated API test was added for this rule. The API test folder was being rewritten by the database migration at the time, so the checks were run from a script that is not in the repository.

**C11 — the three failing voice tests.** Each had a different cause. No test was skipped or loosened; two were made stricter.

| Test                                                        | Cause                                                                                                                                                                                                                                                                             | Fix                                                                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "microphone disconnected while listening"                   | **A defect in the app.** After permission is granted, Chrome lists no microphone at all when the last one is unplugged. The app treated an empty list as "permission not asked yet" and ignored it, so unplugging the only microphone went unnoticed by the device-change handler | `audioInputs()` in `speech/mic.ts` now treats an empty list as "no microphone" when permission is granted. Covered by new unit tests                                                            |
| "a speech-capture failure … retries"                        | **A race in the test.** The retry worked. The test looked for the sentence anywhere in the panel, found it at once on a suggestion button that shows the same words, and counted the attempts before the retry had run                                                            | The test now waits for the conversation entry carrying the "spoken" tag, which only the second attempt can produce, and also asserts that no problem card is shown                              |
| "capture keeps failing … explains it is the speech service" | **The simulated microphone was wrong.** Its audio track reported the name of a Web Audio node instead of a device name, which no real microphone does, so the message named the wrong device                                                                                      | The simulated track is now labelled as Chrome labels the default input. The app also strips Chrome's "Default - " prefix from that label, so the message and the device list show the same name |

Voice tests: 13 of 16 passing before, **16 of 16 after**. Voice input with a real microphone is still NOT TESTED, for the reason given in section 17.

### 22.3 Not fixed: C05, request limits

Measured against the API started in production mode:

- 150 requests in one burst: none refused. The general limit of 120 per minute is configured but never applied. **FAIL.**
- Twelve wrong sign-ins from one address: refused from the tenth. The per-address sign-in limit works. **PASS.**
- Nothing counts failed sign-ins per account, so one account can be guessed at from many addresses. **FAIL** (by reading `auth.service.ts`).

A fix was written but **not connected**: a per-account lock (five failures in fifteen minutes lock sign-in for fifteen minutes) and a general limit counted per signed-in user. The two files exist and nothing uses them yet: `apps/api/src/auth/login-attempts.ts` and `apps/api/src/common/app-throttler.guard.ts`. Work stopped there because the API source was handed over to the database migration, which was told about both files and about this gap. **BLOCKED** until the API source is stable again.

### 22.4 Automated checks

| Check                 | Result                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit tests     | **PASS** 87 of 87                                                                                                                                                                                                             |
| Web unit tests        | **PASS** 34 of 34 (28 before; 6 new for the microphone list and withheld amounts)                                                                                                                                             |
| API integration tests | **PASS** 104 of 104, compiled API against the PostgreSQL test database                                                                                                                                                        |
| End-to-end tests      | **PASS** 76 of 76, production build, fresh seed (72 of 76 in the audit)                                                                                                                                                       |
| Lint                  | **PASS** for `packages/shared`, `apps/web`, `apps/api`. `packages/db` was not linted in this pass, because the migration had begun there. `tests/e2e` has no lint script                                                      |
| Type check            | **PASS** for shared, db, API and web at the pushed commit, and for shared, web, API and end-to-end after the fixes. `packages/db` now **FAILS**: it holds the migration's half-written files, which are not part of this pass |
| Build                 | **PASS**: shared, db (before the migration began), API, and the web production build (5 routes)                                                                                                                               |
| Formatting            | **PASS** for the files this pass changed, except one over-long line in `apps/api/src/modules/projects/projects.service.ts`, left because that folder was handed over                                                          |

### 22.5 Functions checked

| Function              | Result                         | How                                                                                                                                                                                                           |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in               | **PASS**                       | 7 end-to-end authentication tests; sign-in through the web address; sign-in in production mode                                                                                                                |
| Sign out              | **PASS**                       | End-to-end (menu and command palette, failure message); the session is dead afterwards; a cross-site sign-out is refused                                                                                      |
| Notifications         | **PASS** at the API only       | The endpoint answers. The menu was not operated in this pass; it passed in the audit (section 5)                                                                                                              |
| Dashboard navigation  | **PASS**                       | All 13 lenses opened by the accessibility and responsive tests                                                                                                                                                |
| All buttons           | **PASS** for the flows covered | The 76 end-to-end tests operate the main create, edit, delete, approve and advance flows. The audit's 59-check click-through was not in the repository and was not repeated, so "every button" is not claimed |
| API connectivity      | **PASS**                       | The browser reaches the API only through the web address; health check and all end-to-end flows go that way                                                                                                   |
| Database operations   | **PASS**                       | 104 API tests against a real PostgreSQL database, plus the end-to-end flows that create and change records                                                                                                    |
| Mobile responsiveness | **PASS**                       | Responsive tests at 320, 375, 390, 430, 768, 1024, 1280 and 1440 px, and one test on an emulated Pixel 7. Physical phones NOT TESTED                                                                          |

### 22.6 Environment and security configuration

| Check                                                                                                | Result                                               |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `.env` is not in the repository; only `.env.example`, in both commits on `main`                      | **PASS**                                             |
| No real secret value in any committed file (administrator password, API key, token patterns)         | **PASS**                                             |
| Session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`                | **PASS**                                             |
| State-changing request from another origin is refused                                                | **PASS**                                             |
| Error responses carry no stack trace; neither server names its framework                             | **PASS**                                             |
| Web sends `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` | **PASS**                                             |
| A signed-out visitor to `/studio` is sent to `/login`                                                | **PASS**                                             |
| General request limit and per-account sign-in lock (C05)                                             | **FAIL**                                             |
| `Strict-Transport-Security` header                                                                   | **FAIL** — not sent                                  |
| `Content-Security-Policy` header                                                                     | **FAIL** — not sent                                  |
| A plain `http://` web origin is refused when `NODE_ENV=production`                                   | **FAIL** — `env.ts` accepts it (by reading the code) |
| Production values of the environment variables                                                       | **BLOCKED** — no production environment exists yet   |

To set when a production environment is created; none of these can be checked before then:

- `NODE_ENV=production` for the API. The cookie is only `Secure` with it, and `.env.example` does not mention it.
- `DATABASE_URL` with its own credentials. The example file and `docker-compose.yml` use `nova:nova`, which is for local use only.
- `WEB_ORIGIN` set to the public `https://` address, and `API_INTERNAL_URL` set both when the web app is built and when it runs.
- The number of proxies the API trusts is fixed at one in `bootstrap.ts`. That is right only while the Next.js app is the single proxy in front of it. Behind a load balancer every user would appear to come from one address.
- Do not run the demonstration seed against a production database: it creates demo accounts.

### 22.7 Node.js version

`package.json` requires Node 24.7 or newer. The reason is real: passwords are hashed with `node:crypto`'s Argon2, which Node 22 does not have.

| Check                                                                  | Result                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Builds, tests and servers on Node 26.13.1, the version on this machine | **PASS**                                                           |
| `crypto.argon2` exists on Node 26.13.1 and is missing on Node 22.23.2  | **PASS** — confirms the requirement                                |
| The minimum itself, Node 24.7                                          | **BLOCKED** — not installed here (26.5.1, 22.23.2 and 20.20.2 are) |

On this machine `pnpm` itself is installed under Node 22.23.2, so every `pnpm` command prints an "Unsupported engine" warning. The scripts it starts run on Node 26.13.1, so results are unaffected. A host that runs the app on Node 22 would fail at sign-in. The repository has no `.nvmrc` or `.node-version` file to pin the version; adding one is recommended.

### 22.8 Deployment readiness

**Not ready.** In order of weight:

1. **The backend is being replaced.** Everything verified here is the PostgreSQL and NestJS application. The MongoDB version on `feat/mongodb` is unverified and, at the time of writing, does not type-check.
2. **C05 is open.** No general request limit and no per-account sign-in lock.
3. **No HSTS and no Content-Security-Policy header**, and a plain-http origin is accepted in production mode.
4. **No production environment exists**, so its variables, HTTPS and proxy settings are unverified.
5. Payment reversal (C02) should be decided before real payments are recorded.

What is in good order: the application's own behaviour. Every automated check passes on the verified code, the two fixed items are verified, sign-in, sessions and role-based access hold, and no secret is in the repository.

### 22.9 State of the repository after this pass

- **Nothing was committed or pushed by this pass.** All changes are uncommitted in the working tree, which another session switched to the branch `feat/mongodb`.
- `main` has one commit newer than the first push (`d0e54fe`, "Remove demo environment note from login page"). It was not made by this pass.
- Files changed by this pass: `packages/shared/src/schemas/{auth,views}.ts`; `apps/web/src/features/assistant/speech/mic.ts` and the new `mic.test.ts`; `apps/web/src/lib/{format,format.test}.ts`; `apps/web/src/features/shell/user-context.tsx`; `apps/web/src/features/productions/productions-lens.tsx`; `apps/web/src/features/inspector/client-inspector.tsx` and `inspector/project/{project-extras,project-inspector}.tsx`; `tests/e2e/voice.spec.ts`; in the API, `modules/projects/{project.mapper,projects.service,projects.controller}.ts`, `modules/clients/{clients.service,clients.controller,crm.service}.ts`, `modules/insights/{insights.service,insights.controller}.ts`, `modules/assistant/{assistant.tools,claude.provider,demo.provider}.ts`, and the two unconnected files named in 22.3; this report and `PROJECT_STATUS.md`.
- The end-to-end run rewrote the eleven images in `docs/screenshots`; they were restored to the committed versions.
- The test database holds four deactivated accounts named `verify-…@nova.local` from the role checks. The demonstration database was not touched.

**Counts after this pass:** of the 71 issues, **60 fixed, 11 open** (one high: C05). New findings from this pass, all in 22.6: three failing configuration checks besides C05, and five settings to make at deployment.
