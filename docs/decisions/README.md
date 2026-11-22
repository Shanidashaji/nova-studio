# Architecture Decision Records

Each record states the context, the decision, the alternatives considered and the consequences. Status values: _Proposed_, _Accepted_, _Superseded_.

| ADR                                                 | Title                                                        | Status   |
| --------------------------------------------------- | ------------------------------------------------------------ | -------- |
| [0001](0001-monorepo-pnpm-turborepo.md)             | Monorepo with pnpm workspaces and Turborepo                  | Accepted |
| [0002](0002-nestjs-api-behind-next-rewrite.md)      | Separate NestJS API, reached through a Next.js rewrite       | Accepted |
| [0003](0003-postgresql-local-strategy.md)           | PostgreSQL everywhere; embedded server for local development | Accepted |
| [0004](0004-session-auth.md)                        | Database-backed session authentication in the API            | Accepted |
| [0005](0005-assistant-provider-and-confirmation.md) | Assistant provider abstraction with confirm-before-write     | Accepted |
| [0006](0006-sse-for-realtime.md)                    | Server-Sent Events for real-time updates; no Redis           | Accepted |
| [0007](0007-shared-zod-contracts.md)                | Zod schemas as the shared API contract                       | Accepted |
| [0008](0008-dependency-versions.md)                 | Dependency version policy                                    | Accepted |
| [0009](0009-configurable-roles.md)                  | Configurable roles over a fixed permission vocabulary        | Accepted |
| [0010](0010-approval-engine.md)                     | A generic approval engine alongside deliverable approvals    | Accepted |
| [0011](0011-ledger-postings.md)                     | The ledger is derived from invoices, payments and expenses   | Accepted |
| [0012](0012-document-storage.md)                    | Private file storage behind the API                          | Accepted |
| [0013](0013-nova-voice-and-multilingual.md)         | NOVA robot figure, model-driven multilingual replies, voice  | Accepted |
