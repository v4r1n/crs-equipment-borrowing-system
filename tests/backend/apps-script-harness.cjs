'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_DIRECTORY = path.join(PROJECT_ROOT, 'src');

const SOURCE_FILES = [
  'Constants.gs',
  'Schema.gs',
  'Errors.gs',
  'Config.gs',
  'Utils.gs',
  'Validation.gs',
  'ServiceUtils.gs',
  'DataStore.gs',
  'Migrations.gs',
  'HistoryService.gs',
  'OperationService.gs',
  'Auth.gs',
  'CategoryService.gs',
  'EquipmentService.gs',
  'BorrowService.gs',
  'DashboardService.gs',
  'UserService.gs',
  'IntegrityService.gs',
  'Setup.gs',
  'Api.gs'
];

function cloneCell(value) {
  return value instanceof Date ? new Date(value.getTime()) : value;
}

class MemoryRange {
  constructor(sheet, row, column, rowCount, columnCount) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
    if (![row, column, rowCount, columnCount].every(Number.isSafeInteger) ||
      row < 1 || column < 1 || rowCount < 1 || columnCount < 1) {
      throw new RangeError('Invalid in-memory Sheet range');
    }
  }

  getValues() {
    const result = [];
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      const row = [];
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        row.push(cloneCell(this.sheet.getCell_(
          this.row + rowOffset,
          this.column + columnOffset
        )));
      }
      result.push(row);
    }
    return result;
  }

  getFormulas() {
    return this.getValues().map((row) => row.map((value) =>
      typeof value === 'string' && value.startsWith('=') ? value : ''
    ));
  }

  setValues(values) {
    if (!Array.isArray(values) || values.length !== this.rowCount ||
      values.some((row) => !Array.isArray(row) || row.length !== this.columnCount)) {
      throw new RangeError('setValues dimensions do not match range');
    }
    values.forEach((row, rowOffset) => {
      row.forEach((value, columnOffset) => {
        this.sheet.setCell_(
          this.row + rowOffset,
          this.column + columnOffset,
          cloneCell(value)
        );
      });
    });
    return this;
  }

  setBackground() { return this; }
  setFontColor() { return this; }
  setFontWeight() { return this; }
  setWrap() { return this; }
  setNumberFormat() { return this; }
}

class MemoryProtection {
  constructor() {
    this.description = '';
    this.warningOnly = false;
  }

  getDescription() { return this.description; }
  setDescription(value) { this.description = String(value); return this; }
  setWarningOnly(value) { this.warningOnly = Boolean(value); return this; }
}

class MemorySheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.maxRows = 1000;
    this.maxColumns = 26;
    this.protections = [];
  }

  getName() { return this.name; }

  getCell_(row, column) {
    const storedRow = this.data[row - 1];
    return storedRow && storedRow[column - 1] !== undefined
      ? storedRow[column - 1]
      : '';
  }

  setCell_(row, column, value) {
    while (this.data.length < row) this.data.push([]);
    while (this.data[row - 1].length < column) this.data[row - 1].push('');
    this.data[row - 1][column - 1] = value === undefined || value === null ? '' : value;
    this.maxRows = Math.max(this.maxRows, row);
    this.maxColumns = Math.max(this.maxColumns, column);
  }

  getLastRow() {
    for (let row = this.data.length; row > 0; row -= 1) {
      if (this.data[row - 1].some((value) => value !== '' && value !== null)) return row;
    }
    return 0;
  }

  getLastColumn() {
    let maximum = 0;
    this.data.forEach((row) => {
      for (let column = row.length; column > 0; column -= 1) {
        if (row[column - 1] !== '' && row[column - 1] !== null) {
          maximum = Math.max(maximum, column);
          break;
        }
      }
    });
    return maximum;
  }

  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxColumns; }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new MemoryRange(this, row, column, rowCount, columnCount);
  }

  insertRowsAfter(afterPosition, howMany) {
    if (!Number.isSafeInteger(afterPosition) || !Number.isSafeInteger(howMany) || howMany < 1) {
      throw new RangeError('Invalid insertRowsAfter arguments');
    }
    this.maxRows = Math.max(this.maxRows, afterPosition) + howMany;
    return this;
  }

  insertColumnsAfter(afterPosition, howMany) {
    if (!Number.isSafeInteger(afterPosition) || !Number.isSafeInteger(howMany) || howMany < 1) {
      throw new RangeError('Invalid insertColumnsAfter arguments');
    }
    this.maxColumns = Math.max(this.maxColumns, afterPosition) + howMany;
    return this;
  }

  setFrozenRows() { return this; }
  setRowHeight() { return this; }
  setColumnWidth() { return this; }
  getProtections() { return this.protections.slice(); }

  protect() {
    const protection = new MemoryProtection();
    this.protections.push(protection);
    return protection;
  }
}

