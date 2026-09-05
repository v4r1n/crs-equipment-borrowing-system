'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  bootstrappedHarness,
  createBorrowRequest,
  createEquipment,
  createUser,
  expectError,
  expectOk
} = require('./test-helpers.cjs');

test('real services complete the guarded borrow lifecycle with durable audit evidence', () => {
  const harness = bootstrappedHarness();
  const borrower = createUser(harness, { suffix: 'borrower' });
  const otherUser = createUser(harness, { suffix: 'other' });
  const equipment = createEquipment(harness);

  harness.setActiveEmail(borrower.email);
  const requested = createBorrowRequest(harness, equipment.asset_id);
  assert.equal(requested.borrow_id, 'BR-000001');
  assert.equal(requested.status, 'PENDING_APPROVAL');
  assert.equal(requested.row_version, 1);

  let storedEquipment = harness.find('Equipment', 'asset_id', equipment.asset_id);
  assert.equal(storedEquipment.status, 'PENDING');
  assert.equal(storedEquipment.active_borrow_id, requested.borrow_id);

  const countsAfterRequest = {
    borrows: harness.records('Borrow').length,
    histories: harness.records('History').length,
    operations: harness.records('Operations').length
  };
  const retriedRequest = createBorrowRequest(harness, equipment.asset_id);
  assert.equal(retriedRequest.borrow_id, requested.borrow_id);
  assert.deepEqual({
    borrows: harness.records('Borrow').length,
    histories: harness.records('History').length,
    operations: harness.records('Operations').length
  }, countsAfterRequest);

  expectError(harness.invoke('createBorrowRequest', {
    command_id: 'borrow-request-002',
    asset_id: equipment.asset_id,
    borrow_date: '2000-01-01',
    due_date: '2000-01-03',
    purpose: 'Competing request',
    note: ''
  }), 'RESERVATION_CONFLICT');
  assert.equal(harness.records('Borrow').length, 1);

  expectError(harness.invoke('adminApproveBorrow', {
    command_id: 'approve-borrow-001',
    borrow_id: requested.borrow_id,
    expected_version: requested.row_version
  }), 'FORBIDDEN');
  assert.equal(harness.find('Borrow', 'borrow_id', requested.borrow_id).status, 'PENDING_APPROVAL');

  harness.setActiveEmail('admin@example.com');
  const approved = expectOk(harness.invoke('adminApproveBorrow', {
    command_id: 'approve-borrow-001',
    borrow_id: requested.borrow_id,
    expected_version: requested.row_version
  }));
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.row_version, 2);
  assert.equal(harness.find('Equipment', 'asset_id', equipment.asset_id).status, 'RESERVED');

  const approvalHistoryCount = harness.records('History')
    .filter((entry) => entry.operation_id === 'approve-borrow-001').length;
  const retriedApproval = expectOk(harness.invoke('adminApproveBorrow', {
    command_id: 'approve-borrow-001',
    borrow_id: requested.borrow_id,
    expected_version: requested.row_version
  }));
  assert.equal(retriedApproval.status, 'APPROVED');
  assert.equal(harness.records('History')
    .filter((entry) => entry.operation_id === 'approve-borrow-001').length,
  approvalHistoryCount);

  expectError(harness.invoke('adminApproveBorrow', {
    command_id: 'approve-borrow-duplicate',
    borrow_id: requested.borrow_id,
    expected_version: approved.row_version
  }), 'STATE_CONFLICT');

  const checkedOut = expectOk(harness.invoke('adminCheckoutBorrow', {
    command_id: 'checkout-borrow-001',
    borrow_id: requested.borrow_id,
    expected_version: approved.row_version
  }));
  assert.equal(checkedOut.status, 'CHECKED_OUT');
  assert.equal(checkedOut.row_version, 3);
  assert.equal(harness.find('Equipment', 'asset_id', equipment.asset_id).status, 'BORROWED');

  const snapshots = harness.records('BorrowItems')
    .filter((item) => item.borrow_id === requested.borrow_id);
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots.map((item) => item.borrow_item_id), ['BIT-000001', 'BIT-000002']);
  assert.deepEqual(snapshots.map((item) => item.is_required), [true, false]);

  assert.equal(harness.invoke('isBorrowOverdue_', checkedOut, '2000-01-02'), false,
    'due today is not overdue');
  assert.equal(harness.invoke('isBorrowOverdue_', checkedOut, '2000-01-03'), true,
    'the day after due date is overdue while checked out');
  assert.equal(harness.invoke('isBorrowOverdue_', { ...checkedOut, status: 'APPROVED' }, '2000-01-03'), false,
    'non-issued requests never receive the overdue projection');

  harness.setActiveEmail(otherUser.email);
  expectError(harness.invoke('getBorrowDetail', requested.borrow_id), 'FORBIDDEN');
  expectError(harness.invoke('requestReturn', {
    command_id: 'other-return-request',
    borrow_id: requested.borrow_id,
    expected_version: checkedOut.row_version,
    note: ''
  }), 'FORBIDDEN');

  harness.setActiveEmail(borrower.email);
  const myBorrowing = expectOk(harness.invoke('listMyBorrowing', { status: 'OVERDUE' }));
  assert.equal(myBorrowing.total, 1);
  assert.equal(myBorrowing.items[0].effective_status, 'OVERDUE');

  const returning = expectOk(harness.invoke('requestReturn', {
    command_id: 'request-return-001',
    borrow_id: requested.borrow_id,
    expected_version: checkedOut.row_version,
    note: 'พร้อมส่งคืน'
  }));
  assert.equal(returning.status, 'RETURN_REQUESTED');
  assert.equal(returning.row_version, 4);
  assert.equal(harness.find('Equipment', 'asset_id', equipment.asset_id).status, 'RETURNING');

  const checklist = snapshots.map((item) => ({
    borrow_item_id: item.borrow_item_id,
    returned_quantity: item.is_required ? 1 : 0,
    note: item.is_required ? '' : 'กระเป๋าไม่ได้นำมาคืน'
  }));
  harness.setActiveEmail('admin@example.com');
  const returnPayload = {
    command_id: 'complete-return-001',
    borrow_id: requested.borrow_id,
    expected_version: returning.row_version,
    condition: 'NORMAL',
    disposition: 'AVAILABLE',
    note: '',
    items: checklist
  };
  const returned = expectOk(harness.invoke('adminCompleteReturn', returnPayload));
  assert.equal(returned.status, 'RETURNED');
  assert.equal(returned.return_condition, 'NORMAL');
  assert.equal(returned.return_disposition, 'AVAILABLE');
  assert.equal(returned.row_version, 5);

  storedEquipment = harness.find('Equipment', 'asset_id', equipment.asset_id);
  assert.equal(storedEquipment.status, 'AVAILABLE');
  assert.equal(storedEquipment.active_borrow_id, '');
  const inspected = harness.records('BorrowItems');
  assert.deepEqual(inspected.map((item) => item.returned_quantity), [1, 0]);
  assert.deepEqual(inspected.map((item) => item.is_complete), [true, false]);
  assert.ok(inspected.every((item) => item.checked_by === 'admin@example.com' && item.checked_at));

  const terminalCounts = {
    histories: harness.records('History').length,
    operations: harness.records('Operations').length
  };
  const retriedReturn = expectOk(harness.invoke('adminCompleteReturn', returnPayload));
  assert.equal(retriedReturn.status, 'RETURNED');
  assert.deepEqual({
    histories: harness.records('History').length,
    operations: harness.records('Operations').length
  }, terminalCounts);

  expectError(harness.invoke('adminCompleteReturn', {
    ...returnPayload,
    command_id: 'complete-return-duplicate',
    expected_version: returned.row_version
  }), 'STATE_CONFLICT');

  const borrowActions = harness.records('History')
    .filter((entry) => entry.borrow_id === requested.borrow_id)
    .map((entry) => entry.action);
  assert.deepEqual(borrowActions,
    ['BORROW_REQUEST', 'APPROVE', 'CHECKOUT', 'REQUEST_RETURN', 'RETURN']);
  assert.equal(new Set(harness.records('History').map((entry) => entry.operation_id)).size,
    harness.records('History').length);
  assert.ok(harness.records('Operations').every((operation) => operation.status === 'COMPLETED'));

  const audit = expectOk(harness.invoke('adminRunIntegrityAudit'));
  assert.equal(audit.passed, true);
  assert.deepEqual(harness.plain(audit.summary), {
    total_issues: 0,
    errors: 0,
    warnings: 0,
    returned_issues: 0,
    truncated: false
  });
});

