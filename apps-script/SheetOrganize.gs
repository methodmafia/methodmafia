/**
 * THE METHOD MAFIA — Sheet organize (Orders / Master / Archive / monthly)
 * ======================================================================
 * Bound to the same Apps Script project as OrderProcessor.gs + CapiPurchase.gs.
 *
 * LIVE production header order (verified 2026-09-19) — do NOT invent columns:
 *   Timestamp, Order ID, Name, Email, Telegram, Plan, Amount,
 *   Source, Status, Expiry, Days Left, Payment, Notes, FBclid, TTclid
 *
 * Tabs:
 *   Orders            daily workspace (Pending + Active; reject stays same Dhaka day)
 *   Master            ALL orders forever (upsert by Order ID)
 *   Archive_Rejected  rejects moved after Dhaka midnight
 *   YYYY-MM           that Asia/Dhaka month’s rows
 *
 * One-time: run setupOrganizeSheets()
 * Trigger:  midnightOrganizeTrigger — time-driven, Midnight–1am, Asia/Dhaka
 * Tests:    testOrganizePendingMaster_, testRejectStaysSameDay_, testMidnightRejectMove_
 *           (TEST_ tabs + TEST- order IDs only — never touch real Orders rows)
 */

var ORGANIZE_TZ = 'Asia/Dhaka';
var ORGANIZE_TZ_OFFSET_MS = 6 * 60 * 60 * 1000; // Dhaka is UTC+6, no DST
var TAB_MASTER = 'Master';
var TAB_ARCHIVE_REJECTED = 'Archive_Rejected';
var ORGANIZE_TEST_PREFIX = 'TEST_';

var LIVE_HEADERS = [
  'Timestamp', 'Order ID', 'Name', 'Email', 'Telegram',
  'Plan', 'Amount', 'Source', 'Status', 'Expiry', 'Days Left',
  'Payment', 'Notes', 'FBclid', 'TTclid'
];

var HEADER_KEY_ALIASES = {
  'timestamp': 'TIMESTAMP',
  'order id': 'ORDER_ID',
  'orderid': 'ORDER_ID',
  'name': 'NAME',
  'email': 'EMAIL',
  'telegram': 'TELEGRAM',
  'plan': 'PLAN',
  'amount': 'AMOUNT',
  'source': 'SOURCE',
  'utm_source': 'SOURCE',
  'status': 'STATUS',
  'expiry': 'EXPIRY',
  'days left': 'DAYS_LEFT',
  'daysleft': 'DAYS_LEFT',
  'payment': 'PAYMENT',
  'notes': 'NOTES',
  'fbclid': 'FBCLID',
  'ttclid': 'TTCLID',
  'medium': 'MEDIUM',
  'utm_medium': 'MEDIUM',
  'campaign': 'CAMPAIGN',
  'utm_campaign': 'CAMPAIGN'
};

function normalizeHeaderName_(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildColMapFromHeaders_(headers) {
  var map = {
    TIMESTAMP: -1, ORDER_ID: -1, NAME: -1, EMAIL: -1, TELEGRAM: -1,
    PLAN: -1, AMOUNT: -1, SOURCE: -1, STATUS: -1, EXPIRY: -1,
    DAYS_LEFT: -1, PAYMENT: -1, NOTES: -1, FBCLID: -1, TTCLID: -1,
    MEDIUM: -1, CAMPAIGN: -1
  };
  headers = headers || [];
  for (var i = 0; i < headers.length; i++) {
    var key = HEADER_KEY_ALIASES[normalizeHeaderName_(headers[i])];
    if (key) map[key] = i;
  }
  return map;
}

function applyHeaderMapToCol_(headers) {
  var map = buildColMapFromHeaders_(headers);
  if (typeof COL === 'undefined') return map;
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    COL[keys[i]] = map[keys[i]];
  }
  return map;
}

function normalizeStatus_(status) {
  return String(status || '').trim().toLowerCase();
}

