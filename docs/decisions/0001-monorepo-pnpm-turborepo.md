# ADR-0001 — Monorepo with pnpm workspaces and Turborepo

**Status:** Accepted (2026-11-22)

## Context

NOVA has a web app, an API, a database package and shared validation/domain logic. The web app and API must agree on request and response shapes, and the same workflow rules must run on both sides.

## Decision

One repository using pnpm workspaces for package linking and Turborepo for task orchestration and caching (`build`, `typecheck`, `lint`, `test`).

## Alternatives

- **Two repositories** — contracts would drift and every change would need two pull requests.
- **Nx** — more capable, but its generators and plugin model add concepts an interviewer would need explained; Turborepo is a thin layer over package scripts.
- **npm workspaces only** — workable, but slower installs and no task caching.

## Consequences

- One `pnpm install`, one `pnpm dev`, one CI pipeline.
- Package boundaries are explicit in `package.json` dependencies and enforced by lint rules.
