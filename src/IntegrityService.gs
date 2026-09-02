var INTEGRITY_MAX_RETURNED_ISSUES_ = 500;

var INTEGRITY_ID_PATTERNS_ = Object.freeze({
  Equipment: /^AST-\d{6}$/,
  Users: /^USR-\d{6}$/,
  Borrow: /^BR-\d{6}$/,
  Categories: /^CAT-\d{3}$/,
  IncludedItems: /^ITM-\d{6}$/,
  BorrowItems: /^BIT-\d{6}$/,
  History: /^LOG-\d{6}$/
});

function runIntegrityAudit_(actor) {
  return withAdminMutation_(actor, function (lockedActor) {
    var tables = {};
    Object.keys(SHEET_SCHEMAS).forEach(function (sheetName) {
      tables[sheetName] = listRecords_(sheetName);
    });
    var state = {
      issues: [],
      total: 0,
      errors: 0,
      warnings: 0
    };

    auditPrimaryKeys_(state, tables);
    auditUniqueBusinessKeys_(state, tables);
    auditVersionAndValueContracts_(state, tables);
    auditForeignKeys_(state, tables);
    auditBorrowEquipmentProjection_(state, tables);
    auditSystemMetadata_(state, tables);

    var sheetCounts = {};
    Object.keys(tables).forEach(function (sheetName) {
      sheetCounts[sheetName] = tables[sheetName].length;
    });
    return {
      generated_at: nowIso_(),
      generated_by: stripSheetEscape_(lockedActor.email),
      passed: state.errors === 0,
      summary: {
        total_issues: state.total,
        errors: state.errors,
        warnings: state.warnings,
        returned_issues: state.issues.length,
        truncated: state.total > state.issues.length
      },
      sheet_counts: sheetCounts,
      issues: state.issues
    };
  });
}

function auditPrimaryKeys_(state, tables) {
  Object.keys(SHEET_PRIMARY_KEYS).forEach(function (sheetName) {
    var fieldName = SHEET_PRIMARY_KEYS[sheetName];
    var records = tables[sheetName] || [];
    var pattern = INTEGRITY_ID_PATTERNS_[sheetName];
    records.forEach(function (record) {
      var value = normalizeWhitespace_(record[fieldName]);
      if (!value) {
        addIntegrityIssue_(state, 'ERROR', 'MISSING_PRIMARY_KEY', sheetName, '',
          'พบแถวที่ไม่มีรหัสหลัก', record, { field: fieldName });
        return;
      }
      if (pattern && !pattern.test(value)) {
        addIntegrityIssue_(state, 'ERROR', 'INVALID_ID_FORMAT', sheetName, value,
          'รูปแบบรหัสหลักไม่ถูกต้อง', record, { field: fieldName, value: value });
      }
    });
    auditDuplicateField_(state, sheetName, records, fieldName, 'DUPLICATE_PRIMARY_KEY',
      pattern
        ? function (value) { return normalizeWhitespace_(value).toUpperCase(); }
        : normalizeWhitespace_,
      'ERROR');
  });
}

function auditUniqueBusinessKeys_(state, tables) {
  auditDuplicateField_(state, SHEETS.EQUIPMENT, tables[SHEETS.EQUIPMENT], 'serial_number',
    'DUPLICATE_SERIAL_NUMBER', normalizeSerial_, 'ERROR');
  auditDuplicateField_(state, SHEETS.USERS, tables[SHEETS.USERS], 'email',
    'DUPLICATE_USER_EMAIL', normalizeEmail_, 'ERROR');
  auditDuplicateField_(state, SHEETS.CATEGORIES, tables[SHEETS.CATEGORIES], 'category_name',
    'DUPLICATE_CATEGORY_NAME', function (value) {
      return stripSheetEscape_(normalizeWhitespace_(value)).toLowerCase();
    }, 'ERROR');
  auditDuplicateField_(state, SHEETS.BORROW, tables[SHEETS.BORROW], 'client_request_id',
    'DUPLICATE_CLIENT_REQUEST_ID', normalizeWhitespace_, 'ERROR');
  auditDuplicateField_(state, SHEETS.HISTORY, tables[SHEETS.HISTORY], 'operation_id',
    'DUPLICATE_OPERATION_ID', normalizeWhitespace_, 'ERROR');

  tables[SHEETS.BORROW].forEach(function (record) {
    if (!normalizeWhitespace_(record.client_request_id)) {
      addIntegrityIssue_(state, 'ERROR', 'MISSING_CLIENT_REQUEST_ID', SHEETS.BORROW,
        record.borrow_id, 'รายการยืมไม่มีรหัสป้องกันคำสั่งซ้ำ', record);
    }
  });
  tables[SHEETS.HISTORY].forEach(function (record) {
    if (!normalizeWhitespace_(record.operation_id)) {
      addIntegrityIssue_(state, 'ERROR', 'MISSING_OPERATION_ID', SHEETS.HISTORY,
        record.log_id, 'ประวัติไม่มีรหัสป้องกันคำสั่งซ้ำ', record);
    }
  });
}

