'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const sheet = require(path.join(__dirname, '..', 'js', 'sheet-client.js'));

const SHEET_URL = 'https://script.google.com/macros/s/EXAMPLE/exec';

test('write success requires HTTP ok plus JSON {ok:true}', () => {
  assert.equal(sheet.isWriteSuccess({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: true },
    text: '{"ok":true}'
  }), true);

  assert.equal(sheet.isWriteSuccess({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: true, dupe: true },
    text: '{"ok":true,"dupe":true}'
  }), true);
});

test('opaque CORS response is never a write success', () => {
  assert.equal(sheet.isWriteSuccess({
    type: 'opaque',
    ok: true,
    status: 0,
    json: null,
    text: ''
  }), false);
});

test('HTTP error or missing {ok:true} is never a write success', () => {
  assert.equal(sheet.isWriteSuccess({
    type: 'cors',
    ok: false,
    status: 500,
    json: { ok: true },
    text: '{"ok":true}'
  }), false);

  assert.equal(sheet.isWriteSuccess({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: false, error: 'boom' },
    text: '{"ok":false}'
  }), false);

  assert.equal(sheet.isWriteSuccess({
    type: 'cors',
    ok: true,
    status: 200,
    json: null,
    text: '<html>Google interstitial</html>'
  }), false);

  assert.equal(sheet.isWriteSuccess({
    type: 'cors',
    ok: true,
    status: 200,
    json: { success: true },
    text: '{"success":true}'
  }), false);

  assert.equal(sheet.isWriteSuccess(null), false);
});

test('escapeHtml encodes markup so order IDs cannot inject HTML', () => {
  assert.equal(sheet.escapeHtml('MM-2026-3007'), 'MM-2026-3007');
  assert.equal(sheet.escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(sheet.escapeHtml('a&b'), 'a&amp;b');
});

test('parseJsonSafe only returns objects parsed from JSON', () => {
  assert.deepEqual(sheet.parseJsonSafe('{"ok":true}'), { ok: true });
  assert.equal(sheet.parseJsonSafe(''), null);
  assert.equal(sheet.parseJsonSafe('<!doctype html>'), null);
  assert.equal(sheet.parseJsonSafe(null), null);
});

test('status lookup URL is public and never includes a token', () => {
  const url = sheet.buildStatusLookupUrl(SHEET_URL, 'mm-2026-3007');
  assert.ok(url.startsWith(SHEET_URL));
  assert.match(url, /action=status/);
  assert.match(url, /orderId=MM-2026-3007/);
  assert.equal(url.includes('token='), false);
  assert.equal(url.toLowerCase().includes('admin_token'), false);

  const dirty = sheet.buildStatusLookupUrl(SHEET_URL + '?token=SECRET&foo=1', 'MM-2026-5114');
  assert.equal(dirty.includes('token='), false);
  assert.equal(dirty.includes('SECRET'), false);
  assert.match(dirty, /action=status/);
  assert.match(dirty, /orderId=MM-2026-5114/);

  assert.equal(sheet.buildStatusLookupUrl('', 'MM-1'), '');
  assert.equal(sheet.buildStatusLookupUrl(SHEET_URL, ''), '');
});

test('status lookup interprets Active, reject, and not-found JSON', () => {
  const active = sheet.interpretStatusResult({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: true, found: true, orderId: 'MM-2026-3007', status: 'Active', plan: 'Entry' }
  });
  assert.equal(active.kind, 'found');
  assert.equal(active.orderId, 'MM-2026-3007');
  assert.equal(active.status, 'active');
  assert.equal(active.statusRaw, 'Active');
  assert.equal(active.plan, 'Entry');

  const rejected = sheet.interpretStatusResult({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: true, found: true, orderId: 'MM-2026-5114', status: 'reject' }
  });
  assert.equal(rejected.kind, 'found');
  assert.equal(rejected.status, 'reject');

  const missing = sheet.interpretStatusResult({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: true, found: false, orderId: 'MM-2026-0000' }
  });
  assert.equal(missing.kind, 'not_found');
});

test('status lookup fails closed on opaque, HTML, or unauthorized payloads', () => {
  assert.equal(sheet.interpretStatusResult({
    type: 'opaque',
    ok: true,
    status: 0,
    json: null
  }).kind, 'lookup_failed');

  assert.equal(sheet.interpretStatusResult({
    type: 'cors',
    ok: true,
    status: 200,
    json: null,
    text: '<html>Unauthorized</html>'
  }).kind, 'lookup_failed');

  assert.equal(sheet.interpretStatusResult({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: false, error: 'Unauthorized' }
  }).kind, 'lookup_failed');

  assert.equal(sheet.interpretStatusResult(null).kind, 'lookup_failed');
});

test('interpretWriteResult treats pending duplicate as a soft client path, not a generic fail', () => {
  const pending = sheet.interpretWriteResult({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: false, dupe: true, reason: 'pending', orderId: 'MM-2026-1111' },
    text: '{"ok":false,"dupe":true}'
  });
  assert.equal(pending.ok, false);
  assert.equal(pending.reason, 'duplicate_pending');
  assert.equal(pending.dupe, true);
  assert.equal(pending.orderId, 'MM-2026-1111');

  const writtenDupe = sheet.interpretWriteResult({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: true, dupe: true },
    text: '{"ok":true,"dupe":true}'
  });
  assert.equal(writtenDupe.ok, true);
  assert.equal(writtenDupe.dupe, true);

  const boom = sheet.interpretWriteResult({
    type: 'cors',
    ok: true,
    status: 200,
    json: { ok: false, error: 'boom' },
    text: '{"ok":false}'
  });
  assert.equal(boom.ok, false);
  assert.equal(boom.reason, 'sheet');
});

test('write fetch is CORS + text/plain so the JSON body can be read', () => {
  const opts = sheet.writeFetchOptions({ orderId: 'MM-2026-3007', fbclid: 'abc' });
  assert.equal(opts.method, 'POST');
  assert.equal(opts.mode, 'cors');
  assert.equal(opts.credentials, 'omit');
  assert.match(opts.headers['Content-Type'], /text\/plain/);
  assert.equal(JSON.parse(opts.body).fbclid, 'abc');
});

test('sheet write timeout is 8–12 seconds and hanging fetch is aborted', async () => {
  assert.equal(typeof sheet.fetchWithTimeout, 'function');
  assert.ok(sheet.SHEET_WRITE_TIMEOUT_MS >= 8000);
  assert.ok(sheet.SHEET_WRITE_TIMEOUT_MS <= 12000);

  let aborted = false;
  const hanging = function(url, opts){
    return new Promise(function(_, reject){
      if(opts && opts.signal){
        opts.signal.addEventListener('abort', function(){
          aborted = true;
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  };
  const t0 = Date.now();
  await assert.rejects(
    () => sheet.fetchWithTimeout('https://example.invalid', {}, 40, hanging),
    function(err){ return err && err.reason === 'timeout'; }
  );
  assert.ok(Date.now() - t0 < 400, 'timeout must not hang');
  assert.equal(aborted, true);
});

test('normalizeStatus maps reject aliases and known Sheet values', () => {
  assert.equal(sheet.normalizeStatus('Active'), 'active');
  assert.equal(sheet.normalizeStatus('PENDING'), 'pending');
  assert.equal(sheet.normalizeStatus('reject'), 'reject');
  assert.equal(sheet.normalizeStatus('Rejected'), 'reject');
  assert.equal(sheet.normalizeStatus('Verifying'), 'verifying');
  assert.equal(sheet.normalizeStatus('Expired'), 'expired');
  assert.equal(sheet.normalizeStatus(''), 'unknown');
});
