# ADR-0012 — Private file storage behind the API

**Status:** Accepted (2026-11-22)

## Context

Contracts, proposals, scripts, storyboards, invoices and HR documents must be stored without being publicly reachable.

## Decision

- Files are written to `NOVA_STORAGE_DIR` (default: `%LOCALAPPDATA%\nova\storage` on Windows, `~/.local/share/nova/storage` elsewhere) — outside the repository, the web root and synced folders.
- Each version is stored under a random 128-bit key; the original filename is kept only as metadata. Paths are never built from user input.
- Uploads are limited to 20 MB and an allow-list of types (PDF, images, plain text/Markdown, CSV, Office documents). The type is checked from the file's leading bytes as well as the declared MIME type. A SHA-256 hash is stored per version.
- Downloads stream through `GET /documents/:id/versions/:v/file` after the same permission checks as reading the record, with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Documents marked confidential (HR, contracts) require `document:confidential`.
- The storage driver is an interface; an S3-compatible driver with signed URLs is the documented next step and is **not** implemented.

## Consequences

- Nothing in `apps/web/public` or any static path can expose a file.
- Local development needs no cloud account.