function auditVersionAndValueContracts_(state, tables) {
  [SHEETS.EQUIPMENT, SHEETS.USERS, SHEETS.BORROW, SHEETS.CATEGORIES].forEach(function (sheetName) {
    tables[sheetName].forEach(function (record) {
      var version = Number(record.row_version);
      if (!Number.isSafeInteger(version) || version < 1) {
        addIntegrityIssue_(state, 'ERROR', 'INVALID_ROW_VERSION', sheetName,
          integrityRecordId_(sheetName, record), 'row_version ต้องเป็นจำนวนเต็มบวก', record, {
            value: record.row_version
          });
      }
    });
  });

  var equipmentStatuses = integrityEnumValues_(EQUIPMENT_STATUS);
  tables[SHEETS.EQUIPMENT].forEach(function (record) {
    auditEnumValue_(state, SHEETS.EQUIPMENT, record, 'status', equipmentStatuses);
    if (Number(record.quantity) !== 1) {
      addIntegrityIssue_(state, 'ERROR', 'INVALID_PHYSICAL_ASSET_QUANTITY', SHEETS.EQUIPMENT,
        record.asset_id, 'Equipment หนึ่งแถวต้องแทนอุปกรณ์จริงหนึ่งชิ้นและ quantity ต้องเท่ากับ 1', record, {
          value: record.quantity
        });
    }
  });

  tables[SHEETS.USERS].forEach(function (record) {
    auditEnumValue_(state, SHEETS.USERS, record, 'role', integrityEnumValues_(USER_ROLE));
    auditEnumValue_(state, SHEETS.USERS, record, 'status', integrityEnumValues_(RECORD_STATUS));
    var email = normalizeWhitespace_(record.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addIntegrityIssue_(state, 'ERROR', 'INVALID_USER_EMAIL', SHEETS.USERS, record.user_id,
        'รูปแบบอีเมลผู้ใช้ไม่ถูกต้อง', record, { value: email });
    } else if (email !== normalizeEmail_(email)) {
      addIntegrityIssue_(state, 'WARNING', 'NON_CANONICAL_USER_EMAIL', SHEETS.USERS, record.user_id,
        'อีเมลผู้ใช้ควรเก็บเป็นตัวพิมพ์เล็กโดยไม่มีช่องว่าง', record, { value: email });
    }
  });

  var borrowStatuses = integrityEnumValues_(BORROW_STATUS);
  var returnConditions = integrityEnumValues_(RETURN_CONDITION);
  var returnDispositions = integrityEnumValues_(RETURN_DISPOSITION);
  tables[SHEETS.BORROW].forEach(function (record) {
    auditEnumValue_(state, SHEETS.BORROW, record, 'status', borrowStatuses);
    if (!isIntegrityDateOnly_(record.borrow_date) || !isIntegrityDateOnly_(record.due_date)) {
      addIntegrityIssue_(state, 'ERROR', 'INVALID_BORROW_DATE', SHEETS.BORROW, record.borrow_id,
        'วันที่ยืมหรือวันที่กำหนดคืนไม่ใช่วันที่รูปแบบ YYYY-MM-DD ที่ถูกต้อง', record, {
          borrow_date: record.borrow_date,
          due_date: record.due_date
        });
    } else if (compareDateOnly_(record.due_date, record.borrow_date) < 0) {
      addIntegrityIssue_(state, 'ERROR', 'DUE_DATE_BEFORE_BORROW_DATE', SHEETS.BORROW,
        record.borrow_id, 'วันที่กำหนดคืนอยู่ก่อนวันที่ยืม', record);
    }
    if (record.return_condition && returnConditions.indexOf(record.return_condition) === -1) {
      addIntegrityIssue_(state, 'ERROR', 'INVALID_RETURN_CONDITION', SHEETS.BORROW,
        record.borrow_id, 'ค่าสภาพอุปกรณ์ตอนคืนไม่ถูกต้อง', record, { value: record.return_condition });
    }
    if (record.return_disposition && returnDispositions.indexOf(record.return_disposition) === -1) {
      addIntegrityIssue_(state, 'ERROR', 'INVALID_RETURN_DISPOSITION', SHEETS.BORROW,
        record.borrow_id, 'ค่าสถานะอุปกรณ์หลังคืนไม่ถูกต้อง', record, { value: record.return_disposition });
    }
    if (record.status === BORROW_STATUS.RETURNED &&
      (!record.return_at || !record.return_condition || !record.return_disposition)) {
      addIntegrityIssue_(state, 'ERROR', 'INCOMPLETE_RETURN_EVIDENCE', SHEETS.BORROW,
        record.borrow_id, 'รายการที่คืนแล้วขาดเวลา สภาพ หรือสถานะหลังคืน', record);
    }
  });

  tables[SHEETS.CATEGORIES].forEach(function (record) {
    auditEnumValue_(state, SHEETS.CATEGORIES, record, 'status', integrityEnumValues_(RECORD_STATUS));
  });
  tables[SHEETS.INCLUDED_ITEMS].forEach(function (record) {
    auditEnumValue_(state, SHEETS.INCLUDED_ITEMS, record, 'status', integrityEnumValues_(RECORD_STATUS));
    var quantity = Number(record.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      addIntegrityIssue_(state, 'ERROR', 'INVALID_INCLUDED_ITEM_QUANTITY', SHEETS.INCLUDED_ITEMS,
        record.item_id, 'จำนวนอุปกรณ์ประกอบต้องเป็นจำนวนเต็มบวก', record, { value: record.quantity });
    }
    if (integrityBoolean_(record.is_required) === null) {
      addIntegrityIssue_(state, 'ERROR', 'INVALID_INCLUDED_ITEM_REQUIRED_FLAG', SHEETS.INCLUDED_ITEMS,
        record.item_id, 'ค่า is_required ของอุปกรณ์ประกอบต้องเป็น boolean', record, {
          value: record.is_required
        });
    }
  });
  tables[SHEETS.BORROW_ITEMS].forEach(function (record) {
    auditBorrowItemValues_(state, record);
  });
  if (SHEETS.OPERATIONS && tables[SHEETS.OPERATIONS]) {
    tables[SHEETS.OPERATIONS].forEach(function (record) {
      auditOperationValues_(state, record);
    });
  }
}

