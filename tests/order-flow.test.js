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

function loadTranslations() {
  return Function(read('js/translations.js') + '\nreturn TRANSLATIONS;')();
}

test('buildSupportTelegramUrl opens @MMHQ_Support with encoded payment-proof text', () => {
  const url = flow.buildSupportTelegramUrl(
    'https://t.me/MMHQ_Support',
    'Order ID : MM-2026-3007\nI will send my payment screenshot here.'
  );
  assert.ok(url.startsWith('https://t.me/MMHQ_Support?'));
  assert.match(url, /text=/);
  const text = decodeURIComponent(url.split('text=')[1]);
  assert.match(text, /MM-2026-3007/);
  assert.match(text, /screenshot/i);
  assert.equal(flow.buildSupportTelegramUrl('https://t.me/MMHQ_Support/', ''), 'https://t.me/MMHQ_Support');
});

test('buildPaymentProofMessage includes order, plan, amount and selected payment method', () => {
  const msg = flow.buildPaymentProofMessage({
    orderId: 'MM-2026-3007',
    name: 'Rakib',
    email: 'rakib@example.com',
    telegram: '@rakib_h',
    language: 'EN',
    plan: 'Entry',
    amount: '$30',
    payment: 'Binance Pay'
  });
  assert.match(msg, /MM-2026-3007/);
  assert.match(msg, /Rakib/);
  assert.match(msg, /rakib@example.com/);
  assert.match(msg, /@rakib_h/);
  assert.match(msg, /Entry/);
  assert.match(msg, /\$30/);
  assert.match(msg, /Binance Pay/);
  assert.match(msg, /NEW ORDER/);
  assert.match(msg, /Language : EN/);
  assert.doesNotMatch(msg, /Please send me the payment details/);
  assert.match(msg, /screenshot/i);
});

test('openSupportTelegram reports blocked popup and still returns the Support link', () => {
  const opened = flow.openSupportTelegram(
    'https://t.me/MMHQ_Support',
    'hello',
    function(){ return null; }
  );
  assert.equal(opened.blocked, true);
  assert.ok(opened.url.indexOf('https://t.me/MMHQ_Support') === 0);

  const ok = flow.openSupportTelegram(
    'https://t.me/MMHQ_Support',
    'hello',
    function(url){ return { href: url, closed: false }; }
  );
  assert.equal(ok.blocked, false);
});

test('findContactMatch treats newest Pending/Submitted row as a soft duplicate', () => {
  const rows = [
    ['Timestamp','Order ID','Name','Email','Telegram','Plan','Amount','Payment','Src','Med','Camp','Status'],
    ['t1','MM-OLD','A','a@x.com','@rakib','Entry','30','bKash','','','','Expired'],
    ['t2','MM-2026-1111','A','a@x.com','@rakib','Entry','30','bKash','','','','Pending']
  ];
  const hit = flow.findContactMatch(rows, '@rakib', 'a@x.com');
  assert.equal(hit.orderId, 'MM-2026-1111');
  assert.equal(hit.pending, true);

  const submitted = flow.findContactMatch([
    rows[0],
    ['t','MM-2026-2222','B','b@x.com','@b','Monthly','15','Nagad','','','','Submitted']
  ], '@b', 'other@x.com');
  assert.equal(submitted.pending, true);
  assert.equal(submitted.orderId, 'MM-2026-2222');
});

test('findContactMatch prefers an existing Pending row over a later Active row', () => {
  const rows = [
    ['h'],
    ['t','MM-1','A','a@x.com','@rakib','Entry','30','bKash','','','','Pending'],
    ['t','MM-2','A','a@x.com','@rakib','Monthly','15','bKash','','','','Active']
  ];
  const hit = flow.findContactMatch(rows, 'rakib', 'A@X.COM');
  assert.equal(hit.orderId, 'MM-1');
  assert.equal(hit.pending, true);
  assert.equal(flow.findContactMatch(rows, '@nobody', 'nope@x.com'), null);
});

test('findContactMatch allows renew when no matching row is still Pending', () => {
  const rows = [
    ['h'],
    ['t','MM-1','A','a@x.com','@rakib','Entry','30','bKash','','','','Expired'],
    ['t','MM-2','A','a@x.com','@rakib','Monthly','15','bKash','','','','Active']
  ];
  const hit = flow.findContactMatch(rows, 'rakib', 'A@X.COM');
  assert.equal(hit.orderId, 'MM-2');
  assert.equal(hit.pending, false);
});