function isRejectStatus_(status) {
  var n = normalizeStatus_(status);
  return n === 'reject' || n === 'rejected';
}

function planImmediateStatusChange_(status) {
  if (isRejectStatus_(status)) {
    return { removeFromOrders: false, reason: 'same-day-stay' };
  }
  return { removeFromOrders: false, reason: 'keep' };
}

function pad2_(n) {
  n = String(n);
  return n.length < 2 ? '0' + n : n;
}

function dhakaParts_(date) {
  var ms = (date instanceof Date) ? date.getTime() : new Date(date).getTime();
  var shifted = new Date(ms + ORGANIZE_TZ_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours()
  };
}

function dhakaYmd_(date) {
  var p = dhakaParts_(date);
  return p.y + '-' + pad2_(p.m) + '-' + pad2_(p.d);
}

function dhakaMonthTab_(date) {
  var p = dhakaParts_(date);
  return p.y + '-' + pad2_(p.m);
}

function colLetter_(index0) {
  var n = index0 + 1;
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function daysLeftFormula_(row1, col) {
  var letter = colLetter_(col.EXPIRY);
  return '=IF(' + letter + row1 + '="","",DATEDIF(TODAY(),' + letter + row1 + ',"D"))';
}

function buildOrderRowValues_(headers, col, data, now, isDupe) {
  data = data || {};
  now = now || new Date();
  var row = [];
  for (var i = 0; i < headers.length; i++) row.push('');
  var expiry = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  if (col.TIMESTAMP >= 0) row[col.TIMESTAMP] = now.toISOString();
  if (col.ORDER_ID >= 0) row[col.ORDER_ID] = data.orderId || '';
  if (col.NAME >= 0) row[col.NAME] = data.name || '';
  if (col.EMAIL >= 0) row[col.EMAIL] = data.email || '';
  if (col.TELEGRAM >= 0) row[col.TELEGRAM] = data.telegram || '';
  if (col.PLAN >= 0) row[col.PLAN] = data.plan || '';
  if (col.AMOUNT >= 0) row[col.AMOUNT] = data.amount || '';
  if (col.SOURCE >= 0) row[col.SOURCE] = data.source || 'direct';
  if (col.STATUS >= 0) row[col.STATUS] = 'Pending';
  if (col.EXPIRY >= 0) row[col.EXPIRY] = expiry.toISOString().split('T')[0];
  if (col.DAYS_LEFT >= 0) row[col.DAYS_LEFT] = '';
  if (col.PAYMENT >= 0) row[col.PAYMENT] = data.payment || '';
  if (col.NOTES >= 0) row[col.NOTES] = isDupe ? '⚠️ DUPLICATE' : '';
  if (col.FBCLID >= 0) row[col.FBCLID] = data.fbclid || '';
  if (col.TTCLID >= 0) row[col.TTCLID] = data.ttclid || '';
  if (col.MEDIUM >= 0) row[col.MEDIUM] = data.medium || '';
  if (col.CAMPAIGN >= 0) row[col.CAMPAIGN] = data.campaign || '';
  return row;
}

function checkDuplicateInTables_(tables, col, telegram, email) {
  var tgLower = String(telegram || '').toLowerCase().replace(/^@/, '');
  var emlLower = String(email || '').toLowerCase();
  tables = tables || [];
  for (var t = 0; t < tables.length; t++) {
    var data = tables[t] || [];
    for (var i = 1; i < data.length; i++) {
      var rowTg = String(data[i][col.TELEGRAM] || '').toLowerCase().replace(/^@/, '');
      var rowEml = String(data[i][col.EMAIL] || '').toLowerCase();
      if ((tgLower && rowTg === tgLower) || (emlLower && rowEml === emlLower)) {
        return true;
      }
    }
  }
  return false;
}

function mergeNotesPreservePurchaseSent_(oldNotes, newNotes) {
  var merged = String(newNotes == null ? '' : newNotes);
  var old = String(oldNotes == null ? '' : oldNotes);
  if (old.toUpperCase().indexOf('PURCHASE_SENT') !== -1 &&
      merged.toUpperCase().indexOf('PURCHASE_SENT') === -1) {
    merged = merged ? (merged + ' | PURCHASE_SENT') : 'PURCHASE_SENT';
  }
  return merged;
}

function upsertRowsByOrderId_(rows, incomingRow, col) {
  var copy = [];
  for (var r = 0; r < rows.length; r++) copy.push(rows[r].slice());
  var id = String(incomingRow[col.ORDER_ID] || '').trim().toUpperCase();
  if (id) {
    for (var i = 1; i < copy.length; i++) {
      if (String(copy[i][col.ORDER_ID] || '').trim().toUpperCase() === id) {
        var merged = incomingRow.slice();
        if (col.NOTES >= 0) {
          merged[col.NOTES] = mergeNotesPreservePurchaseSent_(copy[i][col.NOTES], incomingRow[col.NOTES]);
        }
        copy[i] = merged;
        return { rows: copy, action: 'update', index: i };
      }
    }
  }
  copy.push(incomingRow.slice());
  return { rows: copy, action: 'append', index: copy.length - 1 };
}

function dhakaHour_(date) {
  return dhakaParts_(date).h;
}

function isOrganizeTestSheetName_(name) {
  return String(name || '').indexOf(ORGANIZE_TEST_PREFIX) === 0;
}

function reconcileOrdersIntoMaster_(orders, master, col) {
  var next = [];
  var i;
  for (i = 0; i < master.length; i++) next.push(master[i].slice());
  for (i = 1; i < orders.length; i++) {
    next = upsertRowsByOrderId_(next, orders[i], col).rows;
  }
  return next;
}

function planMidnightRejectMoves_(orders, col) {
  var moves = [];
  for (var i = 1; i < orders.length; i++) {
    if (isRejectStatus_(orders[i][col.STATUS])) {
      moves.push({
        rowIndex0: i,
        orderId: String(orders[i][col.ORDER_ID] || '')
      });
    }
  }
  return moves;
}

function applyMidnightRejectMoves_(state, col) {
  var orders = [];
  var master = [];
  var archive = [];
  var i;
  for (i = 0; i < state.orders.length; i++) orders.push(state.orders[i].slice());
  for (i = 0; i < state.master.length; i++) master.push(state.master[i].slice());
  for (i = 0; i < state.archive.length; i++) archive.push(state.archive[i].slice());

  var plans = planMidnightRejectMoves_(orders, col);
  plans.sort(function(a, b) { return b.rowIndex0 - a.rowIndex0; });
  var moved = [];
  for (i = 0; i < plans.length; i++) {
    var p = plans[i];
    var row = orders[p.rowIndex0].slice();
    archive = upsertRowsByOrderId_(archive, row, col).rows;
    master = upsertRowsByOrderId_(master, row, col).rows;
    orders.splice(p.rowIndex0, 1);
    moved.push(p.orderId);
  }
  return { orders: orders, master: master, archive: archive, moved: moved };
}

function collectMonthRows_(master, col, monthName) {
  var out = [];
  for (var i = 1; i < master.length; i++) {
    var ts = master[i][col.TIMESTAMP];
    if (!ts && ts !== 0) continue;
    if (dhakaMonthTab_(ts) === monthName) out.push(master[i].slice());
  }
  return out;
}

function headersEqual_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (normalizeHeaderName_(a[i]) !== normalizeHeaderName_(b[i])) return false;
  }
  return true;
}

