function listCategoriesForAdmin_(query) {
  requireAdmin_(true);
  query = query || {};
  var pageQuery = normalizePageQuery_(
    query,
    ['category_id', 'category_name', 'prefix', 'status', 'sort_order', 'created_at', 'updated_at'],
    'sort_order',
    'asc'
  );
  var records = listRecords_(SHEETS.CATEGORIES).filter(function (record) {
    return includesSearch_(record, ['category_id', 'category_name', 'prefix'], query.search) &&
      exactFilter_(record.status, query.status);
  });
  var result = paginateRecords_(
    sortRecords_(records, pageQuery.sortBy, pageQuery.sortDirection),
    pageQuery
  );
  result.facets = {
    statuses: [RECORD_STATUS.ACTIVE, RECORD_STATUS.INACTIVE]
  };
  return result;
}

function createCategory_(input, actor) {
  input = input || {};
  var commandId = requireCommandId_(input.command_id);
  var normalized = normalizeCategoryInput_(input, null);
  return withAdminMutation_(function (lockedActor) {
    if (normalized.sort_order === null) {
      var pendingOperation = findRecordById_(SHEETS.OPERATIONS, 'operation_id', commandId);
      normalized.sort_order = pendingOperation
        ? operationPayload_(pendingOperation).sort_order
        : nextCategorySortOrderLocked_();
    }
    var spec = operationSpec_(commandId, 'CREATE_CATEGORY', 'CATEGORY', '', normalized, lockedActor);
    var operation = findOperationLocked_(spec);
    if (!operation) {
      var legacy = findHistoryByOperationLocked_(commandId);
      if (legacy) {
        assertOperationMatch_(legacy, 'CREATE_CATEGORY', 'CATEGORY', '');
        return categoryResultLocked_(legacy.entity_id);
      }
    }
    if (operation && operation.status === OPERATION_STATUS.COMPLETED) {
      return operationResult_(operation);
    }
    var categoryId = operation && operation.entity_id;
    if (!operation) {
      assertUniqueCategoryNameLocked_(normalized.category_name, '');
      operation = startOperationLocked_(spec, null);
    }
    if (!categoryId) {
      categoryId = nextIdLocked_('CATEGORY');
      operation = setOperationEntityLocked_(operation, categoryId);
    }
    var record = findRecordById_(SHEETS.CATEGORIES, 'category_id', categoryId);
    var timestamp = operation.started_at;
    var expectedRecord = mergeObjects_(normalized, {
      category_id: categoryId,
      created_at: timestamp,
      created_by: operation.actor_email,
      updated_at: timestamp,
      updated_by: operation.actor_email,
      row_version: 1
    });
    if (!record) {
      assertUniqueCategoryNameLocked_(normalized.category_name, categoryId);
      record = expectedRecord;
      insertRecord_(SHEETS.CATEGORIES, record);
    } else {
      assertApp_(operationRecordMatchesExpected_(SHEETS.CATEGORIES, record, expectedRecord),
      'STATE_CONFLICT', 'ข้อมูลหมวดหมู่ของคำสั่งที่ค้างอยู่ไม่ตรงกับข้อมูลปัจจุบัน', null, false);
    }
    ensureOperationHistoryLocked_({
      entityType: 'CATEGORY',
      entityId: categoryId,
      action: 'CREATE_CATEGORY',
      oldStatus: '',
      newStatus: record.status,
      note: 'สร้างหมวดหมู่ ' + stripSheetEscape_(record.category_name),
      changedFields: changedFields_(null, record, Object.keys(record)),
      operationId: commandId
    }, lockedActor);
    var result = categoryResultLocked_(categoryId);
    finalizeOperationLocked_(operation, categoryId, result);
    return result;
  });
}

