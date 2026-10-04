'use strict';
/* Order Source spec (Swa/Manager): facebook / tiktok / telegram / direct / other.
   Priority: known utm_source → fbclid → ttclid → Telegram referrer / telegram utm →
   other (unknown non-empty utm_source) → direct (no signal at all). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lib = require(path.join(__dirname, '..', 'js', 'tracking-lib.js'));

function memoryStore(seed) {
  const data = Object.assign({}, seed);
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    _data: data
  };
}

test('deriveSource: known utm_source wins (case-insensitive, aliases)', () => {
  assert.equal(lib.deriveSource({ utm_source: 'facebook' }), 'facebook');
  assert.equal(lib.deriveSource({ utm_source: 'FaceBook ' }), 'facebook');
  assert.equal(lib.deriveSource({ utm_source: 'ig' }), 'facebook');
  assert.equal(lib.deriveSource({ utm_source: 'TikTok', fbclid: 'x' }), 'tiktok');
  assert.equal(lib.deriveSource({ utm_source: 'telegram', fbclid: 'x' }), 'telegram');
  assert.equal(lib.deriveSource({ utm_source: 'direct', fbclid: 'x' }), 'direct');
});

test('deriveSource: fbclid → facebook, then ttclid → tiktok (they beat an unknown utm)', () => {
  assert.equal(lib.deriveSource({ fbclid: 'IwAR1' }), 'facebook');
  assert.equal(lib.deriveSource({ ttclid: 'E.C.P' }), 'tiktok');
  assert.equal(lib.deriveSource({ fbclid: 'a', ttclid: 'b' }), 'facebook');
  assert.equal(lib.deriveSource({ utm_source: 'google', ttclid: 'b' }), 'tiktok');
});

test('deriveSource: Telegram referrer or telegram-ish utm → telegram', () => {
  assert.equal(lib.deriveSource({ referrer: 'https://t.me/methodmafia/123' }), 'telegram');
  assert.equal(lib.deriveSource({ referrer: 'https://web.telegram.org/k/' }), 'telegram');
  assert.equal(lib.deriveSource({ referrer: 'https://telegram.me/x' }), 'telegram');
  assert.equal(lib.deriveSource({ referrer: 'https://notat.me/x' }), 'direct');
  assert.equal(lib.deriveSource({ referrer: 'https://example.com/?u=t.me' }), 'direct');
  assert.equal(lib.deriveSource({ utm_source: 'telegram_channel' }), 'telegram');
  assert.equal(lib.deriveSource({ utm_source: 'tg-bot' }), 'telegram');
  assert.equal(lib.deriveSource({ utm_source: 'stg' }), 'other', 'no substring false positive (unknown → other)');
});

test('deriveSource: unknown non-empty utm → other; no signal at all → direct; manual Telegram → telegram', () => {
  assert.equal(lib.deriveSource({}), 'direct');
  assert.equal(lib.deriveSource(null), 'direct');
  assert.equal(lib.deriveSource({ utm_source: '   ' }), 'direct', 'blank utm = no signal');
  assert.equal(lib.deriveSource({ utm_source: 'google' }), 'other');
  assert.equal(lib.deriveSource({ utm_source: 'Newsletter', referrer: 'https://www.google.com/' }), 'other');
  assert.equal(lib.deriveSource({ referrer: 'https://www.google.com/' }), 'direct');
  assert.equal(lib.deriveSource({ manualTelegram: true, fbclid: 'x' }), 'telegram');
  lib.KNOWN_SOURCES.forEach((s) => assert.equal(lib.deriveSource({ utm_source: s }), s));
});

test('getAttribution: fresh ad click beats a stale session utm_source', () => {
  const s = memoryStore({ mm_utm_source: 'telegram' });
  const a = lib.getAttribution('?fbclid=NEW', s, memoryStore(), '', 'methodmafia.com');
  assert.equal(a.source, 'facebook');
  assert.equal(a.utm_source, 'telegram', 'raw utm kept as before');
});

test('getAttribution: remembered signals used when the order page has none', () => {
  const sess = memoryStore();
  const loc = memoryStore();
  lib.getAttribution('?utm_source=tiktok&utm_medium=paid', sess, loc, 'https://www.tiktok.com/', 'methodmafia.com');
  const later = lib.getAttribution('', sess, loc, 'https://methodmafia.com/', 'methodmafia.com');
  assert.equal(later.source, 'tiktok');
  // a fbclid from an earlier visit (localStorage) still counts on a new direct visit
  const nextVisit = lib.getAttribution('', memoryStore(), memoryStore({ mm_fbclid: 'old' }), '', 'methodmafia.com');
  assert.equal(nextVisit.source, 'facebook');
});

test('getAttribution: first external referrer of the session is kept (Telegram link → internal page → order)', () => {
  const sess = memoryStore();
  const a = lib.getAttribution('', sess, memoryStore(), 'https://t.me/methodmafia', 'methodmafia.com');
  assert.equal(a.source, 'telegram');
  assert.equal(sess.getItem('mm_referrer'), 'https://t.me/methodmafia');
  const b = lib.getAttribution('', sess, memoryStore(), 'https://www.methodmafia.com/', 'methodmafia.com');
  assert.equal(b.source, 'telegram');
  assert.equal(sess.getItem('mm_referrer'), 'https://t.me/methodmafia', 'own-site referrer never overwrites');
});

test('getAttribution: nothing at all → direct; explicit utm_source=direct stays direct', () => {
  assert.equal(lib.getAttribution('', memoryStore(), memoryStore(), '', 'methodmafia.com').source, 'direct');
  const s = memoryStore({ mm_fbclid: 'old' });
  assert.equal(lib.getAttribution('?utm_source=direct', s, memoryStore(), '', 'methodmafia.com').source, 'direct');
});

test('buildSheetTrackingFields: uses attr.source; old callers without source are normalized', () => {
  assert.equal(lib.buildSheetTrackingFields({ source: 'tiktok', utm_source: 'google' }).source, 'tiktok');
  assert.equal(lib.buildSheetTrackingFields({ utm_source: 'Facebook' }).source, 'facebook');
  assert.equal(lib.buildSheetTrackingFields({ utm_source: 'google', fbclid: 'x' }).source, 'facebook');
  assert.equal(lib.buildSheetTrackingFields({}).source, 'direct');
  assert.equal(lib.buildSheetTrackingFields({ utm_source: 'direct' }).source, 'direct');
  assert.equal(lib.buildSheetTrackingFields({ utm_source: 'google' }).source, 'other');
});

/* main.js getUtmData: both the MMTracking path and the no-library fallback send a spec value. */
function loadGetUtmData(ctx) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
  const start = src.indexOf('function getUtmData(){');
  const end = src.indexOf('/* legacy wrapper */', start);
  assert.ok(start > 0 && end > start, 'getUtmData found in main.js');
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end) + '\nthis.getUtmData = getUtmData;', ctx);
  return ctx.getUtmData;
}

