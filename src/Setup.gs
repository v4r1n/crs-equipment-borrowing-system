/**
 * Run once from the Apps Script editor after setting the first admin email.
 * The function is idempotent and never clears existing rows.
 */
function setupSystem() {
  return executeSafely_(function () {
    return withScriptLock_(function () {
      var config = getRuntimeConfig_();
      var setupAccess = assertSetupCaller_(config);
      var actorEmail = setupAccess.email;
      var spreadsheet = getSpreadsheet_();
      var migrationIds = Object.keys(MIGRATION_DEFINITIONS).sort();
      var installedMigrations = Object.create(null);
      preflightRecordedMigrationsRaw_(spreadsheet);
      spreadsheet.setSpreadsheetTimeZone(config.TIMEZONE);
      spreadsheet.setSpreadsheetLocale(config.LOCALE);
      ensureAllSheetsLocked_(spreadsheet);
      migrationIds.forEach(function (migrationId) {
        installedMigrations[migrationId] = preflightMigrationLocked_(
          migrationId,
          MIGRATION_DEFINITIONS[migrationId].checksum
        );
      });
      if (!installedMigrations['002_operation_journal_and_required_items']) {
        migrateBorrowItemRequiredFlagsLocked_();
      }
      if (!installedMigrations['003_operation_result_integrity_and_abort']) {
        migrateOperationResultHashesLocked_();
      }
      validateCriticalUniquenessLocked_();
      recoverSequencesLocked_();
      seedSettingsLocked_(actorEmail, config);
      seedDefaultCategoriesLocked_(actorEmail);
      if (setupAccess.isBootstrap) {
        seedAdminUsersLocked_(actorEmail, config.ADMIN_EMAILS);
      }
      migrationIds.forEach(function (migrationId) {
        var migration = MIGRATION_DEFINITIONS[migrationId];
        recordMigrationLocked_(migrationId, migration.description, migration.checksum, actorEmail);
      });
      markSetupCompletedLocked_(actorEmail);
      bumpCacheEpoch_();
      var warnings = [];
      if (!config.DRIVE_FOLDER_ID) warnings.push('ยังไม่ได้ตั้งค่า DRIVE_FOLDER_ID; การอัปโหลดรูปจะยังใช้งานไม่ได้');
      if (!config.ALLOWED_DOMAIN) warnings.push('ควรตั้งค่า ALLOWED_DOMAIN และจำกัด Web app ให้ใช้ภายใน Workspace domain');
      if (!config.WEB_APP_URL) warnings.push('หลัง deploy ให้ตั้ง WEB_APP_URL หรือรัน refresh QR URL');
      return {
        message: 'ตั้งค่าระบบเรียบร้อยแล้ว',
        spreadsheetId: spreadsheet.getId(),
        sheets: Object.keys(SHEET_SCHEMAS),
        warnings: warnings
      };
    });
  });
}

function assertSetupCaller_(config) {
  var email = normalizeEmail_(Session.getActiveUser().getEmail());
  assertApp_(isSafeEmailValue_(email), 'UNAUTHENTICATED',
    'ไม่พบอีเมลผู้ใช้งาน กรุณารัน setup ด้วยบัญชี Google Workspace', null, false);
  assertApp_(config.ALLOWED_DOMAIN, 'CONFIG_ERROR',
    'กรุณาตั้งค่า ALLOWED_DOMAIN ก่อนรัน setup', null, false);
  assertApp_(isEmailInDomain_(email, config.ALLOWED_DOMAIN), 'FORBIDDEN',
    'บัญชีที่รัน setup ไม่อยู่ใน ALLOWED_DOMAIN', null, false);
  var invalidAdmins = config.ADMIN_EMAILS.filter(function (adminEmail) {
    return !isSafeEmailValue_(adminEmail) || !isEmailInDomain_(adminEmail, config.ALLOWED_DOMAIN);
  });
  assertApp_(!invalidAdmins.length, 'CONFIG_ERROR',
    'ADMIN_EMAILS มีอีเมลที่อยู่นอก ALLOWED_DOMAIN: ' + invalidAdmins.join(', '), null, false);
  var spreadsheet = getSpreadsheet_();
  var isBootstrap = !hasCompletedSetupRaw_(spreadsheet);
  if (isBootstrap) {
    assertApp_(config.ADMIN_EMAILS.indexOf(email) !== -1, 'FORBIDDEN',
      'อีเมลที่รัน setup ครั้งแรกต้องอยู่ใน ADMIN_EMAILS', null, false);
  } else {
    assertApp_(isActiveAdminRaw_(spreadsheet, email), 'FORBIDDEN',
      'หลังติดตั้งแล้ว เฉพาะผู้ดูแลระบบที่เปิดใช้งานอยู่เท่านั้นที่รัน setup ได้', null, false);
  }
  return { email: email, isBootstrap: isBootstrap };
}

