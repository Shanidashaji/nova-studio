# ADR-0007 — Zod schemas as the shared API contract

**Status:** Accepted (2026-11-22)

## Context

Requests must be validated in the API, forms must be validated in the UI, and both must agree. NestJS's default validation uses `class-validator` decorators on DTO classes, which cannot be shared with the browser cheaply.

## Decision

- Define request and response schemas once with Zod in `packages/shared/src/schemas`.
- The API validates with a `ZodValidationPipe`; the UI uses the same schemas with React Hook Form's Zod resolver.
- TypeScript types are inferred with `z.infer`, so there is no hand-written duplicate type layer.

## Alternatives

- **class-validator DTOs + generated OpenAPI client** — idiomatic NestJS, but adds a generation step and still duplicates rules in forms.
- **tRPC** — excellent type sharing, but replaces the REST API the brief asks for.

## Consequences

- One definition per contract; a breaking change fails type-checking in both apps.
- API reference documentation is written by hand in `docs/api/` (or generated from the Zod schemas later).