function planHeaderWrite_(existingHeaders, proposedHeaders, hasDataRows) {
  var existing = [];
  existingHeaders = existingHeaders || [];
  for (var i = 0; i < existingHeaders.length; i++) {
    if (String(existingHeaders[i] || '').trim() !== '') existing.push(existingHeaders[i]);
  }
  if (existing.length === 0) {
    return { write: true, reason: 'empty' };
  }
  if (headersEqual_(existing, proposedHeaders)) {
    return { write: false, reason: 'already-canonical' };
  }
  return { write: false, reason: 'refuse-scramble' };
}

function planAppendOptionalHeaders_(headers) {
  var next = headers.slice();
  var names = {};
  for (var i = 0; i < next.length; i++) names[normalizeHeaderName_(next[i])] = true;
  if (!names.medium) next.push('Medium');
  if (!names.campaign) next.push('Campaign');
  return next;
}

function planSetupCopy_(orders, master, col) {
  var nextMaster = [];
  var nextOrders = [];
  var i;
  for (i = 0; i < master.length; i++) nextMaster.push(master[i].slice());
  for (i = 0; i < orders.length; i++) nextOrders.push(orders[i].slice());
  for (i = 1; i < orders.length; i++) {
    nextMaster = upsertRowsByOrderId_(nextMaster, orders[i], col).rows;
  }
  return { orders: nextOrders, master: nextMaster };
}

