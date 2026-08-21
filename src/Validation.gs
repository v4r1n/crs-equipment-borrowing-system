function requireText_(value, fieldName, label, maximumLength) {
  var text = normalizeWhitespace_(value);
  assertApp_(text !== '', 'VALIDATION_FAILED', 'กรุณากรอกข้อมูลให้ครบถ้วน', {
    fieldErrors: fieldError_(fieldName, 'กรุณาระบุ' + label)
  });
  assertApp_(!maximumLength || text.length <= maximumLength, 'VALIDATION_FAILED', 'ข้อมูลยาวเกินกำหนด', {
    fieldErrors: fieldError_(fieldName, label + 'ต้องไม่เกิน ' + maximumLength + ' ตัวอักษร')
  });
  return sanitizeSheetText_(text);
}

function optionalText_(value, fieldName, label, maximumLength, multiline) {
  var text = multiline ? String(value || '').trim() : normalizeWhitespace_(value);
  assertApp_(!maximumLength || text.length <= maximumLength, 'VALIDATION_FAILED', 'ข้อมูลยาวเกินกำหนด', {
    fieldErrors: fieldError_(fieldName, label + 'ต้องไม่เกิน ' + maximumLength + ' ตัวอักษร')
  });
  return multiline ? sanitizeMultilineSheetText_(text) : sanitizeSheetText_(text);
}

function requireEnum_(value, allowedValues, fieldName, label) {
  var normalized = normalizeWhitespace_(value).toUpperCase();
  assertApp_(allowedValues.indexOf(normalized) !== -1, 'VALIDATION_FAILED', 'ค่า' + label + 'ไม่ถูกต้อง', {
    fieldErrors: fieldError_(fieldName, 'กรุณาเลือก' + label + 'ที่ถูกต้อง')
  });
  return normalized;
}

function requireEmail_(value, fieldName) {
  var email = normalizeEmail_(value);
  assertApp_(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'VALIDATION_FAILED', 'อีเมลไม่ถูกต้อง', {
    fieldErrors: fieldError_(fieldName || 'email', 'กรุณาระบุอีเมลที่ถูกต้อง')
  });
  return email;
}

function requirePositiveInteger_(value, fieldName, label, minimum, maximum) {
  var number = Number(value);
  assertApp_(Number.isInteger(number) && number >= minimum && number <= maximum,
    'VALIDATION_FAILED', 'ค่า' + label + 'ไม่ถูกต้อง', {
      fieldErrors: fieldError_(fieldName, label + 'ต้องเป็นจำนวนเต็มระหว่าง ' + minimum + '–' + maximum)
    });
  return number;
}

function optionalMoney_(value, fieldName) {
  if (value === '' || value === null || value === undefined) return '';
  var number = Number(value);
  assertApp_(Number.isFinite(number) && number >= 0, 'VALIDATION_FAILED', 'ราคาซื้อไม่ถูกต้อง', {
    fieldErrors: fieldError_(fieldName || 'purchase_price', 'ราคาซื้อต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
  });
  return Math.round(number * 100) / 100;
}

function requireAssetId_(value) {
  var assetId = normalizeWhitespace_(value).toUpperCase();
  assertApp_(/^AST-\d{6}$/.test(assetId), 'VALIDATION_FAILED', 'Asset ID ไม่ถูกต้อง', {
    fieldErrors: fieldError_('asset_id', 'Asset ID ต้องอยู่ในรูปแบบ AST-000001')
  });
  return assetId;
}

function validateBorrowDates_(borrowDate, dueDate) {
  var start = parseDateOnly_(borrowDate, 'borrow_date');
  var end = parseDateOnly_(dueDate, 'due_date');
  assertApp_(compareDateOnly_(end, start) >= 0, 'VALIDATION_FAILED', 'วันที่กำหนดคืนต้องไม่น้อยกว่าวันที่ยืม', {
    fieldErrors: fieldError_('due_date', 'วันที่กำหนดคืนต้องไม่น้อยกว่าวันที่ยืม')
  });
  return { borrowDate: start, dueDate: end };
}

