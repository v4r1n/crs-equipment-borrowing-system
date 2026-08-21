function toClientValue_(value) {
  if (Array.isArray(value)) return value.map(toClientValue_);
  if (value && typeof value === 'object') {
    var output = {};
    Object.keys(value).forEach(function (key) {
      if (key.indexOf('__') === 0) return;
      output[key] = toClientValue_(value[key]);
    });
    return output;
  }
  return typeof value === 'string' ? stripSheetEscape_(value) : value;
}

function requireCommandId_(value) {
  var commandId = normalizeWhitespace_(value);
  assertApp_(/^[A-Za-z0-9_-]{8,100}$/.test(commandId), 'VALIDATION_FAILED',
    'รหัสคำสั่งไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง', {
      fieldErrors: fieldError_('command_id', 'ไม่พบรหัสคำสั่งที่ถูกต้อง')
    }, false);
  return commandId;
}

function assertExpectedVersion_(record, expectedVersion) {
  var version = Number(expectedVersion);
  assertApp_(Number.isSafeInteger(version) && version > 0, 'VALIDATION_FAILED',
    'ไม่พบเวอร์ชันข้อมูล กรุณาโหลดข้อมูลใหม่', {
      fieldErrors: fieldError_('expected_version', 'กรุณาโหลดข้อมูลล่าสุด')
    }, false);
  assertApp_(Number(record.row_version) === version, 'STATE_CONFLICT',
    'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุด', {
      currentVersion: Number(record.row_version)
    }, false);
}

function normalizePageQuery_(query, allowedSortFields, defaultSortField, defaultSortDirection) {
  var config = getRuntimeConfig_();
  query = query || {};
  var page = Number(query.page || 1);
  var pageSize = Number(query.pageSize || config.DEFAULT_PAGE_SIZE);
  if (!Number.isSafeInteger(page) || page < 1) page = 1;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) pageSize = config.DEFAULT_PAGE_SIZE;
  pageSize = Math.min(pageSize, config.MAX_PAGE_SIZE);
  var sortBy = normalizeWhitespace_(query.sortBy || defaultSortField);
  if (allowedSortFields.indexOf(sortBy) === -1) sortBy = defaultSortField;
  var sortDirection = normalizeWhitespace_(query.sortDirection || defaultSortDirection).toLowerCase();
  if (['asc', 'desc'].indexOf(sortDirection) === -1) sortDirection = defaultSortDirection;
  return {
    page: page,
    pageSize: pageSize,
    sortBy: sortBy,
    sortDirection: sortDirection
  };
}

function sortRecords_(records, fieldName, direction) {
  var multiplier = direction === 'desc' ? -1 : 1;
  return records.slice().sort(function (left, right) {
    var leftValue = left[fieldName];
    var rightValue = right[fieldName];
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * multiplier;
    }
    return String(leftValue === undefined || leftValue === null ? '' : leftValue)
      .localeCompare(String(rightValue === undefined || rightValue === null ? '' : rightValue), 'th') * multiplier;
  });
}

function paginateRecords_(records, pageQuery) {
  var total = records.length;
  var totalPages = Math.max(Math.ceil(total / pageQuery.pageSize), 1);
  var page = Math.min(pageQuery.page, totalPages);
  var start = (page - 1) * pageQuery.pageSize;
  return {
    items: records.slice(start, start + pageQuery.pageSize).map(toClientValue_),
    total: total,
    page: page,
    pageSize: pageQuery.pageSize,
    totalPages: totalPages
  };
}

function includesSearch_(record, fields, searchTerm) {
  if (!searchTerm) return true;
  var needle = normalizeWhitespace_(searchTerm).toLowerCase();
  return fields.some(function (fieldName) {
    return stripSheetEscape_(record[fieldName]).toLowerCase().indexOf(needle) !== -1;
  });
}

function exactFilter_(recordValue, filterValue) {
  var filter = normalizeWhitespace_(filterValue);
  if (!filter) return true;
  return normalizeWhitespace_(recordValue).toLowerCase() === filter.toLowerCase();
}

function changedFields_(before, after, fields) {
  var changes = {};
  fields.forEach(function (fieldName) {
    if (fieldName.indexOf('__') === 0) return;
    var oldValue = before ? toSerializable_(before[fieldName]) : null;
    var newValue = after ? toSerializable_(after[fieldName]) : null;
    if (stableJson_(oldValue) !== stableJson_(newValue)) {
      changes[fieldName] = { oldValue: oldValue, newValue: newValue };
    }
  });
  return changes;
}

function hasOwn_(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function selectClientFields_(record, fields) {
  var output = {};
  fields.forEach(function (fieldName) {
    if (hasOwn_(record, fieldName)) output[fieldName] = toClientValue_(record[fieldName]);
  });
  return output;
}

function recordFieldsMatch_(record, expected, fields) {
  return fields.every(function (fieldName) {
    return stableJson_(toSerializable_(record[fieldName])) ===
      stableJson_(toSerializable_(expected[fieldName]));
  });
}

function operationRecordMatchesSnapshot_(sheetName, current, snapshot) {
  if (!current || !snapshot) return false;
  return SHEET_SCHEMAS[sheetName].every(function (fieldName) {
    return stableJson_(toSerializable_(current[fieldName])) ===
      stableJson_(toSerializable_(snapshot[fieldName]));
  });
}

function operationRecordMatchesChanges_(sheetName, current, snapshot, changes) {
  if (!current || !snapshot) return false;
  changes = changes || {};
  return SHEET_SCHEMAS[sheetName].every(function (fieldName) {
    var expected = hasOwn_(changes, fieldName) ? changes[fieldName] : snapshot[fieldName];
    return stableJson_(toSerializable_(current[fieldName])) ===
      stableJson_(toSerializable_(expected));
  });
}

function operationRecordMatchesExpected_(sheetName, current, expected) {
  if (!current || !expected) return false;
  return SHEET_SCHEMAS[sheetName].every(function (fieldName) {
    return stableJson_(toSerializable_(current[fieldName])) ===
      stableJson_(toSerializable_(expected[fieldName]));
  });
}