class MemorySpreadsheet {
  constructor(id = 'test-spreadsheet') {
    this.id = id;
    this.sheets = new Map();
    this.timezone = '';
    this.locale = '';
  }

  getId() { return this.id; }
  getSheetByName(name) { return this.sheets.get(String(name)) || null; }

  insertSheet(name) {
    const normalized = String(name);
    if (this.sheets.has(normalized)) throw new Error(`Duplicate sheet: ${normalized}`);
    const sheet = new MemorySheet(normalized);
    this.sheets.set(normalized, sheet);
    return sheet;
  }

  setSpreadsheetTimeZone(value) { this.timezone = String(value); return this; }
  setSpreadsheetLocale(value) { this.locale = String(value); return this; }
}

class MemoryProperties {
  constructor(initial = {}) {
    this.values = Object.create(null);
    Object.entries(initial).forEach(([key, value]) => {
      this.values[key] = String(value);
    });
  }

  getProperty(key) {
    return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null;
  }

  getProperties() { return { ...this.values }; }

  setProperty(key, value) {
    this.values[String(key)] = String(value);
    return this;
  }

  setProperties(values, deleteAllOthers = false) {
    if (deleteAllOthers) this.values = Object.create(null);
    Object.entries(values || {}).forEach(([key, value]) => this.setProperty(key, value));
    return this;
  }

  deleteProperty(key) { delete this.values[String(key)]; return this; }
}

class MemoryCache {
  constructor() { this.values = new Map(); }
  get(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  put(key, value) { this.values.set(String(key), String(value)); }
  remove(key) { this.values.delete(String(key)); }
  removeAll(keys) { (keys || []).forEach((key) => this.remove(key)); }
}

class MemoryScriptLock {
  constructor() {
    this.held = false;
    this.failNext = false;
    this.acquireCount = 0;
    this.releaseCount = 0;
  }

  tryLock() {
    if (this.failNext) {
      this.failNext = false;
      return false;
    }
    if (this.held) return false;
    this.held = true;
    this.acquireCount += 1;
    return true;
  }

