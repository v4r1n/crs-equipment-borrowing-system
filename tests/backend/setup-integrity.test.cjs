'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createAppsScriptHarness } = require('./apps-script-harness.cjs');
const {
  bootstrappedHarness,
  createEquipment,
  createUser,
  expectError,
  expectOk
} = require('./test-helpers.cjs');

test('private setupSystem_ creates the complete schema once and remains idempotent', () => {
  const harness = createAppsScriptHarness();
  const first = harness.setup();
  const sheetNames = Object.keys(harness.context.SHEET_SCHEMAS);
  assert.deepEqual(Array.from(first.sheets), sheetNames);
  assert.equal(harness.spreadsheet.timezone, 'Asia/Bangkok');
  assert.equal(harness.spreadsheet.locale, 'th_TH');

  sheetNames.forEach((sheetName) => {
    const sheet = harness.spreadsheet.getSheetByName(sheetName);
    assert.ok(sheet, `missing ${sheetName}`);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    assert.deepEqual(headers, Array.from(harness.context.SHEET_SCHEMAS[sheetName]));
    assert.equal(sheet.getProtections().length, 1);
    assert.equal(sheet.getProtections()[0].warningOnly, true);
  });

  const countsBeforeRetry = Object.fromEntries(sheetNames.map((sheetName) =>
    [sheetName, harness.records(sheetName).length]
  ));
  const second = harness.setup();
  assert.equal(second.message, first.message);
  assert.deepEqual(Object.fromEntries(sheetNames.map((sheetName) =>
    [sheetName, harness.records(sheetName).length]
  )), countsBeforeRetry);
  assert.equal(harness.records('Categories').length, 13);
  assert.equal(harness.records('Users').length, 1);
  assert.equal(harness.records('Sequences').length, 7);
  assert.equal(harness.records('SchemaMigrations').length, 3);
  assert.equal(harness.records('Settings')
    .filter((setting) => setting.setting_key === 'setup_completed_at').length, 1);
  sheetNames.forEach((sheetName) => {
    assert.equal(harness.spreadsheet.getSheetByName(sheetName).getProtections().length, 1,
      `setup retry duplicated protection for ${sheetName}`);
  });
  assert.equal(harness.scriptLock.held, false);
  assert.equal(harness.scriptLock.acquireCount, harness.scriptLock.releaseCount);
});

test('first setup is restricted to a configured admin in the allowed domain', () => {
  const harness = createAppsScriptHarness({ activeEmail: 'user@example.com' });
  expectError(harness.invokeRaw('setupSystem_'), 'FORBIDDEN');
  assert.equal(harness.spreadsheet.sheets.size, 0);

  const outside = createAppsScriptHarness({
    activeEmail: 'admin@outside.example',
    properties: { ADMIN_EMAILS: 'admin@outside.example' }
  });
  expectError(outside.invokeRaw('setupSystem_'), 'FORBIDDEN');
  assert.equal(outside.spreadsheet.sheets.size, 0);
});

test('setup rejects invalid deployment properties before creating managed sheets', () => {
  const cases = [
    { name: 'image sharing mode', properties: { IMAGE_SHARING: 'PRIVATE' } },
    { name: 'Drive folder access', properties: { DRIVE_FOLDER_ID: 'missing-folder' } },
    {
      name: 'development Web app URL',
      properties: {
        WEB_APP_URL: 'https://script.google.com/macros/s/test-deployment/dev'
      }
    },
    {
      name: 'different Web app deployment',
      properties: {
        WEB_APP_URL: 'https://script.google.com/macros/s/other-deployment/exec'
      }
    }
  ];

  for (const scenario of cases) {
    const harness = createAppsScriptHarness({ properties: scenario.properties });
    expectError(harness.invokeRaw('setupSystem_'), 'CONFIG_ERROR');
    assert.equal(harness.spreadsheet.sheets.size, 0, scenario.name);
    assert.equal(harness.scriptLock.held, false, scenario.name);
  }
});

test('recorded migration checksum drift fails closed before setup mutates data', () => {
  const harness = bootstrappedHarness();
  const before = harness.records('SchemaMigrations').map((migration) => ({ ...migration }));
  harness.replaceCell('SchemaMigrations', 'migration_id', '001_initial_schema',
    'checksum', 'tampered-checksum');
  const result = harness.invokeRaw('setupSystem_');
  expectError(result, 'SCHEMA_ERROR');
  assert.equal(harness.records('SchemaMigrations').length, before.length);
  assert.equal(harness.find('SchemaMigrations', 'migration_id', '001_initial_schema').checksum,
    'tampered-checksum');
  assert.equal(harness.scriptLock.held, false);
});

test('integrity audit passes a healthy datastore and reports raw-sheet corruption', () => {
  const harness = bootstrappedHarness();
  const equipment = createEquipment(harness, { suffix: 'audit' });
  const healthy = expectOk(harness.invoke('adminRunIntegrityAudit'));
  assert.equal(healthy.passed, true);
  assert.equal(healthy.summary.total_issues, 0);

  const raw = harness.find('Equipment', 'asset_id', equipment.asset_id);
  delete raw.__rowNumber;
  harness.invoke('insertRecord_', 'Equipment', {
    ...raw,
    serial_number: 'AUDIT-DUPLICATE-PK'
  });
  harness.invoke('insertRecord_', 'Equipment', {
    ...raw,
    asset_id: 'AST-1000000',
    serial_number: 'AUDIT-BAD-WIDTH',
    status: 'PENDING',
    active_borrow_id: ''
  });

  const corrupt = expectOk(harness.invoke('adminRunIntegrityAudit'));
  assert.equal(corrupt.passed, false);
  assert.ok(corrupt.summary.errors >= 3);
  const issueCodes = new Set(Array.from(corrupt.issues, (issue) => issue.code));
  assert.equal(issueCodes.has('DUPLICATE_PRIMARY_KEY'), true);
  assert.equal(issueCodes.has('INVALID_ID_FORMAT'), true);
  assert.equal(issueCodes.has('WORKFLOW_STATUS_WITHOUT_ACTIVE_BORROW'), true);

  const user = createUser(harness, { suffix: 'audit-reader' });
  harness.setActiveEmail(user.email);
  expectError(harness.invoke('adminRunIntegrityAudit'), 'FORBIDDEN');
});

test('integrity audit identifies duplicate normalized business keys from direct edits', () => {
  const harness = bootstrappedHarness();
  const auditor = createUser(harness, {
    suffix: 'duplicate-auditor',
    email: 'duplicate-auditor@example.com',
    role: 'ADMIN'
  });
  const existing = harness.find('Users', 'user_id', 'USR-000001');
  delete existing.__rowNumber;
  harness.invoke('insertRecord_', 'Users', {
    ...existing,
    user_id: 'USR-000002',
    email: '  ADMIN@EXAMPLE.COM  '
  });

  harness.setActiveEmail(auditor.email);
  const audit = expectOk(harness.invoke('adminRunIntegrityAudit'));
  const duplicate = Array.from(audit.issues).find((issue) =>
    issue.code === 'DUPLICATE_USER_EMAIL'
  );
  assert.ok(duplicate);
  assert.equal(duplicate.sheet, 'Users');
  assert.equal(audit.passed, false);
});