function hasCompletedSetupRaw_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(SHEETS.SETTINGS);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 2) return false;
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values[0].map(normalizeWhitespace_);
  var keyIndex = headers.indexOf('setting_key');
  var valueIndex = headers.indexOf('setting_value');
  if (keyIndex === -1 || valueIndex === -1) return false;
  return values.slice(1).some(function (row) {
    return normalizeWhitespace_(row[keyIndex]) === 'setup_completed_at' &&
      Boolean(normalizeWhitespace_(row[valueIndex]));
  });
}

function isActiveAdminRaw_(spreadsheet, email) {
  var sheet = spreadsheet.getSheetByName(SHEETS.USERS);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 4) return false;
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values[0].map(normalizeWhitespace_);
  var emailIndex = headers.indexOf('email');
  var roleIndex = headers.indexOf('role');
  var statusIndex = headers.indexOf('status');
  if (emailIndex === -1 || roleIndex === -1 || statusIndex === -1) return false;
  return values.slice(1).some(function (row) {
    return normalizeEmail_(row[emailIndex]) === email &&
      normalizeWhitespace_(row[roleIndex]).toUpperCase() === USER_ROLE.ADMIN &&
      normalizeWhitespace_(row[statusIndex]).toUpperCase() === RECORD_STATUS.ACTIVE;
  });
}

function ensureAllSheetsLocked_(spreadsheet) {
  Object.keys(SHEET_SCHEMAS).forEach(function (sheetName) {
    ensureSheetLocked_(spreadsheet, sheetName, SHEET_SCHEMAS[sheetName]);
  });
}

function ensureSheetLocked_(spreadsheet, sheetName, expectedHeaders) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  var lastColumn = sheet.getLastColumn();
  var existing = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) {
      return normalizeWhitespace_(value);
    })
    : [];
  if (existing.length === 1 && existing[0] === '') existing = [];
  var seen = Object.create(null);
  existing.forEach(function (header) {
    assertApp_(header && !seen[header], 'SCHEMA_ERROR',
      'Header ของชีต ' + sheetName + ' ว่างหรือซ้ำ: ' + header, null, false);
    seen[header] = true;
    assertApp_(expectedHeaders.indexOf(header) !== -1, 'SCHEMA_ERROR',
      'พบ header ที่ระบบไม่รู้จักในชีต ' + sheetName + ': ' + header, null, false);
  });
  var missing = expectedHeaders.filter(function (header) {
    return existing.indexOf(header) === -1;
  });
  var finalHeaders = existing.concat(missing);
  if (finalHeaders.length) {
    ensureSheetCapacity_(sheet, 2, finalHeaders.length);
    sheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]);
    formatSheetLocked_(sheet, sheetName, finalHeaders);
  }
  return sheet;
}

