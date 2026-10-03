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
  const end = main.indexOf('function armSubmitButton');
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
  assert.equal(desktopBlocked.openTelegramSameGesture(support), 'handoff');
  assert.equal(stayed.href, 'http://127.0.0.1/index.html');

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

test('submit button is disabled only for a short guard, then restored with data-t', () => {
  const main = read('js/main.js');
  assert.match(main, /ORDER_SUBMIT_GUARD_MS = 2000/);
  const fnSrc = sliceFn(main, 'armSubmitButton').match(/function armSubmitButton\(btn\)\{[\s\S]*?\n\}/);
  assert.ok(fnSrc, 'armSubmitButton source');
  assert.match(fnSrc[0], /setAttribute\('data-t', 'handoffSent'\)/);
  assert.match(fnSrc[0], /setAttribute\('data-t', 'btnSubmit'\)/);
  assert.match(fnSrc[0], /btn\.disabled = false/);
  assert.ok(fnSrc[0].indexOf('handoffSent') < fnSrc[0].indexOf('btnSubmit'));

  const submit = main.match(/function submitOrder\(\)\{[\s\S]*?\n\}/)[0];
  const armAt = submit.indexOf('armSubmitButton(btn)');
  const openAt = submit.indexOf('openTelegramSameGesture(telegramUrl)');
  assert.ok(armAt !== -1 && armAt < openAt, 'guard starts before Telegram open');
  assert.equal(submit.includes('btn.textContent = t(\'handoffSent\')'), false);
  assert.doesNotMatch(submit, /location\.href/);

  let queued = null;
  const btn = {
    disabled: false,
    attrs: {},
    textContent: '',
    setAttribute: function(key, value){ this.attrs[key] = value; }
  };
  const arm = new Function('setTimeout', 't', 'ORDER_SUBMIT_GUARD_MS', fnSrc[0] + '\nreturn armSubmitButton;');
  const run = arm(
    function(fn, ms){ queued = { fn: fn, ms: ms }; return 1; },
    function(key){ return 'label:' + key; },
    2000
  );
  run(btn);
  assert.equal(btn.disabled, true);
  assert.equal(btn.attrs['data-t'], 'handoffSent');
  assert.equal(btn.textContent, 'label:handoffSent');
  assert.equal(queued.ms, 2000);

  const labels = { en: 'Submit Order', bn: 'অর্ডার সাবমিট করুন', hi: 'ऑर्डर सबमिट करें' };
  Object.keys(labels).forEach(function(lang){
    btn.textContent = 'label:handoffSent';
    const translated = new Function('setTimeout', 't', 'ORDER_SUBMIT_GUARD_MS', fnSrc[0] + '\nreturn armSubmitButton;')(
      function(fn){ fn(); return 1; },
      function(key){ return key === 'btnSubmit' ? labels[lang] : key; },
      2000
    );
    const again = {
      disabled: true,
      attrs: { 'data-t': 'handoffSent' },
      textContent: 'sent',
      setAttribute: function(key, value){ this.attrs[key] = value; }
    };
    translated(again);
    assert.equal(again.disabled, false, lang);
    assert.equal(again.attrs['data-t'], 'btnSubmit', lang);
    assert.equal(again.textContent, labels[lang], lang);
  });
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
