# NOVA REST API (v1)

Base path: `/api/v1`, served by the web app (`http://localhost:3100` in development, your Vercel domain in production). A standalone API (`pnpm --filter @nova/api start`) serves the same paths on `API_PORT`.

Request bodies and query strings are validated with the Zod schemas in [`packages/shared/src/schemas/requests.ts`](../../packages/shared/src/schemas/requests.ts); response shapes are the types in [`views.ts`](../../packages/shared/src/schemas/views.ts). The schema name is given for each endpoint below.

## Conventions

**Authentication.** Every route except `POST /auth/login` and `GET /health` requires the `nova_session` cookie set at login (HttpOnly, SameSite=Lax, Secure in production). Unauthenticated requests get `401 UNAUTHENTICATED`.

**Authorisation.** Routes declare the permission they need. Roles: `ADMIN` (all), `PRODUCER` (all except `user:manage` and `workflow:manage`), `VIEWER` (`workspace:read`, `finance:read`). Missing permission → `403 FORBIDDEN`.

**CSRF.** State-changing requests whose `Origin` is not the web app, or that the browser marks `Sec-Fetch-Site: cross-site`, are rejected with `403 BAD_ORIGIN`.

**Errors.** Every error uses one envelope:

```json
{
  "error": {
    "code": "TRANSITION_BLOCKED",
    "message": "1 blocking task still open: Colour grade.",
    "details": { "blockers": [] },
    "requestId": "4f1c…"
  }
}
```

| Status | Codes                                                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED` (`details`: `[{ path, message }]`)                                                                                                                                                         |
| 401    | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`                                                                                                                                                                       |
| 403    | `FORBIDDEN`, `BAD_ORIGIN`                                                                                                                                                                                      |
| 404    | `NOT_FOUND`                                                                                                                                                                                                    |
| 409    | `BOOKING_CONFLICT`, `CREW_CONFLICT`, `ASSET_UNAVAILABLE`, `ALREADY_BOOKED`, `ALREADY_CALLED`, `ALREADY_DECIDED`, `ALREADY_APPROVED`, `REVIEW_PENDING`, `APPROVAL_EXISTS`, `ALREADY_EXISTS`, `ALREADY_RESOLVED` |
| 422    | `TRANSITION_BLOCKED`, `DEPENDENCIES_OPEN`, `DEPENDENCY_CYCLE`, `CROSS_PROJECT`, `NOT_SKIPPABLE`, `NOT_PENDING`, `INVALID_*` (unknown referenced entity)                                                        |
| 429    | `RATE_LIMITED` (login: 10/min; assistant messages: 30/min)                                                                                                                                                     |
| 500    | `INTERNAL` (logged with the request ID)                                                                                                                                                                        |

Every response carries an `x-request-id` header.

**Audit.** Every successful state change writes an `ActivityLog` row in the same transaction and is pushed to `GET /events`.

## Endpoints

### Auth and health

| Method | Path           | Permission | Body / query   | Notes                                       |
| ------ | -------------- | ---------- | -------------- | ------------------------------------------- |
| POST   | `/auth/login`  | public     | `LoginRequest` | Sets the session cookie; returns `{ user }` |
| POST   | `/auth/logout` | public     | —              | 204; revokes the session, expires cookie    |
| GET    | `/auth/me`     | session    | —              | `{ user: SessionUser }`                     |
| GET    | `/health`      | public     | —              | Liveness + database round-trip              |

### Workspace

| Method | Path                      | Permission     | Body / query                                                                         | Returns                                                                                              |
| ------ | ------------------------- | -------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| GET    | `/workspace/pulse`        | workspace:read | —                                                                                    | `PulseView`: spine flow metrics, ranked attention queue, upcoming 14 days, totals, weighted pipeline |
| GET    | `/search`                 | workspace:read | `SearchQuery` (`q`)                                                                  | `SearchResult[]` across projects, tasks, clients, people, assets, shoots, leads                      |
| GET    | `/activity`               | workspace:read | `ActivityQuery` (`projectId`, `entityType`, `entityId`, `source`, `cursor`, `limit`) | `Page<ActivityView>` (cursor pagination, newest first)                                               |
| GET    | `/events`                 | workspace:read | —                                                                                    | Server-Sent Events: `ready`, then `activity` events                                                  |
| GET    | `/notifications`          | session        | —                                                                                    | `{ items, unread }` for the current user                                                             |
| POST   | `/notifications/:id/read` | session        | —                                                                                    | 204                                                                                                  |
| POST   | `/notifications/read-all` | session        | —                                                                                    | 204                                                                                                  |

### Projects and workflow