function formatSheetLocked_(sheet, sheetName, headers) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#16324f')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setWrap(true);
  sheet.setRowHeight(1, 36);
  headers.forEach(function (header, index) {
    var column = index + 1;
    if (/_id$/.test(header) ||
      ['sku', 'serial_number', 'purchase_date', 'borrow_date', 'due_date'].indexOf(header) !== -1) {
      sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    }
    if (header === 'purchase_price') {
      sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('#,##0.00');
    }
    sheet.setColumnWidth(column, /note|description|specification|purpose|json/.test(header) ? 260 : 150);
  });
  ensureWarningProtectionLocked_(sheet);
}

function ensureWarningProtectionLocked_(sheet) {
  var description = 'CRS protected datastore: ' + sheet.getName();
  var exists = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).some(function (protection) {
    return protection.getDescription() === description;
  });
  if (!exists) sheet.protect().setDescription(description).setWarningOnly(true);
}

function seedSettingsLocked_(actorEmail, config) {
  var timestamp = nowIso_();
  [
    ['schema_version', CURRENT_SCHEMA_VERSION, 'Current Google Sheets schema version'],
    ['app_version', config.APP_VERSION, 'Application semantic version'],
    ['timezone', config.TIMEZONE, 'Business timezone']
  ].forEach(function (entry) {
    upsertRecordByField_(SHEETS.SETTINGS, 'setting_key', entry[0], {
      setting_key: entry[0],
      setting_value: entry[1],
      description: entry[2],
      updated_at: timestamp,
      updated_by: actorEmail
    });
  });
}

function markSetupCompletedLocked_(actorEmail) {
  var timestamp = nowIso_();
  upsertRecordByField_(SHEETS.SETTINGS, 'setting_key', 'setup_completed_at', {
    setting_key: 'setup_completed_at',
    setting_value: timestamp,
    description: 'Most recent successful idempotent setup',
    updated_at: timestamp,
    updated_by: actorEmail
  });
}

function seedDefaultCategoriesLocked_(actorEmail) {
  var existing = listRecords_(SHEETS.CATEGORIES);
  var names = Object.create(null);
  existing.forEach(function (row) {
    names[normalizeWhitespace_(row.category_name).toLowerCase()] = true;
  });
  var timestamp = nowIso_();
  var rows = [];
  DEFAULT_CATEGORIES.forEach(function (category, index) {
    if (names[category.name.toLowerCase()]) return;
    rows.push({
      category_id: nextIdLocked_('CATEGORY'),
      category_name: category.name,
      prefix: category.prefix,
      status: RECORD_STATUS.ACTIVE,
      sort_order: index + 1,
      created_at: timestamp,
      created_by: actorEmail,
      updated_at: timestamp,
      updated_by: actorEmail,
      row_version: 1
    });
  });
  insertRecords_(SHEETS.CATEGORIES, rows);
}

function seedAdminUsersLocked_(actorEmail, adminEmails) {
  var timestamp = nowIso_();
  var existing = listRecords_(SHEETS.USERS);
  var emails = Object.create(null);
  existing.forEach(function (row) {
    emails[normalizeEmail_(row.email)] = row;
  });
  var rows = [];
  adminEmails.forEach(function (email) {
    email = normalizeEmail_(email);
    if (!email) return;
    if (emails[email]) {
      var current = emails[email];
      if (current.role !== USER_ROLE.ADMIN || current.status !== RECORD_STATUS.ACTIVE) {
        updateRecordById_(SHEETS.USERS, 'user_id', current.user_id, {
          role: USER_ROLE.ADMIN,
          status: RECORD_STATUS.ACTIVE,
          updated_at: timestamp,
          updated_by: actorEmail,
          row_version: Number(current.row_version || 0) + 1
        });
      }
      return;
    }
    rows.push({
      user_id: nextIdLocked_('USER'),
      email: email,
      name: email.split('@')[0],
      department: '',
      role: USER_ROLE.ADMIN,
      status: RECORD_STATUS.ACTIVE,
      last_login_at: '',
      created_at: timestamp,
      created_by: actorEmail,
      updated_at: timestamp,
      updated_by: actorEmail,
      row_version: 1
    });
    emails[email] = { email: email };
  });
  insertRecords_(SHEETS.USERS, rows);
}