test('main.js getUtmData (MMTracking path) passes document.referrer + hostname → source', () => {
  const sess = memoryStore();
  const fn = loadGetUtmData({
    MMTracking: lib, URLSearchParams, URL,
    location: { search: '', hostname: 'methodmafia.com' },
    document: { referrer: 'https://t.me/methodmafia' },
    sessionStorage: sess, localStorage: memoryStore()
  });
  const d = fn();
  assert.equal(d.source, 'telegram');
  assert.equal(d.utm_source, 'direct');
});

test('main.js getUtmData (fallback path, no MMTracking) uses the same priority', () => {
  const mk = (search, ref, sess, loc) => loadGetUtmData({
    URLSearchParams, URL, location: { search, hostname: 'methodmafia.com' }, document: { referrer: ref || '' },
    sessionStorage: sess || memoryStore(), localStorage: loc || memoryStore()
  })();
  assert.equal(mk('?utm_source=TikTok').source, 'tiktok');
  assert.equal(mk('?utm_source=google&fbclid=x').source, 'facebook');
  assert.equal(mk('?ttclid=y').source, 'tiktok');
  assert.equal(mk('', 'https://t.me/x').source, 'telegram');
  assert.equal(mk('?utm_source=google').source, 'other');
  assert.equal(mk('').source, 'direct');
});

test('getAttribution: fresh unknown utm (google) → other, even with an old stored fbclid; session keeps it', () => {
  const sess = memoryStore();
  const loc = memoryStore({ mm_fbclid: 'old' });
  assert.equal(lib.getAttribution('?utm_source=google', sess, loc, '', 'methodmafia.com').source, 'other');
  assert.equal(lib.getAttribution('?utm_source=tiktok', sess, loc, '', 'methodmafia.com').source, 'tiktok', 'new known utm wins');
});
