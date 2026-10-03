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

function loadOpenHelpers(main) {
  const start = main.indexOf('function prefersSameTabTelegram');
  const end = main.indexOf('function showOrderHandoff');
  assert.ok(start !== -1 && end > start, 'telegram open helpers must exist');
  return new Function('window', 'navigator', main.slice(start, end) + '\nreturn { prefersSameTabTelegram: prefersSameTabTelegram, openTelegramSameGesture: openTelegramSameGesture };');
}

test('mobile and in-app browsers go to t.me/MMHQ_Support in this tab; desktop popups stay on the page', () => {
  const main = read('js/main.js');
  assert.equal(main.includes('TELEGRAM_NAV_FALLBACK_MS'), false);
  assert.equal(main.includes(', 900'), false);
  assert.equal(main.includes('MM_OrdersBot'), false);
  assert.match(main, /https:\/\/t\.me\/MMHQ_Support/);

  const UAS = {
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36',
    facebook: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.70 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/484.0.0.63.85;]',
    telegram: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.70 Mobile Safari/537.36 Telegram-Android/11.1.3',
    desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
  };
  const support = 'https://t.me/MMHQ_Support?text=' + encodeURIComponent('Order ID : MM-2026-6341\nName : simanto');

  Object.keys(UAS).forEach(function(name) {
    if (name === 'desktop') return;
    const opened = [];
    const location = { href: 'http://127.0.0.1/index.html' };
    const api = loadOpenHelpers(main)(
      { location: location, open: function(){ opened.push('open'); return { closed: false }; } },
      { userAgent: UAS[name] }
    );
    assert.equal(api.prefersSameTabTelegram(), true, name);
    assert.equal(api.openTelegramSameGesture(support), 'navigate', name);
    assert.equal(location.href, support, name);
    assert.equal(opened.length, 0, name + ' must not trust window.open');
    assert.equal(location.href.indexOf('https://t.me/MMHQ_Support?text='), 0, name);
    assert.equal(location.href.indexOf('MM_OrdersBot'), -1, name);
    assert.match(decodeURIComponent(location.href.split('text=')[1]), /MM-2026-6341/);
    assert.match(decodeURIComponent(location.href.split('text=')[1]), /simanto/);
  });

  const stayed = { href: 'http://127.0.0.1/index.html' };
  const popped = [];
  const desktopBlocked = loadOpenHelpers(main)(
    { location: stayed, open: function(){ return null; } },
    { userAgent: UAS.desktop }
  );
  assert.equal(desktopBlocked.prefersSameTabTelegram(), false);
  assert.equal(desktopBlocked.openTelegramSameGesture(support), 'navigate');
  assert.equal(stayed.href, support);

  const desktopOpen = loadOpenHelpers(main)(
    {
      location: { href: 'stay' },
      open: function(url, target){
        popped.push({ url: url, target: target });
        return { closed: false };
      }
    },
    { userAgent: UAS.desktop }
  );
  assert.equal(desktopOpen.openTelegramSameGesture(support), 'popup');
  assert.equal(popped[0].target, '_blank');
  assert.equal(popped[0].url.indexOf('https://t.me/MMHQ_Support?text='), 0);
});

test('submit stays a live t.me link: no disable, no Redirecting toast, no auto-copy', () => {
  const main = read('js/main.js');
  const html = read('index.html');
  assert.equal(main.includes('armSubmitButton'), false);
  assert.equal(main.includes('ORDER_SUBMIT_GUARD_MS'), false);
  assert.match(html, /<a class="submit-btn" id="submitBtn" href="https:\/\/t\.me\/MMHQ_Support" onclick="return submitOrder\(event\)" data-t="btnSubmit">/);

  const submit = main.match(/function submitOrder\(e\)\{[\s\S]*?\n\}/)[0];
  assert.equal(submit.includes('disabled'), false);
  assert.equal(submit.includes('toastOk'), false);
  assert.equal(submit.includes('clipboard'), false);
  assert.equal(submit.includes('execCommand'), false);
  assert.equal(submit.includes('await '), false);
  assert.ok(submit.indexOf('postOrderToSheet(payload)') < submit.indexOf("window.open(telegramUrl, '_blank')"));
  assert.match(submit, /popup\.closed === true/);
  assert.match(submit, /window\.location\.href = telegramUrl/);
  assert.match(submit, /return true/);

  const tr = loadTranslations();
  ['en', 'bn', 'hi'].forEach(function(lang) {
    assert.doesNotMatch(tr[lang].toastOk, /Redirecting/i);
    assert.equal(tr[lang].btnSubmit.length > 1, true);
  });

  const handoffStart = main.indexOf('function showOrderHandoff');
  const handoffEnd = main.indexOf('function postOrderToSheet');
  const handoff = main.slice(handoffStart, handoffEnd);
  assert.equal(handoff.includes('clipboard'), false);
  assert.equal(handoff.includes('execCommand'), false);
  assert.match(sliceFn(main, 'copyOrderHandoff'), /navigator\.clipboard\.writeText/);
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
  const draft = main.match(/function collectOrderDraft\(showErrors\)\{[\s\S]*?\n\}/)[0];
  const submit = main.match(/function submitOrder\(e\)\{[\s\S]*?\n\}/)[0];
  assert.ok(draft.indexOf("toast(t('errFill')") !== -1);
  assert.ok(draft.indexOf("toast(t('errPay')") !== -1);
  assert.ok(submit.indexOf('collectOrderDraft(true)') < submit.indexOf('postOrderToSheet(payload)'));
  assert.equal(submit.includes('navigator.clipboard'), false);
  assert.equal(main.slice(main.indexOf('function showOrderHandoff'), main.indexOf('function postOrderToSheet')).includes('writeText'), false);
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
