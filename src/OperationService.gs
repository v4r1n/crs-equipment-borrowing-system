function operationSpec_(commandId, action, entityType, entityId, payload, actor, assetId) {
  var normalizedEntityType = normalizeWhitespace_(entityType).toUpperCase();
  var normalizedEntityId = normalizeWhitespace_(entityId);
  var serializedPayload = stableJson_(toSerializable_(payload || {}));
  assertApp_(serializedPayload.length <= 90000, 'VALIDATION_FAILED',
    'ข้อมูลคำสั่งมีขนาดใหญ่เกินกว่าที่ระบบรองรับ', null, false);
  return {
    operationId: requireCommandId_(commandId),
    action: normalizeWhitespace_(action).toUpperCase(),
    entityType: normalizedEntityType,
    entityId: normalizedEntityId,
    assetId: normalizeWhitespace_(assetId ||
      (normalizedEntityType === 'EQUIPMENT' ? normalizedEntityId : '')),
    actorUserId: actor.user_id,
    actorEmail: actor.email,
    payloadHash: hashOperationPayload_(payload || {}),
    payloadJson: serializedPayload,
    actorRole: actor.role
  };
}

function hashOperationPayload_(payload) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    stableJson_(toSerializable_(payload)),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function findOperationLocked_(spec) {
  var operation = findRecordById_(SHEETS.OPERATIONS, 'operation_id', spec.operationId);
  if (!operation) return null;
  assertApp_(operation.action === spec.action && operation.entity_type === spec.entityType,
    'STATE_CONFLICT', 'รหัสคำสั่งนี้ถูกใช้กับรายการอื่นแล้ว', null, false);
  assertApp_(!spec.entityId || !operation.entity_id || operation.entity_id === spec.entityId,
    'STATE_CONFLICT', 'รหัสคำสั่งนี้ถูกใช้กับข้อมูลคนละรายการแล้ว', null, false);
  assertApp_(!spec.assetId || !operation.asset_id || operation.asset_id === spec.assetId,
    'STATE_CONFLICT', 'รหัสคำสั่งนี้ผูกกับอุปกรณ์คนละรายการแล้ว', null, false);
  assertApp_(operation.actor_user_id === spec.actorUserId || spec.actorRole === USER_ROLE.ADMIN,
    'FORBIDDEN', 'รหัสคำสั่งนี้เป็นของผู้ใช้อื่น', null, false);
  assertApp_(operation.payload_hash === spec.payloadHash,
    'STATE_CONFLICT', 'ข้อมูลของคำสั่งเดิมไม่ตรงกับคำขอครั้งนี้ กรุณาสร้างรหัสคำสั่งใหม่', null, false);
  assertApp_(operation.status !== OPERATION_STATUS.ABORTED, 'OPERATION_ABORTED',
    'คำสั่งนี้ถูกยกเลิกโดยผู้ดูแลระบบแล้ว กรุณาสร้างรหัสคำสั่งใหม่', null, false);
  assertApp_([OPERATION_STATUS.STARTED, OPERATION_STATUS.COMPLETED].indexOf(operation.status) !== -1,
    'SCHEMA_ERROR', 'สถานะ operation ไม่ถูกต้อง: ' + operation.operation_id, null, false);
  return operation;
}

function startOperationLocked_(spec, beforeState) {
  assertApp_(!findOperationLocked_(spec), 'STATE_CONFLICT',
    'รหัสคำสั่งนี้เริ่มทำงานแล้ว กรุณาลองรายการเดิมอีกครั้ง', null, true);
  assertNoPendingOperationForEntityLocked_(spec.entityType, spec.entityId, spec.operationId);
  assertNoPendingOperationForAssetLocked_(spec.assetId, spec.operationId);
  assertNoPendingUniqueReservationsLocked_(spec);
  var timestamp = nowIso_();
  return insertRecord_(SHEETS.OPERATIONS, {
    operation_id: spec.operationId,
    action: spec.action,
    entity_type: spec.entityType,
    entity_id: spec.entityId,
    asset_id: spec.assetId,
    resource_id: '',
    actor_user_id: spec.actorUserId,
    actor_email: spec.actorEmail,
    payload_hash: spec.payloadHash,
    payload_json: spec.payloadJson.substring(0, 45000),
    payload_json_2: spec.payloadJson.substring(45000),
    before_json: stableJson_(toSerializable_(beforeState === undefined ? null : beforeState)),
    result_json: '',
    result_json_2: '',
    result_json_3: '',
    result_json_4: '',
    result_hash: '',
    status: OPERATION_STATUS.STARTED,
    started_at: timestamp,
    completed_at: '',
    updated_at: timestamp
  });
}

