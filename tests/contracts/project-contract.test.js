const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sourceFiles(extension) {
  return fs.readdirSync(SRC)
    .filter((file) => file.endsWith(extension))
    .sort();
}

function wrappedScript(file) {
  const match = fs.readFileSync(path.join(SRC, file), 'utf8')
    .match(/^\s*<script>\s*([\s\S]*?)\s*<\/script>\s*$/);
  assert.ok(match, `${file} must contain one script wrapper`);
  return match[1];
}

function loadServerContext() {
  const context = vm.createContext({
    console: { error() {}, log() {}, warn() {} },
    URL,
  });
  const combined = sourceFiles('.gs')
    .map((file) => fs.readFileSync(path.join(SRC, file), 'utf8'))
    .join('\n');
  new vm.Script(combined, { filename: 'combined.gs' }).runInContext(context);
  return context;
}

test('all server, browser, and manifest sources compile', () => {
  const serverFiles = sourceFiles('.gs');
  for (const file of serverFiles) {
    new vm.Script(fs.readFileSync(path.join(SRC, file), 'utf8'), { filename: file });
  }
  new vm.Script(
    serverFiles.map((file) => fs.readFileSync(path.join(SRC, file), 'utf8')).join('\n'),
    { filename: 'combined.gs' },
  );

  const browserFiles = sourceFiles('.html').filter((file) =>
    /^(scripts-|vendor-)/.test(file));
  for (const file of browserFiles) {
    new vm.Script(wrappedScript(file), { filename: file });
  }
  const manifest = JSON.parse(read('src/appsscript.json'));
  assert.deepEqual(manifest.oauthScopes, [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
  ]);
  assert.equal(serverFiles.length, 23);
  assert.equal(browserFiles.length, 9);
});

