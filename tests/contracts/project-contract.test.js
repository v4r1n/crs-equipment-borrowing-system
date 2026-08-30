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
  assert.doesNotThrow(() => JSON.parse(read('src/appsscript.json')));
  assert.equal(serverFiles.length, 23);
  assert.equal(browserFiles.length, 9);
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
