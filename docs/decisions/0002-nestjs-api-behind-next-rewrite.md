# ADR-0002 — Separate NestJS API, reached through a Next.js rewrite

**Status:** Accepted (2026-11-22)

## Context

Next.js can serve API routes itself. The brief prefers NestJS and asks for modular services, guards, validation and logging.

## Decision

A separate NestJS application owns all business logic and data access. Next.js rewrites `/api/*` to it, so the browser sees one origin.

## Alternatives

- **Next.js route handlers / server actions only** — fewer moving parts, but business logic tends to leak into UI code, and there is no natural home for guards, interceptors, module boundaries and SSE.
- **NestJS on a different origin with CORS** — works, but makes cookies third-party-adjacent (needs `SameSite=None; Secure`) and complicates local development.

## Consequences

- Clear separation: the web app is presentation and interaction; the API is the system of record.
- The API can be tested with Supertest without a browser.
- Two processes in development (handled by `pnpm dev` through Turborepo).
- Server components that need data call the API over HTTP with the user's cookie, not the database directly.