test('deployment runbook covers every runtime file, config key, and requested step', () => {
  const guide = read('docs/DEPLOYMENT.md');
  const runtimeFiles = fs.readdirSync(SRC)
    .filter((file) => /\.(?:gs|html|json)$/.test(file))
    .sort();
  assert.equal(runtimeFiles.length, 43);
  for (const file of runtimeFiles) {
    const escapedFile = file.replaceAll('.', '\\.');
    assert.match(guide, new RegExp(`\\b${escapedFile}\\b`),
      `${file} must be named in the deployment inventory`);
  }

  const configBlock = read('src/Config.gs')
    .match(/var CONFIG = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  assert.ok(configBlock, 'central CONFIG block must remain discoverable');
  const configKeys = [...configBlock[1].matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)]
    .map((match) => match[1]);
  for (const key of configKeys) {
    assert.match(guide, new RegExp(`\\b${key}\\b`),
      `${key} must be documented for the deployer`);
  }

  const steps = [...guide.matchAll(/^## (\d+)\./gm)]
    .map((match) => Number(match[1]));
  assert.deepEqual(steps, Array.from({ length: 11 }, (_, index) => index + 1));
  assert.match(read('src/Setup.gs'), /event:\s*'SETUP_COMPLETED'/);
});

test('server exposes only the guarded RPCs and deliberate Apps Script entry points', () => {
  const expected = [
    'adminAbortOperation',
    'adminApproveBorrow',
    'adminChangeEquipmentStatus',
    'adminCheckoutBorrow',
    'adminCompleteReturn',
    'adminCreateCategory',
    'adminCreateEquipment',
    'adminCreateUser',
    'adminGetDashboard',
    'adminGetOperationDetail',
    'adminListBorrowing',
    'adminListCategories',
    'adminListHistory',
    'adminListOperations',
    'adminListUsers',
    'adminReconcileOperation',
    'adminRejectBorrow',
    'adminRunIntegrityAudit',
    'adminUpdateCategory',
    'adminUpdateEquipment',
    'adminUpdateUser',
    'adminUploadEquipmentImage',
    'createBorrowRequest',
    'doGet',
    'getAppBootstrap',
    'getBorrowDetail',
    'getDashboard',
    'getEquipmentDetail',
    'listCategories',
    'listEquipment',
    'listMyBorrowing',
    'listMyHistory',
    'requestReturn',
    'setupSystem',
  ];
  const actual = [];
  for (const file of sourceFiles('.gs')) {
    const source = fs.readFileSync(path.join(SRC, file), 'utf8');
    for (const match of source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
      if (!match[1].endsWith('_')) actual.push(match[1]);
    }
  }
  assert.deepEqual(actual.sort(), expected.sort());

  const api = read('src/Api.gs');
  const declarations = [...api.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)];
  declarations.forEach((declaration, index) => {
    const name = declaration[1];
    if (name.endsWith('_')) return;
    const end = declarations[index + 1] ? declarations[index + 1].index : api.length;
    const body = api.slice(declaration.index, end);
    assert.match(body, /return executeSafely_\s*\(/, `${name} must use executeSafely_`);
    assert.match(
      body,
      name.startsWith('admin') ? /requireAdmin_\s*\(/ : /requireUser_\s*\(/,
      `${name} must enforce its server-side role`,
    );
  });
  assert.doesNotMatch(sourceFiles('.gs').map((file) =>
    fs.readFileSync(path.join(SRC, file), 'utf8')).join('\n'), /Session\.getEffectiveUser\s*\(/);
});

test('include and route registries exactly match their source consumers', () => {
  const context = loadServerContext();
  const allowlisted = Array.from(context.HTML_PARTIALS_).sort();
  const included = [...read('src/index.html').matchAll(/include_\('([^']+)'\)/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(included, allowlisted);
  for (const partial of allowlisted) {
    assert.ok(fs.existsSync(path.join(SRC, `${partial}.html`)), `${partial}.html must exist`);
  }

  const registrations = sourceFiles('.html')
    .filter((file) => file.startsWith('scripts-'))
    .flatMap((file) => [...fs.readFileSync(path.join(SRC, file), 'utf8')
      .matchAll(/CRS\.registerRoute\('([^']+)'/g)])
    .map((match) => match[1])
    .sort();
  assert.deepEqual(registrations, Array.from(context.CLIENT_ROUTES_).sort());
});

test('fixed-width ID allocation fails atomically at sequence exhaustion', () => {
  const context = loadServerContext();
  let nextValue = 999999;
  let existing = Object.create(null);
  const updates = [];
  context.findRecordByField_ = () => ({ next_value: nextValue });
  context.getFieldValueSet_ = () => existing;
  context.updateRecordById_ = (...args) => {
    updates.push(args);
    return args[3];
  };
  context.nowIso_ = () => '2026-08-28T00:00:00.000Z';

  assert.deepEqual(Array.from(context.nextIdsLocked_('ASSET', 1)), ['AST-999999']);
  assert.equal(updates.at(-1)[3].next_value, 1000000);

  updates.length = 0;
  nextValue = 1000000;
  assert.throws(
    () => context.nextIdsLocked_('ASSET', 1),
    (error) => error && error.code === 'ID_EXHAUSTED' && error.retryable === false,
  );
  assert.equal(updates.length, 0);

  nextValue = 999999;
  assert.throws(
    () => context.nextIdsLocked_('ASSET', 2),
    (error) => error && error.code === 'ID_EXHAUSTED',
  );
  assert.equal(updates.length, 0);

  existing = { 'AST-999999': true };
  assert.throws(
    () => context.nextIdsLocked_('ASSET', 1),
    (error) => error && error.code === 'ID_EXHAUSTED',
  );
  assert.equal(updates.length, 0);

  existing = Object.create(null);
  nextValue = 999;
  assert.deepEqual(Array.from(context.nextIdsLocked_('CATEGORY', 1)), ['CAT-999']);
  nextValue = 1000;
  assert.throws(
    () => context.nextIdsLocked_('CATEGORY', 1),
    (error) => error && error.code === 'ID_EXHAUSTED',
  );
});

test('record validators reject over-width identifiers', () => {
  const context = loadServerContext();
  assert.equal(context.requireUserRecordId_('usr-000001'), 'USR-000001');
  assert.equal(context.requireCategoryRecordId_('cat-001'), 'CAT-001');
  assert.throws(() => context.requireUserRecordId_('USR-1000000'),
    (error) => error && error.code === 'VALIDATION_FAILED');
  assert.throws(() => context.requireCategoryRecordId_('CAT-1000'),
    (error) => error && error.code === 'VALIDATION_FAILED');
  assert.doesNotMatch(read('src/BorrowService.gs'), /BIT-\\d\{6,\}/);
});

test('server QR base accepts only the current canonical Apps Script exec URL', () => {
  const context = loadServerContext();
  const base = 'https://script.google.com/macros/s/AKfycbDeployment_123/exec';
  const other = 'https://script.google.com/macros/s/AKfycbOther_456/exec';
  let configured = '';
  let detected = base;
  context.getRuntimeConfig_ = () => ({ WEB_APP_URL: configured });
  context.ScriptApp = { getService: () => ({ getUrl: () => detected }) };

  assert.equal(context.getWebAppBaseUrl_(), base);
  assert.equal(context.buildAssetUrl_('AST-000001'),
    `${base}?view=equipment-detail&id=AST-000001`);
  detected = `${base}/`;
  assert.equal(context.getWebAppBaseUrl_(), base);

  configured = base;
  detected = base;
  assert.equal(context.getWebAppBaseUrl_(), base);
  detected = `${base.replace('/exec', '/dev')}`;
  assert.equal(context.getWebAppBaseUrl_(), base,
    'a /dev execution must keep the configured production /exec base');
  detected = other;
  assert.equal(context.getWebAppBaseUrl_(), '',
    'a configured deployment must match the detected deployment');

  detected = base;
  const invalid = [
    base.replace('/exec', '/dev'),
    'https://example.com/macros/s/AKfycbDeployment_123/exec',
    'https://script.googleusercontent.com/macros/s/AKfycbDeployment_123/exec',
    'https://user@script.google.com/macros/s/AKfycbDeployment_123/exec',
    'https://script.google.com:443/macros/s/AKfycbDeployment_123/exec',
    `${base}?view=equipment`,
    `${base}#fragment`,
    `${base}/extra`,
  ];
  for (const value of invalid) {
    configured = value;
    assert.equal(context.getWebAppBaseUrl_(), '', value);
  }
});

test('Drive sharing failures keep a stable application error code', () => {
  const context = loadServerContext();
  context.DriveApp = {
    Access: {
      DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK',
      ANYONE_WITH_LINK: 'ANYONE_WITH_LINK',
    },
    Permission: { VIEW: 'VIEW' },
  };
  const denied = {
    setSharing() { throw new Error('Sharing is disabled by organization policy'); },
  };
  assert.throws(
    () => context.applyImageSharing_(denied, 'DOMAIN_WITH_LINK'),
    (error) => error && error.code === 'DRIVE_SHARING_FAILED' && error.retryable === true,
  );

  let sharingAccess = '';
  let sharingPermission = '';
  const accepted = {
    setSharing(access, permission) {
      sharingAccess = access;
      sharingPermission = permission;
    },
    getSharingAccess: () => sharingAccess,
    getSharingPermission: () => sharingPermission,
  };
  assert.doesNotThrow(() => context.applyImageSharing_(accepted, 'DOMAIN_WITH_LINK'));
  assert.equal(sharingAccess, 'DOMAIN_WITH_LINK');
  assert.equal(sharingPermission, 'VIEW');
});

test('QR parser accepts only an exact asset ID or canonical same-app URL', () => {
  const base = 'https://script.google.com/macros/s/DEPLOYMENT/exec';
  const window = {
    URL,
    console: { error() {} },
    setTimeout,
    CRS: {
      state: { bootstrap: { app: { webAppUrl: base } } },
      registerRoute() {},
    },
  };
  window.window = window;
  new vm.Script(wrappedScript('scripts-qr.html'), { filename: 'scripts-qr.html' })
    .runInNewContext({ window, URL, setTimeout });
  const parse = window.CRS.qr.parseScannedAsset;
  const valid = [
    'AST-000001',
    ' ast-000001 ',
    `${base}?id=AST-000001`,
    `${base}?view=equipment-detail&id=AST-000001`,
    `${base}?asset_id=AST-000001`,
  ];
  for (const payload of valid) {
    assert.equal(parse(payload).assetId, 'AST-000001', payload);
  }

  const hostile = [
    '',
    'AST-00001',
    'AST-1000000',
    `http://script.google.com/macros/s/DEPLOYMENT/exec?id=AST-000001`,
    `https://example.com/macros/s/DEPLOYMENT/exec?id=AST-000001`,
    `https://user@script.google.com/macros/s/DEPLOYMENT/exec?id=AST-000001`,
    `${base}/?id=AST-000001`,
    `${base}#`,
    `${base}#fragment`,
    `${base}?view=equipment&id=AST-000001`,
    `${base}?view=equipment-detail&view=equipment-detail&id=AST-000001`,
    `${base}?id=AST-000001&id=AST-000002`,
    `${base}?id=AST-000001&asset_id=AST-000001`,
    `${base}?asset_id=AST-000001&asset_id=AST-000002`,
    `${base}?foo=1&id=AST-000001`,
    `${base}?constructor=1&id=AST-000001`,
    `${base}?__proto__=1&id=AST-000001`,
    `${base}?toString=1&id=AST-000001`,
    `${base}?hasOwnProperty=1&id=AST-000001`,
    `${base}?valueOf=1&id=AST-000001`,
    `${base}?view=&id=AST-000001`,
    `${base}?view=equipment-detail`,
  ];
  for (const payload of hostile) assert.equal(parse(payload), null, payload);
});

test('project-authored markup keeps the QR scanner passive and HTML safe', () => {
  const authored = sourceFiles('.html')
    .filter((file) => !file.startsWith('vendor-'))
    .map((file) => fs.readFileSync(path.join(SRC, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(authored, /navigator\.mediaDevices|getUserMedia|getCameras/);
  assert.doesNotMatch(authored, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(authored, /javascript\s*:/i);
  assert.match(read('src/scripts-qr.html'), /\.scanFile\s*\(/);
});
