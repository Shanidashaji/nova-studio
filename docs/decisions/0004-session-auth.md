# ADR-0004 — Database-backed session authentication in the API

**Status:** Accepted (2026-11-22)

## Context

NOVA needs admin login, logout, protected routes, session handling, secure password storage and role-based authorisation. Authentication must live in the API (ADR-0002), because the API is the authority for every request.

## Decision

Implement a small, explicit session system inside the NestJS `auth` module:

- Argon2id password hashing with Node's built-in `crypto.argon2` (Node ≥ 24.7), stored in PHC format with OWASP minimum parameters (m=19 MiB, t=2, p=1). A native add-on (`@node-rs/argon2`) was tried first and rejected: Windows Smart App Control blocks unsigned `.node` binaries on the development machine, and the built-in needs no native code at all.
- Opaque 256-bit random session token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). Only its SHA-256 hash is stored in the `Session` table.
- Idle and absolute expiry; session deleted on logout; all sessions for a user can be revoked.
- `SessionGuard` applied globally; routes opt out with `@Public()`.
- RBAC through `Role`/`Permission` tables and a `@RequirePermissions()` decorator.
- Login rate-limited; uniform error messages; `Origin` check on state-changing requests.

## Alternatives

- **Better Auth** — well designed, but its primary integration is with the frontend framework; running it inside NestJS adds adapter code and hides the mechanism.
- **Auth.js** — oriented to OAuth providers and Next.js; credential login is deliberately discouraged in its docs and sessions would live in Next rather than the API.
- **Stateless JWT** — cannot be revoked on logout without a denylist, which reintroduces server state.

## Consequences

- About 300 lines of auditable code, fully covered by integration tests.
- Every mechanism can be explained line by line in an interview.
- OAuth/SSO is not included; the `User`/`Session` model leaves room to add it.
