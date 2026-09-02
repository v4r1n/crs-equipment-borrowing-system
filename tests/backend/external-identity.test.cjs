'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  TEST_GOOGLE_OAUTH_CLIENT_ID,
  createAppsScriptHarness
} = require('./apps-script-harness.cjs');
const {
  bootstrappedHarness,
  createUser,
  expectError,
  expectOk
} = require('./test-helpers.cjs');

const MULTI_DOMAIN_PROPERTIES = Object.freeze({
  ADMIN_EMAILS: 'admin@yru.ac.th',
  ALLOWED_DOMAINS: 'yru.ac.th,gmail.com',
  ALLOWED_DOMAIN: 'legacy.invalid',
  GOOGLE_OAUTH_CLIENT_ID: TEST_GOOGLE_OAUTH_CLIENT_ID,
  AUTO_PROVISION_USERS: 'false'
});

function multiDomainHarness(overrides = {}) {
  return bootstrappedHarness({
    activeEmail: 'admin@yru.ac.th',
    ...overrides,
    properties: {
      ...MULTI_DOMAIN_PROPERTIES,
      ...(overrides.properties || {})
    }
  });
}

function corruptSignature(idToken) {
  const segments = String(idToken).split('.');
  segments[2] = `${segments[2][0] === 'A' ? 'B' : 'A'}${segments[2].slice(1)}`;
  return segments.join('.');
}

test('ALLOWED_DOMAINS normalizes multiple domains and falls back to legacy ALLOWED_DOMAIN', () => {
  const modern = createAppsScriptHarness({
    properties: {
      ALLOWED_DOMAINS: ' YRU.AC.TH, gmail.com, yru.ac.th ',
      ALLOWED_DOMAIN: 'legacy.invalid'
    }
  });
  assert.deepEqual(
    Array.from(modern.invokeRaw('getRuntimeConfig_').ALLOWED_DOMAINS),
    ['yru.ac.th', 'gmail.com']
  );

  modern.properties.deleteProperty('ALLOWED_DOMAINS');
  assert.deepEqual(
    Array.from(modern.invokeRaw('getRuntimeConfig_').ALLOWED_DOMAINS),
    ['legacy.invalid']
  );

  modern.properties.setProperty('ALLOWED_DOMAINS', '');
  modern.properties.setProperty('ALLOWED_DOMAIN', 'yru.ac.th');
  assert.deepEqual(
    Array.from(modern.invokeRaw('getRuntimeConfig_').ALLOWED_DOMAINS),
    ['yru.ac.th']
  );

  const unsafe = createAppsScriptHarness({
    properties: { ALLOWED_DOMAINS: 'yru.ac.th,*.example.com' }
  });
  expectError(unsafe.invoke('getAppBootstrap'), 'CONFIG_ERROR');
});

test('verified yru.ac.th and gmail.com identities use their own active Users rows', () => {
  const harness = multiDomainHarness();
  const yruUser = createUser(harness, {
    suffix: 'yru-identity',
    email: 'lecturer@yru.ac.th'
  });
  const gmailUser = createUser(harness, {
    suffix: 'gmail-identity',
    email: 'external.borrower@gmail.com'
  });

  harness.setTokenIdentity(yruUser.email, { hd: 'yru.ac.th' });
  const yruBootstrap = expectOk(harness.invoke('getAppBootstrap'));
  assert.equal(yruBootstrap.session.email, 'lecturer@yru.ac.th');
  assert.equal(yruBootstrap.session.role, 'USER');

  harness.setTokenIdentity(gmailUser.email, { hd: undefined });
  const gmailBootstrap = expectOk(harness.invoke('getAppBootstrap'));
  assert.equal(gmailBootstrap.session.email, 'external.borrower@gmail.com');
  assert.equal(gmailBootstrap.session.role, 'USER');
  assert.ok(harness.state.fetches.length >= 1, 'identity verification must obtain Google JWKS');
});

test('Google JWKS is reused from Script Cache across verified RPCs', () => {
  const harness = multiDomainHarness();
  harness.setTokenIdentity('admin@yru.ac.th', { hd: 'yru.ac.th' });

  expectOk(harness.invoke('getAppBootstrap'));
  const fetchesAfterFirstRpc = harness.state.fetches.length;
  assert.equal(fetchesAfterFirstRpc, 1);

  expectOk(harness.invoke('listEquipment', {}));
  assert.equal(harness.state.fetches.length, fetchesAfterFirstRpc,
    'a cached JWKS must prevent a second Google fetch');
});

test('Google JWKS max-age=0 is respected and does not retain signing keys', () => {
  const harness = multiDomainHarness({
    jwksHeaders: { 'Cache-Control': 'public, max-age=0' }
  });
  harness.setTokenIdentity('admin@yru.ac.th', { hd: 'yru.ac.th' });

  expectOk(harness.invoke('getAppBootstrap'));
  expectOk(harness.invoke('listEquipment', {}));
  assert.equal(harness.state.fetches.length, 2);
});

test('unknown key IDs cannot force repeated JWKS refreshes while cached keys are fresh', () => {
  const harness = multiDomainHarness();
  for (let index = 0; index < 4; index += 1) {
    const token = harness.issueIdToken('admin@yru.ac.th', { hd: 'yru.ac.th' }, {
      header: { kid: `attacker-key-${index}` }
    });
    expectError(harness.invokeWithToken('getDashboard', token), 'UNAUTHENTICATED');
  }
  assert.equal(harness.state.fetches.length, 1,
    'a fresh cached key set must reject unknown kids without another fetch');
});