/* ── Spreadsheet helpers (Apps Script runtime) ───────────── */

function readHeaders_(sheet) {
  var last = sheet.getLastColumn();
  if (last < 1) return [];
  return sheet.getRange(1, 1, 1, last).getValues()[0];
}

function applyColMapFromSheet_(sheet) {
  var headers = readHeaders_(sheet);
  return applyHeaderMapToCol_(headers);
}

function sheetValues_(sheet) {
  return sheet.getDataRange().getValues();
}

function getOrCreateSheetWithHeaders_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name, ss.getNumSheets());
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length)
      .setBackground('#2c2c2c')
      .setFontColor('#FFD700')
      .setFontWeight('bold');
    return sh;
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }
  var existing = readHeaders_(sh);
  var decision = planHeaderWrite_(existing, headers, sh.getLastRow() > 1);
  if (decision.reason === 'refuse-scramble') {
    throw new Error(
      'Tab "' + name + '" headers do not match Orders. Rename or delete that tab, then re-run. Found: ' +
      existing.join(',')
    );
  }
  return sh;
}

function applyDaysLeftFormulaOnSheet_(sheet, row1, col) {
  if (!col || col.DAYS_LEFT < 0 || col.EXPIRY < 0) return;
  sheet.getRange(row1, col.DAYS_LEFT + 1).setFormula(daysLeftFormula_(row1, col));
}

function upsertRowByOrderIdOnSheet_(sheet, rowValues, col) {
  var headers = readHeaders_(sheet);
  var width = headers.length || rowValues.length;
  var padded = [];
  for (var i = 0; i < width; i++) padded.push(i < rowValues.length ? rowValues[i] : '');
  var orderId = String(rowValues[col.ORDER_ID] || '').toUpperCase();
  var existing = orderId && typeof findOrderRow === 'function' ? findOrderRow(sheet, orderId, col) : null;
  if (existing) {
    var oldNotes = (col.NOTES >= 0) ? sheet.getRange(existing, col.NOTES + 1).getValue() : '';
    if (col.NOTES >= 0) {
      padded[col.NOTES] = mergeNotesPreservePurchaseSent_(oldNotes, padded[col.NOTES]);
    }
    sheet.getRange(existing, 1, 1, padded.length).setValues([padded]);
    applyDaysLeftFormulaOnSheet_(sheet, existing, col);
    return existing;
  }
  sheet.appendRow(padded);
  var newRow = sheet.getLastRow();
  applyDaysLeftFormulaOnSheet_(sheet, newRow, col);
  return newRow;
}

function syncOrderRowToOrganizeTabs_(ordersSheet, row1) {
  var ss = ordersSheet.getParent();
  var headers = readHeaders_(ordersSheet);
  var col = applyColMapFromSheet_(ordersSheet);
  var width = headers.length;
  var rowValues = ordersSheet.getRange(row1, 1, 1, width).getValues()[0];
  var master = getOrCreateSheetWithHeaders_(ss, TAB_MASTER, headers);
  upsertRowByOrderIdOnSheet_(master, rowValues, col);
  var monthName = dhakaMonthTab_(rowValues[col.TIMESTAMP] || new Date());
  var monthSheet = getOrCreateSheetWithHeaders_(ss, monthName, headers);
  upsertRowByOrderIdOnSheet_(monthSheet, rowValues, col);
}

