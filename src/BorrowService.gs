function requireBorrowId_(value) {
  var borrowId = normalizeWhitespace_(value).toUpperCase();
  assertApp_(/^BR-\d{6}$/.test(borrowId), 'VALIDATION_FAILED', 'รหัสการยืมไม่ถูกต้อง', {
    fieldErrors: fieldError_('borrow_id', 'รหัสการยืมต้องอยู่ในรูปแบบ BR-000001')
  }, false);
  return borrowId;
}

function executeBorrowTransitionLocked_(options, actor) {
  var borrow = findRecordById_(SHEETS.BORROW, 'borrow_id', options.borrowId);
  assertApp_(borrow, 'NOT_FOUND', 'ไม่พบรายการยืม', null, false);
  if (options.authorize) options.authorize(borrow, actor);
  var equipment = findRecordById_(SHEETS.EQUIPMENT, 'asset_id', borrow.asset_id);
  assertApp_(equipment, 'STATE_CONFLICT',
    'ไม่พบอุปกรณ์ของรายการยืม กรุณาติดต่อผู้ดูแลระบบ', null, false);
  var spec = operationSpec_(
    options.commandId,
    options.action,
    'BORROW',
    options.borrowId,
    options.payload,
    actor,
    borrow.asset_id
  );
  var operation = findOperationLocked_(spec);
  if (!operation) {
    var legacy = findHistoryByOperationLocked_(options.commandId);
    if (legacy) {
      assertOperationMatch_(legacy, options.action, 'BORROW', options.borrowId);
      return borrowDto_(borrow, null, actor.role === USER_ROLE.ADMIN);
    }
  }
  if (operation && operation.status === OPERATION_STATUS.COMPLETED) {
    return borrowDto_(operationResult_(operation), null, actor.role === USER_ROLE.ADMIN);
  }
  var expectedVersion = Number(options.expectedVersion);
  if (!operation) {
    assertApp_(borrow.status === options.sourceBorrowStatus &&
      equipment.status === options.sourceEquipmentStatus &&
      equipment.active_borrow_id === options.borrowId,
    'STATE_CONFLICT', 'สถานะรายการยืมหรืออุปกรณ์ไม่ตรงกับขั้นตอนที่ต้องการ', null, false);
    assertExpectedVersion_(borrow, expectedVersion);
    operation = startOperationLocked_(spec, { borrow: borrow, equipment: equipment });
  }
  var beforeState = operationBeforeState_(operation);
  var beforeBorrow = beforeState && beforeState.borrow;
  var beforeEquipment = beforeState && beforeState.equipment;
  assertApp_(beforeBorrow && beforeEquipment, 'SCHEMA_ERROR',
    'operation ไม่มีข้อมูลสถานะก่อนทำรายการ', null, false);
  assertApp_(borrow.asset_id === beforeBorrow.asset_id && equipment.asset_id === beforeEquipment.asset_id,
    'STATE_CONFLICT', 'ข้อมูลอ้างอิงของรายการยืมเปลี่ยนแปลงระหว่างทำคำสั่ง', null, false);
  var domainActor = {
    user_id: operation.actor_user_id,
    email: operation.actor_email,
    role: actor.role
  };
  var timestamp = operation.started_at;
  var targetBorrowChanges = options.borrowChanges(timestamp, beforeBorrow, domainActor);
  targetBorrowChanges.status = options.targetBorrowStatus;
  targetBorrowChanges.updated_at = timestamp;
  targetBorrowChanges.row_version = Number(beforeBorrow.row_version) + 1;
  var targetEquipmentChanges = {
    status: options.targetEquipmentStatus,
    active_borrow_id: options.targetActiveBorrowId,
    updated_at: timestamp,
    updated_by: domainActor.email,
    row_version: Number(beforeEquipment.row_version) + 1
  };
  var borrowAtSource = operationRecordMatchesSnapshot_(SHEETS.BORROW, borrow, beforeBorrow);
  var borrowAtTarget = operationRecordMatchesChanges_(
    SHEETS.BORROW, borrow, beforeBorrow, targetBorrowChanges);
  var equipmentAtSource = operationRecordMatchesSnapshot_(
    SHEETS.EQUIPMENT, equipment, beforeEquipment);
  var equipmentAtTarget = operationRecordMatchesChanges_(
    SHEETS.EQUIPMENT, equipment, beforeEquipment, targetEquipmentChanges);
  assertApp_(borrowAtSource || borrowAtTarget, 'STATE_CONFLICT',
    'รายการยืมถูกแก้ไขต่อจากคำสั่งที่ค้างอยู่แล้ว', null, false);
  assertApp_(equipmentAtSource || equipmentAtTarget, 'STATE_CONFLICT',
    'อุปกรณ์ถูกแก้ไขต่อจากคำสั่งที่ค้างอยู่แล้ว', null, false);
  if (options.prepareLocked) options.prepareLocked(borrow, equipment, domainActor, operation.started_at);
  if (borrowAtSource) {
    borrow = updateRecordById_(
      SHEETS.BORROW, 'borrow_id', options.borrowId, targetBorrowChanges);
  }
  if (equipmentAtSource) {
    equipment = updateRecordById_(
      SHEETS.EQUIPMENT, 'asset_id', beforeEquipment.asset_id, targetEquipmentChanges);
  }
  appendBorrowTransitionHistoryLocked_(
    beforeBorrow,
    borrow,
    beforeEquipment,
    options.action,
    options.note || '',
    options.commandId,
    actor
  );
  var result = borrowDto_(borrow, null, actor.role === USER_ROLE.ADMIN);
  finalizeOperationLocked_(operation, options.borrowId, toClientValue_(borrow));
  return result;
}

