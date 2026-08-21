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

