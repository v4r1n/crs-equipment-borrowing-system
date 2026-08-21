# Project Memory

Last updated: 2026-08-21

## Current state

- Active branch: `codex/initial-v1`
- Current version: `0.1.0` under development
- Completed: Phase 1 — architecture, schema, workflow, project rules, migration direction
- Completed: Phase 2 — manifest/config, schema setup, immutable migration ledger, sequences, repositories, utilities, validation, cache helpers
- Next: Phase 3 — authentication, guarded API, equipment/borrow/user/category/history/dashboard/image services

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

## Phase 2 verification

- Combined Apps Script source passes Node.js syntax checking; `appsscript.json` parses as valid JSON.
- Pure contract checks pass for leap/invalid dates, due-date ordering, overdue boundary, formula escaping, domain matching, QR URL construction, and sequence-to-schema mappings.
- In-memory Apps Script review verified first setup and rerun idempotency: 10 sheets, 13 categories, 7 sequences, 1 admin, 4 settings, and 1 migration.
- Verified automatic grid expansion past 26 columns and 1,000 rows, existing-user admin promotion, partial updates preserving untouched Date/formula cells, immutable primary keys, unknown-field rejection, cache fallback, and pagination clamping.
- Verified the immutable migration `001_initial_schema` SHA-256 checksum against its frozen V1 schema material.
- Live Google deployment checks remain for Phase 7 because deployer-owned Spreadsheet/Drive IDs are intentionally not stored in source.
