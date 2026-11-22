# ADR-0009 — Configurable roles over a fixed permission vocabulary

**Status:** Accepted (2026-11-22)

## Context

The first build had three roles hard-coded as a TypeScript enum (`ADMIN`, `PRODUCER`, `VIEWER`). The expanded brief asks for configurable roles (Super Admin, Admin, Production Manager, Project Manager, Finance, HR, Creative Team, Employee) and permission management, enforced on the backend.

## Decision

- **Permissions are code.** Each permission key (e.g. `expense:approve`) is checked by `@RequirePermissions()` on a route, so the list stays a typed constant in `@nova/shared`. Adding a permission is a code change, reviewed like any other.
- **Roles are data.** `Role.key` is a free string. Admins with `role:manage` create roles and edit the role ↔ permission matrix in Settings. The seed writes eight initial roles plus a read-only `VIEWER` guest.
- **Guard rails.** `SUPER_ADMIN` is system-locked (always holds every permission, cannot be edited or deleted). A role that still has users cannot be deleted. A user cannot change their own role or deactivate themselves; only a Super Admin can grant or change Super Admin; the last active Super Admin cannot be removed. Permissions are read from the database on every request, so role edits apply on the next request; deactivation and password resets also delete the user’s sessions.
- **Sensitive data** (employee records, confidential documents, finance) sits behind its own permissions (`hr:read`, `document:confidential`, `finance:read`) rather than "admin".

## Alternatives

- Per-record ACLs: more flexible, far more complex; not needed for a studio-sized team.
- Permissions stored only in the database with free-form keys: the code could not type-check which keys exist.

## Consequences

- Role changes are immediate and auditable (activity entries `role.updated`, `user.updated`).
- The UI hides what a role cannot use, but every decision is still made by the API.
