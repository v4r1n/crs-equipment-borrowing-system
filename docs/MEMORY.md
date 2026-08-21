# Project Memory

Last updated: 2026-08-21

## Current state

- Active branch: `codex/initial-v1`
- Current version: `0.1.0` under development
- Completed: Phase 1 — architecture, schema, workflow, project rules, migration direction
- Next: Phase 2 — Apps Script manifest/config, schema setup, sequences, repositories, utilities, validation, migrations

## Frozen contracts

- One Equipment row is one physical asset; `quantity` is retained for compatibility but fixed to `1`.
- One active workflow per asset; a pending request is a hard hold.
- Borrow and Equipment statuses use canonical English enums and synchronized transitions in BorrowService.
- Overdue is derived; return condition and disposition are separate.
- Identity is same-domain Google Workspace session and fails closed when unavailable.
- QR stores/encodes a canonical detail URL but the URL is derived and refreshable.
- Sheet repositories are the only storage boundary so a future SQL migration preserves services and workflow.

## Configuration still supplied by deployer

`SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, `ADMIN_EMAILS`, `ALLOWED_DOMAIN`, and optionally `WEB_APP_URL` via Script Properties or the documented Config defaults.

## Phase 1 verification

- Compared architecture against all 35 requirement sections.
- Resolved quantity, overdue, return/maintenance, user return notification, future booking, QR stability, and serial uniqueness ambiguities.
- Confirmed remote repository initially contains only `LICENSE`; feature branch was created from `main`.

