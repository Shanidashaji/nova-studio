# Roadmap, Risks and Decisions Log

## Phases

| Phase                   | Deliverable                                                                                                                                                                                                                                           | Status                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1 — Research & planning | `docs/research`, `docs/architecture`, `docs/decisions`                                                                                                                                                                                                | Done                         |
| 2 — Design              | `docs/design/01-design-system.md`; tokens in `apps/web/src/styles/tokens.css`                                                                                                                                                                         | Done                         |
| 3 — Foundation          | Monorepo, Prisma schema + migration, embedded PostgreSQL, deterministic seed, NestJS (config, errors, logging, CSRF, sessions, RBAC), Next.js shell with login and protected `/studio`                                                                | Done                         |
| 4 — Unified workspace   | Pipeline Spine, lenses, focus model with URL sync, context column, command palette, Pulse with the attention queue, SSE live updates                                                                                                                  | Done                         |
| 5 — Modules & workflows | Productions (grid / stage board / table), workflow engine and templates, tasks + dependency graph, deliverables / revisions / approvals, Schedule with conflict detection, People workload, Clients & Sales, Business (demo), Activity, notifications | Done                         |
| 6 — NOVA AI             | Demo provider, Claude provider, confirm-before-write proposals, voice input/output with fallback                                                                                                                                                      | Done                         |
| 7 — Testing             | Unit (shared, web), API integration, component, Playwright end-to-end incl. mobile                                                                                                                                                                    | Done — see README for counts |
| 8 — Polish              | Accessibility pass, docs, screenshots, API reference                                                                                                                                                                                                  | Done                         |
| 9–13 — ERP expansion   | Roles & administration, approval engine, finance, procurement, inventory, HR, studios, documents, CRM/project gaps — see [plan](erp-expansion-plan.md) and [PROJECT_STATUS](../../PROJECT_STATUS.md) | Done |
| 14 — ERP intelligence  | Attention-queue signals, NOVA tools and analytics for the new modules | Planned |

## Issues met during the build

| Issue                      | What happened                                                                                                 | Resolution                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows Smart App Control  | Blocked the unsigned native add-on `@node-rs/argon2` (`An Application Control policy has blocked this file`). | Switched to Node's built-in `crypto.argon2` (ADR-0004). No native add-ons remain.                                                                 |
| PostgreSQL encoding        | The embedded cluster defaulted to the Windows code page (WIN1252) and rejected `₹`.                           | `initdb --encoding=UTF8 --locale=C`; the start script now checks `server_encoding` (ADR-0003).                                                    |
| OneDrive-synced repository | `next build` failed with `EPERM … unlink .next/…` while files were locked.                                    | Delete `.next` before rebuilding. Recommended: keep the repository outside a synced folder. The database data directory already lives outside it. |
| Dependency majors          | `typescript@7` breaks `typescript-eslint`; `@nestjs/*@12` is ESM-only.                                        | Pinned TypeScript 6.0 and NestJS 11.2 (ADR-0008).                                                                                                 |

## Remaining risks and limitations

| Risk                                                       | Impact                                     | Mitigation                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Web Speech API is Chromium-only                            | No voice input in Firefox/Safari           | Feature-detected; microphone shown disabled with an explanation; text always works                             |
| Demo-mode assistant understands a focused set of phrasings | Unusual questions get a help message       | Suggestions guide the user; the Claude provider handles open-ended language when a key is set                  |
| Single API instance for SSE                                | Several instances would not share events   | The emitter is behind an interface; Redis or PostgreSQL `LISTEN/NOTIFY` would be a contained change (ADR-0006) |
| In-memory computation of health and flow                   | Fine for tens of projects, not thousands   | Move to SQL aggregates or materialised views when the data grows                                               |
| E2E suite re-seeds the development database                | Local changes are reset by `pnpm test:e2e` | Documented; set `E2E_SKIP_SEED=1` to keep data                                                                 |

## Future improvements

- Media review: frame-accurate playback with timecoded comments (a Frame.io-style player) instead of text-only feedback.
- Client portal: a restricted login for clients to approve versions directly instead of the studio recording decisions.
- Invoicing and payments tied to milestones; real accounting export.
- Calendar sync (Google / Outlook) for shoots and crew calls.
- WhatsApp Business integration for client communication history.
- OAuth / SSO, user management UI, per-project permissions.
- Learned delivery predictions once enough real history exists (the current projection is a transparent heuristic).
- Background job queue for notifications and digests.