function createBorrowRequest_(input, actor) {
  input = input || {};
  var assetId = requireAssetId_(input.asset_id);
  var commandId = requireCommandId_(input.command_id);
  var dates = validateBorrowDates_(input.borrow_date, input.due_date);
  var purpose = requireText_(input.purpose, 'purpose', 'วัตถุประสงค์', 1000);
  var note = optionalText_(input.note, 'note', 'หมายเหตุ', 2000, true);
  return withUserMutation_(function (lockedActor) {
    var pendingOperation = findRecordById_(SHEETS.OPERATIONS, 'operation_id', commandId);
    var pendingPayload = pendingOperation ? operationPayload_(pendingOperation) : null;
    var borrowerUserId = pendingOperation && lockedActor.role === USER_ROLE.ADMIN
      ? pendingPayload.borrowerUserId
      : lockedActor.user_id;
    var payload = {
      assetId: assetId,
      borrowDate: dates.borrowDate,
      dueDate: dates.dueDate,
      purpose: purpose,
      note: note,
      borrowerUserId: borrowerUserId
    };
    var spec = operationSpec_(commandId, 'BORROW_REQUEST', 'BORROW', '',
      payload, lockedActor, assetId);
    var operation = findOperationLocked_(spec);
    var existingRequest = findRecordByField_(SHEETS.BORROW, 'client_request_id', commandId, false);
    if (!operation && existingRequest) {
      assertBorrowRequestMatches_(existingRequest, payload);
      repairLegacyBorrowRequestLocked_(existingRequest, lockedActor);
      return borrowDto_(existingRequest, null, lockedActor.role === USER_ROLE.ADMIN);
    }
    if (!operation) {
      var legacy = findHistoryByOperationLocked_(commandId);
      assertApp_(!legacy, 'STATE_CONFLICT',
        'รหัสคำสั่งนี้ถูกใช้กับรายการอื่นแล้ว', null, false);
    }
    if (operation && operation.status === OPERATION_STATUS.COMPLETED) {
      return borrowDto_(operationResult_(operation), null,
        lockedActor.role === USER_ROLE.ADMIN);
    }
    var equipment = findRecordById_(SHEETS.EQUIPMENT, 'asset_id', assetId);
    assertApp_(equipment, 'NOT_FOUND', 'ไม่พบอุปกรณ์ที่ต้องการยืม', null, false);
    if (!operation) {
      assertApp_(equipment.status === EQUIPMENT_STATUS.AVAILABLE && !equipment.active_borrow_id,
        'RESERVATION_CONFLICT', 'อุปกรณ์รายการนี้ไม่พร้อมให้ยืมแล้ว', null, false);
      assertApp_(!findActiveBorrowForAssetLocked_(assetId),
        'RESERVATION_CONFLICT', 'มีคำขอยืมอุปกรณ์รายการนี้กำลังดำเนินการอยู่', null, false);
      operation = startOperationLocked_(spec, {
        equipment: equipment,
        borrower: {
          userId: lockedActor.user_id,
          email: lockedActor.email,
          name: lockedActor.name,
          department: lockedActor.department
        }
      });
    }
    var beforeState = operationBeforeState_(operation);
    var beforeEquipment = beforeState && beforeState.equipment;
    var borrowerSnapshot = beforeState && beforeState.borrower;
    assertApp_(beforeEquipment && beforeEquipment.asset_id === assetId && borrowerSnapshot,
      'SCHEMA_ERROR',
      'operation คำขอยืมไม่มีข้อมูลอุปกรณ์ก่อนทำรายการ', null, false);
    var borrowId = operation.entity_id;
    if (!borrowId) {
      borrowId = nextIdLocked_('BORROW');
      operation = setOperationEntityLocked_(operation, borrowId);
    }
    var borrow = findRecordById_(SHEETS.BORROW, 'borrow_id', borrowId);
    var timestamp = borrow && borrow.requested_at ? borrow.requested_at : operation.started_at;
    var expectedBorrow = buildBorrowRequestRecord_(
      borrowId,
      commandId,
      payload,
      borrowerSnapshot,
      beforeEquipment,
      operation.started_at
    );
    if (!borrow) {
      borrow = expectedBorrow;
      insertRecord_(SHEETS.BORROW, borrow);
    } else {
      assertBorrowRequestMatches_(borrow, payload);
      assertApp_(operationRecordMatchesExpected_(SHEETS.BORROW, borrow, expectedBorrow),
        'STATE_CONFLICT', 'รายการยืมถูกแก้ไขต่อจากคำสั่งที่ค้างอยู่แล้ว', null, false);
    }
    timestamp = operation.started_at;
    var targetEquipmentChanges = {
      status: EQUIPMENT_STATUS.PENDING,
      active_borrow_id: borrowId,
      updated_at: timestamp,
      updated_by: operation.actor_email,
      row_version: Number(beforeEquipment.row_version) + 1
    };
    var equipmentAtSource = operationRecordMatchesSnapshot_(
      SHEETS.EQUIPMENT, equipment, beforeEquipment);
    var equipmentAtTarget = operationRecordMatchesChanges_(
      SHEETS.EQUIPMENT, equipment, beforeEquipment, targetEquipmentChanges);
    assertApp_(equipmentAtSource || equipmentAtTarget, 'STATE_CONFLICT',
      'อุปกรณ์ถูกแก้ไขต่อจากคำขอยืมที่ค้างอยู่แล้ว', null, false);
    if (equipmentAtSource) {
      equipment = updateRecordById_(
        SHEETS.EQUIPMENT, 'asset_id', assetId, targetEquipmentChanges);
    }
    ensureOperationHistoryLocked_({
      entityType: 'BORROW',
      entityId: borrowId,
      assetId: assetId,
      borrowId: borrowId,
      action: 'BORROW_REQUEST',
      oldStatus: '',
      newStatus: BORROW_STATUS.PENDING_APPROVAL,
      note: purpose,
      operationId: commandId
    }, lockedActor);
    var result = borrowDto_(borrow, null, lockedActor.role === USER_ROLE.ADMIN);
    finalizeOperationLocked_(operation, borrowId, toClientValue_(borrow));
    return result;
  });
}