| Method | Path                                 | Permission          | Body / query                                                                          | Notes                                                                                                                            |
| ------ | ------------------------------------ | ------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/projects`                          | workspace:read      | `ProjectListQuery` (`q`, `stage`, `clientId`, `memberId`, `status`, `health`, `sort`) | `ProjectSummary[]` with computed health and progress                                                                             |
| GET    | `/projects/:id`                      | workspace:read      | —                                                                                     | `ProjectDetail`: stages, tasks, deliverables, approvals, shoots, transitions, finance, `advance` evaluation, delivery projection |
| POST   | `/projects`                          | project:write       | `CreateProject`                                                                       | Starts in the first stage of the chosen workflow; code `NM-YY-NNN`                                                               |
| PATCH  | `/projects/:id`                      | project:write       | `UpdateProject`                                                                       | Status, priority, due date, budget…                                                                                              |
| POST   | `/projects/:id/transitions`          | workflow:transition | `TransitionRequest`                                                                   | `FORWARD` (guarded) or `BACKWARD` (reason required). 422 `TRANSITION_BLOCKED` with typed blockers                                |
| POST   | `/projects/:id/stages/:stageId/skip` | workflow:transition | —                                                                                     | Only for pending stages the template marks skippable                                                                             |
| GET    | `/workflows`                         | workspace:read      | —                                                                                     | `WorkflowTemplateView[]`                                                                                                         |
| POST   | `/workflows`                         | workflow:manage     | `CreateWorkflowTemplate`                                                              | Copies an existing template                                                                                                      |
| PATCH  | `/workflows/stages/:id`              | workflow:manage     | `UpdateStageDefinition`                                                               | Planned days, approval gate, skippable, exit criteria                                                                            |

### Tasks

| Method | Path                                   | Permission     | Body            | Notes                                                                          |
| ------ | -------------------------------------- | -------------- | --------------- | ------------------------------------------------------------------------------ |
| GET    | `/tasks/:id`                           | workspace:read | —               | `TaskView`                                                                     |
| POST   | `/tasks`                               | task:write     | `CreateTask`    | Defaults to the project's current stage                                        |
| PATCH  | `/tasks/:id`                           | task:write     | `UpdateTask`    | Starting or finishing a task with open prerequisites → 422 `DEPENDENCIES_OPEN` |
| DELETE | `/tasks/:id`                           | task:write     | —               | 204                                                                            |
| POST   | `/tasks/:id/dependencies`              | task:write     | `AddDependency` | Same project only; cycles → 422 `DEPENDENCY_CYCLE`                             |
| DELETE | `/tasks/:id/dependencies/:dependsOnId` | task:write     | —               |                                                                                |

### Deliverables, reviews and approvals

| Method | Path                           | Permission      | Body                           | Notes                                                                                                  |
| ------ | ------------------------------ | --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| POST   | `/deliverables/:id/review`     | project:write   | `SendForReview`                | Opens revision round _n_+1 and a pending client approval; rounds beyond the included count are flagged |
| POST   | `/deliverables/:id/feedback`   | project:write   | `AddFeedback`                  | Timecoded note on the latest round                                                                     |
| PATCH  | `/feedback/:id`                | project:write   | `{ status: OPEN \| RESOLVED }` |                                                                                                        |
| POST   | `/stages/:id/approval-request` | project:write   | `SendForReview`                | Requests sign-off on a stage that requires approval                                                    |
| POST   | `/approvals/:id/decision`      | approval:decide | `ApprovalDecision`             | Records the client's decision; closes the round                                                        |

### Schedule and equipment

| Method | Path                              | Permission     | Body / query                | Notes                                                                   |
| ------ | --------------------------------- | -------------- | --------------------------- | ----------------------------------------------------------------------- |
| GET    | `/schedule`                       | workspace:read | `RangeQuery` (`from`, `to`) | Shoots, equipment with bookings, and every conflict in the window       |
| GET    | `/shoots/:id`                     | workspace:read | —                           | `ShootView` with conflicts described from the shoot's side              |
| POST   | `/shoots`                         | schedule:write | `CreateShoot`               |                                                                         |
| PATCH  | `/shoots/:id`                     | schedule:write | `UpdateShoot`               | Equipment bookings follow the shoot's time window                       |
| POST   | `/shoots/:id/bookings`            | schedule:write | `BookAsset`                 | Overlap → 409 `BOOKING_CONFLICT` unless `allowOverlap: true` (recorded) |
| DELETE | `/shoots/:id/bookings/:bookingId` | schedule:write | —                           |                                                                         |
| POST   | `/shoots/:id/crew`                | schedule:write | `CallCrew`                  | Overlap → 409 `CREW_CONFLICT` unless `allowOverlap: true`               |
| DELETE | `/shoots/:id/crew/:crewCallId`    | schedule:write | —                           |                                                                         |
| GET    | `/assets`                         | workspace:read | `RangeQuery`                | `AssetView[]`                                                           |
| PATCH  | `/assets/:id`                     | asset:write    | `UpdateAsset`               | e.g. move to maintenance                                                |

### People, clients, sales, finance

| Method | Path                        | Permission     | Body                  | Notes                                          |
| ------ | --------------------------- | -------------- | --------------------- | ---------------------------------------------- |
| GET    | `/team`                     | workspace:read | —                     | `MemberView[]` with four rolling weeks of load |
| GET    | `/team/:id`                 | workspace:read | —                     | `MemberDetail` with open tasks                 |
| GET    | `/clients`                  | workspace:read | —                     | `ClientView[]`                                 |
| GET    | `/clients/:id`              | workspace:read | —                     | `ClientDetail`: projects, interactions, leads  |
| POST   | `/clients`                  | client:write   | `CreateClient`        |                                                |
| POST   | `/clients/:id/interactions` | client:write   | `LogInteraction`      | Calls, emails, meetings, WhatsApp, feedback    |
| GET    | `/leads`                    | workspace:read | —                     | `LeadView[]`                                   |
| POST   | `/leads`                    | sales:write    | `CreateLead`          |                                                |
| PATCH  | `/leads/:id`                | sales:write    | `UpdateLead`          | Stage changes, value, close date               |
| GET    | `/finance/summary`          | finance:read   | —                     | `FinanceSummary` (demo data; `isDemo: true`)   |
| POST   | `/finance/records`          | finance:write  | `CreateFinanceRecord` |                                                |

### NOVA assistant

| Method | Path                             | Permission                                  | Body                                                                       | Notes                                                                                                                         |
| ------ | -------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/assistant/status`              | assistant:use                               | —                                                                          | `{ provider: "demo" \| "claude", model }`                                                                                     |
| GET    | `/assistant/history`             | assistant:use                               | —                                                                          | Last 40 turns with their proposals                                                                                            |
| POST   | `/assistant/messages`            | assistant:use                               | `AssistantMessageRequest` (`message`, `context: { lens, focus, inspect }`) | `AssistantReply`: content, linked references, proposals (never applied), suggestions                                          |
| POST   | `/assistant/actions/:id/confirm` | assistant:use + the change's own permission | —                                                                          | Applies the proposal through the normal domain service; returns it as `CONFIRMED`, `STALE` (target changed since) or `FAILED` |
| POST   | `/assistant/actions/:id/cancel`  | assistant:use                               | —                                                                          |                                                                                                                               |

