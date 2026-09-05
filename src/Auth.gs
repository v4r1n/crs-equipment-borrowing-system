function requireUser_(sessionToken) {
  var session = requireApplicationSession_(sessionToken);
  var user = requireUserForIdentity_({ email: session.email });
  assertApp_(user.user_id === session.userId, 'FORBIDDEN',
    'ข้อมูลบัญชีผู้ใช้งานเปลี่ยนแปลงแล้ว กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);
  return user;
}

function requireUserForIdentity_(identity) {
  assertApp_(identity && isSafeEmailValue_(identity.email), 'UNAUTHENTICATED',
    'กรุณาลงชื่อเข้าใช้ด้วยบัญชี Google ที่ได้รับอนุญาต', null, false);
  var email = normalizeEmail_(identity.email);
  var matches = listRecords_(SHEETS.USERS).filter(function (record) {
    return normalizeEmail_(stripSheetEscape_(record.email)) === email;
  });
  assertApp_(matches.length === 1, 'FORBIDDEN',
    'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแลระบบ', null, false);
  var user = matches[0];
  assertApp_(user.status === RECORD_STATUS.ACTIVE, 'USER_DISABLED',
    'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ', null, false);
  assertApp_([USER_ROLE.USER, USER_ROLE.ADMIN].indexOf(user.role) !== -1, 'FORBIDDEN',
    'บัญชีนี้ไม่มีบทบาทที่ระบบรองรับ กรุณาติดต่อผู้ดูแลระบบ', null, false);
  return user;
}

function requireAdmin_(sessionToken) {
  var user = requireUser_(sessionToken);
  assertApp_(user.role === USER_ROLE.ADMIN, 'FORBIDDEN',
    'เฉพาะผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้', null, false);
  return user;
}

function assertUserActor_(actor) {
  assertApp_(actor && /^USR-\d{6}$/.test(String(actor.user_id || '')) &&
    isSafeEmailValue_(stripSheetEscape_(actor.email)) &&
    [USER_ROLE.USER, USER_ROLE.ADMIN].indexOf(actor.role) !== -1 &&
    actor.status === RECORD_STATUS.ACTIVE, 'FORBIDDEN',
  'ไม่สามารถยืนยันสิทธิ์ของผู้ใช้งานได้', null, false);
  return actor;
}

function assertAdminActor_(actor) {
  var user = assertUserActor_(actor);
  assertApp_(user.role === USER_ROLE.ADMIN, 'FORBIDDEN',
    'เฉพาะผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้', null, false);
  return user;
}

function refreshUserActor_(actor) {
  var expected = assertUserActor_(actor);
  var current = requireUserForIdentity_({ email: stripSheetEscape_(expected.email) });
  assertApp_(current.user_id === expected.user_id, 'FORBIDDEN',
    'ข้อมูลบัญชีผู้ใช้งานเปลี่ยนแปลงแล้ว กรุณาลงชื่อเข้าใช้อีกครั้ง', null, false);
  return current;
}

function refreshAdminActor_(actor) {
  return assertAdminActor_(refreshUserActor_(actor));
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

function withUserMutation_(actor, callback) {
  return withScriptLock_(function () {
    return callback(refreshUserActor_(actor));
  });
}

function withAdminMutation_(actor, callback) {
  return withScriptLock_(function () {
    return callback(refreshAdminActor_(actor));
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