function buildBorrowRequestRecord_(borrowId, commandId, payload, borrower, equipment, timestamp) {
  return {
    borrow_id: borrowId,
    client_request_id: commandId,
    user_id: borrower.userId,
    user_email: borrower.email,
    user_name: borrower.name,
    user_department: borrower.department,
    asset_id: payload.assetId,
    asset_name: equipment.name,
    asset_sku: equipment.sku,
    borrow_date: payload.borrowDate,
    due_date: payload.dueDate,
    purpose: payload.purpose,
    status: BORROW_STATUS.PENDING_APPROVAL,
    requested_at: timestamp,
    approved_by: '',
    approved_at: '',
    rejected_by: '',
    rejected_at: '',
    rejection_reason: '',
    checkout_by: '',
    checkout_at: '',
    return_requested_by: '',
    return_requested_at: '',
    returned_by: '',
    return_at: '',
    return_condition: '',
    return_disposition: '',
    return_note: '',
    note: payload.note,
    created_at: timestamp,
    updated_at: timestamp,
    row_version: 1
  };
}

function assertBorrowRequestMatches_(borrow, payload) {
  assertApp_(borrow.user_id === payload.borrowerUserId &&
    borrow.asset_id === payload.assetId && borrow.borrow_date === payload.borrowDate &&
    borrow.due_date === payload.dueDate && borrow.purpose === payload.purpose &&
    borrow.note === payload.note,
  'STATE_CONFLICT', 'รหัสคำสั่งนี้ถูกใช้กับข้อมูลคำขออื่นแล้ว', null, false);
}

function repairLegacyBorrowRequestLocked_(borrow, actor) {
  var existingHistory = findHistoryByOperationLocked_(borrow.client_request_id);
  if (existingHistory) {
    assertOperationMatch_(existingHistory, 'BORROW_REQUEST', 'BORROW', borrow.borrow_id);
  }
  var equipment = findRecordById_(SHEETS.EQUIPMENT, 'asset_id', borrow.asset_id);
  assertApp_(equipment, 'STATE_CONFLICT', 'ไม่พบอุปกรณ์ของรายการยืม', null, false);
  if (equipment.status === EQUIPMENT_STATUS.AVAILABLE && !equipment.active_borrow_id) {
    updateRecordById_(SHEETS.EQUIPMENT, 'asset_id', equipment.asset_id, {
      status: EQUIPMENT_STATUS.PENDING,
      active_borrow_id: borrow.borrow_id,
      updated_at: borrow.requested_at || nowIso_(),
      updated_by: actor.email,
      row_version: Number(equipment.row_version) + 1
    });
  } else {
    assertApp_(equipment.status === EQUIPMENT_STATUS.PENDING &&
      equipment.active_borrow_id === borrow.borrow_id,
    'STATE_CONFLICT', 'สถานะอุปกรณ์ไม่ตรงกับคำขอยืมเดิม', null, false);
  }
  ensureOperationHistoryLocked_({
    entityType: 'BORROW',
    entityId: borrow.borrow_id,
    assetId: borrow.asset_id,
    borrowId: borrow.borrow_id,
    action: 'BORROW_REQUEST',
    oldStatus: '',
    newStatus: BORROW_STATUS.PENDING_APPROVAL,
    note: borrow.purpose,
    operationId: borrow.client_request_id
  }, actor);
  bumpCacheEpoch_();
}

function approveBorrow_(input, actor) {
  input = input || {};
  var borrowId = requireBorrowId_(input.borrow_id);
  var commandId = requireCommandId_(input.command_id);
  return withAdminMutation_(function (lockedActor) {
    return executeBorrowTransitionLocked_({
      borrowId: borrowId,
      commandId: commandId,
      expectedVersion: input.expected_version,
      action: 'APPROVE',
      payload: { borrowId: borrowId, expectedVersion: Number(input.expected_version) },
      sourceBorrowStatus: BORROW_STATUS.PENDING_APPROVAL,
      targetBorrowStatus: BORROW_STATUS.APPROVED,
      sourceEquipmentStatus: EQUIPMENT_STATUS.PENDING,
      targetEquipmentStatus: EQUIPMENT_STATUS.RESERVED,
      targetActiveBorrowId: borrowId,
      timestampField: 'approved_at',
      borrowChanges: function (timestamp, before, transitionActor) {
        return { approved_by: transitionActor.email, approved_at: timestamp };
      }
    }, lockedActor);
  });
}

