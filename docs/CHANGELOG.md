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

### Changed

- Upgraded the additive data contract to schema version 3 and expanded setup/repositories for the Operations sheet and batched multi-row writes.
- Made a pending borrow request an immediate hard hold and synchronized every workflow transition between Borrow and Equipment under the Script Lock.
- Drive image URLs retain resource keys when present and support only verified `DOMAIN_WITH_LINK` or `ANYONE_WITH_LINK` sharing.

### Security

- Re-authorize every mutation from the current Users row inside the Script Lock; blank, external, unknown, inactive, or insufficient-role identities fail closed.
- Restrict first setup to configured same-domain admins and subsequent setup runs to currently active admins, with authorization checked inside the setup lock.
- Redact procurement, Drive file, active-workflow, and staff audit fields from non-admin equipment/borrowing responses.

[Unreleased]: https://github.com/v4r1n/crs-equipment-borrowing-system/compare/main...codex/initial-v1