test('a stalled operation reserves an asset before a Borrow row exists', () => {
  const harness = bootstrappedHarness();
  const borrower = createUser(harness, { suffix: 'reservation' });
  const equipment = createEquipment(harness, { suffix: 'reservation' });
  harness.setActiveEmail(borrower.email);

  const actor = harness.invokeRaw('requireUser_', harness.state.sessionToken);
  const payload = {
    assetId: equipment.asset_id,
    borrowDate: '2000-01-01',
    dueDate: '2000-01-02',
    purpose: 'Stalled request',
    note: '',
    borrowerUserId: borrower.user_id
  };
  const spec = harness.invoke('operationSpec_', 'stalled-request-001', 'BORROW_REQUEST',
    'BORROW', '', payload, actor, equipment.asset_id);
  harness.invoke('startOperationLocked_', spec, {
    equipment: harness.find('Equipment', 'asset_id', equipment.asset_id),
    borrower: {
      userId: borrower.user_id,
      email: borrower.email,
      name: borrower.name,
      department: borrower.department
    }
  });

  expectError(harness.invoke('createBorrowRequest', {
    command_id: 'competing-request-001',
    asset_id: equipment.asset_id,
    borrow_date: '2000-01-01',
    due_date: '2000-01-02',
    purpose: 'Competing request',
    note: ''
  }), 'OPERATION_PENDING');
  assert.equal(harness.records('Borrow').length, 0);
  assert.equal(harness.find('Equipment', 'asset_id', equipment.asset_id).status, 'AVAILABLE');
  assert.equal(harness.records('Operations')
    .filter((operation) => operation.status === 'STARTED').length, 1);
});

