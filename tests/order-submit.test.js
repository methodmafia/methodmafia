'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadTranslations() {
  const src = read('js/translations.js');
  return Function(src + '\nreturn TRANSLATIONS;')();
}

function sliceFn(src, name) {
  const start = src.indexOf('function ' + name);
  assert.ok(start !== -1, name + ' must exist');
  return src.slice(start);
}

test('Telegram opens in the same click, with location.href if the popup is blocked', () => {
  const main = read('js/main.js');
  const fnSrc = sliceFn(main, 'openTelegramSameGesture').match(/function openTelegramSameGesture\(url\)\{[\s\S]*?\n\}/);
  assert.ok(fnSrc, 'openTelegramSameGesture source');
  assert.match(fnSrc[0], /window\.open\(url, '_blank'\)/);
  assert.match(fnSrc[0], /location\.href = url/);
  assert.match(main, /TELEGRAM_NAV_FALLBACK_MS = 250/);
  assert.ok(250 <= 300);
  assert.equal(main.includes(', 900'), false);
  assert.equal(fnSrc[0].includes('setTimeout'), true);
  assert.ok(fnSrc[0].indexOf('window.open') < fnSrc[0].indexOf('setTimeout'));

  const opened = [];
  let scheduled = null;
  const location = { href: '' };
  const run = new Function('window', 'location', 'setTimeout', 'TELEGRAM_NAV_FALLBACK_MS', fnSrc[0] + '\nreturn openTelegramSameGesture;');

  const blocked = run(
    { open: function(){ return null; } },
    location,
    function(fn, ms){ scheduled = { fn: fn, ms: ms }; return 1; },
    250
  );
  assert.equal(blocked('https://t.me/MMHQ_Support?text=hi'), 'navigate');
  assert.equal(location.href, '');
  assert.equal(scheduled.ms, 250);
  scheduled.fn();
  assert.equal(location.href, 'https://t.me/MMHQ_Support?text=hi');

  const popped = [];
  const allow = run(
    { open: function(url, target){ popped.push({ url: url, target: target }); return { closed: false }; } },
    { href: 'stay' },
    function(){ throw new Error('must not delay a successful popup'); },
    250
  );
  assert.equal(allow('https://t.me/MMHQ_Support?text=order'), 'popup');
  assert.equal(popped[0].target, '_blank');
  assert.equal(popped[0].url, 'https://t.me/MMHQ_Support?text=order');
});

test('order message includes the fields Swa expects and the FINAL closing line', () => {
  const main = read('js/main.js');
  const fnSrc = sliceFn(main, 'buildOrderTelegramText').match(/function buildOrderTelegramText\(fields\)\{[\s\S]*?\n\}/);
  const build = new Function(fnSrc[0] + '\nreturn buildOrderTelegramText;')();
  const text = build({
    orderId: 'MM-2026-3007',
    name: 'Swa Test',
    email: 'swa@example.com',
    telegram: '@swa_test',
    language: 'BN',
    plan: 'Entry',
    amount: '$30',
    payment: 'bKash',
    localAmount: '৳৩,৫০০'
  });
  assert.match(text, /NEW ORDER/);
  assert.match(text, /Order ID : MM-2026-3007/);
  assert.match(text, /Name     : Swa Test/);
  assert.match(text, /Email    : swa@example.com/);
  assert.match(text, /Telegram : @swa_test/);
  assert.match(text, /Language : BN/);
  assert.match(text, /Plan     : Entry/);
  assert.match(text, /Amount   : \$30/);
  assert.match(text, /Amount \(BDT\): ৳৩,৫০০/);
  assert.match(text, /Payment  : bKash/);
  assert.match(text, /I would like to complete my payment\. Please send me the payment details\./);

  const noBdt = build({
    orderId: 'MM-2026-1',
    name: 'A',
    email: 'a@b.co',
    telegram: '@abcde',
    language: 'EN',
    plan: 'Monthly',
    amount: '$15',
    payment: 'Binance',
    localAmount: ''
  });
  assert.equal(noBdt.includes('Amount (BDT)'), false);
});

test('handoff box and EN/BN/HI copy exist, and validation still returns before the Sheet post', () => {
  const html = read('index.html');
  assert.match(html, /id="orderHandoff"/);
  assert.match(html, /id="orderHandoffSummary"/);
  assert.match(html, /id="orderCopyBtn"/);
  assert.match(html, /id="orderTgLink"/);
  assert.match(html, /href="https:\/\/t\.me\/MMHQ_Support"/);
  assert.match(html, /data-t="handoffCopy"/);
  assert.match(html, /data-t="handoffTg"/);

  const tr = loadTranslations();
  assert.equal(tr.en.handoffCopy, 'Copy order');
  assert.equal(tr.en.handoffTg, 'Send order on Telegram');
  ['en', 'bn', 'hi'].forEach(function(lang) {
    ['handoffTitle', 'handoffNote', 'handoffCopy', 'handoffTg', 'handoffSent', 'handoffCopied', 'handoffCopyFail'].forEach(function(key) {
      assert.ok(tr[lang][key] && tr[lang][key].length > 1, lang + '.' + key);
    });
  });
  assert.notEqual(tr.bn.handoffTg, tr.en.handoffTg);
  assert.notEqual(tr.hi.handoffCopy, tr.en.handoffCopy);

  const main = read('js/main.js');
  const submit = main.match(/function submitOrder\(\)\{[\s\S]*?\n\}/)[0];
  const fetchAt = submit.indexOf('fetch(CONFIG.SHEET_URL');
  const errAt = submit.indexOf("toast(t('errFill')");
  const payAt = submit.indexOf("toast(t('errPay')");
  assert.ok(errAt !== -1 && errAt < fetchAt);
  assert.ok(payAt !== -1 && payAt < fetchAt);
  assert.ok(submit.indexOf('showOrderHandoff') < submit.indexOf('openTelegramSameGesture'));
  assert.match(main, /function showOrderHandoff\(text, telegramUrl\)\{[\s\S]*?navigator\.clipboard\.writeText\(text\)/);
});

test('browser pages do not fire Purchase; order-status lookup and confirmed UI stay', () => {
  ['js/main.js', 'js/pixels.js', 'js/tracking-lib.js', 'js/pages.js', 'js/sheet-client.js'].forEach(function(rel) {
    const src = read(rel);
    assert.doesNotMatch(src, /fbq\(\s*['"]track['"]\s*,\s*['"]Purchase['"]/);
    assert.doesNotMatch(src, /CompletePayment/);
    assert.doesNotMatch(src, /gtag\(\s*['"]event['"]\s*,\s*['"]purchase['"]/);
    assert.doesNotMatch(src, /initPurchaseConfirm/);
  });

  const main = read('js/main.js');
  assert.match(main, /buildStatusLookupUrl/);
  assert.match(main, /function checkOrder\(/);
  assert.match(main, /confirmedBackup/);
  assert.match(main, /statusFetchOptions/);
  assert.match(read('order-status.html'), /id="statusResult"/);
  assert.match(read('payment.html'), /data-href="SUPPORT"/);

  const guide = read('GUIDE.md');
  assert.match(guide, /no-cors/);
  assert.match(guide, /keepalive/);
  assert.match(guide, /Pending/);
  assert.match(guide, /CapiPurchase/);
  assert.doesNotMatch(guide, /FB Pixel-এ `Purchase`/);
});