test('thank-you copy exists in EN/BN/HI and tells customer to pay then message Support with Order ID + SS', () => {
  const tr = loadTranslations();
  ['en','bn','hi'].forEach(function(lang) {
    assert.ok(tr[lang].thankTitle, lang + ' thankTitle');
    assert.ok(tr[lang].thankBody, lang + ' thankBody');
    assert.ok(tr[lang].thankTgBtn, lang + ' thankTgBtn');
    assert.ok(tr[lang].toastDupe, lang + ' toastDupe');
    assert.ok(tr[lang].thankDupeTitle, lang + ' thankDupeTitle');
    assert.ok(tr[lang].thankDupeBody, lang + ' thankDupeBody');
    const blob = [
      tr[lang].thankTitle, tr[lang].thankBody, tr[lang].thankTgBtn,
      tr[lang].thankDupeTitle, tr[lang].thankDupeBody,
      tr[lang].toastOk, tr[lang].toastDupe, tr[lang].thankStep1, tr[lang].thankStep2
    ].join(' ');
    assert.match(blob, /MMHQ_Support/);
    assert.match(blob.toLowerCase(), /order id/);
  });
  assert.match(tr.en.thankBody.toLowerCase(), /pay/);
  assert.match(tr.en.thankBody.toLowerCase(), /screenshot|ss\b/);
  assert.match(tr.en.toastDupe.toLowerCase(), /pending/);
  assert.doesNotMatch(tr.en.toastDupe.toLowerCase(), /could not save|error|failed/);
  assert.match(tr.bn.thankBody, /পেমেন্ট|পাঠান|স্ক্রিনশট|SS/);
  assert.match(tr.hi.thankBody, /पेमेंट|भेजें|स्क्रीनशॉट|SS/);
});

test('index keeps payment selector and shows post-submit recap + Support CTA', () => {
  const html = read('index.html');
  assert.match(html, /id="payBadges"/);
  assert.match(html, /id="orderSuccess"/);
  assert.match(html, /id="okOrderId"/);
  assert.match(html, /id="okPlan"/);
  assert.match(html, /id="okPay"/);
  assert.match(html, /id="okTgBtn"/);
  assert.match(html, /src="js\/order-flow\.js"/);
  const flowAt = html.indexOf('src="js/order-flow.js"');
  const mainAt = html.indexOf('src="js/main.js"');
  assert.ok(flowAt !== -1 && flowAt < mainAt, 'order-flow.js must load before main.js');
  assert.match(html, /data-t="thankStep1"/);
  assert.match(html, /data-t="thankDupeTitle"|thankTitle/);
  assert.doesNotMatch(html, /createChatInviteLink|AUTO_VIP|auto.?invite/i);
});

test('main.js shows success recap and never gates Telegram on Sheet JSON', () => {
  const main = read('js/main.js');
  assert.match(main, /showOrderOutcome|orderSuccess/);
  assert.match(main, /okTgBtn/);
  assert.doesNotMatch(main, /Please send me the payment details/);
  assert.doesNotMatch(main, /createChatInviteLink/);
  const submit = main.match(/function submitOrder\(\)\{[\s\S]*?\nfunction /);
  assert.ok(submit, 'submitOrder must exist');
  assert.match(submit[0], /mode:'no-cors'/);
  assert.doesNotMatch(submit[0], /interpretWriteResult/);
  assert.doesNotMatch(submit[0], /fetchWithTimeout/);
});

test('OrderProcessor refuses a new row when Telegram\/email already Pending', () => {
  const gs = read('apps-script/OrderProcessor.gs');
  assert.match(gs, /reason:\s*['"]pending['"]|reason:\s*['"]duplicate_pending['"]/);
  assert.match(gs, /dupe:\s*true/);
  assert.match(gs, /findContactMatch|findExistingOrder|checkDuplicate/);
  const doPost = gs.match(/function doPost\([\s\S]*?^function /m);
  assert.ok(doPost, 'doPost must exist');
  assert.match(doPost[0], /pending/i);
  assert.match(doPost[0], /ok:\s*false/);
});