function assertNoPendingUniqueReservationsLocked_(spec) {
  var desired = operationUniqueReservations_(spec.action, JSON.parse(spec.payloadJson));
  if (!desired.length) return;
  var conflict = listRecords_(SHEETS.OPERATIONS).some(function (operation) {
    if (operation.operation_id === spec.operationId ||
      operation.status !== OPERATION_STATUS.STARTED) return false;
    var existing = operationUniqueReservations_(operation.action, operationPayload_(operation));
    return desired.some(function (wanted) {
      return existing.some(function (reserved) {
        return wanted.namespace === reserved.namespace && wanted.key === reserved.key;
      });
    });
  });
  assertApp_(!conflict, 'OPERATION_PENDING',
    'ค่าที่ต้องไม่ซ้ำนี้ถูกจองโดยคำสั่งที่ยังทำงานไม่สมบูรณ์ กรุณากู้คืนคำสั่งเดิมก่อน',
    null, true);
}

function operationUniqueReservations_(action, payload) {
  payload = payload || {};
  var reservation = null;
  if (action === 'CREATE_ASSET' || action === 'EDIT_ASSET') {
    var equipment = payload.equipment || {};
    reservation = {
      namespace: 'EQUIPMENT_SERIAL',
      key: normalizeSerial_(stripSheetEscape_(equipment.serial_number))
    };
  } else if (action === 'CREATE_USER') {
    reservation = { namespace: 'USER_EMAIL', key: normalizeEmail_(payload.email) };
  } else if (action === 'EDIT_USER') {
    reservation = {
      namespace: 'USER_EMAIL',
      key: normalizeEmail_((payload.user || {}).email)
    };
  } else if (action === 'AUTO_PROVISION_USER') {
    reservation = { namespace: 'USER_EMAIL', key: normalizeEmail_(payload.email) };
  } else if (action === 'CREATE_CATEGORY') {
    reservation = {
      namespace: 'CATEGORY_NAME',
      key: normalizeWhitespace_(stripSheetEscape_(payload.category_name)).toLowerCase()
    };
  } else if (action === 'EDIT_CATEGORY') {
    reservation = {
      namespace: 'CATEGORY_NAME',
      key: normalizeWhitespace_(stripSheetEscape_((payload.category || {}).category_name)).toLowerCase()
    };
  }
  return reservation && reservation.key ? [reservation] : [];
}

function assertNoPendingOperationForAssetLocked_(assetId, exceptOperationId) {
  if (!assetId) return;
  var pending = listRecords_(SHEETS.OPERATIONS).some(function (operation) {
    return operation.operation_id !== exceptOperationId && operation.asset_id === assetId &&
      operation.status === OPERATION_STATUS.STARTED;
  });
  assertApp_(!pending, 'OPERATION_PENDING',
    'อุปกรณ์นี้มีคำสั่งก่อนหน้าที่ยังทำงานไม่สมบูรณ์ กรุณาลองคำสั่งเดิมอีกครั้งหรือติดต่อผู้ดูแลระบบ',
    null, true);
}

function operationBeforeState_(operation) {
  try {
    return JSON.parse(String(operation.before_json || 'null'));
  } catch (error) {
    throw new AppError('SCHEMA_ERROR',
      'ข้อมูลก่อนทำ operation ไม่สมบูรณ์: ' + operation.operation_id, null, false);
  }
}

function operationPayload_(operation) {
  try {
    var payload = JSON.parse(
      String(operation.payload_json || '') + String(operation.payload_json_2 || '')
    );
    assertApp_(hashOperationPayload_(payload) === operation.payload_hash, 'SCHEMA_ERROR',
      'payload ของ operation ไม่ตรงกับ hash: ' + operation.operation_id, null, false);
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('SCHEMA_ERROR',
      'ข้อมูล payload ของ operation ไม่สมบูรณ์: ' + operation.operation_id, null, false);
  }
}

function operationResult_(operation) {
  try {
    var result = JSON.parse(String(operation.result_json || '') +
      String(operation.result_json_2 || '') + String(operation.result_json_3 || '') +
      String(operation.result_json_4 || ''));
    assertApp_(hashOperationPayload_(result) === operation.result_hash, 'SCHEMA_ERROR',
      'ผลลัพธ์ของ operation ไม่ตรงกับ hash: ' + operation.operation_id, null, false);
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('SCHEMA_ERROR',
      'ข้อมูลผลลัพธ์ของ operation ไม่สมบูรณ์: ' + operation.operation_id, null, false);
  }
}

function assertNoPendingOperationForEntityLocked_(entityType, entityId, exceptOperationId) {
  if (!entityId) return;
  var pending = listRecords_(SHEETS.OPERATIONS).some(function (operation) {
    return operation.operation_id !== exceptOperationId &&
      operation.entity_type === entityType && operation.entity_id === entityId &&
      operation.status === OPERATION_STATUS.STARTED;
  });
  assertApp_(!pending, 'OPERATION_PENDING',
    'รายการนี้มีคำสั่งก่อนหน้าที่ยังทำงานไม่สมบูรณ์ กรุณาลองคำสั่งเดิมอีกครั้งหรือติดต่อผู้ดูแลระบบ',
    null, true);
}

