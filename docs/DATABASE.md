# Google Sheets Database Schema

## Storage conventions

- Header เป็น `snake_case` และใช้เป็น contract; ห้ามอิงตำแหน่งคอลัมน์จากเลขคงที่
- ID เป็น string ที่คงที่และไม่ reuse แม้รายการเดิมถูกยกเลิก
- instant เก็บ ISO-8601 UTC; business date เก็บ `yyyy-MM-dd`; timezone ธุรกิจคือ `Asia/Bangkok`
- blank ย้ายเป็น SQL `NULL` ได้; enum ใช้ค่าอังกฤษ; ชื่อผู้ใช้/หน่วยงานที่ต้องรักษาประวัติใช้ snapshot
- Equipment หนึ่งแถวเท่ากับหนึ่ง physical asset และ `quantity` ต้องเป็น `1`

## Sheets

### Equipment

Primary key: `asset_id`. Headers:

`asset_id, sku, name, category_id, brand, model, serial_number, specification, description, quantity, purchase_date, purchase_price, department, location, status, active_borrow_id, image_file_id, image_url, qr_url, note, created_at, created_by, updated_at, updated_by, row_version`

Nonblank serial numbers are globally unique after trim/lowercase normalization. `qr_url` is a derived cache, never authority. Workflow states are changed only by BorrowService.

### Users

Primary key: `user_id`. Headers:

`user_id, email, name, department, role, status, last_login_at, created_at, created_by, updated_at, updated_by, row_version`

Email is unique and lowercase. Role is `USER|ADMIN`; status is `ACTIVE|INACTIVE`. The last active admin cannot be demoted or deactivated.

### Borrow

Primary key: `borrow_id`. Headers:

`borrow_id, client_request_id, user_id, user_email, user_name, user_department, asset_id, borrow_date, due_date, purpose, status, requested_at, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, checkout_by, checkout_at, return_requested_by, return_requested_at, returned_by, return_at, return_condition, return_disposition, return_note, note, created_at, updated_at, row_version`

`client_request_id` makes request retries idempotent. Overdue is derived when local today is later than `due_date` and status is `CHECKED_OUT` or `RETURN_REQUESTED`.

### Categories

Primary key: `category_id`. Headers:

`category_id, category_name, prefix, status, sort_order, created_at, created_by, updated_at, updated_by, row_version`

Prefix is SKU metadata only; Asset IDs remain globally sequential.

### IncludedItems

Primary key: `item_id`; foreign key: `asset_id`. Headers:

`item_id, asset_id, item_name, quantity, is_required, status, sort_order, note, created_at, created_by, updated_at, updated_by`

Rows are definitions for future checkouts. Existing borrow snapshots are not rewritten when these definitions change.

### BorrowItems

Primary key: `borrow_item_id`; foreign keys: `borrow_id`, `item_id`. Headers:

`borrow_item_id, borrow_id, item_id, item_name, expected_quantity, returned_quantity, is_complete, condition, note, checked_by, checked_at`

This is the immutable-per-loan checklist snapshot and return evidence.

### History

Primary key: `log_id`. Headers:

`log_id, timestamp, actor_user_id, user_email, entity_type, entity_id, asset_id, borrow_id, action, old_status, new_status, note, changed_fields_json, operation_id`

Append-only audit for assets, borrows, users, categories, setup, and repairs.

### Settings

Primary key: `setting_key`. Headers:

`setting_key, setting_value, description, updated_at, updated_by`

Includes schema version, application version, and timezone. Secrets and deployment IDs remain in Script Properties rather than cells.

### Sequences

Primary key: `sequence_name`. Headers:

`sequence_name, prefix, padding, next_value, updated_at`

Allocation occurs only under Script Lock. Gaps are valid and IDs are never decremented/reused.

### SchemaMigrations

Primary key: `migration_id`. Headers:

`migration_id, description, checksum, applied_at, applied_by`

Records ordered, additive, idempotent schema changes.

## ID formats

| Entity | Format |
|---|---|
| Equipment | `AST-000001` |
| Borrow | `BR-000001` |
| User | `USR-000001` |
| Category | `CAT-001` |
| Included item | `ITM-000001` |
| Borrow item | `BIT-000001` |
| History | `LOG-000001` |

## Direct Sheet editing

Transaction sheets are a protected datastore. Direct changes bypass validation, authorization, locking, and history; routine administration must use the web UI. Controlled edits to initial configuration/reference data are permitted only during setup and must be followed by the integrity audit.