## Examples

```bash
# Sign in (keeps the cookie in jar.txt)
curl -c jar.txt -H 'content-type: application/json' \
  -d '{"email":"admin@nova.local","password":"<SEED_ADMIN_PASSWORD>"}' \
  http://localhost:3100/api/v1/auth/login

# What needs attention
curl -b jar.txt http://localhost:3100/api/v1/workspace/pulse

# Try to move a production on — returns 422 with the blocking tasks
curl -b jar.txt -H 'content-type: application/json' -d '{"direction":"FORWARD"}' \
  http://localhost:3100/api/v1/projects/<id>/transitions

# Ask NOVA, then confirm the proposal it returns
curl -b jar.txt -H 'content-type: application/json' \
  -d '{"message":"Create a task \"Archive rushes\" for Woven Light due Friday"}' \
  http://localhost:3100/api/v1/assistant/messages
curl -b jar.txt -X POST http://localhost:3100/api/v1/assistant/actions/<proposalId>/confirm
```

## ERP endpoints (Phases 9–13)

Every route needs a session; the permission column is enforced by `PermissionsGuard` (`any of` = `@RequireAnyPermission`). Request bodies are the Zod schemas in `packages/shared/src/schemas/erp-requests.ts`; responses are the views in `erp-views.ts`.

