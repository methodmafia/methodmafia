'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');

const capi = require(path.join(__dirname, '..', 'js', 'capi-payload.js'));

function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

test('CAPI Purchase only for Status Active + Plan Entry and not already sent', () => {
  assert.equal(capi.shouldSendPurchase({ status: 'Active', plan: 'Entry', notes: '' }), true);
  assert.equal(capi.shouldSendPurchase({ status: 'active', plan: 'ENTRY', notes: '⚠️ DUPLICATE' }), true);
  assert.equal(capi.shouldSendPurchase({ status: 'Pending', plan: 'Entry', notes: '' }), false);
  assert.equal(capi.shouldSendPurchase({ status: 'Active', plan: 'Monthly', notes: '' }), false);
  assert.equal(capi.shouldSendPurchase({ status: 'Active', plan: 'Entry', notes: 'Activated | PURCHASE_SENT' }), false);
});

test('Meta CAPI Purchase payload is $30 USD with hashed email and orderId event_id', () => {
  const body = capi.buildMetaPurchasePayload({
    pixelId: '1402762621295852',
    orderId: 'MM-2026-4821',
    email: 'Rakib@Gmail.com',
    telegram: '@rakib_h',
    fbclid: 'FbClick99',
    eventTime: 1700000000
  });

  assert.equal(body.data.length, 1);
  const ev = body.data[0];
  assert.equal(ev.event_name, 'Purchase');
  assert.equal(ev.event_time, 1700000000);
  assert.equal(ev.event_id, 'MM-2026-4821');
  assert.equal(ev.action_source, 'website');
  assert.deepEqual(ev.user_data.em, [sha256('rakib@gmail.com')]);
  assert.deepEqual(ev.user_data.external_id, [sha256('@rakib_h')]);
  assert.equal(ev.user_data.fbc, 'fb.1.1700000000.FbClick99');
  assert.equal(ev.custom_data.value, 30);
  assert.equal(ev.custom_data.currency, 'USD');
  assert.equal(ev.custom_data.content_name, 'Entry');
  assert.equal(ev.event_source_url, 'https://themethodmafia.com/');
});

test('TikTok Events API uses CompletePayment with $30 and hashed email', () => {
  const body = capi.buildTikTokPurchasePayload({
    pixelId: 'DA6ITFJC77U72JPLUACG',
    orderId: 'MM-2026-4821',
    email: 'Rakib@Gmail.com',
    telegram: '@rakib_h',
    ttclid: 'TtClick88',
    eventTime: 1700000000
  });

  assert.equal(body.event_source, 'web');
  assert.equal(body.event_source_id, 'DA6ITFJC77U72JPLUACG');
  const ev = body.data[0];
  assert.equal(ev.event, 'CompletePayment');
  assert.equal(ev.event_id, 'MM-2026-4821');
  assert.equal(ev.event_time, 1700000000);
  assert.equal(ev.user.email, sha256('rakib@gmail.com'));
  assert.equal(ev.user.external_id, sha256('@rakib_h'));
  assert.equal(ev.user.ttclid, 'TtClick88');
  assert.equal(ev.properties.value, 30);
  assert.equal(ev.properties.currency, 'USD');
  assert.equal(ev.page.url, 'https://themethodmafia.com/');
});

test('PURCHASE_SENT only after every configured API succeeds', () => {
  assert.equal(capi.shouldMarkPurchaseSent({ meta: 'ok', tiktok: 'ok' }), true);
  assert.equal(capi.shouldMarkPurchaseSent({ meta: 'ok', tiktok: 'skipped' }), true);
  assert.equal(capi.shouldMarkPurchaseSent({ meta: 'skipped', tiktok: 'ok' }), true);
  assert.equal(capi.shouldMarkPurchaseSent({ meta: 'ok', tiktok: 'error' }), false);
  assert.equal(capi.shouldMarkPurchaseSent({ meta: 'error', tiktok: 'ok' }), false);
  assert.equal(capi.shouldMarkPurchaseSent({ meta: 'skipped', tiktok: 'skipped' }), false);
});

test('notes helper appends PURCHASE_SENT without duplicating', () => {
  assert.equal(capi.appendPurchaseSentNote(''), 'PURCHASE_SENT');
  assert.equal(capi.appendPurchaseSentNote('⚠️ DUPLICATE'), '⚠️ DUPLICATE | PURCHASE_SENT');
  assert.equal(capi.appendPurchaseSentNote('Activated | PURCHASE_SENT'), 'Activated | PURCHASE_SENT');
});

test('Apps Script CAPI uses Script Properties and documented endpoints', () => {
  const fs = require('fs');
  const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'CapiPurchase.gs'), 'utf8');
  assert.ok(gs.indexOf('PropertiesService.getScriptProperties') !== -1);
  assert.ok(gs.indexOf('META_ACCESS_TOKEN') !== -1);
  assert.ok(gs.indexOf('TIKTOK_ACCESS_TOKEN') !== -1);
  assert.ok(gs.indexOf('https://graph.facebook.com/v18.0/') !== -1);
  assert.ok(gs.indexOf('https://business-api.tiktok.com/open_api/v1.3/event/track/') !== -1);
  assert.ok(gs.indexOf('CompletePayment') !== -1);
  assert.ok(gs.indexOf('onOrderStatusEdit') !== -1);
  assert.ok(gs.indexOf('event_source_url') !== -1);
  assert.ok(gs.indexOf('capiShouldMarkSent_') !== -1);
  assert.ok(gs.indexOf('access_token=EAA') === -1);
  assert.ok(!/META_ACCESS_TOKEN\s*[:=]\s*['"][^'"]+['"]/.test(gs));
});

test('OrderProcessor writes fbclid/ttclid at the end of the row', () => {
  const fs = require('fs');
  const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'OrderProcessor.gs'), 'utf8');
  assert.ok(gs.indexOf('FBCLID') !== -1);
  assert.ok(gs.indexOf('data.fbclid') !== -1);
  assert.ok(gs.indexOf('data.ttclid') !== -1);
  assert.ok(gs.indexOf("'FBclid','TTclid'") !== -1 || gs.indexOf("'FBclid', 'TTclid'") !== -1);
  assert.ok(gs.indexOf('trySendPurchaseForRow_') !== -1);
});

test('Meta and TikTok endpoints match the documented APIs', () => {
  assert.equal(
    capi.metaEventsUrl('1402762621295852'),
    'https://graph.facebook.com/v18.0/1402762621295852/events'
  );
  assert.equal(
    capi.tiktokEventsUrl(),
    'https://business-api.tiktok.com/open_api/v1.3/event/track/'
  );
});
