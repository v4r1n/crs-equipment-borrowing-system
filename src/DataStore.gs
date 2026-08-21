function getSpreadsheet_() {
  var config = getRuntimeConfig_();
  if (config.SPREADSHEET_ID) {
    try { return SpreadsheetApp.openById(config.SPREADSHEET_ID); }
    catch (error) {
      throw new AppError('CONFIG_ERROR', 'ไม่สามารถเปิด Google Sheet ได้ กรุณาตรวจ Spreadsheet ID', null, false);
    }
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  assertApp_(active, 'CONFIG_ERROR', 'กรุณาตั้งค่า SPREADSHEET_ID หรือผูก Apps Script กับ Google Sheet', null, false);
  return active;
}

function getSheetOrThrow_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  assertApp_(sheet, 'CONFIG_ERROR', 'ไม่พบชีต ' + sheetName + ' กรุณารัน setupSystem()', null, false);
  return sheet;
}

function readTable_(sheetName) {
  var sheet = getSheetOrThrow_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  assertApp_(lastColumn > 0, 'SCHEMA_ERROR', 'ชีต ' + sheetName + ' ไม่มี header', null, false);
  var values = sheet.getRange(1, 1, Math.max(lastRow, 1), lastColumn).getValues();
  var headers = values[0].map(function (value) { return normalizeWhitespace_(value); });
  validateSheetHeaders_(sheetName, headers);
  var records = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (isBlankRow_(values[rowIndex])) continue;
    var record = { __rowNumber: rowIndex + 1 };
    headers.forEach(function (header, columnIndex) {
      record[header] = toSerializable_(values[rowIndex][columnIndex]);
    });
    records.push(record);
  }
  return { sheet: sheet, headers: headers, records: records, lastRow: lastRow };
}

function listRecords_(sheetName) {
  return readTable_(sheetName).records;
}

function findRecordByField_(sheetName, fieldName, value, caseInsensitive) {
  var table = readTable_(sheetName);
  assertApp_(table.headers.indexOf(fieldName) !== -1, 'SCHEMA_ERROR', 'ไม่พบคอลัมน์ ' + fieldName, null, false);
  var expected = caseInsensitive ? normalizeWhitespace_(value).toLowerCase() : String(value);
  for (var index = 0; index < table.records.length; index += 1) {
    var actual = table.records[index][fieldName];
    actual = caseInsensitive ? normalizeWhitespace_(actual).toLowerCase() : String(actual);
    if (actual === expected) return table.records[index];
  }
  return null;
}

function findRecordById_(sheetName, idField, idValue) {
  return findRecordByField_(sheetName, idField, idValue, false);
}

function getFieldValues_(sheetName, fieldName) {
  var sheet = getSheetOrThrow_(sheetName);
  var lastColumn = sheet.getLastColumn();
  assertApp_(lastColumn > 0, 'SCHEMA_ERROR', 'ชีต ' + sheetName + ' ไม่มี header', null, false);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) {
    return normalizeWhitespace_(value);
  });
  validateSheetHeaders_(sheetName, headers);
  var columnIndex = headers.indexOf(fieldName);
  assertApp_(columnIndex !== -1, 'SCHEMA_ERROR', 'ไม่พบคอลัมน์ ' + fieldName, null, false);
  var rowCount = Math.max(sheet.getLastRow() - 1, 0);
  if (!rowCount) return [];
  return sheet.getRange(2, columnIndex + 1, rowCount, 1).getValues().map(function (row) {
    return toSerializable_(row[0]);
  });
}

function getFieldValueSet_(sheetName, fieldName) {
  var result = Object.create(null);
  getFieldValues_(sheetName, fieldName).forEach(function (value) {
    if (value !== '' && value !== null) result[String(value)] = true;
  });
  return result;
}

function insertRecord_(sheetName, record) {
  var table = readTable_(sheetName);
  assertKnownRecordFields_(table.headers, record, sheetName);
  var row = table.headers.map(function (header) {
    return record[header] === undefined || record[header] === null ? '' : record[header];
  });
  var targetRow = Math.max(table.sheet.getLastRow() + 1, 2);
  ensureSheetCapacity_(table.sheet, targetRow, row.length);
  table.sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  return mergeObjects_(record, { __rowNumber: targetRow });
}

function insertRecords_(sheetName, records) {
  if (!records || !records.length) return [];
  var table = readTable_(sheetName);
  var rows = records.map(function (record) {
    assertKnownRecordFields_(table.headers, record, sheetName);
    return table.headers.map(function (header) {
      return record[header] === undefined || record[header] === null ? '' : record[header];
    });
  });
  var targetRow = Math.max(table.sheet.getLastRow() + 1, 2);
  ensureSheetCapacity_(table.sheet, targetRow + rows.length - 1, table.headers.length);
  table.sheet.getRange(targetRow, 1, rows.length, table.headers.length).setValues(rows);
  return records.map(function (record, index) {
    return mergeObjects_(record, { __rowNumber: targetRow + index });
  });
}