function rejectBorrow_(input, actor) {
  input = input || {};
  var borrowId = requireBorrowId_(input.borrow_id);
  var commandId = requireCommandId_(input.command_id);
  var reason = requireText_(input.reason, 'reason', 'เหตุผลที่ปฏิเสธ', 1000);
  return withAdminMutation_(function (lockedActor) {
    return executeBorrowTransitionLocked_({
      borrowId: borrowId,
      commandId: commandId,
      expectedVersion: input.expected_version,
      action: 'REJECT',
      payload: {
        borrowId: borrowId,
        expectedVersion: Number(input.expected_version),
        reason: reason
      },
      sourceBorrowStatus: BORROW_STATUS.PENDING_APPROVAL,
      targetBorrowStatus: BORROW_STATUS.REJECTED,
      sourceEquipmentStatus: EQUIPMENT_STATUS.PENDING,
      targetEquipmentStatus: EQUIPMENT_STATUS.AVAILABLE,
      targetActiveBorrowId: '',
      timestampField: 'rejected_at',
      note: reason,
      borrowChanges: function (timestamp, before, transitionActor) {
        return {
          rejected_by: transitionActor.email,
          rejected_at: timestamp,
          rejection_reason: reason
        };
      }
    }, lockedActor);
  });
}

function checkoutBorrow_(input, actor) {
  input = input || {};
  var borrowId = requireBorrowId_(input.borrow_id);
  var commandId = requireCommandId_(input.command_id);
  return withAdminMutation_(function (lockedActor) {
    return executeBorrowTransitionLocked_({
      borrowId: borrowId,
      commandId: commandId,
      expectedVersion: input.expected_version,
      action: 'CHECKOUT',
      payload: { borrowId: borrowId, expectedVersion: Number(input.expected_version) },
      sourceBorrowStatus: BORROW_STATUS.APPROVED,
      targetBorrowStatus: BORROW_STATUS.CHECKED_OUT,
      sourceEquipmentStatus: EQUIPMENT_STATUS.RESERVED,
      targetEquipmentStatus: EQUIPMENT_STATUS.BORROWED,
      targetActiveBorrowId: borrowId,
      timestampField: 'checkout_at',
      prepareLocked: function (currentBorrow, currentEquipment) {
        ensureBorrowItemSnapshotLocked_(currentBorrow, currentEquipment);
      },
      borrowChanges: function (timestamp, before, transitionActor) {
        return { checkout_by: transitionActor.email, checkout_at: timestamp };
      }
    }, lockedActor);
  });
}

function requestReturn_(input, actor) {
  input = input || {};
  var borrowId = requireBorrowId_(input.borrow_id);
  var commandId = requireCommandId_(input.command_id);
  var note = optionalText_(input.note, 'note', 'หมายเหตุ', 1000, true);
  return withUserMutation_(function (lockedActor) {
    return executeBorrowTransitionLocked_({
      borrowId: borrowId,
      commandId: commandId,
      expectedVersion: input.expected_version,
      action: 'REQUEST_RETURN',
      payload: {
        borrowId: borrowId,
        expectedVersion: Number(input.expected_version),
        note: note
      },
      sourceBorrowStatus: BORROW_STATUS.CHECKED_OUT,
      targetBorrowStatus: BORROW_STATUS.RETURN_REQUESTED,
      sourceEquipmentStatus: EQUIPMENT_STATUS.BORROWED,
      targetEquipmentStatus: EQUIPMENT_STATUS.RETURNING,
      targetActiveBorrowId: borrowId,
      timestampField: 'return_requested_at',
      note: note,
      authorize: function (currentBorrow, transitionActor) {
        assertApp_(transitionActor.role === USER_ROLE.ADMIN ||
          currentBorrow.user_id === transitionActor.user_id,
        'FORBIDDEN', 'คุณไม่มีสิทธิ์แจ้งคืนรายการนี้', null, false);
      },
      borrowChanges: function (timestamp, before, transitionActor) {
        return {
          return_requested_by: transitionActor.email,
          return_requested_at: timestamp,
          return_note: note
        };
      }
    }, lockedActor);
  });
}

