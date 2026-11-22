# ADR-0014 — MongoDB (Mongoose) and one Next.js app on Vercel

**Status:** Accepted (2026-11-22). Supersedes ADR-0002 and ADR-0003, and changes the storage part of ADR-0012.

## Context

The product moves to MongoDB Atlas and is deployed on Vercel. Prisma ORM 7, which NOVA used, has no MongoDB connector. The API used PostgreSQL-only features: `SELECT … FOR UPDATE` row locks, `pg_advisory_xact_lock` for document numbers, composite primary keys and database-enforced foreign keys. Uploaded documents were written to the server's disk, and a Vercel function's disk is temporary.

## Decision

**Data layer.** Mongoose 9 replaces Prisma. `packages/db` holds one schema per former model, generated once from the Prisma schema and maintained by hand since then.

- **Keys.** Documents keep string `_id`s in the former cuid style, and every lean read also returns `id`. The API contract and the web app are unchanged.
- **Relations.** Each former relation is a Mongoose virtual with the same name, so `include` becomes `populate`.
- **Foreign-key rules.** `onDelete` rules (Cascade, SetNull, Restrict) are kept as metadata (`FOREIGN_KEYS`) and applied by `deleteCascade()`. A blocked delete returns HTTP 409.
- **Transactions.** Transactions are MongoDB multi-document transactions, which need a replica set; every Atlas tier is one. Mongoose's `transactionAsyncLocalStorage` makes each call inside `db.transaction()` join the transaction.
- **Row locks.** `db.lock(model, id)` writes to the document so that concurrent transactions conflict, and MongoDB retries the loser. It replaces `FOR UPDATE`.
- **Number allocation.** Document numbers and project codes come from an atomic counter collection. A counter never goes below the highest number already stored.
- **Indexes.** Unique and secondary indexes are created by `pnpm db:setup`. The seed also creates them. They are never created on boot.

**Files.** Uploaded documents are stored in MongoDB GridFS (bucket `documentFiles`). Uploads are capped at 4 MB (`DOCUMENT_MAX_BYTES`, down from 20 MB) to stay under Vercel's 4.5 MB request-body limit.

**Deployment.** The NestJS API is no longer a separate server.

- **Routing.** `apps/web/src/pages/api/[...path].ts` boots the compiled Nest application once per function instance and hands it every `/api/*` request. The whole product deploys as one Vercel project, `apps/web`, in region `bom1`. The browser still talks to one origin, so the session cookie remains first-party.
- **Bundling.** Nest, Mongoose and the driver are server-external packages, loaded by Node and never bundled by Next. Decorator metadata therefore stays exactly as `nest build` emits it.
- **Standalone mode.** The API can still run on its own (`pnpm --filter @nova/api start`). Setting `API_INTERNAL_URL` sends `/api/*` to it.

## Consequences

- No local database server. Development, tests and production each use their own Atlas database (`DATABASE_URL`, `TEST_DATABASE_URL`).
- The SSE stream runs inside a function with `maxDuration` 300 s. The browser's `EventSource` reconnects automatically. Events reach only the clients connected to the instance that handled the write, so other clients see the change on their next refresh or reconnect. A shared pub/sub (for example Atlas change streams) is the follow-up if live fan-out across instances matters.
- In-memory rate limits apply per function instance, not globally.
- `$regex` search replaces PostgreSQL `ILIKE`. User input is escaped (`containsI`).
- The host must run Node ≥ 24.7, because password hashing uses `node:crypto` Argon2. The web package pins `engines.node` to `24.x` for Vercel.
