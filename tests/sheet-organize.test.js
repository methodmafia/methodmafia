'use strict';

/**
 * Unit tests for Apps Script sheet-organize helpers.
 * Pure logic lives in apps-script/SheetOrganize.gs (Node-loadable).
 *
 * Live production header (verified 2026-09-19):
 * Timestamp, Order ID, Name, Email, Telegram, Plan, Amount,
 * Source, Status, Expiry, Days Left, Payment, Notes, FBclid, TTclid
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const organize = require(path.join(__dirname, '..', 'apps-script', 'SheetOrganize.gs'));

const LIVE_HEADER_SNIPPET = [
  'Timestamp', 'Order ID', 'Name', 'Email', 'Telegram', 'Plan', 'Amount',
  'Source', 'Status', 'Expiry', 'Days Left', 'Payment', 'Notes', 'FBclid', 'TTclid'
];

const FELIX_ROW = [
  '2026-09-16T14:59:10.481Z', 'MM-2026-3007', 'Felix', 'wildriftnewacc001@gmail.com',
  '@digitalbaymm', 'Entry', '$30', 'direct', 'Active', '2026-10-16', 27, 'Other',
  'PURCHASE_SENT', '', ''
];

const GARRY_REJECT_ROW = [
  '2026-09-18T02:52:27.921Z', 'MM-2026-5114', 'Garry', 'webscansolution@gmail.com',
  '@Webscan', 'Monthly', '$15', 'direct', 'reject', '2026-10-18', 29, 'Binance Pay',
  '', '', ''
];

test('LIVE_HEADERS match the production sheet (Source before Status, Payment after Days Left)', () => {
  const csv = 'Timestamp,Order ID,Name,Email,Telegram,Plan,Amount,Source,Status,Expiry,Days Left,Payment,Notes,FBclid,TTclid';
  assert.equal(organize.LIVE_HEADER_CSV, csv);
  assert.deepEqual(organize.LIVE_HEADERS, csv.split(','));
  assert.deepEqual(organize.LIVE_HEADERS, LIVE_HEADER_SNIPPET);
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  assert.equal(col.TIMESTAMP, 0);
  assert.equal(col.ORDER_ID, 1);
  assert.equal(col.SOURCE, 7);
  assert.equal(col.STATUS, 8);
  assert.equal(col.EXPIRY, 9);
  assert.equal(col.DAYS_LEFT, 10);
  assert.equal(col.PAYMENT, 11);
  assert.equal(col.NOTES, 12);
  assert.equal(col.FBCLID, 13);
  assert.equal(col.TTCLID, 14);
  assert.equal(col.MEDIUM, -1);
  assert.equal(col.CAMPAIGN, -1);
});

test('repo OrderProcessor COL default matches live sheet, not the old Payment-before-Source map', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'OrderProcessor.gs'), 'utf8');
  assert.match(gs, /SOURCE\s*:\s*7/);
  assert.match(gs, /STATUS\s*:\s*8/);
  assert.match(gs, /PAYMENT\s*:\s*11/);
  assert.match(gs, /NOTES\s*:\s*12/);
  assert.match(gs, /FBCLID\s*:\s*13/);
  assert.match(gs, /TTCLID\s*:\s*14/);
  assert.doesNotMatch(gs, /PAYMENT\s*:\s*7\s*,/);
  assert.doesNotMatch(gs, /STATUS\s*:\s*11/);
});

test('CAPI would read Status=Active and Notes=PURCHASE_SENT from the live Felix row', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  assert.equal(FELIX_ROW[col.STATUS], 'Active');
  assert.equal(FELIX_ROW[col.PLAN], 'Entry');
  assert.equal(FELIX_ROW[col.NOTES], 'PURCHASE_SENT');
  assert.equal(FELIX_ROW[col.PAYMENT], 'Other');
  assert.equal(FELIX_ROW[col.SOURCE], 'direct');
  assert.equal(GARRY_REJECT_ROW[col.STATUS], 'reject');
  assert.equal(GARRY_REJECT_ROW[col.PAYMENT], 'Binance Pay');
});

test('normalize / isRejectStatus_ accepts reject, Reject, rejected (any case)', () => {
  assert.equal(organize.isRejectStatus_('reject'), true);
  assert.equal(organize.isRejectStatus_('Reject'), true);
  assert.equal(organize.isRejectStatus_('REJECTED'), true);
  assert.equal(organize.isRejectStatus_(' rejected '), true);
  assert.equal(organize.isRejectStatus_('Active'), false);
  assert.equal(organize.isRejectStatus_('Pending'), false);
  assert.equal(organize.isRejectStatus_('Expired'), false);
});

test('immediate status change to reject does NOT plan a move (same-day stay)', () => {
  const decision = organize.planImmediateStatusChange_('reject');
  assert.equal(decision.removeFromOrders, false);
  assert.equal(decision.reason, 'same-day-stay');
  assert.equal(organize.planImmediateStatusChange_('Active').removeFromOrders, false);
});

test('midnight job plans a move for every reject still on Orders', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  const orders = [LIVE_HEADER_SNIPPET, FELIX_ROW, GARRY_REJECT_ROW];
  const moves = organize.planMidnightRejectMoves_(orders, col);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].orderId, 'MM-2026-5114');
  assert.equal(moves[0].rowIndex0, 2);
});

test('doPost-shaped row writes Payment into L and Status Pending into I (live order)', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  const now = new Date('2026-09-19T08:00:00.000Z');
  const row = organize.buildOrderRowValues_(LIVE_HEADER_SNIPPET, col, {
    orderId: 'TEST-MM-PEND-1',
    name: 'Test User',
    email: 'test-pend@example.com',
    telegram: '@test_pend',
    plan: 'Entry',
    amount: '$30',
    payment: 'bKash',
    source: 'facebook',
    medium: 'paid',
    campaign: 'entry_sep',
    fbclid: 'FbClick99',
    ttclid: 'TtClick88'
  }, now, false);

  assert.equal(row.length, LIVE_HEADER_SNIPPET.length);
  assert.equal(row[col.ORDER_ID], 'TEST-MM-PEND-1');
  assert.equal(row[col.SOURCE], 'facebook');
  assert.equal(row[col.STATUS], 'Pending');
  assert.equal(row[col.PAYMENT], 'bKash');
  assert.equal(row[col.NOTES], '');
  assert.equal(row[col.FBCLID], 'FbClick99');
  assert.equal(row[col.TTCLID], 'TtClick88');
  assert.equal(row[7], 'facebook');
  assert.equal(row[8], 'Pending');
  assert.equal(row[11], 'bKash');
  assert.equal(row.indexOf('paid'), -1);
  assert.equal(row.indexOf('entry_sep'), -1);
});

test('DUPLICATE flag lands in Notes when checkDuplicate is true', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  const row = organize.buildOrderRowValues_(LIVE_HEADER_SNIPPET, col, {
    orderId: 'TEST-MM-DUP-1',
    telegram: '@digitalbaymm',
    email: 'other@example.com'
  }, new Date(), true);
  assert.equal(row[col.NOTES], '⚠️ DUPLICATE');
});

test('checkDuplicate scans Master + Orders by telegram/email (archive-safe)', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  const master = [LIVE_HEADER_SNIPPET, FELIX_ROW];
  const orders = [LIVE_HEADER_SNIPPET];
  assert.equal(organize.checkDuplicateInTables_([master, orders], col, '@digitalbaymm', 'x@y.com'), true);
  assert.equal(organize.checkDuplicateInTables_([master, orders], col, '@nobody', 'wildriftnewacc001@gmail.com'), true);
  assert.equal(organize.checkDuplicateInTables_([master, orders], col, '@new_user', 'new@example.com'), false);
});

test('upsert by Order ID updates status and preserves PURCHASE_SENT notes', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  let master = [LIVE_HEADER_SNIPPET, FELIX_ROW.slice()];
  const incoming = FELIX_ROW.slice();
  incoming[col.STATUS] = 'Active';
  incoming[col.NOTES] = 'Activated: later';
  const result = organize.upsertRowsByOrderId_(master, incoming, col);
  assert.equal(result.action, 'update');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1][col.NOTES].indexOf('PURCHASE_SENT') !== -1, true);
  assert.equal(result.rows[1][col.STATUS], 'Active');

  const fresh = GARRY_REJECT_ROW.slice();
  const appended = organize.upsertRowsByOrderId_(result.rows, fresh, col);
  assert.equal(appended.action, 'append');
  assert.equal(appended.rows.length, 3);
  assert.equal(appended.rows[2][col.ORDER_ID], 'MM-2026-5114');
});

test('applyMidnightRejectMoves_ copies to archive, updates Master, removes from Orders — never drops the order', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  const state = {
    orders: [LIVE_HEADER_SNIPPET, FELIX_ROW.slice(), GARRY_REJECT_ROW.slice()],
    master: [LIVE_HEADER_SNIPPET, FELIX_ROW.slice(), GARRY_REJECT_ROW.slice()],
    archive: [LIVE_HEADER_SNIPPET]
  };
  const out = organize.applyMidnightRejectMoves_(state, col);
  assert.equal(out.moved.length, 1);
  assert.equal(out.moved[0], 'MM-2026-5114');
  assert.equal(out.orders.length, 2);
  assert.equal(out.orders[1][col.ORDER_ID], 'MM-2026-3007');
  assert.equal(out.archive.length, 2);
  assert.equal(out.archive[1][col.ORDER_ID], 'MM-2026-5114');
  assert.equal(out.archive[1][col.STATUS], 'reject');
  const masterGarry = out.master.find(function(r, i) {
    return i > 0 && r[col.ORDER_ID] === 'MM-2026-5114';
  });
  assert.ok(masterGarry);
  assert.equal(masterGarry[col.STATUS], 'reject');
  const stillFelix = out.master.find(function(r, i) {
    return i > 0 && r[col.ORDER_ID] === 'MM-2026-3007';
  });
  assert.ok(stillFelix);
  assert.equal(stillFelix[col.NOTES], 'PURCHASE_SENT');
});

test('Dhaka month tab is YYYY-MM and uses Asia/Dhaka calendar date', () => {
  assert.equal(organize.dhakaMonthTab_(new Date('2026-09-18T17:59:00.000Z')), '2026-09');
  assert.equal(organize.dhakaMonthTab_(new Date('2026-09-18T18:00:00.000Z')), '2026-09');
  assert.equal(organize.dhakaMonthTab_(new Date('2026-09-30T18:00:00.000Z')), '2026-10');
  assert.equal(organize.dhakaYmd_(new Date('2026-09-18T18:00:00.000Z')), '2026-09-19');
});

test('sync month rows from Master for a given YYYY-MM (Dhaka)', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  const master = [LIVE_HEADER_SNIPPET, FELIX_ROW.slice(), GARRY_REJECT_ROW.slice()];
  const month = organize.collectMonthRows_(master, col, '2026-09');
  assert.equal(month.length, 2);
  const oct = organize.collectMonthRows_(master, col, '2026-10');
  assert.equal(oct.length, 0);
});

test('Days Left formula points at Expiry column J (live), not M', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  const formula = organize.daysLeftFormula_(2, col);
  assert.equal(formula, '=IF(J2="","",J2-TODAY())');
});

test('setup refuses to overwrite existing live headers (no scramble)', () => {
  const decision = organize.planHeaderWrite_(LIVE_HEADER_SNIPPET, organize.LIVE_HEADERS, true);
  assert.equal(decision.write, false);
  assert.equal(decision.reason, 'already-canonical');

  const empty = organize.planHeaderWrite_([], organize.LIVE_HEADERS, false);
  assert.equal(empty.write, true);

  const scramble = organize.planHeaderWrite_(
    LIVE_HEADER_SNIPPET,
    ['Timestamp', 'Order ID', 'Name', 'Email', 'Telegram', 'Plan', 'Amount', 'Payment', 'Source'],
    true
  );
  assert.equal(scramble.write, false);
  assert.equal(scramble.reason, 'refuse-scramble');
});

test('optional Medium/Campaign/Language may only be appended at the far right', () => {
  const next = organize.planAppendOptionalHeaders_(LIVE_HEADER_SNIPPET);
  assert.deepEqual(next, LIVE_HEADER_SNIPPET.concat(['Medium', 'Campaign', 'Language']));
});

test('Language column maps and new rows default to en', () => {
  const headers = LIVE_HEADER_SNIPPET.concat(['Language']);
  const col = organize.buildColMapFromHeaders_(headers);
  assert.ok(col.LANGUAGE >= 0);
  const row = organize.buildOrderRowValues_(headers, col, {
    orderId: 'MM-L', name: 'A', email: 'a@b.c', telegram: '@a'
  }, new Date(), false);
  assert.equal(row[col.LANGUAGE], 'en');
  assert.equal(organize.normalizeOrderLanguage_('BN'), 'bn');
  assert.equal(organize.normalizeOrderLanguage_('hi'), 'hi');
  assert.equal(organize.normalizeOrderLanguage_('fr'), 'en');
  assert.equal(organize.normalizeOrderLanguage_(''), 'en');
  const bn = organize.buildOrderRowValues_(headers, col, { language: 'bn' }, new Date(), false);
  assert.equal(bn[col.LANGUAGE], 'bn');
});

test('setup copies Orders into Master without deleting Orders rows', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  const orders = [LIVE_HEADER_SNIPPET, FELIX_ROW.slice(), GARRY_REJECT_ROW.slice()];
  const out = organize.planSetupCopy_(orders, [LIVE_HEADER_SNIPPET], col);
  assert.equal(out.orders.length, 3);
  assert.equal(out.master.length, 3);
  assert.equal(out.master[1][col.ORDER_ID], 'MM-2026-3007');
  assert.equal(out.master[2][col.ORDER_ID], 'MM-2026-5114');
});

test('midnight heal copies Orders into Master before archiving rejects', () => {
  const col = organize.buildColMapFromHeaders_(LIVE_HEADER_SNIPPET);
  const pending = [
    '2026-09-19T08:00:00.000Z', 'MM-2026-9999', 'New', 'new@example.com',
    '@new_user', 'Entry', '$30', 'direct', 'Pending', '2026-10-19', '', 'Other',
    '', '', ''
  ];
  const orders = [LIVE_HEADER_SNIPPET, FELIX_ROW.slice(), pending];
  const master = [LIVE_HEADER_SNIPPET];
  const healed = organize.reconcileOrdersIntoMaster_(orders, master, col);
  assert.equal(healed.length, 3);
  assert.equal(healed[1][col.ORDER_ID], 'MM-2026-3007');
  assert.equal(healed[2][col.STATUS], 'Pending');
});

test('fallback live row (no SheetOrganize) still uses Source then Status then Payment', () => {
  const fs = require('fs');
  const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'OrderProcessor.gs'), 'utf8');
  assert.match(gs, /function fallbackLiveOrderRow_/);
  assert.match(gs, /data\.source \|\| 'direct'/);
  assert.match(gs, /organize: organizeOk/);
});

test('Apps Script test function names exist for Swa/Developer', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'SheetOrganize.gs'), 'utf8');
  assert.match(gs, /function setupOrganizeSheets\s*\(/);
  assert.match(gs, /function midnightOrganizeTrigger\s*\(/);
  assert.match(gs, /function testOrganizePendingMaster_\s*\(/);
  assert.match(gs, /function testRejectStaysSameDay_\s*\(/);
  assert.match(gs, /function testMidnightRejectMove_\s*\(/);
  assert.match(gs, /function repairDaysLeftFormulas\s*\(/);
  assert.match(gs, /TEST_/);
  assert.match(gs, /Asia\/Dhaka/);
});

test('doPost upserts Master; CAPI activate path is still called', () => {
  const op = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'OrderProcessor.gs'), 'utf8');
  const capi = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'CapiPurchase.gs'), 'utf8');
  assert.match(op, /function doPost/);
  assert.match(op, /upsertNewOrderToOrganizeTabs_/);
  assert.match(op, /trySendPurchaseForRow_/);
  assert.match(capi, /function trySendPurchaseForRow_/);
  assert.match(capi, /function onOrderStatusEdit/);
  assert.match(capi, /syncOrderRowToOrganizeTabs_/);
  assert.match(capi, /PURCHASE_SENT/);
});
