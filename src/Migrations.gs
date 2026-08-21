function recoverSequencesLocked_() {
  var timestamp = nowIso_();
  Object.keys(SEQUENCE_DEFINITIONS).forEach(function (name) {
    var definition = SEQUENCE_DEFINITIONS[name];
    var maxExisting = maxIdNumber_(definition.sheet, definition.idField, definition.prefix);
    var sequence = findRecordByField_(SHEETS.SEQUENCES, 'sequence_name', name, false);
    var storedNext = sequence ? Number(sequence.next_value) : NaN;
    var nextValue = Number.isSafeInteger(storedNext) && storedNext > 0
      ? Math.max(maxExisting + 1, storedNext)
      : maxExisting + 1;
    upsertRecordByField_(SHEETS.SEQUENCES, 'sequence_name', name, {
      sequence_name: name,
      prefix: definition.prefix,
      padding: definition.padding,
      next_value: nextValue,
      updated_at: timestamp
    });
  });
}

function maxIdNumber_(sheetName, idField, prefix) {
  var maximum = 0;
  getFieldValues_(sheetName, idField).forEach(function (idValue) {
    var value = String(idValue || '');
    if (value.indexOf(prefix) !== 0) return;
    var suffix = value.substring(prefix.length);
    if (/^\d+$/.test(suffix)) maximum = Math.max(maximum, Number(suffix));
  });
  return maximum;
}

/** Must be called while the caller holds the Script Lock. */
function nextIdLocked_(sequenceName) {
  var definition = SEQUENCE_DEFINITIONS[sequenceName];
  assertApp_(definition, 'CONFIG_ERROR', 'ไม่รู้จักลำดับ ID: ' + sequenceName, null, false);
  var sequence = findRecordByField_(SHEETS.SEQUENCES, 'sequence_name', sequenceName, false);
  assertApp_(sequence, 'CONFIG_ERROR', 'ไม่พบลำดับ ID กรุณารัน setupSystem()', null, false);
  var candidateNumber = Number(sequence.next_value);
  assertApp_(Number.isSafeInteger(candidateNumber) && candidateNumber > 0,
    'SCHEMA_ERROR', 'ค่า sequence ไม่ถูกต้อง: ' + sequenceName, null, false);
  var candidate = '';
  var attempts = 0;
  var existingIds = getFieldValueSet_(definition.sheet, definition.idField);
  do {
    candidate = definition.prefix + padNumber_(candidateNumber, definition.padding);
    candidateNumber += 1;
    attempts += 1;
    assertApp_(attempts <= 10000, 'SCHEMA_ERROR', 'ไม่สามารถสร้าง ID ที่ไม่ซ้ำได้', null, false);
  } while (existingIds[candidate]);
  updateRecordById_(SHEETS.SEQUENCES, 'sequence_name', sequenceName, {
    next_value: candidateNumber,
    updated_at: nowIso_()
  });
  return candidate;
}

function preflightRecordedMigrationsRaw_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(SHEETS.SCHEMA_MIGRATIONS);
  if (!sheet || sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) return;
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values[0].map(function (value) { return normalizeWhitespace_(value); });
  var idColumn = headers.indexOf('migration_id');
  var checksumColumn = headers.indexOf('checksum');
  assertApp_(idColumn !== -1 && checksumColumn !== -1, 'SCHEMA_ERROR',
    'SchemaMigrations ไม่มี migration_id หรือ checksum; ระบบยังไม่ได้แก้ไขข้อมูล', null, false);
  var seen = Object.create(null);
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (isBlankRow_(values[rowIndex])) continue;
    var migrationId = normalizeWhitespace_(values[rowIndex][idColumn]);
    var checksum = normalizeWhitespace_(values[rowIndex][checksumColumn]);
    assertApp_(migrationId && checksum, 'SCHEMA_ERROR',
      'SchemaMigrations แถว ' + (rowIndex + 1) + ' มีข้อมูลไม่ครบ', null, false);
    assertApp_(!seen[migrationId], 'SCHEMA_ERROR',
      'พบ migration_id ซ้ำ: ' + migrationId, null, false);
    var definition = MIGRATION_DEFINITIONS[migrationId];
    assertApp_(definition, 'SCHEMA_ERROR',
      'ฐานข้อมูลมี migration ที่โค้ดรุ่นนี้ไม่รู้จัก: ' + migrationId, null, false);
    assertApp_(definition.checksum === checksum, 'SCHEMA_ERROR',
      'Checksum ของ migration ' + migrationId + ' ไม่ตรง; ระบบยังไม่ได้แก้ไขข้อมูล', null, false);
    seen[migrationId] = true;
  }
}