function setOperationEntityLocked_(operation, entityId) {
  var normalizedId = normalizeWhitespace_(entityId);
  assertApp_(normalizedId, 'INTERNAL', 'ไม่สามารถผูก operation กับข้อมูลที่ไม่มีรหัสได้', null, false);
  assertApp_(!operation.entity_id || operation.entity_id === normalizedId,
    'STATE_CONFLICT', 'operation ถูกผูกกับข้อมูลคนละรายการแล้ว', null, false);
  if (operation.entity_id === normalizedId) return operation;
  var changes = {
    entity_id: normalizedId,
    updated_at: nowIso_()
  };
  if (operation.entity_type === 'EQUIPMENT' && !operation.asset_id) changes.asset_id = normalizedId;
  return updateRecordById_(SHEETS.OPERATIONS, 'operation_id', operation.operation_id, changes);
}

function completeOperationLocked_(operation, entityId, result) {
  operation = setOperationEntityLocked_(operation, entityId);
  if (operation.status === OPERATION_STATUS.COMPLETED) return operation;
  var serializedResult = stableJson_(toSerializable_(result));
  assertApp_(serializedResult.length <= 180000, 'INTERNAL',
    'ผลลัพธ์ operation มีขนาดใหญ่เกินกว่าที่บันทึกได้', null, false);
  var timestamp = nowIso_();
  return updateRecordById_(SHEETS.OPERATIONS, 'operation_id', operation.operation_id, {
    result_json: serializedResult.substring(0, 45000),
    result_json_2: serializedResult.substring(45000, 90000),
    result_json_3: serializedResult.substring(90000, 135000),
    result_json_4: serializedResult.substring(135000),
    result_hash: hashOperationPayload_(result),
    status: OPERATION_STATUS.COMPLETED,
    completed_at: timestamp,
    updated_at: timestamp
  });
}

function abortOperationLocked_(operation, result) {
  assertApp_(operation.status === OPERATION_STATUS.STARTED, 'STATE_CONFLICT',
    'operation นี้ไม่ได้อยู่ในสถานะที่ยกเลิกได้', null, false);
  var serializedResult = stableJson_(toSerializable_(result));
  assertApp_(serializedResult.length <= 180000, 'INTERNAL',
    'ผลลัพธ์ operation มีขนาดใหญ่เกินกว่าที่บันทึกได้', null, false);
  var timestamp = nowIso_();
  bumpCacheEpoch_();
  SpreadsheetApp.flush();
  return updateRecordById_(SHEETS.OPERATIONS, 'operation_id', operation.operation_id, {
    result_json: serializedResult.substring(0, 45000),
    result_json_2: serializedResult.substring(45000, 90000),
    result_json_3: serializedResult.substring(90000, 135000),
    result_json_4: serializedResult.substring(135000),
    result_hash: hashOperationPayload_(result),
    status: OPERATION_STATUS.ABORTED,
    completed_at: timestamp,
    updated_at: timestamp
  });
}

function finalizeOperationLocked_(operation, entityId, result) {
  bumpCacheEpoch_();
  SpreadsheetApp.flush();
  return completeOperationLocked_(operation, entityId, result);
}

function setOperationResourceLocked_(operation, resourceId) {
  var normalizedId = normalizeWhitespace_(resourceId);
  assertApp_(normalizedId, 'INTERNAL', 'ไม่สามารถบันทึก resource ที่ไม่มีรหัสได้', null, false);
  assertApp_(!operation.resource_id || operation.resource_id === normalizedId,
    'STATE_CONFLICT', 'operation ผูกกับ resource คนละรายการแล้ว', null, false);
  if (operation.resource_id === normalizedId) return operation;
  return updateRecordById_(SHEETS.OPERATIONS, 'operation_id', operation.operation_id, {
    resource_id: normalizedId,
    updated_at: nowIso_()
  });
}

function replaceOperationResourceLocked_(operation, resourceId) {
  var normalizedId = normalizeWhitespace_(resourceId);
  assertApp_(operation.status === OPERATION_STATUS.STARTED && normalizedId,
    'STATE_CONFLICT', 'ไม่สามารถเปลี่ยน resource ของ operation นี้ได้', null, false);
  return updateRecordById_(SHEETS.OPERATIONS, 'operation_id', operation.operation_id, {
    resource_id: normalizedId,
    updated_at: nowIso_()
  });
}

function ensureOperationHistoryLocked_(entry, actor) {
  var operation = entry.operationId
    ? findRecordById_(SHEETS.OPERATIONS, 'operation_id', entry.operationId)
    : null;
  if (operation) {
    actor = {
      user_id: operation.actor_user_id,
      email: operation.actor_email
    };
    entry.timestamp = operation.started_at;
  }
  var history = findHistoryByOperationLocked_(entry.operationId);
  if (history) {
    assertOperationMatch_(history, entry.action, entry.entityType, entry.entityId);
    if (operation) {
      var expectedHistory = historyFieldsForEntry_(entry, actor);
      assertApp_(recordFieldsMatch_(history, expectedHistory, Object.keys(expectedHistory)),
        'STATE_CONFLICT', 'History ไม่ตรงกับหลักฐานของ operation เดิม', null, false);
    }
    return history;
  }
  return appendHistoryLocked_(entry, actor);
}
