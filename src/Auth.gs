function getActiveEmail_() {
  var email = normalizeEmail_(Session.getActiveUser().getEmail());
  assertApp_(email && isSafeEmailValue_(email), 'UNAUTHENTICATED',
    'ไม่พบอีเมลผู้ใช้งาน กรุณาเปิดระบบด้วยบัญชี Google Workspace ที่องค์กรอนุญาต', null, false);
  var config = getRuntimeConfig_();
  assertApp_(config.ALLOWED_DOMAIN, 'CONFIG_ERROR',
    'กรุณาตั้งค่า ALLOWED_DOMAIN ก่อนเปิดใช้งานระบบ', null, false);
  assertApp_(isEmailInDomain_(email, config.ALLOWED_DOMAIN), 'FORBIDDEN',
    'บัญชีนี้อยู่นอกโดเมนที่องค์กรอนุญาต', null, false);
  return email;
}

function requireUser_(allowProvision) {
  var email = getActiveEmail_();
  var user = findRecordByField_(SHEETS.USERS, 'email', email, true);
  if (allowProvision !== false) {
    var autoProvisionOperation = findRecordById_(
      SHEETS.OPERATIONS,
      'operation_id',
      autoProvisionCommandId_(email)
    );
    var mustRecoverProvision = autoProvisionOperation &&
      autoProvisionOperation.status === OPERATION_STATUS.STARTED;
    if (mustRecoverProvision || (!user && getRuntimeConfig_().AUTO_PROVISION_USERS)) {
      user = provisionCurrentUser_(email);
    }
  }
  assertApp_(user, 'FORBIDDEN',
    'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแลระบบ', null, false);
  assertApp_(user.status === RECORD_STATUS.ACTIVE, 'USER_DISABLED',
    'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ', null, false);
  return user;
}

function requireAdmin_(allowProvision) {
  var user = requireUser_(allowProvision);
  assertApp_(user.role === USER_ROLE.ADMIN, 'FORBIDDEN',
    'เฉพาะผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้', null, false);
  return user;
}

function provisionCurrentUser_(email) {
  return withScriptLock_(function () {
    var existing = findRecordByField_(SHEETS.USERS, 'email', email, true);
    var commandId = autoProvisionCommandId_(email);
    var rawOperation = findRecordById_(SHEETS.OPERATIONS, 'operation_id', commandId);
    if (existing && !rawOperation) return existing;
    var userId = rawOperation && rawOperation.entity_id;
    if (!userId) userId = nextIdLocked_('USER');
    assertApp_(!existing || existing.user_id === userId, 'STATE_CONFLICT',
      'อีเมลนี้ถูกสร้างโดยรายการอื่นระหว่างการสมัครใช้งานอัตโนมัติ', null, false);
    var pendingActor = { user_id: userId, email: email, role: USER_ROLE.USER };
    var payload = { email: email, name: sanitizeSheetText_(email.split('@')[0]) };
    var spec = operationSpec_(commandId, 'AUTO_PROVISION_USER', 'USER', userId,
      payload, pendingActor);
    var operation = findOperationLocked_(spec);
    if (operation && operation.status === OPERATION_STATUS.COMPLETED) {
      var liveUser = findRecordById_(SHEETS.USERS, 'user_id', operation.entity_id);
      assertApp_(liveUser && normalizeEmail_(liveUser.email) === email, 'FORBIDDEN',
        'บัญชีนี้ไม่มีผู้ใช้ที่ตรงกับอีเมลปัจจุบัน กรุณาติดต่อผู้ดูแลระบบ', null, false);
      return liveUser;
    }
    if (!operation) operation = startOperationLocked_(spec, null);
    var timestamp = operation.started_at;
    var expectedUser = {
      user_id: userId,
      email: email,
      name: payload.name,
      department: '',
      role: USER_ROLE.USER,
      status: RECORD_STATUS.ACTIVE,
      last_login_at: timestamp,
      created_at: timestamp,
      created_by: email,
      updated_at: timestamp,
      updated_by: email,
      row_version: 1
    };
    var user = findRecordById_(SHEETS.USERS, 'user_id', userId);
    if (!user) user = insertRecord_(SHEETS.USERS, expectedUser);
    else assertApp_(operationRecordMatchesExpected_(SHEETS.USERS, user, expectedUser),
      'STATE_CONFLICT', 'ข้อมูลผู้ใช้ไม่ตรงกับ operation สมัครใช้งานอัตโนมัติ', null, false);
    ensureOperationHistoryLocked_({
      entityType: 'USER',
      entityId: user.user_id,
      action: 'AUTO_PROVISION_USER',
      oldStatus: '',
      newStatus: user.status,
      note: 'Auto-provisioned by configured policy',
      operationId: commandId
    }, user);
    finalizeOperationLocked_(operation, userId, toClientValue_(user));
    return user;
  });
}

function autoProvisionCommandId_(email) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizeEmail_(email),
    Utilities.Charset.UTF_8
  );
  return 'auto-user-' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function withUserMutation_(callback) {
  return withScriptLock_(function () {
    return callback(requireUser_(false));
  });
}

function withAdminMutation_(callback) {
  return withScriptLock_(function () {
    return callback(requireAdmin_(false));
  });
}

function getSessionDto_(user) {
  return {
    user_id: user.user_id,
    email: stripSheetEscape_(user.email),
    name: stripSheetEscape_(user.name),
    department: stripSheetEscape_(user.department),
    role: user.role,
    isAdmin: user.role === USER_ROLE.ADMIN
  };
}