function auditForeignKeys_(state, tables) {
  var maps = {};
  Object.keys(SHEET_PRIMARY_KEYS).forEach(function (sheetName) {
    maps[sheetName] = integrityIdMap_(tables[sheetName], SHEET_PRIMARY_KEYS[sheetName]);
  });

  tables[SHEETS.EQUIPMENT].forEach(function (record) {
    auditRequiredReference_(state, SHEETS.EQUIPMENT, record, 'category_id',
      SHEETS.CATEGORIES, maps[SHEETS.CATEGORIES], 'ORPHAN_EQUIPMENT_CATEGORY');
    if (record.active_borrow_id) {
      auditRequiredReference_(state, SHEETS.EQUIPMENT, record, 'active_borrow_id',
        SHEETS.BORROW, maps[SHEETS.BORROW], 'ORPHAN_ACTIVE_BORROW');
      var activeReference = maps[SHEETS.BORROW][record.active_borrow_id];
      if (activeReference && activeReference.asset_id !== record.asset_id) {
        addIntegrityIssue_(state, 'ERROR', 'ACTIVE_BORROW_ASSET_MISMATCH', SHEETS.EQUIPMENT,
          record.asset_id, 'active_borrow_id ชี้ไปยังรายการยืมของอุปกรณ์คนละรายการ', record, {
            active_borrow_id: record.active_borrow_id,
            borrow_asset_id: activeReference.asset_id
          });
      }
    }
  });

  tables[SHEETS.BORROW].forEach(function (record) {
    auditRequiredReference_(state, SHEETS.BORROW, record, 'user_id', SHEETS.USERS,
      maps[SHEETS.USERS], 'ORPHAN_BORROW_USER');
    auditRequiredReference_(state, SHEETS.BORROW, record, 'asset_id', SHEETS.EQUIPMENT,
      maps[SHEETS.EQUIPMENT], 'ORPHAN_BORROW_ASSET');
  });
  tables[SHEETS.INCLUDED_ITEMS].forEach(function (record) {
    auditRequiredReference_(state, SHEETS.INCLUDED_ITEMS, record, 'asset_id', SHEETS.EQUIPMENT,
      maps[SHEETS.EQUIPMENT], 'ORPHAN_INCLUDED_ITEM_ASSET');
  });
  tables[SHEETS.BORROW_ITEMS].forEach(function (record) {
    auditRequiredReference_(state, SHEETS.BORROW_ITEMS, record, 'borrow_id', SHEETS.BORROW,
      maps[SHEETS.BORROW], 'ORPHAN_BORROW_ITEM_BORROW');
    auditRequiredReference_(state, SHEETS.BORROW_ITEMS, record, 'item_id', SHEETS.INCLUDED_ITEMS,
      maps[SHEETS.INCLUDED_ITEMS], 'ORPHAN_BORROW_ITEM_DEFINITION');
    var borrow = maps[SHEETS.BORROW][record.borrow_id];
    var item = maps[SHEETS.INCLUDED_ITEMS][record.item_id];
    if (borrow && item && borrow.asset_id !== item.asset_id) {
      addIntegrityIssue_(state, 'ERROR', 'BORROW_ITEM_ASSET_MISMATCH', SHEETS.BORROW_ITEMS,
        record.borrow_item_id, 'อุปกรณ์ประกอบในรายการยืมเป็นของ Asset คนละรายการ', record, {
          borrow_asset_id: borrow.asset_id,
          item_asset_id: item.asset_id
        });
    }
  });

  tables[SHEETS.HISTORY].forEach(function (record) {
    auditOptionalReference_(state, SHEETS.HISTORY, record, 'actor_user_id', SHEETS.USERS,
      maps[SHEETS.USERS], 'ORPHAN_HISTORY_ACTOR');
    auditOptionalReference_(state, SHEETS.HISTORY, record, 'asset_id', SHEETS.EQUIPMENT,
      maps[SHEETS.EQUIPMENT], 'ORPHAN_HISTORY_ASSET');
    auditOptionalReference_(state, SHEETS.HISTORY, record, 'borrow_id', SHEETS.BORROW,
      maps[SHEETS.BORROW], 'ORPHAN_HISTORY_BORROW');
    auditHistoryEntityReference_(state, record, maps);
  });
  if (SHEETS.OPERATIONS && tables[SHEETS.OPERATIONS]) {
    var historyByOperation = integrityIdMap_(tables[SHEETS.HISTORY], 'operation_id');
    tables[SHEETS.OPERATIONS].forEach(function (record) {
      auditRequiredReference_(state, SHEETS.OPERATIONS, record, 'actor_user_id', SHEETS.USERS,
        maps[SHEETS.USERS], 'ORPHAN_OPERATION_ACTOR');
      auditOptionalReference_(state, SHEETS.OPERATIONS, record, 'asset_id', SHEETS.EQUIPMENT,
        maps[SHEETS.EQUIPMENT], 'ORPHAN_OPERATION_ASSET');
      auditOperationEntityReference_(state, record, maps);
      var history = historyByOperation[record.operation_id];
      if (record.status === OPERATION_STATUS.COMPLETED && !history) {
        addIntegrityIssue_(state, 'ERROR', 'COMPLETED_OPERATION_WITHOUT_HISTORY', SHEETS.OPERATIONS,
          record.operation_id, 'Operation ที่เสร็จแล้วไม่มี History ที่มี operation_id เดียวกัน', record);
      }
      if (record.status === OPERATION_STATUS.ABORTED && history) {
        addIntegrityIssue_(state, 'ERROR', 'ABORTED_OPERATION_WITH_HISTORY', SHEETS.OPERATIONS,
          record.operation_id, 'Operation ที่ยกเลิกอย่างปลอดภัยต้องไม่มี History หรือ domain mutation',
          record, { history_log_id: history.log_id });
      }
      var expectedBorrowId = record.entity_type === 'BORROW' ? record.entity_id : '';
      var statusEvidence = integrityOperationStatusEvidence_(record);
      if (history && (history.action !== record.action ||
        history.entity_type !== record.entity_type || history.entity_id !== record.entity_id ||
        history.asset_id !== record.asset_id || history.borrow_id !== expectedBorrowId ||
        history.actor_user_id !== record.actor_user_id ||
        history.user_email !== record.actor_email || history.timestamp !== record.started_at ||
        (statusEvidence && (history.old_status !== statusEvidence.oldStatus ||
          history.new_status !== statusEvidence.newStatus)))) {
        addIntegrityIssue_(state, 'ERROR', 'OPERATION_HISTORY_MISMATCH', SHEETS.OPERATIONS,
          record.operation_id, 'Operation และ History ที่อ้างด้วย operation_id เดียวกันไม่ตรงกัน', record, {
            operation_action: record.action,
            history_action: history.action,
            operation_entity_type: record.entity_type,
            history_entity_type: history.entity_type,
            operation_entity_id: record.entity_id,
            history_entity_id: history.entity_id,
            operation_actor_user_id: record.actor_user_id,
            history_actor_user_id: history.actor_user_id,
            operation_actor_email: record.actor_email,
            history_actor_email: history.user_email,
            operation_started_at: record.started_at,
            history_timestamp: history.timestamp,
            operation_asset_id: record.asset_id,
            history_asset_id: history.asset_id,
            expected_borrow_id: expectedBorrowId,
            history_borrow_id: history.borrow_id,
            expected_old_status: statusEvidence && statusEvidence.oldStatus,
            history_old_status: history.old_status,
            expected_new_status: statusEvidence && statusEvidence.newStatus,
            history_new_status: history.new_status
          });
      }
    });
  }
}

