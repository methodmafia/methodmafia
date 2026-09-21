'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const flow = require(path.join(ROOT, 'js', 'order-flow.js'));

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function submitOrderSource() {
  const main = read('js/main.js');
  const match = main.match(/function submitOrder\(\)\{[\s\S]*?\nfunction /);
  assert.ok(match, 'submitOrder function must exist');
  return match[0];
}

test('submitOrder posts the Sheet with fire-and-forget no-cors (does not wait for JSON)', () => {
  const body = submitOrderSource();
  assert.match(body, /fetch\(CONFIG\.SHEET_URL, \{\s*method:'POST',\s*mode:'no-cors',\s*headers:\{'Content-Type':'text\/plain;charset=utf-8'\},\s*body: JSON\.stringify\(payload\)\s*\}\)\.catch\(\(\)=>\{\}\);/);
  assert.doesNotMatch(body, /fetchWithTimeout/);
  assert.doesNotMatch(body, /interpretWriteResult/);
  assert.doesNotMatch(body, /writeFetchOptions/);
  assert.doesNotMatch(body, /mode:'cors'|mode: "cors"|mode: 'cors'/);
  assert.doesNotMatch(body, /\.then\(/);
});

test('submitOrder toasts, then opens Support after 900ms and re-enables the button', () => {
  const body = submitOrderSource();
  const toastAt = body.indexOf("toast(t('toastOk'))");
  const timeoutAt = body.indexOf('setTimeout');
  const openAt = body.indexOf("window.open(CONFIG.SUPPORT + '?text=' + msg, '_blank')");
  const enableAt = body.lastIndexOf('btn.disabled = false');
  assert.ok(toastAt !== -1, 'must toast toastOk without waiting on Sheet');
  assert.ok(timeoutAt !== -1 && toastAt < timeoutAt, 'toastOk must run before the 900ms timer');
  assert.ok(openAt !== -1, "must window.open(CONFIG.SUPPORT + '?text=' + msg)");
  assert.ok(enableAt !== -1 && openAt < enableAt, 'button re-enable must be in the same timeout as Telegram');
  assert.match(body, /setTimeout\(\(\)=>\{[\s\S]*?window\.open\(CONFIG\.SUPPORT \+ '\?text=' \+ msg, '_blank'\);[\s\S]*?btn\.disabled = false;[\s\S]*?\}, 900\)/);
});

test('self-test: button re-enables ~1s; Support opens with NEW ORDER text', () => {
  const body = submitOrderSource();
  const timeoutSrc = body.match(/setTimeout\(\(\)=>\{[\s\S]*?\}, 900\);/);
  assert.ok(timeoutSrc, 'submitOrder must use the proven 900ms window.open timeout');

  const btn = { disabled: true };
  const opened = [];
  let scheduledMs = null;
  let queued = null;
  const fakeSetTimeout = function(fn, ms){
    scheduledMs = ms;
    queued = fn;
    return 1;
  };
  const fakeWindow = {
    open: function(url, target){
      opened.push({ url: url, target: target });
      return { closed: false };
    }
  };
  const CONFIG = { SUPPORT: 'https://t.me/MMHQ_Support' };
  const proof = flow.buildPaymentProofMessage({
    orderId: 'MM-2026-3007',
    name: 'Rakib',
    email: 'rakib@example.com',
    telegram: '@rakib_h',
    language: 'EN',
    plan: 'Entry',
    amount: '$30',
    payment: 'Binance Pay'
  });
  const msg = encodeURIComponent(proof);

  const run = new Function('setTimeout', 'window', 'CONFIG', 'msg', 'btn', timeoutSrc[0]);
  run(fakeSetTimeout, fakeWindow, CONFIG, msg, btn);

  assert.equal(scheduledMs, 900, 'Telegram open is delayed ~1s (900ms)');
  assert.equal(btn.disabled, true, 'button stays disabled until the timeout fires');
  assert.equal(opened.length, 0, 'must not open Telegram before the timeout');

  queued();

  assert.equal(btn.disabled, false, 'button re-enables when the timeout fires');
  assert.equal(opened.length, 1);
  assert.equal(opened[0].target, '_blank');
  assert.ok(opened[0].url.startsWith('https://t.me/MMHQ_Support?text='));
  const text = decodeURIComponent(opened[0].url.split('text=')[1]);
  assert.match(text, /NEW ORDER/);
  assert.match(text, /MM-2026-3007/);
  assert.match(text, /Entry/);
  assert.match(text, /Binance Pay/);
  assert.match(text, /Language : EN/);
});

test('hanging Sheet fetch does not delay Telegram or button re-enable', () => {
  const body = submitOrderSource();
  const start = body.indexOf('fetch(CONFIG.SHEET_URL');
  const end = body.indexOf('}, 900);');
  assert.ok(start !== -1 && end !== -1 && start < end, 'fetch + 900ms timeout block must exist');
  const block = body.slice(start, end + '}, 900);'.length);

  const btn = { disabled: true };
  const opened = [];
  let toasted = null;
  let stored = null;
  let scheduledMs = null;
  let queued = null;
  let fetchCalls = 0;
  const hangingFetch = function(url, opts){
    fetchCalls += 1;
    assert.equal(url, 'https://sheet.test/exec');
    assert.equal(opts.mode, 'no-cors');
    return new Promise(function(){ /* never settles — live CORS hang */ });
  };

  const run = new Function(
    'fetch', 'CONFIG', 'payload', 'orderId', 'handle', 'SELECTED_PAY',
    'localStorage', 'toast', 't', 'MMSheet', 'MMOrderFlow', 'showOrderOutcome',
    'setTimeout', 'window', 'btn',
    block
  );

  run(
    hangingFetch,
    { SHEET_URL: 'https://sheet.test/exec', SUPPORT: 'https://t.me/MMHQ_Support' },
    {
      name: 'Rakib',
      email: 'rakib@example.com',
      language: 'en',
      plan: 'Entry',
      amount: '$30'
    },
    'MM-2026-3007',
    '@rakib_h',
    'Binance Pay',
    { setItem: function(k, v){ stored = k + '=' + v; } },
    function(msg){ toasted = msg; },
    function(key){ return key === 'toastOk' ? 'ok' : key; },
    { sheetLanguageLabel: function(code){ return String(code || 'en').toUpperCase(); } },
    flow,
    function(){},
    function(fn, ms){ scheduledMs = ms; queued = fn; return 1; },
    { open: function(url, target){ opened.push({ url: url, target: target }); return {}; } },
    btn
  );

  assert.equal(fetchCalls, 1);
  assert.equal(toasted, 'ok');
  assert.equal(stored, 'mm_last_order=MM-2026-3007');
  assert.equal(scheduledMs, 900);
  assert.equal(btn.disabled, true);
  assert.equal(opened.length, 0);

  queued();

  assert.equal(btn.disabled, false);
  assert.equal(opened.length, 1);
  const text = decodeURIComponent(opened[0].url.split('text=')[1]);
  assert.match(text, /NEW ORDER/);
  assert.match(text, /Binance Pay/);
  assert.match(text, /Entry/);
});

test('config Support URL is t.me/MMHQ_Support and payload still sends language', () => {
  const cfg = read('config.js');
  assert.match(cfg, /SUPPORT:\s*"https:\/\/t\.me\/MMHQ_Support"/);
  const payload = read('js/main.js').match(/const payload = \{[\s\S]*?\n  \};/);
  assert.ok(payload, 'submit payload object must exist');
  assert.match(payload[0], /language:/);
});