| Area               | Routes                                                                                                                                                 | Permission                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Users & roles      | `GET/POST /admin/users`, `PATCH /admin/users/:id`, `POST /admin/users/:id/password`, `DELETE /admin/users/:id/sessions`                                | `user:manage` (no granting or managing a role with permissions you lack)                                                          |
|                    | `GET /admin/roles` · `POST /admin/roles`, `PATCH/DELETE /admin/roles/:id`                                                                              | any of `user:manage`, `role:manage` · `role:manage`                                                                               |
| Approval rules     | `GET /admin/approval-rules` · `POST`, `PUT/DELETE /admin/approval-rules/:id`                                                                           | any approver permission · `role:manage`                                                                                           |
| My account         | `GET /me/sessions`, `DELETE /me/sessions/:id`, `POST /me/password`, `GET/PUT /me/notification-preferences`                                             | session                                                                                                                           |
| Approvals          | `GET /approval-requests?scope=waiting\|requested\|all`, `GET /approval-requests/:id`, `POST /approval-requests/:id/decision`                           | `workspace:read`; deciding needs the step's permission, not being an owner of the request, and not having decided an earlier step |
| Vendors            | `GET /vendors`, `GET /vendors/:id` · `POST /vendors`, `PATCH /vendors/:id`                                                                             | any of `finance:read`, `vendor:write`, `procurement:request` · `vendor:write`                                                     |
| Expenses           | `GET /expenses[?status&projectId&mine=true]`, `GET /expenses/:id`                                                                                      | any of `expense:submit`, `finance:read` (own only without `finance:read`)                                                         |
|                    | `POST /expenses`, `PATCH /expenses/:id`, `POST /expenses/:id/submit\|withdraw`, `DELETE /expenses/:id`                                                 | `expense:submit`                                                                                                                  |
|                    | `POST /expenses/:id/pay` (posts the ledger entry)                                                                                                      | `finance:write`                                                                                                                   |
| Invoices           | `GET /finance/overview`, `GET /invoices[?status&clientId&projectId&overdue=true]`, `GET /invoices/:id`                                                 | `finance:read`                                                                                                                    |
|                    | `POST /invoices`, `PATCH /invoices/:id` (drafts), `POST /invoices/:id/send\|void`                                                                      | `invoice:write`                                                                                                                   |
|                    | `POST /invoices/:id/payments` (≤ balance; posts the ledger entry)                                                                                      | `finance:write`                                                                                                                   |
| Procurement        | `GET /purchase-requests`, `GET /purchase-requests/:id`, `GET /purchase-orders`, `GET /purchase-orders/:id`                                             | any procurement permission or `finance:read`                                                                                      |
|                    | `POST /purchase-requests`, `POST /purchase-requests/:id/submit` · `…/cancel`                                                                           | `procurement:request` · requester or `procurement:order`                                                                          |
|                    | `POST /purchase-requests/:id/quotes`, `…/quotes/:quoteId/select`                                                                                       | `procurement:order`/`procurement:approve` (quotes also `vendor:write`)                                                            |
|                    | `POST /purchase-orders` (≤ approved amount), `POST /purchase-orders/:id/receive\|cancel`                                                               | `procurement:order`                                                                                                               |
| Inventory          | `GET /stock`, `GET /stock/:id` · `POST /stock`, `PATCH /stock/:id`, `POST /stock/:id/movements`                                                        | `workspace:read` · `inventory:write`                                                                                              |
| Equipment          | `GET /assets/:id` · `PATCH /assets/:id/details`, `POST /assets/:id/maintenance`, `POST /assets/:id/maintenance/:mid/complete`                          | `workspace:read` · `asset:write`                                                                                                  |
| People             | `GET /hr/employees` (records only with `hr:read`), `GET /hr/departments`, `GET/POST /hr/leave`, `POST /hr/leave/:id/cancel`, `GET/POST /hr/attendance` | `workspace:read` (self-service rules in `HrService`)                                                                              |
|                    | `PATCH /hr/employees/:id`, `POST /hr/departments`, `PUT /hr/departments/:id` · `PUT /hr/employees/:id/record`                                          | `hr:write` · `hr:read` + `hr:write`                                                                                               |
| Studios            | `GET /studios` · `POST /studio-bookings`, `PATCH /studio-bookings/:id`                                                                                 | `workspace:read` · `studio:write`                                                                                                 |
| Documents          | `GET /documents`, `GET /documents/:id`, `GET /documents/:id/versions/:v/file` · `POST /documents`, `POST /documents/:id/versions` (multipart `file`)   | `document:read` · `document:write` (confidential/HR/finance visibility in `DocumentsService`)                                     |
| Project plan & CRM | `GET/POST /projects/:id/milestones`, `PATCH …/milestones/:mid`, `GET/POST /projects/:id/risks`, `PUT …/risks/:rid`                                     | `workspace:read` · `project:write`                                                                                                |
|                    | `GET/POST /clients/:id/contacts`, `DELETE …/contacts/:cid` · `PATCH /leads/:id/ownership` · `POST /leads/:id/convert`                                  | `client:write` · `sales:write` · `sales:write` + `project:write`                                                                  |

New error codes include `STUDIO_CONFLICT`, `CREW_ON_LEAVE`, `OVER_APPROVED_AMOUNT`, `INSUFFICIENT_STOCK`, `OVERPAYMENT`, `APPROVAL_CLOSED`, `FILE_REJECTED`, `FINANCE_ONLY`, `LEAVE_OVERLAP`, `LEAVE_TOO_OLD`, `LAST_SUPER_ADMIN`, `ROLE_IN_USE`, `LEAD_CONVERTED`.
