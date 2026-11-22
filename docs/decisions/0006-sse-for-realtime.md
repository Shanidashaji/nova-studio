# ADR-0006 — Server-Sent Events for real-time updates; no Redis

**Status:** Accepted (2026-11-22)

## Context

When one panel changes data (a task completes, a stage advances), other panels and the activity stream should update without a manual refresh. The brief lists Socket.IO and Redis as possible additions, "only when they genuinely improve the project".

## Decision

- Use Server-Sent Events from the API (`GET /api/v1/events`), fed by NestJS's in-process event emitter.
- The client maps each event to TanStack Query invalidations and appends it to the live activity stream.
- Do not add Redis or Socket.IO.

## Alternatives

- **Socket.IO** — bidirectional, but NOVA only needs server-to-client pushes; client actions already go through REST. It would add a second protocol and client library.
- **Polling** — simpler, but wasteful and visibly laggy in a live demo.
- **Redis pub/sub** — needed only when running several API instances. NOVA runs one.

## Consequences

- No extra infrastructure; works through the Next.js rewrite and with cookie authentication.
- Scaling to several API instances later would need a shared pub/sub (Redis or PostgreSQL `LISTEN/NOTIFY`); the emitter is behind an interface so this is a contained change.
