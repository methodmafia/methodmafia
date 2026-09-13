'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const lib = require(path.join(__dirname, '..', 'js', 'tracking-lib.js'));

function memoryStore(seed) {
  const data = Object.assign({}, seed);
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    _data: data
  };
}

test('captures fbclid and ttclid from the URL and persists them', () => {
  const store = memoryStore();
  const ids = lib.captureClickIds('?fbclid=FbClick99&ttclid=TtClick88&utm_source=facebook', store);
  assert.equal(ids.fbclid, 'FbClick99');
  assert.equal(ids.ttclid, 'TtClick88');
  assert.equal(store.getItem('mm_fbclid'), 'FbClick99');
  assert.equal(store.getItem('mm_ttclid'), 'TtClick88');
  assert.ok(String(store.getItem('mm_fbc')).startsWith('fb.1.'));
  assert.ok(String(store.getItem('mm_fbc')).endsWith('.FbClick99'));
});

test('reuses stored click IDs when the next page has no query params', () => {
  const store = memoryStore({ mm_fbclid: 'kept_fb', mm_ttclid: 'kept_tt' });
  const ids = lib.captureClickIds('', store);
  assert.equal(ids.fbclid, 'kept_fb');
  assert.equal(ids.ttclid, 'kept_tt');
});

test('captures UTM params and defaults source to direct', () => {
  const store = memoryStore();
  const a = lib.captureUtm('?utm_source=tiktok&utm_medium=paid&utm_campaign=entry_sep', store);
  assert.deepEqual(a, { utm_source: 'tiktok', utm_medium: 'paid', utm_campaign: 'entry_sep' });

  const b = lib.captureUtm('', memoryStore());
  assert.equal(b.utm_source, 'direct');
  assert.equal(b.utm_medium, '');
  assert.equal(b.utm_campaign, '');
});

test('sheet payload includes fbclid, ttclid, and existing UTM fields', () => {
  const payload = lib.buildSheetTrackingFields({
    fbclid: 'abc',
    ttclid: 'xyz',
    utm_source: 'facebook',
    utm_medium: 'paid',
    utm_campaign: 'entry'
  });
  assert.equal(payload.fbclid, 'abc');
  assert.equal(payload.ttclid, 'xyz');
  assert.equal(payload.source, 'facebook');
  assert.equal(payload.medium, 'paid');
  assert.equal(payload.campaign, 'entry');
});

test('Purchase backup is Entry-only at $30 and skips Monthly', () => {
  const entry = lib.purchaseBackupEvent({ confirmed: '1', plan: 'Entry', orderId: 'MM-2026-1111' });
  assert.deepEqual(entry, {
    fire: true,
    eventName: 'Purchase',
    tiktokEvent: 'CompletePayment',
    value: 30,
    currency: 'USD',
    contentName: 'Entry',
    eventId: 'MM-2026-1111'
  });

  const monthly = lib.purchaseBackupEvent({ confirmed: '1', plan: 'Monthly', orderId: 'MM-2026-2222' });
  assert.equal(monthly.fire, false);

  const notConfirmed = lib.purchaseBackupEvent({ confirmed: '', plan: 'Entry', orderId: 'MM-2026-3333' });
  assert.equal(notConfirmed.fire, false);
});

test('Lead / InitiateCheckout value is 30 for Entry and 15 for Monthly', () => {
  assert.deepEqual(lib.checkoutEventValue('Entry'), { value: 30, contentName: 'Entry', currency: 'USD' });
  assert.deepEqual(lib.checkoutEventValue('entry'), { value: 30, contentName: 'Entry', currency: 'USD' });
  assert.deepEqual(lib.checkoutEventValue('Monthly'), { value: 15, contentName: 'Monthly', currency: 'USD' });
});

test('ViewContent fires once per session', () => {
  const store = memoryStore();
  assert.equal(lib.shouldFireViewContent(store), true);
  lib.markViewContentFired(store);
  assert.equal(lib.shouldFireViewContent(store), false);
});

test('support / public-channel hrefs are Contact targets; Facebook and Full List are not', () => {
  const cfg = {
    SUPPORT: 'https://t.me/MMHQ_Support',
    PUBLIC_CHANNEL: 'https://t.me/TheMethodMafia',
    FACEBOOK_PAGE: 'https://www.facebook.com/share/19Q7KrfTBT/',
    FULL_LIST_POST: 'https://t.me/TheMethodmafia1/95'
  };
  assert.equal(lib.isContactHref('https://t.me/MMHQ_Support', cfg), true);
  assert.equal(lib.isContactHref('https://t.me/MMHQ_Support?text=hi', cfg), true);
  assert.equal(lib.isContactHref('https://t.me/TheMethodMafia', cfg), true);
  assert.equal(lib.isContactHref(cfg.FACEBOOK_PAGE, cfg), false);
  assert.equal(lib.isContactHref('https://themethodmafia.com/about.html', cfg), false);
  assert.equal(lib.isContactHref(cfg.FULL_LIST_POST, cfg), false);
});

test('reads click IDs from localStorage when sessionStorage is empty', () => {
  const session = memoryStore();
  const local = memoryStore({ mm_fbclid: 'from_local', mm_ttclid: 'tt_local', mm_fbc: 'fb.1.1.from_local' });
  const ids = lib.captureClickIds('', session, local);
  assert.equal(ids.fbclid, 'from_local');
  assert.equal(ids.ttclid, 'tt_local');
  assert.equal(ids.fbc, 'fb.1.1.from_local');
});

test('advanced matching passes email and telegram as external_id', () => {
  const am = lib.advancedMatching('Swa@Email.com', '@swa_hq');
  assert.equal(am.em, 'swa@email.com');
  assert.equal(am.external_id, '@swa_hq');
});
