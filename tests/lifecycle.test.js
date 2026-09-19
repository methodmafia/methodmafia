'use strict';

/**
 * Phase 2A — Pending 24h nudge, Auto Expired, Renew +30, customer 3/2/1 emails.
 * Tests Node-exported helpers in apps-script/Lifecycle.gs plus source guards.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LIFE_PATH = path.join(__dirname, '..', 'apps-script', 'Lifecycle.gs');
const OP_PATH = path.join(__dirname, '..', 'apps-script', 'OrderProcessor.gs');
const CAPI_PATH = path.join(__dirname, '..', 'apps-script', 'CapiPurchase.gs');
const ORG_PATH = path.join(__dirname, '..', 'apps-script', 'SheetOrganize.gs');
const GUIDE_PATH = path.join(__dirname, '..', 'GUIDE.md');

const life = require(LIFE_PATH);
const op = require(OP_PATH);
const organize = require(ORG_PATH);

const LIVE_HEADERS = [
  'Timestamp', 'Order ID', 'Name', 'Email', 'Telegram', 'Plan', 'Amount',
  'Source', 'Status', 'Expiry', 'Days Left', 'Payment', 'Notes', 'FBclid', 'TTclid'
];
const col = organize.buildColMapFromHeaders_(LIVE_HEADERS);

function row(overrides) {
  const r = [
    '2026-09-16T14:59:10.481Z', 'MM-2026-3007', 'Felix', 'felix@example.com',
    '@digitalbaymm', 'Entry', '$30', 'direct', 'Active', '2026-10-16', 27, 'Other',
    'PURCHASE_SENT', '', ''
  ];
  Object.keys(overrides || {}).forEach(function (key) {
    const idx = col[key];
    if (idx == null || idx < 0) throw new Error('unknown col ' + key);
    r[idx] = overrides[key];
  });
  return r;
}

const NOW = new Date('2026-09-19T12:00:00.000Z');
const TODAY = new Date('2026-09-19T00:00:00.000Z');

test('DIGEST_EMAIL stays methodmafia.hq@gmail.com for admin lifecycle mail', () => {
  assert.equal(op.DIGEST_EMAIL, 'methodmafia.hq@gmail.com');
  assert.equal(life.LIFECYCLE_ADMIN_EMAIL, 'methodmafia.hq@gmail.com');
  assert.equal(life.LIFECYCLE_ADMIN_EMAIL, op.DIGEST_EMAIL);
});

test('notes markers append once and are detected case-insensitively', () => {
  assert.equal(life.notesHasMarker_('', 'PENDING_NUDGED'), false);
  assert.equal(life.notesHasMarker_('PENDING_NUDGED', 'PENDING_NUDGED'), true);
  assert.equal(life.notesHasMarker_('foo | pending_nudged', 'PENDING_NUDGED'), true);
  assert.equal(life.notesAppendMarker_('', 'PENDING_NUDGED'), 'PENDING_NUDGED');
  assert.equal(life.notesAppendMarker_('PURCHASE_SENT', 'PENDING_NUDGED'), 'PURCHASE_SENT | PENDING_NUDGED');
  assert.equal(life.notesAppendMarker_('PURCHASE_SENT | PENDING_NUDGED', 'PENDING_NUDGED'), 'PURCHASE_SENT | PENDING_NUDGED');
  assert.equal(life.notesHasMarker_('RENEW_MAIL_3 | RENEW_MAIL_2', 'RENEW_MAIL_1'), false);
});

test('Pending 24h nudge selects only Pending rows older than 24h without PENDING_NUDGED', () => {
  const oldTs = new Date(NOW.getTime() - 25 * 3600 * 1000).toISOString();
  const youngTs = new Date(NOW.getTime() - 23 * 3600 * 1000).toISOString();
  const rows = [
    LIVE_HEADERS,
    row({ ORDER_ID: 'MM-OLD', STATUS: 'Pending', TIMESTAMP: oldTs, NOTES: '' }),
    row({ ORDER_ID: 'MM-YOUNG', STATUS: 'Pending', TIMESTAMP: youngTs, NOTES: '' }),
    row({ ORDER_ID: 'MM-FLAGGED', STATUS: 'Pending', TIMESTAMP: oldTs, NOTES: 'PENDING_NUDGED' }),
    row({ ORDER_ID: 'MM-ACTIVE', STATUS: 'Active', TIMESTAMP: oldTs, NOTES: '' }),
    row({ ORDER_ID: 'MM-BADTS', STATUS: 'Pending', TIMESTAMP: '', NOTES: '' })
  ];
  const planned = life.planPendingNudges_(rows, col, NOW);
  assert.deepEqual(planned.map((p) => p.orderId), ['MM-OLD']);
  assert.equal(planned[0].hoursOld >= 24, true);
  assert.equal(life.shouldNudgePending_('Pending', oldTs, '', NOW), true);
  assert.equal(life.shouldNudgePending_('Pending', youngTs, '', NOW), false);
  assert.equal(life.shouldNudgePending_('pending', oldTs, '⚠️ DUPLICATE', NOW), true);
});

test('Pending nudge email is admin-only (DIGEST_EMAIL) and includes Activate links', () => {
  const items = [{
    orderId: 'MM-2026-1111',
    name: 'Amina',
    telegram: '@amina',
    email: 'amina@example.com',
    hoursOld: 30
  }];
  const links = {
    'MM-2026-1111': 'https://script.google.com/macros/s/EXAMPLE/exec?action=activate&orderId=MM-2026-1111&token=live-script-property-token'
  };
  const msg = life.buildPendingNudgeMessage_(items, links);
  assert.equal(msg.to, 'methodmafia.hq@gmail.com');
  assert.match(msg.subject, /Pending/i);
  assert.match(msg.htmlBody, /MM-2026-1111/);
  assert.match(msg.htmlBody, /Amina/);
  assert.match(msg.htmlBody, /action=activate/);
  assert.match(msg.htmlBody, /Activate MM-2026-1111/);
  assert.equal(msg.htmlBody.includes('CHANGE_ME_NOW'), false);
  assert.equal(msg.to === items[0].email, false);
});

test('applyPendingNudgeMarkers_ stamps PENDING_NUDGED without dropping PURCHASE_SENT', () => {
  const oldTs = new Date(NOW.getTime() - 30 * 3600 * 1000).toISOString();
  const rows = [
    LIVE_HEADERS,
    row({ ORDER_ID: 'MM-OLD', STATUS: 'Pending', TIMESTAMP: oldTs, NOTES: '⚠️ DUPLICATE' }),
    row({ ORDER_ID: 'MM-KEEP', STATUS: 'Active', TIMESTAMP: oldTs, NOTES: 'PURCHASE_SENT' })
  ];
  const out = life.applyPendingNudgeMarkers_(rows, col, NOW);
  assert.equal(out.nudged.length, 1);
  assert.equal(out.nudged[0], 'MM-OLD');
  assert.match(String(out.rows[1][col.NOTES]), /PENDING_NUDGED/);
  assert.match(String(out.rows[1][col.NOTES]), /DUPLICATE/);
  assert.equal(out.rows[2][col.NOTES], 'PURCHASE_SENT');
  assert.equal(out.rows.length, 3);
});

test('Auto Expired flips Active rows past Expiry and never deletes', () => {
  const rows = [
    LIVE_HEADERS,
    row({ ORDER_ID: 'MM-PAST', STATUS: 'Active', EXPIRY: '2026-09-18', NOTES: 'PURCHASE_SENT' }),
    row({ ORDER_ID: 'MM-TODAY', STATUS: 'Active', EXPIRY: '2026-09-19', NOTES: 'PURCHASE_SENT' }),
    row({ ORDER_ID: 'MM-FUTURE', STATUS: 'Active', EXPIRY: '2026-10-16', NOTES: 'PURCHASE_SENT' }),
    row({ ORDER_ID: 'MM-PEND', STATUS: 'Pending', EXPIRY: '2026-09-01', NOTES: '' }),
    row({ ORDER_ID: 'MM-DONE', STATUS: 'Expired', EXPIRY: '2026-09-01', NOTES: '' })
  ];
  assert.equal(life.shouldExpire_('Active', '2026-09-18', TODAY), true);
  assert.equal(life.shouldExpire_('Active', '2026-09-19', TODAY), false);
  assert.equal(life.shouldExpire_('Pending', '2026-09-01', TODAY), false);
  assert.equal(life.calendarDaysUntil_('2026-09-18', TODAY), -1);
  assert.equal(life.calendarDaysUntil_('2026-09-19', TODAY), 0);
  assert.equal(life.calendarDaysUntil_('2026-09-22', TODAY), 3);

  const out = life.applyAutoExpiresToRows_(rows, col, TODAY);
  assert.deepEqual(out.expired, ['MM-PAST']);
  assert.equal(out.rows.length, 6);
  assert.equal(out.rows[1][col.STATUS], 'Expired');
  assert.equal(out.rows[1][col.ORDER_ID], 'MM-PAST');
  assert.equal(out.rows[1][col.NOTES], 'PURCHASE_SENT');
  assert.equal(out.rows[2][col.STATUS], 'Active');
  assert.equal(out.rows[3][col.STATUS], 'Active');
  assert.equal(out.rows[4][col.STATUS], 'Pending');
  assert.equal(out.rows[5][col.STATUS], 'Expired');
});

test('Days Left formula uses live Expiry column J and works for past dates', () => {
  const formula = organize.daysLeftFormula_(2, col);
  assert.equal(formula, '=IF(J2="","",J2-TODAY())');
  assert.match(formula, /J2/);
  assert.doesNotMatch(formula, /M2/);
  assert.equal(life.daysLeftFormulaUsesExpiryColumn_(formula, col), true);
});

test('Renew +30 extends from max(today, current expiry) and only Active/Expired', () => {
  const future = life.planRenewOrder_('Active', '2026-10-16', TODAY);
  assert.equal(future.ok, true);
  assert.equal(future.newStatus, 'Active');
  assert.equal(future.newExpiry, '2026-11-15');

  const past = life.planRenewOrder_('Expired', '2026-09-01', TODAY);
  assert.equal(past.ok, true);
  assert.equal(past.newStatus, 'Active');
  assert.equal(past.newExpiry, '2026-10-19');

  const todayExp = life.planRenewOrder_('active', '2026-09-19', TODAY);
  assert.equal(todayExp.newExpiry, '2026-10-19');

  const empty = life.planRenewOrder_('Expired', '', TODAY);
  assert.equal(empty.newExpiry, '2026-10-19');

  assert.equal(life.planRenewOrder_('Pending', '2026-10-16', TODAY).ok, false);
  assert.equal(life.planRenewOrder_('reject', '2026-10-16', TODAY).ok, false);
  assert.equal(life.computeRenewedExpiry_('2026-10-16', TODAY), '2026-11-15');
});

test('applyRenewToRow_ sets Active, new expiry, keeps PURCHASE_SENT, does not send CAPI', () => {
  const rows = [
    LIVE_HEADERS,
    row({ ORDER_ID: 'MM-EXP', STATUS: 'Expired', EXPIRY: '2026-09-01', NOTES: 'PURCHASE_SENT' })
  ];
  const out = life.applyRenewToRow_(rows, col, 1, TODAY);
  assert.equal(out.ok, true);
  assert.equal(out.rows[1][col.STATUS], 'Active');
  assert.equal(out.rows[1][col.EXPIRY], '2026-10-19');
  assert.match(String(out.rows[1][col.NOTES]), /PURCHASE_SENT/);
  assert.match(String(out.rows[1][col.NOTES]), /Renewed:/);
  assert.equal(out.sendCapi, false);
});

test('Customer renew emails plan 3/2/1 day Active rows with Email, deduped by RENEW_MAIL_*', () => {
  const rows = [
    LIVE_HEADERS,
    row({ ORDER_ID: 'MM-3', STATUS: 'Active', EXPIRY: '2026-09-22', EMAIL: 'three@example.com', NOTES: 'PURCHASE_SENT' }),
    row({ ORDER_ID: 'MM-2', STATUS: 'Active', EXPIRY: '2026-09-21', EMAIL: 'two@example.com', NOTES: 'PURCHASE_SENT | RENEW_MAIL_3' }),
    row({ ORDER_ID: 'MM-1', STATUS: 'Active', EXPIRY: '2026-09-20', EMAIL: 'one@example.com', NOTES: '' }),
    row({ ORDER_ID: 'MM-3D', STATUS: 'Active', EXPIRY: '2026-09-22', EMAIL: 'dup@example.com', NOTES: 'RENEW_MAIL_3' }),
    row({ ORDER_ID: 'MM-4', STATUS: 'Active', EXPIRY: '2026-09-23', EMAIL: 'four@example.com', NOTES: '' }),
    row({ ORDER_ID: 'MM-NOMAIL', STATUS: 'Active', EXPIRY: '2026-09-22', EMAIL: '', NOTES: '' }),
    row({ ORDER_ID: 'MM-PEND', STATUS: 'Pending', EXPIRY: '2026-09-22', EMAIL: 'pend@example.com', NOTES: '' }),
    row({ ORDER_ID: 'MM-EXP', STATUS: 'Expired', EXPIRY: '2026-09-22', EMAIL: 'exp@example.com', NOTES: '' })
  ];
  const planned = life.planCustomerRenewMails_(rows, col, TODAY);
  const byId = {};
  planned.forEach((p) => { byId[p.orderId] = p; });
  assert.equal(planned.length, 3);
  assert.equal(byId['MM-3'].daysLeft, 3);
  assert.equal(byId['MM-3'].marker, 'RENEW_MAIL_3');
  assert.equal(byId['MM-2'].daysLeft, 2);
  assert.equal(byId['MM-2'].marker, 'RENEW_MAIL_2');
  assert.equal(byId['MM-1'].daysLeft, 1);
  assert.equal(byId['MM-1'].marker, 'RENEW_MAIL_1');
  assert.equal(byId['MM-3D'], undefined);
  assert.equal(byId['MM-4'], undefined);
  assert.equal(byId['MM-NOMAIL'], undefined);
  assert.equal(byId['MM-PEND'], undefined);
});

test('Customer renew mail goes to the row Email, not DIGEST_EMAIL, polite EN Method Mafia tone', () => {
  const msg = life.buildCustomerRenewMessage_({
    orderId: 'MM-2026-3007',
    name: 'Felix',
    email: 'felix@example.com',
    daysLeft: 3,
    expiry: '2026-09-22'
  });
  assert.equal(msg.to, 'felix@example.com');
  assert.notEqual(msg.to, life.LIFECYCLE_ADMIN_EMAIL);
  assert.match(msg.subject, /Method Mafia/i);
  assert.match(msg.subject, /3/);
  const body = (msg.textBody || '') + (msg.htmlBody || '');
  assert.match(body, /Felix/);
  assert.match(body, /3 day/);
  assert.match(body, /2026-09-22|22/);
  assert.match(body, /Method Mafia/);
  assert.match(body, /30 days|another 30/i);
  assert.doesNotMatch(body, /kick|ban|bot/i);
});

test('applyCustomerRenewMarkers_ writes RENEW_MAIL_3/2/1 independently', () => {
  const rows = [
    LIVE_HEADERS,
    row({ ORDER_ID: 'MM-3', STATUS: 'Active', EXPIRY: '2026-09-22', EMAIL: 'three@example.com', NOTES: 'PURCHASE_SENT' })
  ];
  const planned = life.planCustomerRenewMails_(rows, col, TODAY);
  const out = life.applyCustomerRenewMarkers_(rows, col, planned);
  assert.match(String(out.rows[1][col.NOTES]), /PURCHASE_SENT/);
  assert.match(String(out.rows[1][col.NOTES]), /RENEW_MAIL_3/);
  const again = life.planCustomerRenewMails_(out.rows, col, TODAY);
  assert.equal(again.length, 0);
});

test('classifyDoGetRequest_ routes renew as admin-token action; status still public', () => {
  const token = 'live-script-property-token';
  assert.equal(op.classifyDoGetRequest_({ action: 'renew', orderId: 'MM-1', token: token }, token).kind, 'renew');
  assert.equal(op.classifyDoGetRequest_({ action: 'renew', orderId: 'MM-1', token: 'nope' }, token).kind, 'unauthorized');
  assert.equal(op.classifyDoGetRequest_({ action: 'pendingNudge', token: token }, token).kind, 'pendingNudge');
  assert.equal(op.classifyDoGetRequest_({ action: 'autoExpire', token: token }, token).kind, 'autoExpire');
  assert.equal(op.classifyDoGetRequest_({ action: 'status', orderId: 'MM-2026-3007' }, '').kind, 'status');
});

test('Lifecycle.gs has triggers, renewOrder, TEST_ helpers, and no Telegram bot sends', () => {
  const gs = fs.readFileSync(LIFE_PATH, 'utf8');
  assert.match(gs, /function pendingNudgeTrigger/);
  assert.match(gs, /function installPendingNudgeTrigger/);
  assert.match(gs, /function autoExpireActiveOrders/);
  assert.match(gs, /function renewOrder/);
  assert.match(gs, /function sendCustomerRenewEmails/);
  assert.match(gs, /function expiryLifecycleTrigger/);
  assert.match(gs, /function installExpiryLifecycleTrigger/);
  assert.match(gs, /function testPendingNudge_/);
  assert.match(gs, /function testAutoExpire_/);
  assert.match(gs, /function testRenewPlus30_/);
  assert.match(gs, /function testCustomerRenewMail_/);
  assert.match(gs, /TEST_/);
  assert.doesNotMatch(gs, /api\.telegram\.org/);
  assert.doesNotMatch(gs, /sendTelegram|TelegramBot|bot token/i);
  assert.doesNotMatch(gs, /trySendPurchaseForRow_/);
});

test('renewOrder path must not fire CAPI; Entry $30 Purchase path stays intact', () => {
  const capi = fs.readFileSync(CAPI_PATH, 'utf8');
  const opSrc = fs.readFileSync(OP_PATH, 'utf8');
  assert.match(capi, /CAPI_PURCHASE_VALUE\s*=\s*30/);
  assert.match(capi, /PURCHASE_SENT/);
  assert.match(capi, /function trySendPurchaseForRow_/);
  assert.match(opSrc, /function renewOrder|route\.kind === 'renew'/);
  const renewBlock = opSrc.includes("route.kind === 'renew'")
    ? opSrc.slice(opSrc.indexOf("route.kind === 'renew'"), opSrc.indexOf("route.kind === 'renew'") + 800)
    : '';
  assert.doesNotMatch(renewBlock, /trySendPurchaseForRow_/);
});

test('GUIDE documents Phase 2A triggers, renew URL, and Days Left on Expiry', () => {
  const guide = fs.readFileSync(GUIDE_PATH, 'utf8');
  assert.match(guide, /pendingNudgeTrigger/);
  assert.match(guide, /installPendingNudgeTrigger/);
  assert.match(guide, /expiryLifecycleTrigger|installExpiryLifecycleTrigger/);
  assert.match(guide, /renewOrder/);
  assert.match(guide, /action=renew/);
  assert.match(guide, /PENDING_NUDGED/);
  assert.match(guide, /RENEW_MAIL_3/);
  assert.match(guide, /J2-TODAY\(\)|Expiry column J/i);
  assert.match(guide, /repairDaysLeftFormulas/);
  assert.match(guide, /methodmafia\.hq@gmail\.com/);
  assert.doesNotMatch(guide, /Telegram bot send|bot\.sendMessage/i);
});