function auditBorrowEquipmentProjection_(state, tables) {
  var equipmentById = integrityIdMap_(tables[SHEETS.EQUIPMENT], 'asset_id');
  var activeByAsset = Object.create(null);
  var projection = {};
  projection[BORROW_STATUS.PENDING_APPROVAL] = EQUIPMENT_STATUS.PENDING;
  projection[BORROW_STATUS.APPROVED] = EQUIPMENT_STATUS.RESERVED;
  projection[BORROW_STATUS.CHECKED_OUT] = EQUIPMENT_STATUS.BORROWED;
  projection[BORROW_STATUS.RETURN_REQUESTED] = EQUIPMENT_STATUS.RETURNING;

  tables[SHEETS.BORROW].forEach(function (borrow) {
    if (ACTIVE_BORROW_STATUSES.indexOf(borrow.status) === -1) return;
    if (!activeByAsset[borrow.asset_id]) activeByAsset[borrow.asset_id] = [];
    activeByAsset[borrow.asset_id].push(borrow);
    var equipment = equipmentById[borrow.asset_id];
    if (!equipment) return;
    if (equipment.active_borrow_id !== borrow.borrow_id) {
      addIntegrityIssue_(state, 'ERROR', 'ACTIVE_BORROW_POINTER_MISMATCH', SHEETS.BORROW,
        borrow.borrow_id, 'Equipment ไม่ได้ชี้กลับมายัง active Borrow รายการนี้', borrow, {
          equipment_active_borrow_id: equipment.active_borrow_id
        });
    }
    if (equipment.status !== projection[borrow.status]) {
      addIntegrityIssue_(state, 'ERROR', 'EQUIPMENT_STATUS_PROJECTION_MISMATCH', SHEETS.BORROW,
        borrow.borrow_id, 'สถานะ Equipment ไม่ตรงกับสถานะ Borrow ที่กำลังดำเนินการ', borrow, {
          expected_equipment_status: projection[borrow.status],
          actual_equipment_status: equipment.status
        });
    }
  });

  Object.keys(activeByAsset).forEach(function (assetId) {
    var active = activeByAsset[assetId];
    if (active.length > 1) {
      addIntegrityIssue_(state, 'ERROR', 'DUPLICATE_ACTIVE_WORKFLOW', SHEETS.BORROW, assetId,
        'อุปกรณ์หนึ่งรายการมี Borrow workflow ที่ยังทำงานมากกว่าหนึ่งรายการ', active[0], {
          borrow_ids: active.map(function (record) { return record.borrow_id; })
        });
    }
  });

  tables[SHEETS.EQUIPMENT].forEach(function (equipment) {
    var active = activeByAsset[equipment.asset_id] || [];
    if (!active.length) {
      if (equipment.active_borrow_id) {
        addIntegrityIssue_(state, 'ERROR', 'STALE_ACTIVE_BORROW_POINTER', SHEETS.EQUIPMENT,
          equipment.asset_id, 'Equipment ชี้ active_borrow_id แต่ไม่มี workflow ที่ยังทำงาน', equipment, {
            active_borrow_id: equipment.active_borrow_id
          });
      }
      if (WORKFLOW_EQUIPMENT_STATUSES.indexOf(equipment.status) !== -1) {
        addIntegrityIssue_(state, 'ERROR', 'WORKFLOW_STATUS_WITHOUT_ACTIVE_BORROW', SHEETS.EQUIPMENT,
          equipment.asset_id, 'Equipment อยู่ในสถานะ workflow แต่ไม่มี Borrow ที่ยังทำงาน', equipment, {
            status: equipment.status
          });
      }
      return;
    }
    if (active.length > 1 && !active.some(function (borrow) {
      return borrow.borrow_id === equipment.active_borrow_id;
    })) {
      addIntegrityIssue_(state, 'ERROR', 'ACTIVE_BORROW_POINTER_NOT_IN_WORKFLOWS', SHEETS.EQUIPMENT,
        equipment.asset_id, 'active_borrow_id ไม่ตรงกับ workflow ที่ยังทำงานของอุปกรณ์', equipment);
    }
  });
}