function recordMigrationLocked_(migrationId, description, checksum, actorEmail) {
  var existing = preflightMigrationLocked_(migrationId, checksum);
  if (existing) {
    return existing;
  }
  return insertRecord_(SHEETS.SCHEMA_MIGRATIONS, {
    migration_id: migrationId,
    description: description,
    checksum: checksum,
    applied_at: nowIso_(),
    applied_by: actorEmail
  });
}

function preflightMigrationLocked_(migrationId, checksum) {
  var existing = findRecordByField_(SHEETS.SCHEMA_MIGRATIONS, 'migration_id', migrationId, false);
  if (existing) {
    assertApp_(String(existing.checksum) === String(checksum), 'SCHEMA_ERROR',
      'Checksum ของ migration ' + migrationId + ' ไม่ตรงกับที่เคยติดตั้ง', null, false);
  }
  return existing;
}

function validateCriticalUniquenessLocked_() {
  [
    [SHEETS.EQUIPMENT, [
      ['asset_id', false, normalizeWhitespace_],
      ['serial_number', true, normalizeSerial_]
    ]],
    [SHEETS.USERS, [
      ['user_id', false, normalizeWhitespace_],
      ['email', false, normalizeEmail_]
    ]],
    [SHEETS.BORROW, [
      ['borrow_id', false, normalizeWhitespace_],
      ['client_request_id', true, normalizeWhitespace_]
    ]],
    [SHEETS.CATEGORIES, [
      ['category_id', false, normalizeWhitespace_],
      ['category_name', false, function (value) {
        return normalizeWhitespace_(value).toLowerCase();
      }]
    ]],
    [SHEETS.INCLUDED_ITEMS, [['item_id', false, normalizeWhitespace_]]],
    [SHEETS.BORROW_ITEMS, [['borrow_item_id', false, normalizeWhitespace_]]],
    [SHEETS.HISTORY, [['log_id', false, normalizeWhitespace_]]],
    [SHEETS.SETTINGS, [['setting_key', false, normalizeWhitespace_]]],
    [SHEETS.SEQUENCES, [['sequence_name', false, normalizeWhitespace_]]],
    [SHEETS.SCHEMA_MIGRATIONS, [['migration_id', false, normalizeWhitespace_]]]
  ].forEach(function (sheetDefinition) {
    var records = listRecords_(sheetDefinition[0]);
    sheetDefinition[1].forEach(function (fieldDefinition) {
      assertUniqueRecordFieldLocked_(
        sheetDefinition[0],
        records,
        fieldDefinition[0],
        fieldDefinition[1],
        fieldDefinition[2]
      );
    });
  });
}

function assertUniqueRecordFieldLocked_(sheetName, records, fieldName, allowBlank, normalizer) {
  var seen = Object.create(null);
  records.forEach(function (record) {
    var rawValue = record[fieldName];
    var value = normalizer(rawValue);
    if (!value) {
      assertApp_(allowBlank, 'SCHEMA_ERROR',
        'พบค่า ' + fieldName + ' ว่างในชีต ' + sheetName + ' แถว ' + record.__rowNumber, null, false);
      return;
    }
    assertApp_(!seen[value], 'SCHEMA_ERROR',
      'พบค่า ' + fieldName + ' ซ้ำในชีต ' + sheetName + ': ' + stripSheetEscape_(rawValue), null, false);
    seen[value] = true;
  });
}
