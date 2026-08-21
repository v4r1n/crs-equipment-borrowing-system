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
- Idempotent `setupSystem()` for all ten Sheets, formatting, warning protection, default categories, settings, sequences, and bootstrap admins.
- Header-based bulk repository with grid growth, partial updates, immutable primary keys, serialization, and best-effort cache helpers.
- Lock-safe collision-resistant ID allocation and recovery for assets, borrows, users, categories, items, and logs.
- Immutable migration ledger with pre-mutation checksum validation and duplicate-data preflight.
- Shared Thai-safe errors, validation, date/overdue, normalization, formula-injection, and QR URL utilities.

[Unreleased]: https://github.com/v4r1n/crs-equipment-borrowing-system/compare/main...codex/initial-v1