function auditSystemMetadata_(state, tables) {
  var sequenceMap = integrityIdMap_(tables[SHEETS.SEQUENCES], 'sequence_name');
  Object.keys(SEQUENCE_DEFINITIONS).forEach(function (sequenceName) {
    var expected = SEQUENCE_DEFINITIONS[sequenceName];
    var record = sequenceMap[sequenceName];
    if (!record) {
      addIntegrityIssue_(state, 'ERROR', 'MISSING_SEQUENCE', SHEETS.SEQUENCES, sequenceName,
        'ไม่พบตัวนับรหัสที่ระบบต้องใช้', null);
      return;
    }
    var nextValue = Number(record.next_value);
    if (!Number.isSafeInteger(nextValue) || nextValue < 1) {
      addIntegrityIssue_(state, 'ERROR', 'INVALID_SEQUENCE_COUNTER', SHEETS.SEQUENCES, sequenceName,
        'ค่า next_value ของตัวนับรหัสต้องเป็นจำนวนเต็มบวก', record, { value: record.next_value });
    }
    if (record.prefix !== expected.prefix || Number(record.padding) !== expected.padding) {
      addIntegrityIssue_(state, 'ERROR', 'SEQUENCE_DEFINITION_MISMATCH', SHEETS.SEQUENCES,
        sequenceName, 'prefix หรือ padding ของตัวนับรหัสไม่ตรงกับ source contract', record, {
          expected_prefix: expected.prefix,
          expected_padding: expected.padding
        });
    }
  });

  var migrationMap = integrityIdMap_(tables[SHEETS.SCHEMA_MIGRATIONS], 'migration_id');
  Object.keys(MIGRATION_DEFINITIONS).forEach(function (migrationId) {
    var applied = migrationMap[migrationId];
    if (!applied) {
      addIntegrityIssue_(state, 'ERROR', 'MISSING_SCHEMA_MIGRATION', SHEETS.SCHEMA_MIGRATIONS,
        migrationId, 'ยังไม่มีหลักฐานการใช้ schema migration ที่ source ต้องการ', null);
    } else if (applied.checksum !== MIGRATION_DEFINITIONS[migrationId].checksum) {
      addIntegrityIssue_(state, 'ERROR', 'SCHEMA_MIGRATION_CHECKSUM_MISMATCH',
        SHEETS.SCHEMA_MIGRATIONS, migrationId, 'checksum ของ migration ไม่ตรงกับ source contract', applied);
    }
  });

  var settings = integrityIdMap_(tables[SHEETS.SETTINGS], 'setting_key');
  if (!settings.schema_version || String(settings.schema_version.setting_value) !== String(CURRENT_SCHEMA_VERSION)) {
    addIntegrityIssue_(state, 'ERROR', 'SCHEMA_VERSION_MISMATCH', SHEETS.SETTINGS, 'schema_version',
      'ค่า schema_version ไม่ตรงกับ source contract', settings.schema_version || null, {
        expected: CURRENT_SCHEMA_VERSION,
        actual: settings.schema_version ? settings.schema_version.setting_value : ''
      });
  }
}