function upsertNewOrderToOrganizeTabs_(ordersSheet, row1) {
  syncOrderRowToOrganizeTabs_(ordersSheet, row1);
}

/**
 * One-time migrator. Creates Master / Archive_Rejected / current YYYY-MM.
 * Copies existing Orders rows into Master + current month. Does NOT delete Orders.
 * Does NOT move same-day rejects (midnight job does that).
 */
function setupOrganizeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var orders = ss.getSheetByName(typeof SHEET_NAME !== 'undefined' ? SHEET_NAME : 'Orders')
            || ss.getSheets()[0];
  var headers = readHeaders_(orders);
  var hasData = orders.getLastRow() > 1;
  var decision = planHeaderWrite_(headers, LIVE_HEADERS, hasData);
  if (decision.write) {
    orders.getRange(1, 1, 1, LIVE_HEADERS.length).setValues([LIVE_HEADERS]);
    orders.setFrozenRows(1);
    headers = LIVE_HEADERS.slice();
  } else if (decision.reason === 'refuse-scramble') {
    Logger.log('setupOrganizeSheets: keeping existing Orders headers (refuse scramble): ' + headers.join(','));
  }
  var col = applyColMapFromSheet_(orders);
  if (col.STATUS < 0 || col.ORDER_ID < 0) {
    throw new Error('Orders header missing Status or Order ID — aborting. No tabs modified beyond header check.');
  }
  var master = getOrCreateSheetWithHeaders_(ss, TAB_MASTER, headers);
  getOrCreateSheetWithHeaders_(ss, TAB_ARCHIVE_REJECTED, headers);
  var monthName = dhakaMonthTab_(new Date());
  var monthSheet = getOrCreateSheetWithHeaders_(ss, monthName, headers);

  var orderRows = sheetValues_(orders);
  for (var i = 1; i < orderRows.length; i++) {
    upsertRowByOrderIdOnSheet_(master, orderRows[i], col);
    var ts = orderRows[i][col.TIMESTAMP];
    if (ts && dhakaMonthTab_(ts) === monthName) {
      upsertRowByOrderIdOnSheet_(monthSheet, orderRows[i], col);
    }
  }
  Logger.log('setupOrganizeSheets done. Orders rows kept. Master + Archive_Rejected + ' + monthName + ' ready.');
}

function midnightOrganizeTrigger() {
  runMidnightOrganize_({ dryRun: false, requireDhakaMidnightWindow: true });
}

