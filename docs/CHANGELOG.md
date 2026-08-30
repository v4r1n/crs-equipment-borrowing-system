# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 1 system architecture for a Google Apps Script HTML-service SPA.
- Migration-friendly Google Sheets schema with stable IDs and append-only history.
- Explicit borrow/equipment state machine, return inspection contract, and derived overdue rule.
- Security, performance, coding, and phase-end project conventions.
- Initial migration guide and architectural decision log.
- Apps Script V8 manifest and centralized deployment configuration with Script Property overrides.
- Idempotent `setupSystem()` for all eleven Sheets, formatting, warning protection, default categories, settings, sequences, migrations, and bootstrap admins.
- Header-based bulk repository with grid growth, partial updates, immutable primary keys, serialization, and best-effort cache helpers.
- Lock-safe collision-resistant ID allocation and recovery for assets, borrows, users, categories, items, and logs.
- Immutable migration ledger with pre-mutation checksum validation and duplicate-data preflight.
- Shared Thai-safe errors, validation, date/overdue, normalization, formula-injection, and QR URL utilities.
- Fail-closed Google Workspace session authentication, active-user/admin authorization, optional deterministic user provisioning, and role-specific response DTOs.
- Guarded RPC surface for dashboard, equipment, borrowing, history, users, categories, image upload, integrity audit, and operation recovery.
- Equipment, included-item, borrow approval/checkout/return, user, category, dashboard, history, and Google Drive image services with optimistic row versions.
- Durable Operations journal with payload/result hashes, exact source-or-target replay, admin reconciliation, pending-entity reservations, and evidence-based terminal abort for untouched image uploads.
- Return-time immutable included-item snapshots, required-item enforcement, exact checklist validation, and separate condition/disposition decisions.
- Schema migrations 002 and 003 for the Operations journal, required-item evidence, multi-cell stored results, result integrity hashes, and `ABORTED` operations.
- Cross-sheet integrity audit for IDs, references, state projections, operation/history evidence, migration checksums, and required-item snapshots.
- Responsive Thai single-page shell with desktop sidebar, mobile bottom navigation, Noto Sans Thai design system, access/loading/offline states, confirmations, and toast feedback.
- Dashboard views for users and admins, including current metrics, latest loans, due-soon/overdue lists, and most-borrowed equipment.
- Searchable, filterable, sortable, paginated equipment catalog with card/table modes, detail view, included items, and admin equipment editor, status, and Drive-image workflows.
- Borrow request, My Borrow, personal history, return-request, account, and complete admin-center screens for borrowing, assets, users, categories, history, integrity audit, and durable operation recovery.
- Promise-based client API for all 32 guarded RPCs, SPA history/deep links, optimistic row versions, field-level Thai errors, and session-backed stable command IDs for uncertain retries.
- Vendored, checksummed `qrcode-generator` 2.0.4 and `html5-qrcode` 2.3.8 distributions with license and third-party notices.
- Equipment QR display, canonical-link copy, and high-resolution PNG sticker download with level-Q correction and a four-module quiet zone.
- Mobile-first QR image capture/file scanning, strict canonical payload validation, manual Asset ID fallback, route cleanup, and exact-asset Admin borrowing handoff.
- Deterministic Node test harnesses for Apps Script services and source/security contracts, plus an offline Playwright HTML-service harness with responsive acceptance at 320, 768, and 1440 pixels.
- Automated coverage for the complete borrow/return lifecycle, double booking, permissions, overdue projection, duplicate IDs and business keys, setup/migration integrity, QR browser actions, Thai error states, and Admin scan handoff.

### Changed

- Upgraded the additive data contract to schema version 3 and expanded setup/repositories for the Operations sheet and batched multi-row writes.
- Made a pending borrow request an immediate hard hold and synchronized every workflow transition between Borrow and Equipment under the Script Lock.
- Drive image URLs retain resource keys when present and support only verified `DOMAIN_WITH_LINK` or `ANYONE_WITH_LINK` sharing.
- Admin/user dashboard links preserve route filters, equipment creation supports an admin deep link, and category mutations refresh the in-memory active-category reference list.
- Keep every sequential domain ID at its documented fixed width and fail atomically with `ID_EXHAUSTED` when its numeric range is full.
- Contain the six-tab Admin navigation in a horizontal scroll region on narrow screens.

### Security

- Re-authorize every mutation from the current Users row inside the Script Lock; blank, external, unknown, inactive, or insufficient-role identities fail closed.
- Restrict first setup to configured same-domain admins and subsequent setup runs to currently active admins, with authorization checked inside the setup lock.
- Redact procurement, Drive file, active-workflow, and staff audit fields from non-admin equipment/borrowing responses.
- Escape dynamic client markup, allowlist routes/includes and Drive thumbnail URLs, gate admin routes in the client, and re-authorize every admin operation on the server.
- Prevent an active admin from changing the email of their own signed-in Users row, avoiding identity orphaning; another admin may perform the controlled change.
- Keep scan images local, reject external/malformed/ambiguous QR payloads, and avoid permission-sensitive live-camera APIs inside the Apps Script HTML-service sandbox.
- Remove the internal error constructor from the callable Apps Script surface by renaming it `AppError_`; automated contracts now fail if an unreviewed public server function appears.

[Unreleased]: https://github.com/v4r1n/crs-equipment-borrowing-system/compare/main...codex/initial-v1