  releaseLock() {
    if (!this.held) throw new Error('Script lock released without ownership');
    this.held = false;
    this.releaseCount += 1;
  }
}

function dateOnlyInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function makeUtilities(state) {
  return {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid() {
      state.uuidCounter += 1;
      return `00000000-0000-4000-8000-${String(state.uuidCounter).padStart(12, '0')}`;
    },
    computeDigest(algorithm, value) {
      if (algorithm !== 'SHA_256') throw new Error(`Unsupported digest: ${algorithm}`);
      const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
      return Array.from(crypto.createHash('sha256').update(bytes).digest());
    },
    base64EncodeWebSafe(value) {
      return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    },
    base64Decode(value) {
      return Array.from(Buffer.from(String(value), 'base64'));
    },
    formatDate(date, timezone, pattern) {
      if (pattern !== 'yyyy-MM-dd') throw new Error(`Unsupported date pattern: ${pattern}`);
      return dateOnlyInTimezone(date, timezone);
    },
    newBlob(bytes, mimeType, name) {
      return {
        getBytes: () => Array.from(bytes),
        getContentType: () => mimeType,
        getName: () => name
      };
    }
  };
}

function loadSources(context) {
  SOURCE_FILES.forEach((fileName) => {
    const absolutePath = path.join(SOURCE_DIRECTORY, fileName);
    const source = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(source, context, { filename: absolutePath });
  });
}

function createAppsScriptHarness(options = {}) {
  const state = {
    activeEmail: options.activeEmail || 'admin@example.com',
    webAppUrl: options.webAppUrl || 'https://script.google.com/macros/s/test-deployment/exec',
    uuidCounter: 0,
    flushCount: 0
  };
  const spreadsheet = new MemorySpreadsheet(options.spreadsheetId);
  const properties = new MemoryProperties({
    ALLOWED_DOMAIN: 'example.com',
    ADMIN_EMAILS: 'admin@example.com',
    AUTO_PROVISION_USERS: 'false',
    WEB_APP_URL: state.webAppUrl,
    ...(options.properties || {})
  });
  const cache = new MemoryCache();
  const scriptLock = new MemoryScriptLock();
  const quietConsole = options.console || {
    log() {},
    info() {},
    warn() {},
    error() {}
  };

  const sandbox = {
    Buffer,
    console: quietConsole,
    Session: {
      getActiveUser() {
        return { getEmail: () => state.activeEmail };
      }
    },
    SpreadsheetApp: {
      ProtectionType: { SHEET: 'SHEET' },
      getActiveSpreadsheet: () => spreadsheet,
      openById(id) {
        if (String(id) !== spreadsheet.getId()) throw new Error('Spreadsheet not found');
        return spreadsheet;
      },
      flush() { state.flushCount += 1; }
    },
    LockService: { getScriptLock: () => scriptLock },
    PropertiesService: { getScriptProperties: () => properties },
    CacheService: { getScriptCache: () => cache },
    ScriptApp: { getService: () => ({ getUrl: () => state.webAppUrl }) },
    Utilities: makeUtilities(state),
    DriveApp: {
      Access: { DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFolderById() { throw new Error('Drive is not available in backend unit tests'); },
      getFileById() { throw new Error('Drive is not available in backend unit tests'); }
    }
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox, { name: 'apps-script-backend-test' });
  loadSources(context);

  function setActiveEmail(email) { state.activeEmail = String(email || ''); }

  function invoke(name, ...args) {
    if (typeof context[name] !== 'function') throw new TypeError(`Unknown GAS function: ${name}`);
    return context[name](...args);
  }

  function setup() {
    const result = invoke('setupSystem');
    if (!result || !result.ok) {
      const error = new Error(result && result.error ? result.error.message : 'setupSystem failed');
      error.result = result;
      throw error;
    }
    return result.data;
  }

  function records(sheetName) {
    return Array.from(invoke('listRecords_', sheetName), (record) => ({ ...record }));
  }

  function find(sheetName, idField, id) {
    const record = invoke('findRecordById_', sheetName, idField, id);
    return record ? { ...record } : null;
  }

  function replaceCell(sheetName, idField, id, fieldName, value) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error(`Unknown sheet: ${sheetName}`);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idIndex = headers.indexOf(idField);
    const fieldIndex = headers.indexOf(fieldName);
    if (idIndex < 0 || fieldIndex < 0) throw new Error(`Unknown field: ${fieldName}`);
    for (let row = 2; row <= sheet.getLastRow(); row += 1) {
      if (String(sheet.getRange(row, idIndex + 1).getValues()[0][0]) === String(id)) {
        sheet.getRange(row, fieldIndex + 1).setValues([[value]]);
        return;
      }
    }
    throw new Error(`Record not found: ${id}`);
  }

  function plain(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  return {
    context,
    state,
    spreadsheet,
    properties,
    cache,
    scriptLock,
    setActiveEmail,
    invoke,
    setup,
    records,
    find,
    replaceCell,
    plain
  };
}

module.exports = {
  PROJECT_ROOT,
  SOURCE_FILES,
  createAppsScriptHarness
};