test('required checklist shortages cannot be returned to AVAILABLE', () => {
  const harness = bootstrappedHarness();
  const borrower = createUser(harness, { suffix: 'shortage' });
  const equipment = createEquipment(harness, { suffix: 'shortage' });
  harness.setActiveEmail(borrower.email);
  const requested = createBorrowRequest(harness, equipment.asset_id, {
    command_id: 'shortage-request-001'
  });
  harness.setActiveEmail('admin@example.com');
  const approved = expectOk(harness.invoke('adminApproveBorrow', {
    command_id: 'shortage-approve-001',
    borrow_id: requested.borrow_id,
    expected_version: requested.row_version
  }));
  const checkedOut = expectOk(harness.invoke('adminCheckoutBorrow', {
    command_id: 'shortage-checkout-001',
    borrow_id: requested.borrow_id,
    expected_version: approved.row_version
  }));
  const snapshots = harness.records('BorrowItems');

  expectError(harness.invoke('adminCompleteReturn', {
    command_id: 'shortage-return-invalid',
    borrow_id: requested.borrow_id,
    expected_version: checkedOut.row_version,
    condition: 'NORMAL',
    disposition: 'AVAILABLE',
    note: '',
    items: snapshots.map((item) => ({
      borrow_item_id: item.borrow_item_id,
      returned_quantity: 0
    }))
  }), 'VALIDATION_FAILED');
  assert.equal(harness.find('Borrow', 'borrow_id', requested.borrow_id).status, 'CHECKED_OUT');
  assert.equal(harness.find('Equipment', 'asset_id', equipment.asset_id).status, 'BORROWED');
  assert.equal(harness.records('Operations')
    .some((operation) => operation.operation_id === 'shortage-return-invalid'), false,
  'validation fails before reserving a durable operation');
});