function updateRecordById_(sheetName, idField, idValue, changes) {
  var table = readTable_(sheetName);
  assertApp_(SHEET_PRIMARY_KEYS[sheetName] === idField, 'SCHEMA_ERROR',
    'ต้องแก้ไขชีต ' + sheetName + ' ผ่านรหัสหลัก ' + SHEET_PRIMARY_KEYS[sheetName], null, false);
  assertApp_(table.headers.indexOf(idField) !== -1, 'SCHEMA_ERROR',
    'ไม่พบคอลัมน์รหัสหลัก ' + idField + ' ในชีต ' + sheetName, null, false);
  var current = null;
  for (var index = 0; index < table.records.length; index += 1) {
    if (String(table.records[index][idField]) === String(idValue)) {
      current = table.records[index];
      break;
    }
  }
  assertApp_(current, 'NOT_FOUND', 'ไม่พบข้อมูลที่ต้องการแก้ไข', null, false);
  assertKnownRecordFields_(table.headers, changes || {}, sheetName);
  if (Object.prototype.hasOwnProperty.call(changes || {}, idField)) {
    assertApp_(String(changes[idField]) === String(current[idField]), 'VALIDATION_FAILED',
      'ไม่สามารถเปลี่ยนรหัสหลักของข้อมูลได้', null, false);
  }
  var updated = mergeObjects_(current, changes || {});
  delete updated.__rowNumber;
  var columns = Object.keys(changes || {}).filter(function (fieldName) {
    return fieldName !== idField && fieldName !== '__rowNumber';
  }).map(function (fieldName) {
    return {
      index: table.headers.indexOf(fieldName),
      value: changes[fieldName] === undefined || changes[fieldName] === null ? '' : changes[fieldName]
    };
  }).sort(function (left, right) {
    return left.index - right.index;
  });
  var groups = [];
  columns.forEach(function (column) {
    var group = groups.length ? groups[groups.length - 1] : null;
    if (!group || column.index !== group[group.length - 1].index + 1) {
      group = [];
      groups.push(group);
    }
    group.push(column);
  });
  groups.forEach(function (group) {
    table.sheet
      .getRange(current.__rowNumber, group[0].index + 1, 1, group.length)
      .setValues([group.map(function (column) { return column.value; })]);
  });
  return mergeObjects_(updated, { __rowNumber: current.__rowNumber });
}

function upsertRecordByField_(sheetName, fieldName, fieldValue, record) {
  var existing = findRecordByField_(sheetName, fieldName, fieldValue, false);
  return existing
    ? updateRecordById_(sheetName, fieldName, fieldValue, record)
    : insertRecord_(sheetName, record);
}

function validateSheetHeaders_(sheetName, headers) {
  var expected = SHEET_SCHEMAS[sheetName];
  assertApp_(expected, 'SCHEMA_ERROR', 'ไม่มี schema สำหรับชีต ' + sheetName, null, false);
  var seen = Object.create(null);
  headers.forEach(function (header) {
    assertApp_(header && !seen[header], 'SCHEMA_ERROR', 'Header ของชีต ' + sheetName + ' ว่างหรือซ้ำ: ' + header, null, false);
    seen[header] = true;
    assertApp_(expected.indexOf(header) !== -1, 'SCHEMA_ERROR', 'พบ header ที่ระบบไม่รู้จักในชีต ' + sheetName + ': ' + header, null, false);
  });
  expected.forEach(function (header) {
    assertApp_(headers.indexOf(header) !== -1, 'SCHEMA_ERROR', 'ชีต ' + sheetName + ' ขาด header: ' + header, null, false);
  });
}

function isBlankRow_(row) {
  return row.every(function (value) { return value === '' || value === null; });
}

function assertKnownRecordFields_(headers, record, sheetName) {
  Object.keys(record || {}).forEach(function (fieldName) {
    if (fieldName === '__rowNumber') return;
    assertApp_(headers.indexOf(fieldName) !== -1, 'SCHEMA_ERROR',
      'ฟิลด์ ' + fieldName + ' ไม่มีอยู่ในชีต ' + sheetName, null, false);
  });
}

function ensureSheetCapacity_(sheet, requiredRows, requiredColumns) {
  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(requiredRows - sheet.getMaxRows(), 500));
  }
}

function withScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(getRuntimeConfig_().LOCK_TIMEOUT_MS);
  assertApp_(acquired, 'LOCK_TIMEOUT', 'ระบบกำลังประมวลผลรายการอื่น กรุณาลองใหม่อีกครั้ง', null, true);
  try {
    var result = callback();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function getCacheEpoch_() {
  var value = Number(PropertiesService.getScriptProperties().getProperty(CACHE_KEYS.EPOCH) || '1');
  return Number.isSafeInteger(value) && value > 0 ? String(value) : '1';
}

function bumpCacheEpoch_() {
  var properties = PropertiesService.getScriptProperties();
  var current = Number(properties.getProperty(CACHE_KEYS.EPOCH) || '1');
  if (!Number.isSafeInteger(current) || current < 1) current = 1;
  var next = current + 1;
  properties.setProperty(CACHE_KEYS.EPOCH, String(next));
  return String(next);
}

function cacheGetJson_(key) {
  try {
    var cacheKey = getCacheEpoch_() + ':' + String(key);
    if (cacheKey.length > 240) return null;
    var value = CacheService.getScriptCache().get(cacheKey);
    if (!value) return null;
    return JSON.parse(value);
  } catch (error) {
    console.warn('Cache read skipped: ' + error.message);
    return null;
  }
}

function cachePutJson_(key, value, ttlSeconds) {
  try {
    var cacheKey = getCacheEpoch_() + ':' + String(key);
    var serialized = JSON.stringify(toSerializable_(value));
    if (cacheKey.length > 240 || serialized.length > 90000) return false;
    CacheService.getScriptCache().put(
      cacheKey,
      serialized,
      ttlSeconds || getRuntimeConfig_().CACHE_TTL_SECONDS
    );
    return true;
  } catch (error) {
    console.warn('Cache write skipped: ' + error.message);
    return false;
  }
}
