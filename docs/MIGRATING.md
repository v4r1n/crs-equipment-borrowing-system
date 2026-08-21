# Migrating the Data Layer

## Objective

ย้ายจาก Google Sheets ไป Supabase, PostgreSQL หรือ MySQL ในอนาคตโดยคง workflow, state enums, authorization policy, API DTO และ frontend behavior เดิม เปลี่ยนเฉพาะ repository/configuration และกลไก transaction

## Rules that make migration possible

- Domain services exchange plain objects and never depend on row numbers or Spreadsheet classes.
- Stable string primary/foreign keys are preserved across storage engines.
- Child collections use separate sheets/tables rather than comma-separated values.
- Business dates and UTC instants have explicit formats.
- Status values and transition rules are centralized, not inferred from display labels.
- User/category/asset names required in historical reports are snapshotted on Borrow/History.
- Schema changes are additive, ordered, and recorded in SchemaMigrations.

## Relational mapping

Each Sheet maps one-to-one to a table: `Equipment -> equipment`, `Users -> users`, `Borrow -> borrows`, `Categories -> categories`, `IncludedItems -> included_items`, `BorrowItems -> borrow_items`, `History -> history`, `Settings -> settings`, `Sequences -> sequences`, and `SchemaMigrations -> schema_migrations`.

- Blank cells become `NULL` where allowed.
- ISO timestamps become `timestamptz`; `yyyy-MM-dd` becomes `date`.
- `changed_fields_json` becomes JSON/JSONB where supported.
- `row_version` becomes an optimistic-lock integer.
- Add unique indexes on primary IDs, normalized user email, nonblank normalized serial number, and borrow client request ID.
- Add foreign keys after orphan/integrity checks pass.

## Migration sequence

1. Freeze writes or place the app in maintenance mode.
2. Run the integrity audit and resolve duplicate IDs, active-loan conflicts, bad foreign keys, and equipment-status projections.
3. Export each Sheet as UTF-8 CSV without changing canonical values.
4. Load reference/parent tables, then Equipment, Borrow, child items, and History.
5. Convert blanks/dates/JSON and add constraints/indexes.
6. Implement SQL repositories with the same method contracts and real database transactions.
7. Run the same domain contract and workflow acceptance tests against the new repository.
8. Switch configuration, perform a smoke loan lifecycle, and retain the Sheet export as a read-only archive.

## Compatibility policy

Never change a canonical status value, ID, or API field silently. Introduce a schema migration and compatibility translation, document it in `docs/CHANGELOG.md`, then remove the translation only in a SemVer-major release.