function runMidnightOrganize_(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ordersName = opts.ordersName || (typeof SHEET_NAME !== 'undefined' ? SHEET_NAME : 'Orders');
  var masterName = opts.masterName || TAB_MASTER;
  var archiveName = opts.archiveName || TAB_ARCHIVE_REJECTED;
  var orders = ss.getSheetByName(ordersName);
  if (!orders) throw new Error('Missing sheet ' + ordersName);
  var headers = readHeaders_(orders);
  var col = applyColMapFromSheet_(orders);
  var testMode = isOrganizeTestSheetName_(ordersName);
  var now = new Date();
  if (opts.requireDhakaMidnightWindow && !testMode && !opts.force && dhakaHour_(now) !== 0) {
    Logger.log('midnightOrganize skipped: not Asia/Dhaka 00:00 hour. Do not Run this on live Orders in daytime.');
    return { moved: [], skipped: 'not-midnight-window' };
  }

  if (opts.dryRun) {
    var planned = planMidnightRejectMoves_(sheetValues_(orders), col);
    Logger.log('DRY-RUN midnight would move: ' + planned.map(function(p) { return p.orderId; }).join(', '));
    return { moved: planned.map(function(p) { return p.orderId; }), dryRun: true };
  }

  var master = getOrCreateSheetWithHeaders_(ss, masterName, headers);
  var archive = getOrCreateSheetWithHeaders_(ss, archiveName, headers);

  var orderRows = sheetValues_(orders);
  for (var h = 1; h < orderRows.length; h++) {
    upsertRowByOrderIdOnSheet_(master, orderRows[h], col);
  }

  var snapshot = sheetValues_(orders);
  var moves = planMidnightRejectMoves_(snapshot, col);
  moves.sort(function(a, b) { return b.rowIndex0 - a.rowIndex0; });
  var moved = [];
  for (var i = 0; i < moves.length; i++) {
    var rowValues = orders.getRange(moves[i].rowIndex0 + 1, 1, 1, headers.length).getValues()[0];
    if (!isRejectStatus_(rowValues[col.STATUS])) continue;
    upsertRowByOrderIdOnSheet_(archive, rowValues, col);
    upsertRowByOrderIdOnSheet_(master, rowValues, col);
    orders.deleteRow(moves[i].rowIndex0 + 1);
    moved.push(String(rowValues[col.ORDER_ID] || moves[i].orderId));
  }

  var monthName = opts.monthName || dhakaMonthTab_(new Date());
  var monthTabName = (opts.monthPrefix || '') + monthName;
  var monthSheet = getOrCreateSheetWithHeaders_(ss, monthTabName, headers);
  var masterNow = sheetValues_(master);
  var monthRows = collectMonthRows_(masterNow, col, monthName);
  for (var j = 0; j < monthRows.length; j++) {
    upsertRowByOrderIdOnSheet_(monthSheet, monthRows[j], col);
  }
  Logger.log('midnightOrganize moved ' + moved.length + ' reject(s); synced ' + monthTabName);
  return { moved: moved };
}

/**
 * Optional: append Medium + Campaign as new columns on the FAR RIGHT.
 * Never inserts in the middle (would scramble live data). Not run by setup.
 */
function appendOptionalUtmHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var orders = ss.getSheetByName(typeof SHEET_NAME !== 'undefined' ? SHEET_NAME : 'Orders')
            || ss.getSheets()[0];
  var headers = readHeaders_(orders);
  var next = planAppendOptionalHeaders_(headers);
  if (headersEqual_(headers, next)) {
    Logger.log('Medium/Campaign already present');
    return;
  }
  var added = next.slice(headers.length).join(',');
  var names = [orders.getName(), TAB_MASTER, TAB_ARCHIVE_REJECTED, dhakaMonthTab_(new Date())];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (!sh) continue;
    var cur = readHeaders_(sh);
    if (headersEqual_(cur, next)) continue;
    if (!headersEqual_(cur, headers)) {
      Logger.log('skip ' + names[i] + ' (headers differ from Orders)');
      continue;
    }
    sh.getRange(1, 1, 1, next.length).setValues([next]);
  }
  Logger.log('Appended optional headers at far right: ' + added);
}

function installMidnightOrganizeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'midnightOrganizeTrigger') {
      Logger.log('midnightOrganizeTrigger already installed');
      return;
    }
  }
  ScriptApp.newTrigger('midnightOrganizeTrigger')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .inTimezone(ORGANIZE_TZ)
    .create();
  Logger.log('Installed midnightOrganizeTrigger at 00:00 Asia/Dhaka');
}

/* ── Safe self-checks (TEST_ tabs / TEST- order IDs only) ── */

function organizeTestTabNames_() {
  return {
    orders: 'TEST_Orders',
    master: 'TEST_Master',
    archive: 'TEST_Archive_Rejected',
    month: 'TEST_' + dhakaMonthTab_(new Date())
  };
}

function resetOrganizeTestSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (sh) {
    if (ss.getSheets().length === 1) {
      sh.clear();
    } else {
      ss.deleteSheet(sh);
      sh = null;
    }
  }
  return getOrCreateSheetWithHeaders_(ss, name, headers);
}

