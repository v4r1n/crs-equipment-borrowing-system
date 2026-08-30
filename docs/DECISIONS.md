# Architectural Decisions

Decisions are append-only. A later decision may supersede an earlier one but must not erase it.

## ADR-001 — Google Workspace serverless stack

Status: Accepted — 2026-08-21

Use Apps Script HTML Service, Google Sheets, and Google Drive so the organization needs no VPS or paid database. Accept Apps Script quotas and Sheets transaction limitations for the 1,000–5,000 asset V1 scope.

## ADR-002 — Single SPA with server includes

Status: Accepted — 2026-08-21

Serve one HTML shell and include separated view/style/script partials. This provides maintainable files while fitting Apps Script HTML Service. Use Apps Script history/location APIs for routes and QR deep links.

## ADR-003 — One row per physical asset

Status: Accepted — 2026-08-21

An Asset ID identifies one physical unit, so Equipment `quantity` is retained only for source-spec compatibility and must equal 1. Several units may share an SKU but receive separate Asset IDs.

## ADR-004 — Single active borrowing workflow

Status: Accepted — 2026-08-21

V1 allows one open Borrow record per asset. A request immediately changes Equipment from Available to Pending; approval changes it to Reserved. This simple hard-hold model avoids partially implementing calendar reservations and matches the rule that non-Available assets cannot be requested.

## ADR-005 — BorrowService owns workflow states

Status: Accepted — 2026-08-21

Borrow is the evidence of the active transaction and Equipment holds a synchronized operational projection. Only BorrowService may set Pending, Reserved, Borrowed, or Returning. All transitions occur under Script Lock and validate both records.

## ADR-006 — Overdue is derived

Status: Accepted — 2026-08-21

Overdue does not replace Borrow or Equipment status. It is calculated from the Asia/Bangkok business date for Checked Out/Return Requested records, preserving the actual workflow state and avoiding a stale scheduled update.

## ADR-007 — Return condition and disposition are separate

Status: Accepted — 2026-08-21

The observed return condition does not always determine whether the asset is Available, Damaged, under Maintenance, or Lost. Admin submits both values within a validated matrix, with a required note for abnormal returns and a snapshot checklist of included items.

## ADR-008 — Same-domain identity, fail closed

Status: Accepted — 2026-08-21

V1 uses the active Google Workspace user email and domain-restricted deployment. Blank, external, unknown, or inactive identities are denied. EffectiveUser is not accepted as the visitor because execute-as-owner deployments would make it the deployer.

## ADR-009 — Header-based repository boundary

Status: Accepted — 2026-08-21

Only repositories call Spreadsheet services. Records are keyed by stable header names and exchanged as plain objects. This supports bulk access now and repository replacement by SQL later without changing workflow or UI contracts.

## ADR-010 — Derived QR URL and stable deployment

Status: Accepted — 2026-08-21

QR encodes a canonical HTTPS equipment-detail URL derived from configured/current `/exec` base plus Asset ID. The `qr_url` column is a refreshable cache only. Reusing the same Apps Script deployment keeps printed stickers valid.

## ADR-011 — Immutable, additive schema migrations

Status: Accepted — 2026-08-21

Each migration ID owns a frozen SHA-256 checksum that never depends on the future current schema. Setup validates all already-recorded migrations through a minimal raw read before changing spreadsheet locale, headers, formatting, protection, sequences, or seed data. Future schema changes add a new migration definition instead of changing `001_initial_schema`.

## ADR-012 — Durable operation journal and resumable mutations

Status: Accepted — 2026-08-21

Google Sheets cannot atomically commit several domain rows, History, and a Google Drive resource. Every command-backed state-changing RPC (and deterministic auto-provision command) therefore owns one Operations row keyed by its idempotency key. The success protocol is `STARTED → domain rows → exactly-one History → flush → stored result/COMPLETED`; the journal retains normalized action/entity/asset, original actor/time, hashed replay payload, authoritative before-state, optional external resource ID, and a hashed client result. Payload and result hashes are verified before replay.

