'use strict';

/**
 * Phase 1C — Apps Script security + public status + digest/onEdit.
 * Tests the Node-exported helpers in OrderProcessor.gs and source-guards
 * so CHANGE_ME_NOW cannot be the live secret and status JSON stays PII-free.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const OP_PATH = path.join(__dirname, '..', 'apps-script', 'OrderProcessor.gs');
const CAPI_PATH = path.join(__dirname, '..', 'apps-script', 'CapiPurchase.gs');
const GUIDE_PATH = path.join(__dirname, '..', 'GUIDE.md');

const op = require(OP_PATH);

test('isUsableAdminToken_ fails closed on missing, blank, and CHANGE_ME_NOW', () => {
  assert.equal(op.isUsableAdminToken_(''), false);
  assert.equal(op.isUsableAdminToken_(null), false);
  assert.equal(op.isUsableAdminToken_(undefined), false);
  assert.equal(op.isUsableAdminToken_('   '), false);
  assert.equal(op.isUsableAdminToken_('CHANGE_ME_NOW'), false);
  assert.equal(op.isUsableAdminToken_('change_me_now'), false);
  assert.equal(op.isUsableAdminToken_('a-long-random-secret-xyz'), true);
});

test('resolveAdminToken_ never falls back to the repo placeholder', () => {
  assert.equal(op.resolveAdminToken_(''), '');
  assert.equal(op.resolveAdminToken_('CHANGE_ME_NOW'), '');
  assert.equal(op.resolveAdminToken_('  CHANGE_ME_NOW  '), '');
  assert.equal(op.resolveAdminToken_(null), '');
  assert.equal(op.resolveAdminToken_('live-script-property-token'), 'live-script-property-token');
});

test('adminTokenMatches_ fails closed when stored token is missing or placeholder', () => {
  assert.equal(op.adminTokenMatches_('CHANGE_ME_NOW', 'CHANGE_ME_NOW'), false);
  assert.equal(op.adminTokenMatches_('anything', ''), false);
  assert.equal(op.adminTokenMatches_('live-script-property-token', 'live-script-property-token'), true);
  assert.equal(op.adminTokenMatches_('wrong', 'live-script-property-token'), false);
});

test('classifyDoGetRequest_ handles action=status BEFORE any token check', () => {
  const noToken = op.classifyDoGetRequest_(
    { action: 'status', orderId: 'mm-2026-3007' },
    ''
  );
  assert.equal(noToken.kind, 'status');
  assert.equal(noToken.orderId, 'MM-2026-3007');

  const wrongToken = op.classifyDoGetRequest_(
    { action: 'status', orderId: 'MM-2026-5114', token: 'nope' },
    'live-script-property-token'
  );
  assert.equal(wrongToken.kind, 'status');
  assert.equal(wrongToken.orderId, 'MM-2026-5114');

  const missingId = op.classifyDoGetRequest_({ action: 'status' }, '');
  assert.equal(missingId.kind, 'status');
  assert.equal(missingId.orderId, '');
});

test('classifyDoGetRequest_ rejects admin actions without a usable Script Properties token', () => {
  assert.equal(op.classifyDoGetRequest_({ action: 'activate', orderId: 'MM-1', token: 'CHANGE_ME_NOW' }, 'CHANGE_ME_NOW').kind, 'unauthorized');
  assert.equal(op.classifyDoGetRequest_({ action: 'digest', token: 'x' }, '').kind, 'unauthorized');
  assert.equal(op.classifyDoGetRequest_({ action: 'activate', orderId: 'MM-1', token: 'live-script-property-token' }, 'live-script-property-token').kind, 'activate');
  assert.equal(op.classifyDoGetRequest_({ action: 'digest', token: 'live-script-property-token' }, 'live-script-property-token').kind, 'digest');
  assert.equal(op.classifyDoGetRequest_({ action: 'expiry', token: 'live-script-property-token' }, 'live-script-property-token').kind, 'expiry');
  assert.equal(op.classifyDoGetRequest_({ action: 'renew', orderId: 'MM-1', token: 'live-script-property-token' }, 'live-script-property-token').kind, 'renew');
  assert.equal(op.classifyDoGetRequest_({ action: 'pendingNudge', token: 'x' }, '').kind, 'unauthorized');
});

test('public status payload is {ok, found, orderId, status, plan} with no PII keys', () => {
  const found = op.buildPublicStatusPayload_('mm-2026-3007', true, 'Active', 'Entry');
  assert.deepEqual(found, {
    ok: true,
    found: true,
    orderId: 'MM-2026-3007',
    status: 'Active',
    plan: 'Entry'
  });
  assert.deepEqual(Object.keys(found).sort(), ['found', 'ok', 'orderId', 'plan', 'status']);
  assert.equal(op.publicStatusHasOnlySafeKeys_(found), true);

  const missing = op.buildPublicStatusPayload_('MM-2026-0000', false, 'should-not-leak', 'Entry');
  assert.equal(missing.found, false);
  assert.equal(missing.status, '');
  assert.equal(missing.plan, '');
  assert.equal(op.publicStatusHasOnlySafeKeys_(missing), true);

  const leaky = { ok: true, found: true, orderId: 'X', status: 'Active', plan: 'Entry', email: 'a@b.com' };
  assert.equal(op.publicStatusHasOnlySafeKeys_(leaky), false);
});

test('public status lookup order is Orders then Master then Archive_Rejected', () => {
  assert.deepEqual(op.publicStatusSheetNames_(), ['Orders', 'Master', 'Archive_Rejected']);
});

test('digest Activate links use the Script Properties token, never CHANGE_ME_NOW', () => {
  const url = op.buildActivateLink_('https://script.google.com/macros/s/EXAMPLE/exec', 'MM-2026-3007', 'live-script-property-token');
  assert.match(url, /action=activate/);
  assert.match(url, /orderId=MM-2026-3007/);
  assert.match(url, /token=live-script-property-token/);
  assert.equal(url.includes('CHANGE_ME_NOW'), false);

  assert.equal(op.buildActivateLink_('https://script.google.com/macros/s/EXAMPLE/exec', 'MM-1', ''), '');
  assert.equal(op.buildActivateLink_('https://script.google.com/macros/s/EXAMPLE/exec', 'MM-1', 'CHANGE_ME_NOW'), '');
});

test('DIGEST_EMAIL stays methodmafia.hq@gmail.com (not info@)', () => {
  assert.equal(op.DIGEST_EMAIL, 'methodmafia.hq@gmail.com');
  const gs = fs.readFileSync(OP_PATH, 'utf8');
  assert.match(gs, /DIGEST_EMAIL\s*=\s*'methodmafia\.hq@gmail\.com'/);
  assert.doesNotMatch(gs, /DIGEST_EMAIL\s*=\s*'info@themethodmafia\.com'/);
});

test('OrderProcessor reads ADMIN_TOKEN from Script Properties and fails closed', () => {
  const gs = fs.readFileSync(OP_PATH, 'utf8');
  assert.match(gs, /function getAdminToken_/);
  assert.match(gs, /function setupAdminToken_/);
  assert.match(gs, /PropertiesService\.getScriptProperties/);
  assert.match(gs, /getProperty\(\s*'ADMIN_TOKEN'\s*\)/);
  assert.match(gs, /function installDailyDigestTrigger/);
  assert.match(gs, /function classifyDoGetRequest_/);
  assert.match(gs, /action === 'status'|action === \"status\"|kind === 'status'/);

  const tokenCompare = gs.match(/if\s*\(\s*token\s*!==\s*ADMIN_TOKEN\s*\)/);
  assert.equal(tokenCompare, null, 'doGet must not compare against the CHANGE_ME_NOW constant');

  const digestUsesConst = gs.match(/token='\s*\+\s*ADMIN_TOKEN\b/);
  assert.equal(digestUsesConst, null, 'digest Activate links must not embed the placeholder constant');
});

test('doGet status path uses ContentService JSON, not HtmlService', () => {
  const gs = fs.readFileSync(OP_PATH, 'utf8');
  assert.match(gs, /function jsonResponse_/);
  const statusBlock = gs.slice(gs.indexOf('function doGet'));
  assert.match(statusBlock, /jsonResponse_|ContentService\.createTextOutput/);
  assert.match(statusBlock, /handlePublicStatus_|buildPublicStatusPayload_/);
});

test('onOrderStatusEdit still keys off LIVE Status column I (COL.STATUS = 8)', () => {
  const capi = fs.readFileSync(CAPI_PATH, 'utf8');
  const gs = fs.readFileSync(OP_PATH, 'utf8');
  assert.match(gs, /STATUS\s*:\s*8/);
  assert.match(capi, /function onOrderStatusEdit/);
  assert.match(capi, /COL\.STATUS\s*\+\s*1/);
  assert.match(capi, /trySendPurchaseForRow_/);
  assert.match(capi, /CAPI_PURCHASE_VALUE\s*=\s*30/);
  assert.match(capi, /PURCHASE_SENT/);
  assert.match(capi, /function installOnOrderStatusEditTrigger/);
  assert.doesNotMatch(capi, /var statusCol\s*=\s*12/);
});

test('frontend JS never ships ADMIN_TOKEN', () => {
  const roots = [
    path.join(__dirname, '..', 'js'),
    path.join(__dirname, '..', 'config.js'),
    path.join(__dirname, '..', 'index.html'),
    path.join(__dirname, '..', 'order-status.html')
  ];
  function walk(p) {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      return fs.readdirSync(p).flatMap((name) => walk(path.join(p, name)));
    }
    return [p];
  }
  const files = roots.flatMap(walk);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.includes('ADMIN_TOKEN'), false, file + ' must not contain ADMIN_TOKEN');
    assert.equal(text.includes('CHANGE_ME_NOW'), false, file + ' must not contain CHANGE_ME_NOW');
  }
});

test('GUIDE documents Script Properties token, status endpoint, digest + onEdit triggers', () => {
  const guide = fs.readFileSync(GUIDE_PATH, 'utf8');
  assert.match(guide, /ADMIN_TOKEN/);
  assert.match(guide, /Script properties/i);
  assert.match(guide, /setupAdminToken_/);
  assert.match(guide, /action=status/);
  assert.match(guide, /installDailyDigestTrigger/);
  assert.match(guide, /onOrderStatusEdit/);
  assert.match(guide, /methodmafia\.hq@gmail\.com/);
  assert.doesNotMatch(guide, /DIGEST_EMAIL\s*=\s*'info@themethodmafia\.com'/);
});
