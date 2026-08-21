var SHEET_SCHEMAS = Object.freeze({
  Equipment: [
    'asset_id', 'sku', 'name', 'category_id', 'brand', 'model', 'serial_number',
    'specification', 'description', 'quantity', 'purchase_date', 'purchase_price',
    'department', 'location', 'status', 'active_borrow_id', 'image_file_id',
    'image_url', 'qr_url', 'note', 'created_at', 'created_by', 'updated_at',
    'updated_by', 'row_version'
  ],
  Users: [
    'user_id', 'email', 'name', 'department', 'role', 'status', 'last_login_at',
    'created_at', 'created_by', 'updated_at', 'updated_by', 'row_version'
  ],
  Borrow: [
    'borrow_id', 'client_request_id', 'user_id', 'user_email', 'user_name',
    'user_department', 'asset_id', 'asset_name', 'asset_sku', 'borrow_date',
    'due_date', 'purpose', 'status',
    'requested_at', 'approved_by', 'approved_at', 'rejected_by', 'rejected_at',
    'rejection_reason', 'checkout_by', 'checkout_at', 'return_requested_by',
    'return_requested_at', 'returned_by', 'return_at', 'return_condition',
    'return_disposition', 'return_note', 'note', 'created_at', 'updated_at',
    'row_version'
  ],
  Categories: [
    'category_id', 'category_name', 'prefix', 'status', 'sort_order', 'created_at',
    'created_by', 'updated_at', 'updated_by', 'row_version'
  ],
  IncludedItems: [
    'item_id', 'asset_id', 'item_name', 'quantity', 'is_required', 'status',
    'sort_order', 'note', 'created_at', 'created_by', 'updated_at', 'updated_by'
  ],
  BorrowItems: [
    'borrow_item_id', 'borrow_id', 'item_id', 'item_name', 'expected_quantity',
    'returned_quantity', 'is_complete', 'condition', 'note', 'checked_by', 'checked_at'
  ],
  History: [
    'log_id', 'timestamp', 'actor_user_id', 'user_email', 'entity_type', 'entity_id',
    'asset_id', 'borrow_id', 'action', 'old_status', 'new_status', 'note',
    'changed_fields_json', 'operation_id'
  ],
  Settings: ['setting_key', 'setting_value', 'description', 'updated_at', 'updated_by'],
  Sequences: ['sequence_name', 'prefix', 'padding', 'next_value', 'updated_at'],
  SchemaMigrations: ['migration_id', 'description', 'checksum', 'applied_at', 'applied_by']
});

var SHEET_PRIMARY_KEYS = Object.freeze({
  Equipment: 'asset_id',
  Users: 'user_id',
  Borrow: 'borrow_id',
  Categories: 'category_id',
  IncludedItems: 'item_id',
  BorrowItems: 'borrow_item_id',
  History: 'log_id',
  Settings: 'setting_key',
  Sequences: 'sequence_name',
  SchemaMigrations: 'migration_id'
});

var MIGRATION_DEFINITIONS = Object.freeze({
  '001_initial_schema': Object.freeze({
    description: 'Create V1 Sheets, headers, settings, sequences, categories, and admins',
    checksum: 'aneYcqHHtRDgZ30BR8LOdHzSg0wg-hyjKNxqC8Mge-s'
  })
});

var DEFAULT_CATEGORIES = Object.freeze([
  { name: 'Notebook', prefix: 'NBK' },
  { name: 'Computer', prefix: 'COM' },
  { name: 'Monitor', prefix: 'MON' },
  { name: 'Camera', prefix: 'CAM' },
  { name: 'Microphone', prefix: 'MIC' },
  { name: 'Audio Equipment', prefix: 'AUD' },
  { name: 'Projector', prefix: 'PRJ' },
  { name: 'Network Equipment', prefix: 'NET' },
  { name: 'Storage Device', prefix: 'STO' },
  { name: 'Adapter', prefix: 'ADP' },
  { name: 'Cable', prefix: 'CBL' },
  { name: 'Accessories', prefix: 'ACC' },
  { name: 'Office Equipment', prefix: 'OFF' }
]);