A retry with the same specification returns the stored completed result or resumes a started operation only when affected rows still match the recorded source or exact expected target state/version. A different started command for the same entity or asset is rejected with `OPERATION_PENDING`, including asset-first create flows whose entity ID is not allocated yet. Started payloads also reserve normalized serial numbers, user emails, and category names across relevant mutations so cross-entity uniqueness cannot race. Diverged state fails closed for audited reconciliation rather than guessing or repeating writes.

Image upload additionally permits guarded terminal `ABORTED` only while Equipment remains at exact before-state and no matching History exists. Reachable partial image files are moved to Trash and an inaccessible pinned folder produces explicit orphan-cleanup evidence. This releases an otherwise permanent asset reservation without pretending a domain mutation succeeded; the old command ID remains terminal.

This adds storage and recovery complexity, and payload/result text must be split into bounded Sheet cells, but it closes the crash window where domain rows could persist without History or a stable retry result. Operations has no generic CRUD endpoint and is retained as evidence; it is not a replacement for History or for the Borrow source-of-truth model.

## ADR-013 — Client-side SPA routing and stable retry commands

Status: Accepted — 2026-08-27

The browser uses one Apps Script HTML-service shell with allowlisted partials and routes. `google.script.history`/`google.script.url` preserve navigation and Asset deep links without full reloads; each renderer owns a view token so late asynchronous responses cannot overwrite a newer route. Admin visibility is a usability gate only—every RPC remains server-authorized.

Every browser mutation stores a command ID, payload fingerprint, and uncertainty flag in `sessionStorage` before calling `google.script.run`. A definite pre-start validation/authorization error clears the entry; success clears it; an uncertain transport or server result locks the exact payload to the same command ID so a retry cannot create a second operation. The server Operations journal remains authoritative and Admin reconciliation handles commands that cannot be resolved safely in the originating browser session.

## ADR-014 — Vendored QR generation and image-capture scanning

Status: Accepted — 2026-08-28

V1 vendors exact browser distributions of `qrcode-generator` 2.0.4 and `html5-qrcode` 2.3.8 with checksums and license notices. QR symbols use error-correction level Q, an integer-pixel matrix, and a four-module quiet zone. The encoded value is only the canonical HTTPS Equipment Detail URL; it carries no identity, authorization, borrow command, or secret.

Apps Script HTML Service restricts permission-sensitive `navigator.mediaDevices.getUserMedia()` use inside its sandbox. The in-app scanner therefore calls only `html5-qrcode.scanFile()` against a user-selected image; `capture="environment"` lets supported mobile browsers offer their native camera while manual Asset ID remains available. The application does not call the library's live-camera APIs. A future continuous preview requires a separately hosted HTTPS scanner and a new reviewed trust boundary.

Decoded content is untrusted. The client accepts only an exact Asset ID or an HTTPS URL whose origin and path equal `bootstrap.app.webAppUrl`, whose optional view is `equipment-detail`, and whose sole ID matches `AST-000001`. Valid scans navigate internally and never execute a decoded URL or mutation. Admin scan follow-up passes an exact `assetId` to the already-authorized borrowing query and reuses confirmation-based workflows.

## ADR-015 — Deterministic local acceptance and explicit deployment acceptance

Status: Accepted — 2026-08-30

Phase 6 uses three complementary local layers. Node source contracts compile every Apps Script and browser partial and freeze security-sensitive registries and formats. Backend tests execute the real repositories and domain services against faithful in-memory doubles for the Apps Script services needed by the tested workflows. Playwright assembles the real HTML-service includes, substitutes deterministic test-only Bootstrap and `google.script.run` adapters, and verifies UI behavior and responsive containment without a deployed URL.

These doubles are test infrastructure only and are never included in `src/` or the Apps Script deployment. They provide reproducible workflow and regression evidence but cannot establish live Google Workspace identity, authorization prompts, quotas, Drive sharing, HTML-service sandbox behavior, or native mobile capture. Those boundaries remain an explicit Phase 7 deployment matrix instead of being represented by misleading local mocks.