function completeReturn_(input, actor) {
  input = input || {};
  var borrowId = requireBorrowId_(input.borrow_id);
  var commandId = requireCommandId_(input.command_id);
  var condition = requireEnum_(
    input.condition,
    Object.keys(RETURN_CONDITION).map(function (key) { return RETURN_CONDITION[key]; }),
    'condition',
    'สภาพอุปกรณ์'
  );
  var disposition = requireEnum_(
    input.disposition,
    Object.keys(RETURN_DISPOSITION).map(function (key) { return RETURN_DISPOSITION[key]; }),
    'disposition',
    'สถานะหลังคืน'
  );
  var note = optionalText_(input.note, 'note', 'หมายเหตุการคืน', 2000, true);
  assertApp_(Array.isArray(input.items), 'VALIDATION_FAILED',
    'กรุณาส่งรายการตรวจอุปกรณ์ประกอบให้ถูกต้อง', {
      fieldErrors: fieldError_('items', 'รายการตรวจอุปกรณ์ประกอบต้องเป็นรายการ')
    }, false);
  var checklist = input.items;
  validateReturnDisposition_(condition, disposition, note);
  return withAdminMutation_(function (lockedActor) {
    var borrow = findRecordById_(SHEETS.BORROW, 'borrow_id', borrowId);
    assertApp_(borrow, 'NOT_FOUND', 'ไม่พบรายการยืม', null, false);
    var equipment = findRecordById_(SHEETS.EQUIPMENT, 'asset_id', borrow.asset_id);
    assertApp_(equipment, 'STATE_CONFLICT',
      'ไม่พบอุปกรณ์ของรายการยืม กรุณาติดต่อผู้ดูแลระบบ', null, false);
    var payload = {
      borrowId: borrowId,
      expectedVersion: Number(input.expected_version),
      condition: condition,
      disposition: disposition,
      note: note,
      items: checklist
    };
    var spec = operationSpec_(commandId, 'RETURN', 'BORROW', borrowId,
      payload, lockedActor, borrow.asset_id);
    var operation = findOperationLocked_(spec);
    if (!operation) {
      var legacy = findHistoryByOperationLocked_(commandId);
      if (legacy) {
        assertOperationMatch_(legacy, 'RETURN', 'BORROW', borrowId);
        return borrowDto_(borrow, null, true);
      }
    }
    if (operation && operation.status === OPERATION_STATUS.COMPLETED) {
      return borrowDto_(operationResult_(operation), null, true);
    }
    var itemResult = null;
    if (!operation) {
      var canonicalPair = (borrow.status === BORROW_STATUS.CHECKED_OUT &&
        equipment.status === EQUIPMENT_STATUS.BORROWED) ||
        (borrow.status === BORROW_STATUS.RETURN_REQUESTED &&
          equipment.status === EQUIPMENT_STATUS.RETURNING);
      assertApp_(canonicalPair && equipment.active_borrow_id === borrowId,
        'STATE_CONFLICT', 'สถานะอุปกรณ์ไม่ตรงกับรายการยืม กรุณาติดต่อผู้ดูแลระบบ', null, false);
      assertExpectedVersion_(borrow, input.expected_version);
      itemResult = prepareBorrowItemInspectionLocked_(
        borrowId, checklist, condition, note, lockedActor, nowIso_());
      validatePreparedReturn_(itemResult, condition, disposition);
      assertBorrowItemEvidenceRecoverable_(itemResult, '', true);
      operation = startOperationLocked_(spec, {
        borrow: borrow,
        equipment: equipment,
        borrowItemsHash: borrowItemDefinitionHash_(itemResult.snapshots)
      });
    }
    var beforeState = operationBeforeState_(operation);
    var beforeBorrow = beforeState && beforeState.borrow;
    var beforeEquipment = beforeState && beforeState.equipment;
    assertApp_(beforeBorrow && beforeEquipment, 'SCHEMA_ERROR',
      'operation คืนอุปกรณ์ไม่มีข้อมูลสถานะก่อนทำรายการ', null, false);
    var domainActor = { email: operation.actor_email, user_id: operation.actor_user_id };
    var timestamp = operation.started_at;
    var targetBorrowChanges = {
      status: BORROW_STATUS.RETURNED,
      returned_by: domainActor.email,
      return_at: timestamp,
      return_condition: condition,
      return_disposition: disposition,
      return_note: note,
      updated_at: timestamp,
      row_version: Number(beforeBorrow.row_version) + 1
    };
    var targetEquipmentChanges = {
      status: disposition,
      active_borrow_id: '',
      updated_at: timestamp,
      updated_by: domainActor.email,
      row_version: Number(beforeEquipment.row_version) + 1
    };
    var borrowAtSource = operationRecordMatchesSnapshot_(SHEETS.BORROW, borrow, beforeBorrow);
    var borrowAtTarget = operationRecordMatchesChanges_(
      SHEETS.BORROW, borrow, beforeBorrow, targetBorrowChanges);
    var equipmentAtSource = operationRecordMatchesSnapshot_(
      SHEETS.EQUIPMENT, equipment, beforeEquipment);
    var equipmentAtTarget = operationRecordMatchesChanges_(
      SHEETS.EQUIPMENT, equipment, beforeEquipment, targetEquipmentChanges);
    assertApp_(borrowAtSource || borrowAtTarget, 'STATE_CONFLICT',
      'รายการยืมถูกแก้ไขต่อจากคำสั่งคืนที่ค้างอยู่แล้ว', null, false);
    assertApp_(equipmentAtSource || equipmentAtTarget, 'STATE_CONFLICT',
      'อุปกรณ์ถูกแก้ไขต่อจากคำสั่งคืนที่ค้างอยู่แล้ว', null, false);
    itemResult = prepareBorrowItemInspectionLocked_(
      borrowId, checklist, condition, note, domainActor, operation.started_at);
    validatePreparedReturn_(itemResult, condition, disposition);
    assertApp_(beforeState.borrowItemsHash === borrowItemDefinitionHash_(itemResult.snapshots),
      'STATE_CONFLICT', 'snapshot อุปกรณ์ประกอบเปลี่ยนแปลงระหว่าง operation คืน', null, false);
    assertBorrowItemEvidenceRecoverable_(itemResult, operation.started_at, false);
    applyBorrowItemInspectionLocked_(itemResult.updates);
    if (borrowAtSource) {
      borrow = updateRecordById_(
        SHEETS.BORROW, 'borrow_id', borrowId, targetBorrowChanges);
    }
    if (equipmentAtSource) {
      equipment = updateRecordById_(
        SHEETS.EQUIPMENT, 'asset_id', equipment.asset_id, targetEquipmentChanges);
    }
    appendBorrowTransitionHistoryLocked_(
      beforeBorrow,
      borrow,
      beforeEquipment,
      'RETURN',
      note,
      commandId,
      lockedActor
    );
    var result = borrowDto_(borrow, null, true);
    finalizeOperationLocked_(operation, borrowId, toClientValue_(borrow));
    return result;
  });
}

function listMyBorrowing_(query, user) {
  query = query || {};
  var pageQuery = normalizePageQuery_(
    query,
    ['requested_at', 'borrow_date', 'due_date', 'status', 'asset_name'],
    'requested_at',
    'desc'
  );
  var today = todayInTimezone_();
  var records = listRecords_(SHEETS.BORROW).filter(function (record) {
    if (record.user_id !== user.user_id) return false;
    var dto = borrowDto_(record, today);
    return includesSearch_(record, ['borrow_id', 'asset_id', 'asset_name', 'asset_sku'], query.search) &&
      (!query.status || dto.effective_status === query.status || record.status === query.status);
  }).map(function (record) { return borrowDto_(record, today, false); });
  return paginateRecords_(sortRecords_(records, pageQuery.sortBy, pageQuery.sortDirection), pageQuery);
}