function testOrganizePendingMaster_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = LIVE_HEADERS.slice();
  var tabs = organizeTestTabNames_();
  var orders = resetOrganizeTestSheet_(ss, tabs.orders, headers);
  var master = resetOrganizeTestSheet_(ss, tabs.master, headers);
  var col = buildColMapFromHeaders_(headers);
  applyHeaderMapToCol_(headers);
  var row = buildOrderRowValues_(headers, col, {
    orderId: 'TEST-MM-PEND-1',
    name: 'Test Pending',
    email: 'test-pend@example.com',
    telegram: '@test_pend',
    plan: 'Entry',
    amount: '$30',
    payment: 'Other',
    source: 'direct',
    fbclid: 'fb_test',
    ttclid: ''
  }, new Date(), false);
  orders.appendRow(row);
  var newRow = orders.getLastRow();
  applyDaysLeftFormulaOnSheet_(orders, newRow, col);
  upsertRowByOrderIdOnSheet_(master, row, col);
  if (!findOrderRow(orders, 'TEST-MM-PEND-1')) throw new Error('FAIL Orders missing TEST-MM-PEND-1');
  if (!findOrderRow(master, 'TEST-MM-PEND-1')) throw new Error('FAIL Master missing TEST-MM-PEND-1');
  var masterStatus = master.getRange(findOrderRow(master, 'TEST-MM-PEND-1'), col.STATUS + 1).getValue();
  if (String(masterStatus) !== 'Pending') throw new Error('FAIL Master status ' + masterStatus);
  Logger.log('PASS testOrganizePendingMaster_');
}

function testRejectStaysSameDay_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = LIVE_HEADERS.slice();
  var tabs = organizeTestTabNames_();
  var orders = resetOrganizeTestSheet_(ss, tabs.orders, headers);
  var archive = resetOrganizeTestSheet_(ss, tabs.archive, headers);
  var col = buildColMapFromHeaders_(headers);
  applyHeaderMapToCol_(headers);
  var row = buildOrderRowValues_(headers, col, {
    orderId: 'TEST-MM-REJ-1',
    name: 'Test Reject',
    email: 'test-rej@example.com',
    telegram: '@test_rej',
    plan: 'Monthly',
    amount: '$15',
    payment: 'Binance Pay',
    source: 'direct'
  }, new Date(), false);
  row[col.STATUS] = 'reject';
  orders.appendRow(row);
  var decision = planImmediateStatusChange_(row[col.STATUS]);
  if (decision.removeFromOrders) throw new Error('FAIL reject should stay on Orders the same day');
  if (!findOrderRow(orders, 'TEST-MM-REJ-1')) throw new Error('FAIL reject vanished from Orders');
  if (findOrderRow(archive, 'TEST-MM-REJ-1')) throw new Error('FAIL reject moved to archive same day');
  Logger.log('PASS testRejectStaysSameDay_');
}