test('JWKS cache failures do not reject a token after a successful Google fetch', () => {
  const harness = multiDomainHarness();
  harness.cache.put = () => { throw new Error('simulated CacheService failure'); };
  harness.setTokenIdentity('admin@yru.ac.th', { hd: 'yru.ac.th' });

  expectOk(harness.invoke('getAppBootstrap'));
  assert.equal(harness.state.fetches.length, 1);
  assert.equal(harness.invokeRaw('googleIdentityJwksCacheSeconds_', {
    getHeaders: () => ({ 'Cache-Control': 'public, max-age=60', Age: '55' })
  }), 5);

  const acquisitionFailure = multiDomainHarness();
  acquisitionFailure.context.CacheService.getScriptCache = () => {
    throw new Error('simulated CacheService acquisition failure');
  };
  acquisitionFailure.setTokenIdentity('admin@yru.ac.th', { hd: 'yru.ac.th' });
  expectOk(acquisitionFailure.invoke('getAppBootstrap'));
  assert.equal(acquisitionFailure.state.fetches.length, 1);
});

test('missing, malformed, unsigned, invalid-signature, and unknown-key tokens fail closed', () => {
  const harness = multiDomainHarness();
  const valid = harness.issueIdToken('admin@yru.ac.th', { hd: 'yru.ac.th' });
  const unsignedSegments = valid.split('.').slice(0, 2).concat('').join('.');
  const unknownKid = harness.issueIdToken('admin@yru.ac.th', { hd: 'yru.ac.th' }, {
    header: { kid: 'unknown-google-key' }
  });
  const missingKid = harness.issueIdToken('admin@yru.ac.th', { hd: 'yru.ac.th' }, {
    header: { kid: undefined }
  });

  [
    '',
    'not-a-jwt',
    unsignedSegments,
    corruptSignature(valid),
    unknownKid,
    missingKid
  ].forEach((token) => {
    expectError(harness.invokeWithToken('listEquipment', token, {}), 'UNAUTHENTICATED');
  });
});

test('wrong audience, issuer, expiry, verification state, and hosted domain are rejected', () => {
  const harness = multiDomainHarness();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const invalidClaims = [
    { aud: '999999999999-attacker.apps.googleusercontent.com' },
    { iss: 'https://attacker.example' },
    { exp: nowSeconds - 1, iat: nowSeconds - 3600 },
    { email_verified: false },
    { hd: undefined },
    { hd: 'other.example' },
    { azp: '999999999999-attacker.apps.googleusercontent.com' }
  ];

  invalidClaims.forEach((claims) => {
    const token = harness.issueIdToken('admin@yru.ac.th', claims);
    expectError(harness.invokeWithToken('getDashboard', token), 'UNAUTHENTICATED');
  });
});

test('a valid Google token from an unallowed domain is forbidden before Users lookup', () => {
  const harness = multiDomainHarness();
  const token = harness.issueIdToken('outsider@other.example', { hd: 'other.example' });
  expectError(harness.invokeWithToken('listEquipment', token, {}), 'FORBIDDEN');
});

test('JWKS transport or response failure does not admit a signed-in user', () => {
  const unavailable = multiDomainHarness();
  unavailable.setJwks({ error: 'unavailable' }, 503);
  expectError(unavailable.invoke('listEquipment', {}), 'AUTH_SERVICE_UNAVAILABLE');

  const malformed = multiDomainHarness();
  malformed.setJwks({ keys: [] }, 200);
  expectError(malformed.invoke('listEquipment', {}), 'AUTH_SERVICE_UNAVAILABLE');
});

test('an unknown Users identity stays forbidden even when legacy auto-provision is enabled', () => {
  const harness = multiDomainHarness({
    properties: { AUTO_PROVISION_USERS: 'true' }
  });
  const before = {
    users: harness.records('Users').length,
    operations: harness.records('Operations').length,
    history: harness.records('History').length
  };

  harness.setTokenIdentity('unknown.external@gmail.com', { hd: undefined });
  expectError(harness.invoke('getDashboard'), 'FORBIDDEN');
  assert.deepEqual({
    users: harness.records('Users').length,
    operations: harness.records('Operations').length,
    history: harness.records('History').length
  }, before);
});

test('an inactive external Users row is denied after successful token verification', () => {
  const harness = multiDomainHarness();
  const inactive = createUser(harness, {
    suffix: 'inactive-gmail',
    email: 'inactive.borrower@gmail.com',
    status: 'INACTIVE'
  });

  harness.setTokenIdentity(inactive.email, { hd: undefined });
  expectError(harness.invoke('getDashboard'), 'USER_DISABLED');
});

test('verified USER cannot escalate through token claims, payload fields, or deployer Session', () => {
  const harness = multiDomainHarness();
  const user = createUser(harness, {
    suffix: 'no-escalation',
    email: 'ordinary.borrower@gmail.com'
  });
  const before = {
    categories: harness.records('Categories').length,
    operations: harness.records('Operations').length,
    history: harness.records('History').length
  };

  assert.equal(harness.state.activeEmail, 'admin@yru.ac.th',
    'the editor/deployer Session remains admin to prove it is not visitor identity');
  harness.setTokenIdentity(user.email, {
    hd: undefined,
    role: 'ADMIN',
    isAdmin: true
  });
  expectError(harness.invoke('adminCreateCategory', {
    command_id: 'token-claim-escalation',
    category_name: 'Escalated category',
    prefix: 'ESC',
    status: 'ACTIVE',
    actor_email: 'admin@yru.ac.th',
    role: 'ADMIN'
  }), 'FORBIDDEN');

  assert.deepEqual({
    categories: harness.records('Categories').length,
    operations: harness.records('Operations').length,
    history: harness.records('History').length
  }, before);
  assert.equal(harness.records('Categories')
    .some((record) => record.category_name === 'Escalated category'), false);
});