function listBorrowingForAdmin_(query) {
  requireAdmin_(true);
  query = query || {};
  var pageQuery = normalizePageQuery_(
    query,
    ['requested_at', 'borrow_date', 'due_date', 'status', 'asset_name', 'user_name'],
    'requested_at',
    'desc'
  );
  var today = todayInTimezone_();
  var records = listRecords_(SHEETS.BORROW).filter(function (record) {
    var dto = borrowDto_(record, today);
    return includesSearch_(record,
      ['borrow_id', 'asset_id', 'asset_name', 'asset_sku', 'user_email', 'user_name'], query.search) &&
      (!query.status || dto.effective_status === query.status || record.status === query.status) &&
      exactFilter_(record.asset_id, query.assetId) &&
      exactFilter_(record.user_id, query.userId);
  }).map(function (record) { return borrowDto_(record, today, true); });
  return paginateRecords_(sortRecords_(records, pageQuery.sortBy, pageQuery.sortDirection), pageQuery);
}

function getBorrowDetail_(borrowId, user) {
  var normalizedId = requireBorrowId_(borrowId);
  var borrow = findRecordById_(SHEETS.BORROW, 'borrow_id', normalizedId);
  assertApp_(borrow, 'NOT_FOUND', 'ไม่พบรายการยืม', null, false);
  assertApp_(user.role === USER_ROLE.ADMIN || borrow.user_id === user.user_id,
    'FORBIDDEN', 'คุณไม่มีสิทธิ์ดูรายการนี้', null, false);
  var includeAdminFields = user.role === USER_ROLE.ADMIN;
  var result = borrowDto_(borrow, null, includeAdminFields);
  result.items = listRecords_(SHEETS.BORROW_ITEMS).filter(function (item) {
    return item.borrow_id === normalizedId;
  }).map(function (item) { return borrowItemDto_(item, includeAdminFields); });
  return result;
}

function findActiveBorrowForAssetLocked_(assetId) {
  var records = listRecords_(SHEETS.BORROW);
  for (var index = 0; index < records.length; index += 1) {
    if (records[index].asset_id === assetId &&
      ACTIVE_BORROW_STATUSES.indexOf(records[index].status) !== -1) {
      return records[index];
    }
  }
  return null;
}

function requireBorrowEquipmentStateLocked_(borrowId, borrowStatus, equipmentStatus) {
  var borrow = findRecordById_(SHEETS.BORROW, 'borrow_id', borrowId);
  assertApp_(borrow, 'NOT_FOUND', 'ไม่พบรายการยืม', null, false);
  assertApp_(borrow.status === borrowStatus, 'STATE_CONFLICT',
    'รายการยืมไม่ได้อยู่ในสถานะที่ทำขั้นตอนนี้ได้', { currentStatus: borrow.status }, false);
  var equipment = findRecordById_(SHEETS.EQUIPMENT, 'asset_id', borrow.asset_id);
  assertApp_(equipment && equipment.status === equipmentStatus && equipment.active_borrow_id === borrowId,
    'STATE_CONFLICT', 'สถานะอุปกรณ์ไม่ตรงกับรายการยืม กรุณาติดต่อผู้ดูแลระบบ', null, false);
  return { borrow: borrow, equipment: equipment };
}

function transitionOperationResultLocked_(commandId, action, borrowId) {
  var history = findHistoryByOperationLocked_(commandId);
  if (!history) return null;
  assertOperationMatch_(history, action, 'BORROW', borrowId);
  var borrow = findRecordById_(SHEETS.BORROW, 'borrow_id', borrowId);
  assertApp_(borrow, 'NOT_FOUND', 'ไม่พบรายการยืม', null, false);
  return borrowDto_(borrow);
}

function appendBorrowTransitionHistoryLocked_(before, after, equipment, action, note, commandId, actor) {
  ensureOperationHistoryLocked_({
    entityType: 'BORROW',
    entityId: after.borrow_id,
    assetId: equipment.asset_id,
    borrowId: after.borrow_id,
    action: action,
    oldStatus: before.status,
    newStatus: after.status,
    note: note,
    changedFields: changedFields_(before, after, Object.keys(after)),
    operationId: commandId
  }, actor);
}