function updateCategory_(input, actor) {
  input = input || {};
  var categoryId = requireCategoryRecordId_(input.category_id);
  var commandId = requireCommandId_(input.command_id);
  return withAdminMutation_(function (lockedActor) {
    var current = findRecordById_(SHEETS.CATEGORIES, 'category_id', categoryId);
    assertApp_(current, 'NOT_FOUND', 'ไม่พบหมวดหมู่ที่ต้องการแก้ไข', null, false);
    var normalized = normalizeCategoryInput_(input, current);
    var pendingOperation = findRecordById_(SHEETS.OPERATIONS, 'operation_id', commandId);
    if (pendingOperation && pendingOperation.action === 'EDIT_CATEGORY' &&
      pendingOperation.entity_type === 'CATEGORY') {
      var storedCategory = operationPayload_(pendingOperation).category;
      if (!hasOwn_(input, 'sort_order') || input.sort_order === '' || input.sort_order === null) {
        normalized.sort_order = storedCategory.sort_order;
      }
      if (!hasOwn_(input, 'status') || !normalizeWhitespace_(input.status)) {
        normalized.status = storedCategory.status;
      }
    }
    var spec = operationSpec_(commandId, 'EDIT_CATEGORY', 'CATEGORY', categoryId, {
      categoryId: categoryId,
      expectedVersion: Number(input.expected_version),
      category: normalized
    }, lockedActor);
    var operation = findOperationLocked_(spec);
    if (!operation) {
      var legacy = findHistoryByOperationLocked_(commandId);
      if (legacy) {
        assertOperationMatch_(legacy, 'EDIT_CATEGORY', 'CATEGORY', categoryId);
        return categoryResultLocked_(categoryId);
      }
    }
    if (operation && operation.status === OPERATION_STATUS.COMPLETED) {
      return operationResult_(operation);
    }
    var expectedVersion = Number(input.expected_version);
    if (!operation) {
      assertExpectedVersion_(current, expectedVersion);
      assertUniqueCategoryNameLocked_(normalized.category_name, categoryId);
      operation = startOperationLocked_(spec, current);
    }
    var before = operationBeforeState_(operation);
    var targetChanges = mergeObjects_(normalized, {
      updated_at: operation.started_at,
      updated_by: operation.actor_email,
      row_version: Number(before.row_version) + 1
    });
    var atSource = operationRecordMatchesSnapshot_(SHEETS.CATEGORIES, current, before);
    var atTarget = operationRecordMatchesChanges_(
      SHEETS.CATEGORIES, current, before, targetChanges);
    assertApp_(atSource || atTarget, 'STATE_CONFLICT',
      'ข้อมูลหมวดหมู่ถูกแก้ไขต่อจากคำสั่งที่ค้างอยู่แล้ว', {
        currentVersion: Number(current.row_version)
      }, false);
    var updated = current;
    if (atSource) {
      assertUniqueCategoryNameLocked_(normalized.category_name, categoryId);
      updated = updateRecordById_(SHEETS.CATEGORIES, 'category_id', categoryId, targetChanges);
    }
    ensureOperationHistoryLocked_({
      entityType: 'CATEGORY',
      entityId: categoryId,
      action: 'EDIT_CATEGORY',
      oldStatus: before.status,
      newStatus: updated.status,
      note: 'แก้ไขหมวดหมู่ ' + stripSheetEscape_(updated.category_name),
      changedFields: changedFields_(before, updated,
        Object.keys(normalized).concat(['updated_at', 'updated_by', 'row_version'])),
      operationId: commandId
    }, lockedActor);
    var result = toClientValue_(updated);
    finalizeOperationLocked_(operation, categoryId, result);
    return result;
  });
}

function normalizeCategoryInput_(input, current) {
  var sortOrder = hasOwn_(input, 'sort_order') && input.sort_order !== '' &&
    input.sort_order !== null && input.sort_order !== undefined
    ? normalizeCategorySortOrder_(input.sort_order)
    : (current ? normalizeCategorySortOrder_(current.sort_order) : null);
  return {
    category_name: requireText_(input.category_name, 'category_name', 'ชื่อหมวดหมู่', 150),
    prefix: normalizeCategoryPrefix_(input.prefix),
    status: requireEnum_(input.status || (current && current.status) || RECORD_STATUS.ACTIVE,
      [RECORD_STATUS.ACTIVE, RECORD_STATUS.INACTIVE], 'status', 'สถานะ'),
    sort_order: sortOrder
  };
}

function normalizeCategoryPrefix_(value) {
  var prefix = stripSheetEscape_(requireText_(value, 'prefix', 'Prefix', 20)).toUpperCase();
  assertApp_(/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(prefix), 'VALIDATION_FAILED', 'Prefix ไม่ถูกต้อง', {
    fieldErrors: fieldError_('prefix', 'Prefix ใช้ได้เฉพาะ A–Z, 0–9, _ และ - ไม่เกิน 20 ตัวอักษร')
  }, false);
  return prefix;
}

function normalizeCategorySortOrder_(value) {
  var sortOrder = Number(value);
  assertApp_(Number.isSafeInteger(sortOrder) && sortOrder >= 0 && sortOrder <= 999999,
    'VALIDATION_FAILED', 'ลำดับหมวดหมู่ไม่ถูกต้อง', {
      fieldErrors: fieldError_('sort_order', 'ลำดับต้องเป็นจำนวนเต็มระหว่าง 0–999999')
    }, false);
  return sortOrder;
}

function requireCategoryRecordId_(value) {
  var categoryId = normalizeWhitespace_(value).toUpperCase();
  assertApp_(/^CAT-\d{3,}$/.test(categoryId), 'VALIDATION_FAILED', 'Category ID ไม่ถูกต้อง', {
    fieldErrors: fieldError_('category_id', 'Category ID ต้องอยู่ในรูปแบบ CAT-001')
  }, false);
  return categoryId;
}

function assertUniqueCategoryNameLocked_(categoryName, exceptCategoryId) {
  var normalized = normalizedCategoryNameKey_(categoryName);
  var duplicate = listRecords_(SHEETS.CATEGORIES).some(function (record) {
    return record.category_id !== exceptCategoryId &&
      normalizedCategoryNameKey_(record.category_name) === normalized;
  });
  assertApp_(!duplicate, 'DUPLICATE_CATEGORY', 'ชื่อหมวดหมู่นี้มีอยู่ในระบบแล้ว', {
    fieldErrors: fieldError_('category_name', 'ชื่อหมวดหมู่ต้องไม่ซ้ำ')
  }, false);
}

function normalizedCategoryNameKey_(value) {
  return normalizeWhitespace_(stripSheetEscape_(value)).toLowerCase();
}

function nextCategorySortOrderLocked_() {
  return listRecords_(SHEETS.CATEGORIES).reduce(function (maximum, record) {
    var value = Number(record.sort_order);
    return Number.isSafeInteger(value) && value > maximum ? value : maximum;
  }, 0) + 1;
}

function categoryResultLocked_(categoryId) {
  var category = findRecordById_(SHEETS.CATEGORIES, 'category_id', categoryId);
  assertApp_(category, 'NOT_FOUND', 'ไม่พบหมวดหมู่ที่ต้องการ', null, false);
  return toClientValue_(category);
}
