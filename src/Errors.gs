function AppError_(code, message, details, retryable) {
  this.name = 'AppError';
  this.code = code || 'INTERNAL';
  this.message = message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  this.details = details || null;
  this.retryable = Boolean(retryable);
  this.stack = new Error(this.message).stack;
}

AppError_.prototype = Object.create(Error.prototype);
AppError_.prototype.constructor = AppError_;

function assertApp_(condition, code, message, details, retryable) {
  if (!condition) throw new AppError_(code, message, details, retryable);
}

function toPublicError_(error, requestId) {
  var known = error && error.name === 'AppError';
  var code = known ? error.code : 'INTERNAL';
  var message = known ? error.message : 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง';
  console.error(JSON.stringify({
    requestId: requestId,
    code: code,
    message: error && error.message,
    stack: error && error.stack,
    details: known ? error.details : null
  }));
  return {
    ok: false,
    error: {
      code: code,
      message: message,
      fieldErrors: known && error.details && error.details.fieldErrors ? error.details.fieldErrors : null,
      retryable: known ? error.retryable : true
    },
    meta: { requestId: requestId }
  };
}

function executeSafely_(handler) {
  var requestId = Utilities.getUuid();
  try {
    return { ok: true, data: toSerializable_(handler(requestId)), meta: { requestId: requestId } };
  } catch (error) {
    return toPublicError_(error, requestId);
  }
}