function ensureBorrowItemSnapshotLocked_(borrow, equipment) {
  var existing = listRecords_(SHEETS.BORROW_ITEMS).filter(function (item) {
    return item.borrow_id === borrow.borrow_id;
  });
  var definitions = listActiveIncludedItems_(equipment.asset_id);
  var existingByItemId = Object.create(null);
  existing.forEach(function (snapshot) {
    assertApp_(!existingByItemId[snapshot.item_id], 'SCHEMA_ERROR',
      'พบ snapshot อุปกรณ์ประกอบซ้ำในรายการยืม ' + borrow.borrow_id, null, false);
    existingByItemId[snapshot.item_id] = snapshot;
  });
  var definitionIds = Object.create(null);
  var missingDefinitions = [];
  definitions.forEach(function (definition) {
    definitionIds[definition.item_id] = true;
    var snapshot = existingByItemId[definition.item_id];
    if (!snapshot) {
      missingDefinitions.push(definition);
      return;
    }
    var required = !(definition.is_required === false ||
      String(definition.is_required).toUpperCase() === 'FALSE');
    var snapshotRequired = !(snapshot.is_required === false ||
      String(snapshot.is_required).toUpperCase() === 'FALSE');
    assertApp_(/^BIT-\d{6,}$/.test(snapshot.borrow_item_id) &&
      snapshot.borrow_id === borrow.borrow_id && snapshot.item_id === definition.item_id &&
      snapshot.item_name === definition.item_name &&
      Number(snapshot.expected_quantity) === Number(definition.quantity) &&
      snapshotRequired === required && snapshot.returned_quantity === '' &&
      snapshot.is_complete === '' && snapshot.condition === '' && snapshot.note === '' &&
      snapshot.checked_by === '' && snapshot.checked_at === '',
    'STATE_CONFLICT', 'snapshot อุปกรณ์ประกอบไม่ตรงกับข้อมูลตอน Checkout', null, false);
  });
  existing.forEach(function (snapshot) {
    assertApp_(definitionIds[snapshot.item_id], 'STATE_CONFLICT',
      'พบ snapshot อุปกรณ์ประกอบที่ไม่ได้อยู่ในชุด Checkout', null, false);
  });
  var snapshotIds = nextIdsLocked_('BORROW_ITEM', missingDefinitions.length);
  var rows = missingDefinitions.map(function (item, index) {
    return {
      borrow_item_id: snapshotIds[index],
      borrow_id: borrow.borrow_id,
      item_id: item.item_id,
      item_name: item.item_name,
      expected_quantity: Number(item.quantity),
      is_required: !(item.is_required === false || String(item.is_required).toUpperCase() === 'FALSE'),
      returned_quantity: '',
      is_complete: '',
      condition: '',
      note: '',
      checked_by: '',
      checked_at: ''
    };
  });
  insertRecords_(SHEETS.BORROW_ITEMS, rows);
  return existing.concat(rows);
}

function prepareBorrowItemInspectionLocked_(borrowId, checklist, condition, note, actor, checkedAt) {
  var snapshots = listRecords_(SHEETS.BORROW_ITEMS).filter(function (item) {
    return item.borrow_id === borrowId;
  });
  if (!snapshots.length) {
    assertApp_(!checklist.length, 'VALIDATION_FAILED', 'รายการตรวจอุปกรณ์ประกอบไม่ถูกต้อง', null, false);
    return { allComplete: true, requiredComplete: true, updates: [], snapshots: [] };
  }
  var submitted = Object.create(null);
  checklist.forEach(function (item) {
    var itemId = normalizeWhitespace_(item && item.borrow_item_id);
    assertApp_(itemId && !submitted[itemId], 'VALIDATION_FAILED',
      'รายการตรวจอุปกรณ์ประกอบซ้ำหรือไม่ถูกต้อง', null, false);
    submitted[itemId] = item;
  });
  assertApp_(Object.keys(submitted).length === snapshots.length, 'VALIDATION_FAILED',
    'กรุณาตรวจอุปกรณ์ประกอบให้ครบทุกชิ้น', {
      fieldErrors: fieldError_('items', 'กรุณาตรวจอุปกรณ์ประกอบให้ครบทุกชิ้น')
    }, false);
  var allComplete = true;
  var requiredComplete = true;
  var timestamp = checkedAt || nowIso_();
  var updates = [];
  snapshots.forEach(function (snapshot) {
    var item = submitted[snapshot.borrow_item_id];
    assertApp_(item, 'VALIDATION_FAILED', 'กรุณาตรวจอุปกรณ์ประกอบให้ครบทุกชิ้น', null, false);
    var expected = Number(snapshot.expected_quantity);
    assertApp_(item.returned_quantity !== '' && item.returned_quantity !== null &&
      item.returned_quantity !== undefined, 'VALIDATION_FAILED',
    'กรุณาระบุจำนวนอุปกรณ์ประกอบที่คืนให้ครบทุกชิ้น', null, false);
    var returned = Number(item.returned_quantity);
    assertApp_(Number.isSafeInteger(returned) && returned >= 0 && returned <= expected,
      'VALIDATION_FAILED', 'จำนวนอุปกรณ์ประกอบที่คืนไม่ถูกต้อง', null, false);
    var complete = returned === expected;
    if (!complete) allComplete = false;
    var isRequired = !(snapshot.is_required === false ||
      String(snapshot.is_required).toUpperCase() === 'FALSE');
    if (isRequired && !complete) requiredComplete = false;
    updates.push({
      borrow_item_id: snapshot.borrow_item_id,
      changes: {
        returned_quantity: returned,
        is_complete: complete,
        condition: condition,
        note: optionalText_(item.note || note, 'item_note', 'หมายเหตุอุปกรณ์ประกอบ', 500, true),
        checked_by: actor.email,
        checked_at: timestamp
      }
    });
  });
  return {
    allComplete: allComplete,
    requiredComplete: requiredComplete,
    updates: updates,
    snapshots: snapshots
  };
}

function borrowItemDefinitionHash_(snapshots) {
  var definitions = snapshots.map(function (snapshot) {
    return selectClientFields_(snapshot, [
      'borrow_item_id', 'borrow_id', 'item_id', 'item_name',
      'expected_quantity', 'is_required'
    ]);
  }).sort(function (left, right) {
    return left.borrow_item_id.localeCompare(right.borrow_item_id);
  });
  return hashOperationPayload_(definitions);
}