function auditDuplicateField_(state, sheetName, records, fieldName, code, normalizer, severity) {
  var groups = Object.create(null);
  records.forEach(function (record) {
    var normalized = normalizer(record[fieldName]);
    if (!normalized) return;
    var key = '$' + normalized;
    if (!groups[key]) groups[key] = [];
    groups[key].push(record);
  });
  Object.keys(groups).forEach(function (key) {
    var group = groups[key];
    if (group.length < 2) return;
    addIntegrityIssue_(state, severity, code, sheetName, String(key).substring(1),
      'พบค่าที่ต้องไม่ซ้ำมากกว่าหนึ่งแถวในฟิลด์ ' + fieldName, group[0], {
        field: fieldName,
        rows: group.map(function (record) { return record.__rowNumber; }),
        record_ids: group.map(function (record) { return integrityRecordId_(sheetName, record); })
      });
  });
}

function auditEnumValue_(state, sheetName, record, fieldName, allowed) {
  if (allowed.indexOf(record[fieldName]) !== -1) return;
  addIntegrityIssue_(state, 'ERROR', 'INVALID_ENUM_VALUE', sheetName,
    integrityRecordId_(sheetName, record), 'ค่า enum ในฟิลด์ ' + fieldName + ' ไม่ถูกต้อง', record, {
      field: fieldName,
      value: record[fieldName],
      allowed: allowed
    });
}

function auditBorrowItemValues_(state, record) {
  var expected = Number(record.expected_quantity);
  if (integrityBoolean_(record.is_required) === null) {
    addIntegrityIssue_(state, 'ERROR', 'INVALID_BORROW_ITEM_REQUIRED_FLAG', SHEETS.BORROW_ITEMS,
      record.borrow_item_id, 'ค่า is_required ใน snapshot ต้องเป็น boolean', record, {
        value: record.is_required
      });
  }
  if (!Number.isSafeInteger(expected) || expected < 1) {
    addIntegrityIssue_(state, 'ERROR', 'INVALID_EXPECTED_ITEM_QUANTITY', SHEETS.BORROW_ITEMS,
      record.borrow_item_id, 'จำนวนอุปกรณ์ประกอบที่คาดหวังต้องเป็นจำนวนเต็มบวก', record, {
        value: record.expected_quantity
      });
    return;
  }
  if (record.returned_quantity === '' || record.returned_quantity === null) return;
  var returned = Number(record.returned_quantity);
  if (!Number.isSafeInteger(returned) || returned < 0 || returned > expected) {
    addIntegrityIssue_(state, 'ERROR', 'INVALID_RETURNED_ITEM_QUANTITY', SHEETS.BORROW_ITEMS,
      record.borrow_item_id, 'จำนวนอุปกรณ์ประกอบที่คืนไม่อยู่ในช่วงที่ถูกต้อง', record, {
        expected: expected,
        returned: record.returned_quantity
      });
    return;
  }
  var complete = integrityBoolean_(record.is_complete);
  if (complete === null || complete !== (returned === expected)) {
    addIntegrityIssue_(state, 'ERROR', 'BORROW_ITEM_COMPLETENESS_MISMATCH', SHEETS.BORROW_ITEMS,
      record.borrow_item_id, 'ค่า is_complete ไม่สอดคล้องกับจำนวนที่คืน', record, {
        expected: expected,
        returned: returned,
        is_complete: record.is_complete
      });
  }
}

