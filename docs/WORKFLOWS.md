# Workflows and State Contracts

## Booking model

V1 permits exactly one active workflow per physical asset. Submitting a request immediately holds the asset even when the requested borrow date is in the future. Date-range reservations, queues, recurring loans, and no-show expiry are outside V1.

## Canonical transitions

| Action | Borrow before → after | Equipment before → after | Actor |
|---|---|---|---|
| Request | none → `PENDING_APPROVAL` | `AVAILABLE` → `PENDING` | User/Admin |
| Approve | `PENDING_APPROVAL` → `APPROVED` | `PENDING` → `RESERVED` | Admin |
| Reject | `PENDING_APPROVAL` → `REJECTED` | `PENDING` → `AVAILABLE` | Admin |
| Checkout | `APPROVED` → `CHECKED_OUT` | `RESERVED` → `BORROWED` | Admin |
| Request return | `CHECKED_OUT` → `RETURN_REQUESTED` | `BORROWED` → `RETURNING` | Borrower/Admin |
| Direct inspected return | `CHECKED_OUT` → `RETURNED` | `BORROWED` → disposition | Admin |
| Inspected return | `RETURN_REQUESTED` → `RETURNED` | `RETURNING` → disposition | Admin |

Repeated or out-of-order transitions return `STATE_CONFLICT` and never append duplicate history.

## Return inspection

Condition describes what the admin observed; disposition controls the resulting Equipment status.

| Condition | Allowed disposition |
|---|---|
| `NORMAL` | `AVAILABLE` |
| `COSMETIC_DAMAGE` | `AVAILABLE`, `MAINTENANCE` |
| `DAMAGED` | `DAMAGED`, `MAINTENANCE` |
| `MISSING_ITEMS` | `DAMAGED`, `MAINTENANCE` |
| `LOST` | `LOST` |

Abnormal returns require a note. Every included-item snapshot row records returned quantity; required missing items prevent `AVAILABLE` disposition.

## Overdue

`is_overdue = today(Asia/Bangkok) > due_date AND borrow.status IN (CHECKED_OUT, RETURN_REQUESTED)`

Due today is not overdue. `OVERDUE` is an effective UI badge/filter and does not replace the persisted Borrow or Equipment status.

## Manual equipment status changes

Admin may change an asset with no active borrow among operational states `AVAILABLE`, `MAINTENANCE`, `DAMAGED`, `LOST`, and `RETIRED`. Admin may not manually set `PENDING`, `RESERVED`, `BORROWED`, or `RETURNING`; those belong to BorrowService. Every correction is audited.

## Concurrency and idempotency

All availability checks and transitions are re-evaluated inside a Script Lock. A new request fails if either Equipment is not `AVAILABLE` or any active Borrow row exists. Browser mutations send a command/request ID; retrying the same command returns the original outcome, while a different competing command receives a deterministic conflict.

## QR workflow

Canonical link shape is `WEB_APP_EXEC_URL?view=equipment-detail&id=AST-000001`; `?id=` alone is also accepted. The scanner validates an Asset ID or same-app URL and routes to details. It never opens arbitrary scanned URLs and never approves/checks out/returns automatically.