function assertBorrowItemEvidenceRecoverable_(itemResult, checkedAt, requireSourceOnly) {
  var updatesById = Object.create(null);
  itemResult.updates.forEach(function (update) {
    updatesById[update.borrow_item_id] = update.changes;
  });
  itemResult.snapshots.forEach(function (snapshot) {
    var source = snapshot.returned_quantity === '' && snapshot.is_complete === '' &&
      snapshot.condition === '' && snapshot.note === '' && snapshot.checked_by === '' &&
      snapshot.checked_at === '';
    var targetChanges = updatesById[snapshot.borrow_item_id];
    var target = Boolean(targetChanges) && Object.keys(targetChanges).every(function (fieldName) {
      return stableJson_(toSerializable_(snapshot[fieldName])) ===
        stableJson_(toSerializable_(targetChanges[fieldName]));
    });
    if (checkedAt && target) target = snapshot.checked_at === checkedAt;
    assertApp_(source || (!requireSourceOnly && target), 'STATE_CONFLICT',
      'หลักฐานตรวจอุปกรณ์ประกอบถูกแก้ไขต่อจาก operation คืนที่ค้างอยู่', null, false);
  });
}

function applyBorrowItemInspectionLocked_(updates) {
  updateRecordsById_(SHEETS.BORROW_ITEMS, 'borrow_item_id', updates.map(function (update) {
    return { id: update.borrow_item_id, changes: update.changes };
  }));
}

function validateReturnDisposition_(condition, disposition, note) {
  var allowed = {};
  allowed[RETURN_CONDITION.NORMAL] = [EQUIPMENT_STATUS.AVAILABLE];
  allowed[RETURN_CONDITION.COSMETIC_DAMAGE] = [EQUIPMENT_STATUS.AVAILABLE, EQUIPMENT_STATUS.MAINTENANCE];
  allowed[RETURN_CONDITION.DAMAGED] = [EQUIPMENT_STATUS.DAMAGED, EQUIPMENT_STATUS.MAINTENANCE];
  allowed[RETURN_CONDITION.MISSING_ITEMS] = [EQUIPMENT_STATUS.DAMAGED, EQUIPMENT_STATUS.MAINTENANCE];
  allowed[RETURN_CONDITION.LOST] = [EQUIPMENT_STATUS.LOST];
  assertApp_(allowed[condition].indexOf(disposition) !== -1, 'VALIDATION_FAILED',
    'สภาพอุปกรณ์ไม่สอดคล้องกับสถานะหลังคืน', {
      fieldErrors: fieldError_('disposition', 'กรุณาเลือกสถานะหลังคืนที่สอดคล้องกับสภาพ')
    }, false);
  if (condition !== RETURN_CONDITION.NORMAL) {
    assertApp_(normalizeWhitespace_(note), 'VALIDATION_FAILED',
      'กรุณาระบุหมายเหตุเมื่อสภาพอุปกรณ์ไม่ปกติ', {
        fieldErrors: fieldError_('note', 'กรุณาระบุรายละเอียดสภาพหรือสิ่งที่ขาด')
      }, false);
  }
}

function validatePreparedReturn_(itemResult, condition, disposition) {
  assertApp_(!(disposition === EQUIPMENT_STATUS.AVAILABLE && !itemResult.requiredComplete),
    'VALIDATION_FAILED', 'อุปกรณ์ประกอบที่จำเป็นไม่ครบ จึงตั้งสถานะพร้อมยืมไม่ได้', {
      fieldErrors: fieldError_('items', 'กรุณาตรวจอุปกรณ์ประกอบที่จำเป็นให้ครบ')
    }, false);
  assertApp_(itemResult.requiredComplete ||
    [RETURN_CONDITION.MISSING_ITEMS, RETURN_CONDITION.LOST].indexOf(condition) !== -1,
  'VALIDATION_FAILED', 'จำนวนอุปกรณ์ประกอบที่จำเป็นไม่ครบ กรุณาระบุสภาพให้ตรงกับการตรวจ', {
    fieldErrors: fieldError_('condition', 'กรุณาเลือกสภาพอุปกรณ์ไม่ครบหรือสูญหาย')
  }, false);
  assertApp_(!(condition === RETURN_CONDITION.MISSING_ITEMS && itemResult.allComplete),
    'VALIDATION_FAILED', 'อุปกรณ์ประกอบครบ จึงไม่ควรระบุว่าอุปกรณ์ไม่ครบ', {
      fieldErrors: fieldError_('condition', 'กรุณาตรวจจำนวนหรือเลือกสภาพใหม่')
    }, false);
}

function borrowDto_(record, today, includeAdminFields) {
  var userFields = [
    'borrow_id', 'user_id', 'user_email', 'user_name', 'user_department',
    'asset_id', 'asset_name', 'asset_sku', 'borrow_date', 'due_date', 'purpose',
    'status', 'requested_at', 'rejection_reason', 'checkout_at',
    'return_requested_at', 'return_at', 'return_condition', 'return_disposition',
    'return_note', 'note', 'created_at', 'updated_at', 'row_version'
  ];
  var dto = includeAdminFields ? toClientValue_(record) : selectClientFields_(record, userFields);
  dto.is_overdue = isBorrowOverdue_(record, today || todayInTimezone_());
  dto.effective_status = dto.is_overdue ? 'OVERDUE' : record.status;
  return dto;
}

function borrowItemDto_(record, includeAdminFields) {
  return includeAdminFields ? toClientValue_(record) : selectClientFields_(record, [
    'borrow_item_id', 'borrow_id', 'item_id', 'item_name', 'expected_quantity',
    'is_required', 'returned_quantity', 'is_complete', 'condition', 'note', 'checked_at'
  ]);
}
