function appendHistoryLocked_(entry, actor) {
  return insertRecord_(SHEETS.HISTORY, mergeObjects_({
    log_id: nextIdLocked_('LOG')
  }, historyFieldsForEntry_(entry, actor)));
}

function historyFieldsForEntry_(entry, actor) {
  return {
    timestamp: entry.timestamp || nowIso_(),
    actor_user_id: actor.user_id || '',
    user_email: actor.email || '',
    entity_type: entry.entityType || '',
    entity_id: entry.entityId || '',
    asset_id: entry.assetId || '',
    borrow_id: entry.borrowId || '',
    action: entry.action || '',
    old_status: entry.oldStatus || '',
    new_status: entry.newStatus || '',
    note: optionalText_(entry.note, 'note', 'หมายเหตุ', 2000, true),
    changed_fields_json: entry.changedFields ? stableJson_(entry.changedFields) : '',
    operation_id: entry.operationId || Utilities.getUuid()
  };
}

function findHistoryByOperationLocked_(operationId) {
  if (!operationId) return null;
  return findRecordByField_(SHEETS.HISTORY, 'operation_id', operationId, false);
}

function assertOperationMatch_(history, action, entityType, entityId) {
  if (!history) return false;
  assertApp_(history.action === action && history.entity_type === entityType &&
    (!entityId || history.entity_id === entityId),
    'STATE_CONFLICT', 'รหัสคำสั่งนี้ถูกใช้กับรายการอื่นแล้ว', null, false);
  return true;
}

function listHistoryForAdmin_(query) {
  requireAdmin_(true);
  query = query || {};
  var pageQuery = normalizePageQuery_(
    query,
    ['timestamp', 'action', 'asset_id', 'user_email'],
    'timestamp',
    'desc'
  );
  var records = listRecords_(SHEETS.HISTORY).filter(function (record) {
    return includesSearch_(record, ['log_id', 'user_email', 'asset_id', 'borrow_id', 'action', 'note'], query.search) &&
      exactFilter_(record.action, query.action) &&
      exactFilter_(record.entity_type, query.entityType) &&
      exactFilter_(record.asset_id, query.assetId);
  });
  return paginateRecords_(sortRecords_(records, pageQuery.sortBy, pageQuery.sortDirection), pageQuery);
}

function listHistoryForUser_(query, user) {
  query = query || {};
  var borrowIds = Object.create(null);
  listRecords_(SHEETS.BORROW).forEach(function (borrow) {
    if (borrow.user_id === user.user_id) borrowIds[borrow.borrow_id] = true;
  });
  var pageQuery = normalizePageQuery_(query, ['timestamp', 'action', 'asset_id'], 'timestamp', 'desc');
  var records = listRecords_(SHEETS.HISTORY).filter(function (record) {
    return Boolean(record.borrow_id && borrowIds[record.borrow_id]) &&
      includesSearch_(record, ['asset_id', 'borrow_id', 'action', 'note'], query.search);
  });
  var redacted = sortRecords_(records, pageQuery.sortBy, pageQuery.sortDirection).map(function (record) {
    return selectClientFields_(record, [
      'log_id', 'timestamp', 'entity_type', 'entity_id', 'asset_id', 'borrow_id',
      'action', 'old_status', 'new_status', 'note'
    ]);
  });
  return paginateRecords_(redacted, pageQuery);
}
