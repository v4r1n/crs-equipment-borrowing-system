# Project Memory

Last updated: 2026-08-27

## Current state

- Active branch: `codex/initial-v1`
- Current version: `0.1.0` under development
- Completed: Phase 1 — architecture, schema, workflow, project rules, migration direction
- Completed: Phase 2 — manifest/config, schema setup, immutable migration ledger, sequences, repositories, utilities, validation, cache helpers
- Completed: Phase 3 — Workspace authentication, guarded RPCs, domain services, durable operation recovery, Drive images, integrity audit, and schema v3 migrations
- Completed: Phase 4 — responsive Thai SPA shell, navigation, dashboards, equipment/borrowing/admin screens, forms, state handling, and client RPC integration
- Next: Phase 5 — QR generation, asset-link display/download, deep-link handling, and camera scanner

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

## Phase 3 verification

- All 22 Apps Script files pass individual and combined V8-compatible syntax compilation; `appsscript.json` parses as valid JSON and `git diff --check` is clean.
- Static contracts verify schema version 3, the exact 21-column Operations header, `BorrowItems.is_required`, all three immutable migration IDs, and the frozen SHA-256 Base64URL checksum for migration 003.
- Verified all 32 public application RPC wrappers use `executeSafely_` plus a user/admin guard, and every journaled mutation action has an admin recovery route.
- Verified source contains no `Session.getEffectiveUser()` or unsupported private Drive-image sharing path. Setup validates the caller inside the Script Lock; first bootstrap requires a configured same-domain admin, while every later run requires an active Users-row admin.
- Read-only recovery/security review covered exact source/target replay, role-specific DTO redaction, active-workflow holds, return checklist evidence, result hashes, safe image aborts, unique reservations, cache epochs, and batch row updates. It also reproduced and closed partial equipment-edit recovery, setup authorization races, stale auto-provision authorization, uncertain Drive-resource cleanup, and invalid `ABORTED` evidence cases.
- Live Workspace identity, Apps Script authorization, Drive sharing/resource-key behavior, browser RPC, and deployed web-app acceptance remain for Phase 7 because they require deployer-owned resources.

## Phase 4 verification

- All 23 Apps Script files pass individual and combined V8-compatible syntax compilation; all six inline client controllers compile, `appsscript.json` parses, and `git diff --check` is clean.
- Static integration checks match all 32 guarded public RPCs to Promise client endpoints, all nine allowlisted routes to registered renderers, all six mounted view templates to source templates, and every server include to an allowlisted HTML partial.
- Responsive Thai UI covers the desktop sidebar, mobile bottom navigation with a central Scan action, access/loading/offline/toast/confirm states, dashboard, equipment card/table catalog, detail, borrow request, My Borrow/history, account, and all six admin tabs.
- Admin workflows use current row versions and stable browser command IDs for approve, reject, checkout, return inspection, equipment/user/category mutations, and operation abort. Return inspection sends every immutable BorrowItems snapshot and enforces required-item plus condition/disposition rules before the server revalidates them.
- Read-only frontend review closed deep-link filter gaps, stale category options, an invalid catalog pagination structure, exact Asset/Borrow ID validation, dashboard admin routing/latest-borrow selection, route-selector hardening, and the signed-in admin email orphaning case. The email rule is also enforced in `UserService.gs`, not only by a read-only field.
- HTML structure checks found no duplicate static IDs, unbalanced tags/CSS braces, mojibake, inline event-handler attributes, `javascript:` URLs, or unfinished runtime markers.
- Live responsive layout, `google.script.run`, Workspace session behavior, and browser accessibility acceptance remain for Phase 7 because the deployment configuration and accounts are deployer-owned.