function auditOperationValues_(state, record) {
  auditEnumValue_(state, SHEETS.OPERATIONS, record, 'status', integrityEnumValues_(OPERATION_STATUS));
  var entityTypes = ['EQUIPMENT', 'BORROW', 'USER', 'CATEGORY'];
  if (entityTypes.indexOf(normalizeWhitespace_(record.entity_type).toUpperCase()) === -1) {
    addIntegrityIssue_(state, 'ERROR', 'INVALID_OPERATION_ENTITY_TYPE', SHEETS.OPERATIONS,
      record.operation_id, 'entity_type ของ operation ไม่ถูกต้อง', record, {
        value: record.entity_type
      });
  }
  if (!normalizeWhitespace_(record.action) || !normalizeWhitespace_(record.entity_type) ||
    !normalizeWhitespace_(record.actor_email) || !normalizeWhitespace_(record.payload_hash) ||
    !normalizeWhitespace_(record.started_at) || !normalizeWhitespace_(record.updated_at)) {
    addIntegrityIssue_(state, 'ERROR', 'INCOMPLETE_OPERATION_JOURNAL', SHEETS.OPERATIONS,
      record.operation_id, 'Operation journal ขาดข้อมูลที่จำเป็น', record);
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalizeWhitespace_(record.payload_hash))) {
    addIntegrityIssue_(state, 'ERROR', 'INVALID_OPERATION_PAYLOAD_HASH', SHEETS.OPERATIONS,
      record.operation_id, 'payload_hash ของ operation ไม่ใช่ SHA-256 แบบ Base64URL ที่ถูกต้อง', record);
  }
  var payloadText = String(record.payload_json || '') + String(record.payload_json_2 || '');
  try {
    var payload = JSON.parse(payloadText);
    if (hashOperationPayload_(payload) !== normalizeWhitespace_(record.payload_hash)) {
      addIntegrityIssue_(state, 'ERROR', 'OPERATION_PAYLOAD_HASH_MISMATCH', SHEETS.OPERATIONS,
        record.operation_id, 'payload ของ operation ไม่ตรงกับ payload_hash ที่บันทึกไว้', record);
    }
  } catch (error) {
    addIntegrityIssue_(state, 'ERROR', 'INVALID_OPERATION_PAYLOAD_JSON', SHEETS.OPERATIONS,
      record.operation_id, 'payload JSON ของ operation อ่านไม่ได้', record);
  }
  try {
    JSON.parse(String(record.before_json || ''));
  } catch (error) {
    addIntegrityIssue_(state, 'ERROR', 'INVALID_OPERATION_BEFORE_JSON', SHEETS.OPERATIONS,
      record.operation_id, 'before snapshot ของ operation อ่านไม่ได้', record);
  }
  var terminal = record.status === OPERATION_STATUS.COMPLETED ||
    record.status === OPERATION_STATUS.ABORTED;
  var terminalResult = null;
  if (terminal && !normalizeWhitespace_(record.completed_at)) {
    addIntegrityIssue_(state, 'ERROR', 'INCOMPLETE_TERMINAL_OPERATION', SHEETS.OPERATIONS,
      record.operation_id, 'Operation ที่สิ้นสุดแล้วต้องมี completed_at', record);
  }
  if (record.status === OPERATION_STATUS.COMPLETED && !normalizeWhitespace_(record.entity_id)) {
    addIntegrityIssue_(state, 'ERROR', 'INCOMPLETE_COMPLETED_OPERATION', SHEETS.OPERATIONS,
      record.operation_id, 'Operation ที่เสร็จแล้วต้องมี entity_id', record);
  }
  if (terminal) {
    var resultText = String(record.result_json || '') + String(record.result_json_2 || '') +
      String(record.result_json_3 || '') + String(record.result_json_4 || '');
    if (!resultText || !/^[A-Za-z0-9_-]{43}$/.test(normalizeWhitespace_(record.result_hash))) {
      addIntegrityIssue_(state, 'ERROR', 'MISSING_OPERATION_RESULT', SHEETS.OPERATIONS,
        record.operation_id, 'Operation ที่สิ้นสุดแล้วต้องมี result snapshot และ result_hash', record);
    } else {
      try {
        terminalResult = JSON.parse(resultText);
        if (hashOperationPayload_(terminalResult) !== normalizeWhitespace_(record.result_hash)) {
          addIntegrityIssue_(state, 'ERROR', 'OPERATION_RESULT_HASH_MISMATCH', SHEETS.OPERATIONS,
            record.operation_id, 'result snapshot ของ operation ไม่ตรงกับ result_hash', record);
        }
      } catch (error) {
        addIntegrityIssue_(state, 'ERROR', 'INVALID_OPERATION_RESULT_JSON', SHEETS.OPERATIONS,
          record.operation_id, 'result snapshot ของ operation อ่านไม่ได้', record);
      }
    }
  }
  if (record.status === OPERATION_STATUS.ABORTED) {
    auditAbortedOperationContract_(state, record, terminalResult);
  }
  if (record.status === OPERATION_STATUS.STARTED) {
    if (record.completed_at || record.result_json || record.result_json_2 ||
      record.result_json_3 || record.result_json_4 || record.result_hash) {
      addIntegrityIssue_(state, 'ERROR', 'STARTED_OPERATION_HAS_COMPLETION_DATA', SHEETS.OPERATIONS,
        record.operation_id, 'Operation ที่ยัง STARTED ต้องไม่มี completed_at หรือ result snapshot', record);
    }
    addIntegrityIssue_(state, 'WARNING', 'INCOMPLETE_STARTED_OPERATION', SHEETS.OPERATIONS,
      record.operation_id, 'พบ Operation ที่เริ่มแล้วแต่ยังไม่บันทึกว่าเสร็จสมบูรณ์', record);
  }
}

function auditAbortedOperationContract_(state, record, result) {
  var expectedResultKeys = [
    'aborted', 'aborted_by', 'action', 'entity_id', 'orphan_cleanup_required', 'reason'
  ];
  var isPlainObject = result && typeof result === 'object' && !Array.isArray(result);
  var resultKeys = isPlainObject ? Object.keys(result).sort() : [];
  var hasCanonicalResult = isPlainObject &&
    stableJson_(resultKeys) === stableJson_(expectedResultKeys) &&
    result.aborted === true && result.action === 'UPLOAD_ASSET_IMAGE' &&
    result.entity_id === record.entity_id && typeof result.reason === 'string' &&
    Boolean(normalizeWhitespace_(result.reason)) && typeof result.aborted_by === 'string' &&
    isSafeEmailValue_(result.aborted_by) &&
    (result.orphan_cleanup_required === true || result.orphan_cleanup_required === false);
  var hasCanonicalOperation = record.action === 'UPLOAD_ASSET_IMAGE' &&
    record.entity_type === 'EQUIPMENT' && Boolean(normalizeWhitespace_(record.entity_id)) &&
    record.entity_id === record.asset_id;
  if (hasCanonicalOperation && hasCanonicalResult) return;
  addIntegrityIssue_(state, 'ERROR', 'INVALID_ABORTED_OPERATION_CONTRACT', SHEETS.OPERATIONS,
    record.operation_id,
    'ABORTED ใช้ได้เฉพาะ image upload ที่ไม่แตะ domain row และมีหลักฐานการยกเลิกครบถ้วน',
    record, {
      action: record.action,
      entity_type: record.entity_type,
      entity_id: record.entity_id,
      asset_id: record.asset_id,
      result_keys: resultKeys
    });
}

