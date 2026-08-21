function listUsersForAdmin_(query) {
  requireAdmin_(true);
  query = query || {};
  var pageQuery = normalizePageQuery_(
    query,
    ['user_id', 'email', 'name', 'department', 'role', 'status', 'last_login_at', 'created_at', 'updated_at'],
    'name',
    'asc'
  );
  var records = listRecords_(SHEETS.USERS).filter(function (record) {
    return includesSearch_(record, ['user_id', 'email', 'name', 'department'], query.search) &&
      exactFilter_(record.role, query.role) &&
      exactFilter_(record.status, query.status) &&
      exactFilter_(record.department, query.department);
  });
  var result = paginateRecords_(
    sortRecords_(records, pageQuery.sortBy, pageQuery.sortDirection),
    pageQuery
  );
  result.facets = userFacets_(records);
  return result;
}

function createUser_(input, actor) {
  input = input || {};
  var commandId = requireCommandId_(input.command_id);
  var normalized = normalizeUserInput_(input);
  return withAdminMutation_(function (lockedActor) {
    var spec = operationSpec_(commandId, 'CREATE_USER', 'USER', '', normalized, lockedActor);
    var operation = findOperationLocked_(spec);
    if (!operation) {
      var legacy = findHistoryByOperationLocked_(commandId);
      if (legacy) {
        assertOperationMatch_(legacy, 'CREATE_USER', 'USER', '');
        return userResultLocked_(legacy.entity_id);
      }
    }
    if (operation && operation.status === OPERATION_STATUS.COMPLETED) {
      return operationResult_(operation);
    }
    var userId = operation && operation.entity_id;
    if (!operation) {
      assertAllowedUserDomain_(normalized.email);
      assertUniqueUserEmailLocked_(normalized.email, '');
      operation = startOperationLocked_(spec, null);
    }
    if (!userId) {
      userId = nextIdLocked_('USER');
      operation = setOperationEntityLocked_(operation, userId);
    }
    var record = findRecordById_(SHEETS.USERS, 'user_id', userId);
    var timestamp = operation.started_at;
    var expectedRecord = mergeObjects_(normalized, {
      user_id: userId,
      last_login_at: '',
      created_at: timestamp,
      created_by: operation.actor_email,
      updated_at: timestamp,
      updated_by: operation.actor_email,
      row_version: 1
    });
    if (!record) {
      assertAllowedUserDomain_(normalized.email);
      assertUniqueUserEmailLocked_(normalized.email, userId);
      record = expectedRecord;
      insertRecord_(SHEETS.USERS, record);
    } else {
      assertApp_(operationRecordMatchesExpected_(SHEETS.USERS, record, expectedRecord),
      'STATE_CONFLICT', 'ข้อมูลผู้ใช้ของคำสั่งที่ค้างอยู่ไม่ตรงกับข้อมูลปัจจุบัน', null, false);
    }
    ensureOperationHistoryLocked_({
      entityType: 'USER',
      entityId: userId,
      action: 'CREATE_USER',
      oldStatus: '',
      newStatus: record.status,
      note: 'สร้างผู้ใช้ ' + stripSheetEscape_(record.email),
      changedFields: changedFields_(null, record, Object.keys(record)),
      operationId: commandId
    }, lockedActor);
    var result = userResultLocked_(userId);
    finalizeOperationLocked_(operation, userId, result);
    return result;
  });
}

function updateUser_(input, actor) {
  input = input || {};
  var userId = requireUserRecordId_(input.user_id);
  var commandId = requireCommandId_(input.command_id);
  var normalized = normalizeUserInput_(input);
  return withAdminMutation_(function (lockedActor) {
    var current = findRecordById_(SHEETS.USERS, 'user_id', userId);
    assertApp_(current, 'NOT_FOUND', 'ไม่พบผู้ใช้ที่ต้องการแก้ไข', null, false);
    var spec = operationSpec_(commandId, 'EDIT_USER', 'USER', userId, {
      userId: userId,
      expectedVersion: Number(input.expected_version),
      user: normalized
    }, lockedActor);
    var operation = findOperationLocked_(spec);
    if (!operation) {
      var legacy = findHistoryByOperationLocked_(commandId);
      if (legacy) {
        assertOperationMatch_(legacy, 'EDIT_USER', 'USER', userId);
        return userResultLocked_(userId);
      }
    }
    if (operation && operation.status === OPERATION_STATUS.COMPLETED) {
      return operationResult_(operation);
    }
    var expectedVersion = Number(input.expected_version);
    if (!operation) {
      assertExpectedVersion_(current, expectedVersion);
      assertAllowedUserDomain_(normalized.email);
      assertUniqueUserEmailLocked_(normalized.email, userId);
      assertLastActiveAdminPreservedLocked_(current, normalized);
      operation = startOperationLocked_(spec, current);
    }
    var before = operationBeforeState_(operation);
    var targetChanges = mergeObjects_(normalized, {
      updated_at: operation.started_at,
      updated_by: operation.actor_email,
      row_version: Number(before.row_version) + 1
    });
    var atSource = operationRecordMatchesSnapshot_(SHEETS.USERS, current, before);
    var atTarget = operationRecordMatchesChanges_(SHEETS.USERS, current, before, targetChanges);
    assertApp_(atSource || atTarget, 'STATE_CONFLICT',
      'ข้อมูลผู้ใช้ถูกแก้ไขต่อจากคำสั่งที่ค้างอยู่แล้ว', {
        currentVersion: Number(current.row_version)
      }, false);
    var updated = current;
    if (atSource) {
      assertAllowedUserDomain_(normalized.email);
      assertUniqueUserEmailLocked_(normalized.email, userId);
      assertLastActiveAdminPreservedLocked_(current, normalized);
      updated = updateRecordById_(SHEETS.USERS, 'user_id', userId, targetChanges);
    }
    ensureOperationHistoryLocked_({
      entityType: 'USER',
      entityId: userId,
      action: 'EDIT_USER',
      oldStatus: before.status,
      newStatus: updated.status,
      note: 'แก้ไขผู้ใช้ ' + stripSheetEscape_(updated.email),
      changedFields: changedFields_(before, updated,
        Object.keys(normalized).concat(['updated_at', 'updated_by', 'row_version'])),
      operationId: commandId
    }, lockedActor);
    var result = toClientValue_(updated);
    finalizeOperationLocked_(operation, userId, result);
    return result;
  });
}

