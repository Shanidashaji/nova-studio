# ADR-0008 — Dependency version policy

**Status:** Accepted (2026-11-22)

## Context

Versions were checked against the npm registry when the project was scaffolded. Several "latest" tags were not safe defaults:

| Package        | `latest` tag | Issue                                                     |
| -------------- | ------------ | --------------------------------------------------------- |
| `typescript`   | 7.0.x        | `typescript-eslint` 8.x supports TypeScript `<6.1` only   |
| `@nestjs/*`    | 12.x         | New ESM-only major; NestJS 11 is the mature CommonJS line |
| `prisma` (CLI) | 8.0.0-rc     | Release candidate; `@prisma/client` latest is 7.10.x      |

## Decision

- TypeScript **6.0.x** across the monorepo.
- NestJS **11.2.x**.
- Prisma CLI and client **7.10.x** (matching versions).
- Other packages use their current stable release, with exact versions recorded in `pnpm-lock.yaml`.
- Node.js **≥ 24.7** (`engines`) — required for the built-in `crypto.argon2`; developed on Node 26.

## Consequences

- The whole toolchain (type-checking, linting, Nest CLI, Prisma) works together today.
- Upgrading to TypeScript 7 and NestJS 12 is a later, isolated change, once `typescript-eslint` supports TypeScript 7.