function integrityOperationStatusEvidence_(operation) {
  if (operation.status !== OPERATION_STATUS.COMPLETED) return null;
  try {
    var before = JSON.parse(String(operation.before_json || 'null'));
    var result = JSON.parse(String(operation.result_json || '') +
      String(operation.result_json_2 || '') + String(operation.result_json_3 || '') +
      String(operation.result_json_4 || ''));
    var oldStatus = '';
    if (before && before.borrow) oldStatus = before.borrow.status || '';
    else if (before && before.status) oldStatus = before.status;
    return { oldStatus: oldStatus, newStatus: result && result.status ? result.status : '' };
  } catch (ignored) {
    return null;
  }
}

function auditRequiredReference_(state, sourceSheet, record, fieldName, targetSheet, targetMap, code) {
  var value = normalizeWhitespace_(record[fieldName]);
  if (!value) {
    addIntegrityIssue_(state, 'ERROR', 'MISSING_FOREIGN_KEY', sourceSheet,
      integrityRecordId_(sourceSheet, record), 'ไม่พบรหัสอ้างอิงในฟิลด์ ' + fieldName, record, {
        field: fieldName,
        target_sheet: targetSheet
      });
    return;
  }
  if (!targetMap[value]) {
    addIntegrityIssue_(state, 'ERROR', code, sourceSheet,
      integrityRecordId_(sourceSheet, record), 'รหัสอ้างอิงไม่พบในชีต ' + targetSheet, record, {
        field: fieldName,
        value: value,
        target_sheet: targetSheet
      });
  }
}

function auditOptionalReference_(state, sourceSheet, record, fieldName, targetSheet, targetMap, code) {
  if (!normalizeWhitespace_(record[fieldName])) return;
  auditRequiredReference_(state, sourceSheet, record, fieldName, targetSheet, targetMap, code);
}

function auditHistoryEntityReference_(state, record, maps) {
  var targetByType = {
    EQUIPMENT: SHEETS.EQUIPMENT,
    BORROW: SHEETS.BORROW,
    USER: SHEETS.USERS,
    CATEGORY: SHEETS.CATEGORIES
  };
  var targetSheet = targetByType[record.entity_type];
  if (!targetSheet) return;
  var entityId = normalizeWhitespace_(record.entity_id);
  if (!entityId || !maps[targetSheet][entityId]) {
    addIntegrityIssue_(state, 'ERROR', 'ORPHAN_HISTORY_ENTITY', SHEETS.HISTORY, record.log_id,
      'entity_id ในประวัติไม่พบในชีตของ entity_type', record, {
        entity_type: record.entity_type,
        entity_id: entityId,
        target_sheet: targetSheet
      });
  }
}

function auditOperationEntityReference_(state, record, maps) {
  var targetByType = {
    EQUIPMENT: SHEETS.EQUIPMENT,
    BORROW: SHEETS.BORROW,
    USER: SHEETS.USERS,
    CATEGORY: SHEETS.CATEGORIES
  };
  var targetSheet = targetByType[record.entity_type];
  var entityId = normalizeWhitespace_(record.entity_id);
  if (!targetSheet || !entityId) return;
  if (!maps[targetSheet][entityId]) {
    addIntegrityIssue_(state, 'ERROR', 'ORPHAN_OPERATION_ENTITY', SHEETS.OPERATIONS,
      record.operation_id, 'entity_id ใน Operation ไม่พบในชีตของ entity_type', record, {
        entity_type: record.entity_type,
        entity_id: entityId,
        target_sheet: targetSheet
      });
  }
}

function addIntegrityIssue_(state, severity, code, sheetName, recordId, message, record, details) {
  state.total += 1;
  if (severity === 'ERROR') state.errors += 1;
  else state.warnings += 1;
  if (state.issues.length >= INTEGRITY_MAX_RETURNED_ISSUES_) return;
  state.issues.push({
    severity: severity,
    code: code,
    sheet: sheetName,
    record_id: stripSheetEscape_(recordId || ''),
    row_number: record && record.__rowNumber ? record.__rowNumber : null,
    message: message,
    details: toClientValue_(details || {})
  });
}

function integrityRecordId_(sheetName, record) {
  var primaryKey = SHEET_PRIMARY_KEYS[sheetName];
  return primaryKey && record ? normalizeWhitespace_(record[primaryKey]) : '';
}

function integrityIdMap_(records, fieldName) {
  var result = Object.create(null);
  records.forEach(function (record) {
    var value = normalizeWhitespace_(record[fieldName]);
    if (value) result[value] = record;
  });
  return result;
}

function integrityEnumValues_(enumObject) {
  return Object.keys(enumObject).map(function (key) { return enumObject[key]; });
}

function integrityBoolean_(value) {
  if (value === true || String(value).toUpperCase() === 'TRUE') return true;
  if (value === false || String(value).toUpperCase() === 'FALSE') return false;
  return null;
}

function isIntegrityDateOnly_(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}
