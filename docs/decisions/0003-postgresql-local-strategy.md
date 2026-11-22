# ADR-0003 — PostgreSQL everywhere; embedded server for local development

**Status:** Superseded by [ADR-0014](0014-mongodb-and-single-vercel-app.md) — originally accepted (2026-11-22)

## Context

The brief specifies PostgreSQL with Prisma. The development machine has neither Docker nor a PostgreSQL installation. Reviewers cloning the repository may or may not have Docker.

## Decision

- The schema targets PostgreSQL only (no SQLite fallback, which would diverge in types, JSON handling and case-insensitive search).
- `pnpm db:start` runs a real PostgreSQL server through the `embedded-postgres` npm package, which downloads official platform binaries. No system installation is needed.
- `docker-compose.yml` is provided as an alternative for machines with Docker.
- Any external PostgreSQL works by setting `DATABASE_URL`.
- The embedded server's data directory defaults to a folder **outside** the repository (`NOVA_PG_DATA_DIR`), because synced folders such as OneDrive can lock or corrupt database files.

## Alternatives

- **SQLite for development** — simpler, but different behaviour from production and would undermine the "PostgreSQL" claim.
- **PGlite (PostgreSQL compiled to WebAssembly)** — attractive, but Prisma support is through a preview adapter; a real server is lower risk.
- **Hosted database (Neon, Supabase)** — requires an account and sends data off the machine; kept as an option via `DATABASE_URL`, not the default.

## Implementation note

The embedded cluster is initialised with `--encoding=UTF8 --locale=C`. Without it, Windows initialises the cluster in the OS code page (WIN1252), which cannot store characters such as `₹` — this was found during development and the script now checks `server_encoding` at start-up.

## Consequences

- Zero-install local setup with real PostgreSQL semantics.
- Integration tests use the same server with a separate database.
- First run downloads PostgreSQL binaries (tens of MB).