function normalizeUserInput_(input) {
  return {
    email: requireEmail_(input.email, 'email'),
    name: requireText_(input.name, 'name', 'ชื่อผู้ใช้', 200),
    department: optionalText_(input.department, 'department', 'หน่วยงาน', 150, false),
    role: requireEnum_(input.role, [USER_ROLE.USER, USER_ROLE.ADMIN], 'role', 'สิทธิ์ผู้ใช้'),
    status: requireEnum_(input.status || RECORD_STATUS.ACTIVE,
      [RECORD_STATUS.ACTIVE, RECORD_STATUS.INACTIVE], 'status', 'สถานะ')
  };
}

function requireUserRecordId_(value) {
  var userId = normalizeWhitespace_(value).toUpperCase();
  assertApp_(/^USR-\d{6,}$/.test(userId), 'VALIDATION_FAILED', 'User ID ไม่ถูกต้อง', {
    fieldErrors: fieldError_('user_id', 'User ID ต้องอยู่ในรูปแบบ USR-000001')
  }, false);
  return userId;
}

function assertAllowedUserDomain_(email) {
  var domain = getRuntimeConfig_().ALLOWED_DOMAIN;
  assertApp_(domain, 'CONFIG_ERROR', 'กรุณาตั้งค่า ALLOWED_DOMAIN ก่อนจัดการผู้ใช้', null, false);
  assertApp_(isEmailInDomain_(email, domain), 'VALIDATION_FAILED',
    'อีเมลอยู่นอกโดเมน Google Workspace ที่อนุญาต', {
      fieldErrors: fieldError_('email', domain
        ? 'กรุณาใช้อีเมลโดเมน @' + domain
        : 'อีเมลไม่อยู่ในโดเมนที่อนุญาต')
    }, false);
}

function assertUniqueUserEmailLocked_(email, exceptUserId) {
  var normalized = normalizeEmail_(email);
  var duplicate = listRecords_(SHEETS.USERS).some(function (record) {
    return record.user_id !== exceptUserId && normalizeEmail_(stripSheetEscape_(record.email)) === normalized;
  });
  assertApp_(!duplicate, 'DUPLICATE_EMAIL', 'อีเมลนี้มีอยู่ในระบบแล้ว', {
    fieldErrors: fieldError_('email', 'อีเมลผู้ใช้ต้องไม่ซ้ำ')
  }, false);
}

function assertLastActiveAdminPreservedLocked_(current, target) {
  var removesActiveAdmin = current.role === USER_ROLE.ADMIN &&
    current.status === RECORD_STATUS.ACTIVE &&
    (target.role !== USER_ROLE.ADMIN || target.status !== RECORD_STATUS.ACTIVE);
  if (!removesActiveAdmin) return;
  var anotherActiveAdmin = listRecords_(SHEETS.USERS).some(function (record) {
    return record.user_id !== current.user_id &&
      record.role === USER_ROLE.ADMIN &&
      record.status === RECORD_STATUS.ACTIVE;
  });
  assertApp_(anotherActiveAdmin, 'LAST_ACTIVE_ADMIN',
    'ไม่สามารถลดสิทธิ์หรือปิดใช้งานผู้ดูแลระบบคนสุดท้ายได้', null, false);
}

function userResultLocked_(userId) {
  var user = findRecordById_(SHEETS.USERS, 'user_id', userId);
  assertApp_(user, 'NOT_FOUND', 'ไม่พบผู้ใช้ที่ต้องการ', null, false);
  return toClientValue_(user);
}

function userFacets_(records) {
  var departments = Object.create(null);
  records.forEach(function (record) {
    if (record.department) departments[stripSheetEscape_(record.department)] = true;
  });
  return {
    roles: [USER_ROLE.USER, USER_ROLE.ADMIN],
    statuses: [RECORD_STATUS.ACTIVE, RECORD_STATUS.INACTIVE],
    departments: Object.keys(departments).sort(function (left, right) {
      return left.localeCompare(right, 'th');
    })
  };
}
