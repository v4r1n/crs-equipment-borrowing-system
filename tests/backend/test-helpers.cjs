'use strict';

const assert = require('node:assert/strict');
const { createAppsScriptHarness } = require('./apps-script-harness.cjs');

function expectOk(response) {
  assert.equal(response && response.ok, true,
    response && response.error ? `${response.error.code}: ${response.error.message}` : 'Expected success envelope');
  return response.data;
}

function expectError(response, code) {
  assert.equal(response && response.ok, false, 'Expected error envelope');
  assert.equal(response.error.code, code);
  return response.error;
}

function expectAppError(callback, code) {
  assert.throws(callback, (error) => {
    assert.equal(error && error.code, code);
    return true;
  });
}

function bootstrappedHarness(options = {}) {
  const harness = createAppsScriptHarness(options);
  harness.setup();
  return harness;
}

function createUser(harness, overrides = {}) {
  const suffix = overrides.suffix || 'user';
  const payload = {
    command_id: `create-user-${suffix}`,
    email: `${suffix}@example.com`,
    name: `User ${suffix}`,
    department: 'Operations',
    role: 'USER',
    status: 'ACTIVE',
    ...overrides
  };
  delete payload.suffix;
  return expectOk(harness.invoke('adminCreateUser', payload));
}

function createEquipment(harness, overrides = {}) {
  const suffix = overrides.suffix || '001';
  const payload = {
    command_id: `create-asset-${suffix}`,
    sku: `IT-CAM-${suffix}`,
    name: `Camera ${suffix}`,
    category_id: 'CAT-004',
    brand: 'Sony',
    model: 'A6400',
    serial_number: `SERIAL-${suffix}`,
    specification: '24 MP',
    description: 'Shared camera',
    department: 'Operations',
    location: 'Equipment room',
    note: '',
    included_items: [
      { item_name: 'Battery', quantity: 1, is_required: true, sort_order: 1 },
      { item_name: 'Bag', quantity: 1, is_required: false, sort_order: 2 }
    ],
    ...overrides
  };
  delete payload.suffix;
  return expectOk(harness.invoke('adminCreateEquipment', payload));
}

function createBorrowRequest(harness, assetId, overrides = {}) {
  return expectOk(harness.invoke('createBorrowRequest', {
    command_id: 'borrow-request-001',
    asset_id: assetId,
    borrow_date: '2000-01-01',
    due_date: '2000-01-02',
    purpose: 'Field documentation',
    note: '',
    ...overrides
  }));
}

module.exports = {
  bootstrappedHarness,
  createBorrowRequest,
  createEquipment,
  createUser,
  expectAppError,
  expectError,
  expectOk
};