function testMidnightRejectMove_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = LIVE_HEADERS.slice();
  var tabs = organizeTestTabNames_();
  var orders = resetOrganizeTestSheet_(ss, tabs.orders, headers);
  var master = resetOrganizeTestSheet_(ss, tabs.master, headers);
  var archive = resetOrganizeTestSheet_(ss, tabs.archive, headers);
  resetOrganizeTestSheet_(ss, tabs.month, headers);
  var col = buildColMapFromHeaders_(headers);
  applyHeaderMapToCol_(headers);

  var active = buildOrderRowValues_(headers, col, {
    orderId: 'TEST-MM-KEEP-1',
    name: 'Keep Active',
    email: 'keep@example.com',
    telegram: '@test_keep',
    plan: 'Entry',
    amount: '$30',
    payment: 'Other',
    source: 'direct'
  }, new Date(), false);
  active[col.STATUS] = 'Active';
  active[col.NOTES] = 'PURCHASE_SENT';

  var rej = buildOrderRowValues_(headers, col, {
    orderId: 'TEST-MM-REJ-2',
    name: 'Move Reject',
    email: 'move-rej@example.com',
    telegram: '@test_move_rej',
    plan: 'Monthly',
    amount: '$15',
    payment: 'Binance Pay',
    source: 'direct'
  }, new Date(), false);
  rej[col.STATUS] = 'Reject';

  orders.appendRow(active);
  orders.appendRow(rej);
  upsertRowByOrderIdOnSheet_(master, active, col);
  upsertRowByOrderIdOnSheet_(master, rej, col);

  var result = runMidnightOrganize_({
    ordersName: tabs.orders,
    masterName: tabs.master,
    archiveName: tabs.archive,
    monthPrefix: ORGANIZE_TEST_PREFIX,
    monthName: dhakaMonthTab_(new Date())
  });
  if (result.moved.indexOf('TEST-MM-REJ-2') === -1) throw new Error('FAIL midnight did not move TEST-MM-REJ-2');
  if (findOrderRow(orders, 'TEST-MM-REJ-2')) throw new Error('FAIL reject still on TEST_Orders');
  if (!findOrderRow(archive, 'TEST-MM-REJ-2')) throw new Error('FAIL reject missing from TEST_Archive_Rejected');
  if (!findOrderRow(master, 'TEST-MM-REJ-2')) throw new Error('FAIL Master lost TEST-MM-REJ-2 (history wipe)');
  if (!findOrderRow(orders, 'TEST-MM-KEEP-1')) throw new Error('FAIL Active row was removed from Orders');
  var keepNotes = orders.getRange(findOrderRow(orders, 'TEST-MM-KEEP-1'), col.NOTES + 1).getValue();
  if (String(keepNotes).indexOf('PURCHASE_SENT') === -1) throw new Error('FAIL PURCHASE_SENT lost');
  Logger.log('PASS testMidnightRejectMove_ moved=' + result.moved.join(','));
}

function cleanupOrganizeTests_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = ss.getSheets();
  var removed = [];
  for (var i = tabs.length - 1; i >= 0; i--) {
    var name = tabs[i].getName();
    var isMonth = name.indexOf('TEST_') === 0 && /^\d{4}-\d{2}$/.test(name.slice(5));
    if (name === 'TEST_Orders' || name === 'TEST_Master' || name === 'TEST_Archive_Rejected' || isMonth) {
      if (ss.getSheets().length === 1) continue;
      ss.deleteSheet(tabs[i]);
      removed.push(name);
    }
  }
  Logger.log('Removed test tabs: ' + removed.join(', '));
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    LIVE_HEADERS: LIVE_HEADERS,
    ORGANIZE_TZ: ORGANIZE_TZ,
    TAB_MASTER: TAB_MASTER,
    TAB_ARCHIVE_REJECTED: TAB_ARCHIVE_REJECTED,
    buildColMapFromHeaders_: buildColMapFromHeaders_,
    isRejectStatus_: isRejectStatus_,
    normalizeStatus_: normalizeStatus_,
    planImmediateStatusChange_: planImmediateStatusChange_,
    dhakaYmd_: dhakaYmd_,
    dhakaMonthTab_: dhakaMonthTab_,
    daysLeftFormula_: daysLeftFormula_,
    colLetter_: colLetter_,
    buildOrderRowValues_: buildOrderRowValues_,
    checkDuplicateInTables_: checkDuplicateInTables_,
    mergeNotesPreservePurchaseSent_: mergeNotesPreservePurchaseSent_,
    upsertRowsByOrderId_: upsertRowsByOrderId_,
    planMidnightRejectMoves_: planMidnightRejectMoves_,
    applyMidnightRejectMoves_: applyMidnightRejectMoves_,
    reconcileOrdersIntoMaster_: reconcileOrdersIntoMaster_,
    dhakaHour_: dhakaHour_,
    collectMonthRows_: collectMonthRows_,
    planHeaderWrite_: planHeaderWrite_,
    planAppendOptionalHeaders_: planAppendOptionalHeaders_,
    planSetupCopy_: planSetupCopy_
  };
}
