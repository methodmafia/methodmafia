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

const UAS = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36',
  facebook: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.70 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/484.0.0.63.85;]',
  telegram: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.70 Mobile Safari/537.36 Telegram-Android/11.1.3',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
};

function loadPrefers(main) {
  const start = main.indexOf('function prefersSameTabTelegram');
  const end = main.indexOf('function supportBaseUrl');
  assert.ok(start !== -1 && end > start);
  return new Function('navigator', main.slice(start, end) + '\nreturn prefersSameTabTelegram;');
}

function loadSubmitRuntime(opts) {
  const main = read('js/main.js');
  const start = main.indexOf('function makeOrderId');
  const end = main.indexOf('function initScroll');
  assert.ok(start !== -1 && end > start, 'order runtime slice');
  const beacons = [];
  const fetches = [];
  const opens = [];
  const listeners = {};
  const net = {
    beaconOk: !(opts && opts.beaconOk === false),
    fetchThrows: !!(opts && opts.fetchThrows)
  };
  const location = { href: 'http://127.0.0.1/index.html' };
  function cls() {
    return { add(){}, remove(){}, contains(){ return false; }, toggle(){} };
  }
  const fields = {
    iName: { value: 'Swa Test', classList: cls() },
    iEmail: { value: 'swa@example.com', classList: cls() },
    iTelegram: { value: '@swa_test', classList: cls() },
    iLanguage: { value: 'en' },
    submitBtn: { tagName: 'A', href: 'https://t.me/MMHQ_Support', disabled: false },
    toast: { textContent: '', classList: cls() },
    orderHandoff: { hidden: true, classList: cls() },
    orderHandoffSummary: { textContent: '' },
    orderTgLink: { href: '' }
  };
  const windowObj = {
    location: location,
    open: function(url, target) {
      opens.push({ url: url, target: target });
      if (opts && opts.blockPopup) return null;
      return { closed: false };
    },
    addEventListener: function(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    }
  };
  const navigatorObj = {
    userAgent: (opts && opts.ua) || UAS.desktop,
    sendBeacon: function(_url, body) {
      if (!net.beaconOk) return false;
      beacons.push(String(body));
      return true;
    }
  };
  const documentObj = {
    getElementById: function(id) { return fields[id] || null; },
    querySelectorAll: function() { return []; }
  };
  const src = [
    'var LANG = "en";',
    'var SELECTED_PAY = "Binance Pay";',
    'var SELECTED_PLAN = "entry";',
    'var SELECTED_PREF_LANG = "en";',
    'var CONFIG = { SUPPORT: "https://t.me/MMHQ_Support", SHEET_URL: "https://script.google.com/macros/s/x/exec", ENTRY_USD: "$30", MONTHLY_USD: "$15", ENTRY_BDT: "৳1", MONTHLY_BDT: "৳2", META_PIXEL: "" };',
    'var MMSheet = {',
    '  normalizeOrderLanguage: function(v){ return v === "bn" || v === "hi" ? v : "en"; },',
    '  sheetLanguageLabel: function(v){ return String(v || "en").toUpperCase(); },',
    '  writeFetchOptions: function(payload){ return { method:"POST", mode:"no-cors", keepalive:true, body: JSON.stringify(payload) }; }',
    '};',
    'function getUtmData(){ return { utm_source:"direct", utm_medium:"", utm_campaign:"", fbclid:"", ttclid:"" }; }',
    'function t(key){ return key; }',
    main.slice(start, end),
    'function fetch(){',
    '  if(net.fetchThrows) throw new Error("fetch failed");',
    '  fetches.push(1);',
    '  return { catch: function(){ return this; } };',
    '}',
    'function forgetSentLatch(){ ORDER_SENT_ID = ""; }',
    'function sentLatch(){ return ORDER_SENT_ID; }',
    'return { submitOrder: submitOrder, noteOrderFieldEdit: noteOrderFieldEdit, refreshSubmitHref: refreshSubmitHref, forgetSentLatch: forgetSentLatch, prefersSameTabTelegram: prefersSameTabTelegram, sentLatch: sentLatch };'
  ].join('\n');
  const run = new Function('window', 'document', 'navigator', 'net', 'fetches', src);
  const api = run(windowObj, documentObj, navigatorObj, net, fetches);
  api.beacons = beacons;
  api.fetches = fetches;
  api.net = net;
  api.opens = opens;
  api.location = location;
  api.fields = fields;
  api.pageShow = function(persisted) {
    (listeners.pageshow || []).forEach(function(fn) { fn({ persisted: persisted }); });
  };
  api.click = function() {
    return api.submitOrder({ preventDefault: function(){} });
  };
  return api;
}

function orderIdFromHref(href) {
  const text = decodeURIComponent(String(href || '').split('text=')[1] || '');
  const match = text.match(/Order ID : (MM-\d+-\d+)/);
  return match ? match[1] : '';
}

function loadFormControls() {
  const main = read('js/main.js');
  const start = main.indexOf("let SELECTED_PAY = ''");
  const end = main.indexOf('function initScroll');
  assert.ok(start !== -1 && end > start, 'form control slice');
  const beacons = [];
  function withClassList(el, initial) {
    const classes = new Set(String(initial || '').split(/\s+/).filter(Boolean));
    el.classList = {
      add: function(name) { classes.add(name); },
      remove: function(name) { classes.delete(name); },
      contains: function(name) { return classes.has(name); }
    };
    el.attrs = {};
    el.setAttribute = function(key, value) { this.attrs[key] = value; };
    el.getAttribute = function(key) { return this.attrs[key]; };
    el.click = function() {
      if (typeof this.onclick === 'function') this.onclick.call(this);
    };
    return el;
  }
  function button(className) {
    return withClassList({ className: className, dataset: {}, parentElement: null }, className);
  }
  const planEntry = button('plan-opt sel');
  const planMonthly = button('plan-opt');
  const langBn = button('lang-pref-opt');
  const langEn = button('lang-pref-opt sel');
  const langHi = button('lang-pref-opt');
  const payBinance = button('pay-opt');
  const payOther = button('pay-opt');
  payBinance.dataset.pay = 'Binance Pay';
  payOther.dataset.pay = 'Other';
  const payBadges = withClassList({ className: 'pay-select-row', children: [payBinance, payOther] }, 'pay-select-row');
  Object.defineProperty(payBadges, 'innerHTML', {
    configurable: true,
    set: function(value) {
      const names = [];
      const re = /data-pay="([^"]*)"/g;
      let match;
      while ((match = re.exec(String(value)))) names.push(match[1]);
      this.children = names.map(function(name) {
        const el = button('pay-opt');
        el.dataset.pay = name;
        return el;
      });
    }
  });
  const fields = {
    iName: { value: 'Swa Test', classList: { add(){}, remove(){} } },
    iEmail: { value: 'swa@example.com', classList: { add(){}, remove(){} } },
    iTelegram: { value: '@swa_test', classList: { add(){}, remove(){} } },
    iLanguage: { value: 'en' },
    submitBtn: { tagName: 'A', href: 'https://t.me/MMHQ_Support', disabled: false },
    payBadges: payBadges,
    orderHandoff: { hidden: true, classList: { add(){} } },
    orderHandoffSummary: { textContent: '' },
    orderTgLink: { href: '' }
  };
  const lists = {
    '.plan-opt': [planEntry, planMonthly],
    '.lang-pref-opt': [langBn, langEn, langHi],
    '.faq-item': []
  };
  const documentObj = {
    getElementById: function(id) { return fields[id] || null; },
    querySelectorAll: function(sel) { return lists[sel] || []; }
  };
  const windowObj = {
    location: { href: 'http://127.0.0.1/index.html' },
    open: function() { return { closed: false }; },
    addEventListener: function() {}
  };
  const navigatorObj = {
    userAgent: UAS.desktop,
    sendBeacon: function(_url, body) {
      beacons.push(String(body));
      return true;
    }
  };
  const src = [
    'var LANG = "en";',
    'var PAYMENTS = { en: [["a","Binance Pay"],["b","Other"]], bn: [["a","বিকাশ"],["b","অন্যান্য"]], hi: [["a","Binance Pay"],["b","Other"]] };',
    'var CONFIG = { SUPPORT: "https://t.me/MMHQ_Support", SHEET_URL: "https://script.google.com/macros/s/x/exec", ENTRY_USD: "$30", MONTHLY_USD: "$15", ENTRY_BDT: "৳1", MONTHLY_BDT: "৳2", ENTRY_REGULAR_USD: "$100", ENTRY_REGULAR_BDT: "৳9", META_PIXEL: "" };',
    'var MMSheet = {',
    '  normalizeOrderLanguage: function(v){ return v === "bn" || v === "hi" ? v : "en"; },',
    '  sheetLanguageLabel: function(v){ return String(v || "en").toUpperCase(); },',
    '  writeFetchOptions: function(payload){ return { method:"POST", mode:"no-cors", keepalive:true, body: JSON.stringify(payload) }; }',
    '};',
    'function getUtmData(){ return { utm_source:"direct", utm_medium:"", utm_campaign:"", fbclid:"", ttclid:"" }; }',
    'function t(key){ return key; }',
    main.slice(start, end),
    'planEntry.onclick = function(){ selectPlan(this, "entry"); };',
    'planMonthly.onclick = function(){ selectPlan(this, "monthly"); };',
    'langBn.onclick = function(){ selectPrefLang(this, "bn"); };',
    'langEn.onclick = function(){ selectPrefLang(this, "en"); };',
    'langHi.onclick = function(){ selectPrefLang(this, "hi"); };',
    'payBinance.onclick = function(){ selectPay(this); };',
    'payOther.onclick = function(){ selectPay(this); };',
    'function sentLatch(){ return ORDER_SENT_ID; }',
    'function payName(){ return SELECTED_PAY; }',
    'function setLang(v){ LANG = v; }',
    'return { submitOrder: submitOrder, refreshSubmitHref: refreshSubmitHref, renderPayments: renderPayments, sentLatch: sentLatch, payName: payName, setLang: setLang };'
  ].join('\n');
  const run = new Function(
    'window', 'document', 'navigator',
    'planEntry', 'planMonthly', 'langBn', 'langEn', 'langHi', 'payBinance', 'payOther',
    src
  );
  const api = run(windowObj, documentObj, navigatorObj, planEntry, planMonthly, langBn, langEn, langHi, payBinance, payOther);
  api.beacons = beacons;
  api.fields = fields;
  api.plan = { entry: planEntry, monthly: planMonthly };
  api.lang = { bn: langBn, en: langEn, hi: langHi };
  api.pay = { binance: payBinance, other: payOther };
  api.submit = function() {
    return api.submitOrder({ preventDefault: function(){} });
  };
  api.orderId = function() { return orderIdFromHref(fields.submitBtn.href); };
  return api;
}

test('phones use the same tab and desktop uses window.open; the old opener helper is gone', () => {
  const main = read('js/main.js');
  assert.equal(main.includes('function openTelegramSameGesture'), false);
  assert.equal(main.includes('TELEGRAM_NAV_FALLBACK_MS'), false);
  assert.equal(main.includes(', 900'), false);
  assert.equal(main.includes('MM_OrdersBot'), false);
  const prefers = loadPrefers(main);
  ['android', 'facebook', 'telegram', 'iphone'].forEach(function(name) {
    assert.equal(prefers({ userAgent: UAS[name] })(), true, name);
  });
  assert.equal(prefers({ userAgent: UAS.desktop })(), false);

  const phone = loadSubmitRuntime({ ua: UAS.android });
  assert.equal(phone.click(), true);
  assert.equal(phone.location.href, 'http://127.0.0.1/index.html');
  assert.equal(phone.opens.length, 0);
  assert.equal(phone.fields.submitBtn.href.indexOf('https://t.me/MMHQ_Support?text='), 0);
  assert.match(decodeURIComponent(phone.fields.submitBtn.href.split('text=')[1]), /Swa Test/);
  assert.equal(phone.fields.submitBtn.disabled, false);

  const desktop = loadSubmitRuntime({ ua: UAS.desktop });
  assert.equal(desktop.click(), false);
  assert.equal(desktop.location.href, 'http://127.0.0.1/index.html');
  assert.equal(desktop.opens.length, 1);
  assert.equal(desktop.opens[0].target, '_blank');
  assert.equal(desktop.opens[0].url.indexOf('https://t.me/MMHQ_Support?text='), 0);

  const blocked = loadSubmitRuntime({ ua: UAS.desktop, blockPopup: true });
  assert.equal(blocked.click(), false);
  assert.equal(blocked.location.href.indexOf('https://t.me/MMHQ_Support?text='), 0);
  assert.equal(blocked.beacons.length, 1);
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

test('two submitOrder calls in one turn send one Sheet beacon', () => {
  const api = loadSubmitRuntime({ ua: UAS.android });
  assert.equal(api.click(), true);
  assert.equal(api.click(), true);
  assert.equal(api.beacons.length, 1);
  const id = JSON.parse(api.beacons[0]).orderId;
  assert.match(api.fields.submitBtn.href, new RegExp(id));
  assert.equal(api.fields.submitBtn.disabled, false);
  assert.equal(api.opens.length, 0);
});

test('desktop popup success then a second tap does not mint a new id or a second beacon', () => {
  const api = loadSubmitRuntime({ ua: UAS.desktop });
  api.click();
  api.click();
  assert.equal(api.beacons.length, 1);
  assert.equal(api.opens.length, 2);
  assert.equal(api.opens[0].url, api.opens[1].url);
  assert.equal(api.location.href, 'http://127.0.0.1/index.html');
  assert.equal(api.fields.submitBtn.disabled, false);
  const firstId = JSON.parse(api.beacons[0]).orderId;
  assert.match(api.opens[1].url, new RegExp(firstId));

  api.noteOrderFieldEdit();
  api.click();
  assert.equal(api.beacons.length, 2);
  const secondId = JSON.parse(api.beacons[1]).orderId;
  assert.notEqual(secondId, firstId);
  assert.match(api.opens[2].url, new RegExp(secondId));
});

test('a valid draft stays unsent across persisted pageshow, then submit beacons once', () => {
  const main = read('js/main.js');
  assert.equal(main.includes('ORDER_SENT_ID = DRAFT_ORDER_ID'), false);
  assert.equal(main.includes("addEventListener('pageshow'"), false);
  const submit = main.match(/function submitOrder\(e\)\{[\s\S]*?\n\}/)[0];
  const sendAt = submit.indexOf('ORDER_SENT_ID = orderId');
  const postAt = submit.indexOf('postOrderToSheet(payload)');
  assert.ok(postAt !== -1 && sendAt > postAt);
  assert.match(submit, /if\(ORDER_SENT_ID !== orderId && postOrderToSheet\(payload\)\)/);

  const api = loadSubmitRuntime({ ua: UAS.android });
  api.refreshSubmitHref();
  assert.equal(api.beacons.length, 0);
  const id = orderIdFromHref(api.fields.submitBtn.href);
  assert.match(id, /^MM-\d+-\d+$/);
  api.pageShow(true);
  assert.equal(api.click(), true);
  assert.equal(api.beacons.length, 1);
  assert.equal(JSON.parse(api.beacons[0]).orderId, id);
  assert.equal(api.fields.submitBtn.disabled, false);

  api.pageShow(true);
  api.click();
  assert.equal(api.beacons.length, 1);
  assert.match(api.fields.submitBtn.href, new RegExp(id));
});

test('re-tapping the selected plan, payment, or language does not create another Sheet row', () => {
  const api = loadFormControls();
  api.pay.binance.click();
  const id = api.orderId();
  assert.match(id, /^MM-\d+-\d+$/);
  api.pay.binance.click();
  api.plan.entry.click();
  api.lang.en.click();
  assert.equal(api.orderId(), id);
  api.submit();
  assert.equal(api.beacons.length, 1);
  assert.equal(JSON.parse(api.beacons[0]).orderId, id);
  assert.equal(JSON.parse(api.beacons[0]).payment, 'Binance Pay');
  assert.equal(JSON.parse(api.beacons[0]).plan, 'Entry');

  api.pay.binance.click();
  api.plan.entry.click();
  api.lang.en.click();
  api.submit();
  assert.equal(api.beacons.length, 1);
  assert.equal(api.orderId(), id);
  assert.equal(api.fields.submitBtn.disabled, false);

  api.plan.monthly.click();
  assert.notEqual(api.orderId(), id);
  api.submit();
  assert.equal(api.beacons.length, 2);
  const monthlyId = JSON.parse(api.beacons[1]).orderId;
  assert.equal(JSON.parse(api.beacons[1]).plan, 'Monthly');
  assert.equal(api.orderId(), monthlyId);
  api.plan.monthly.click();
  api.submit();
  assert.equal(api.beacons.length, 2);
  assert.equal(api.orderId(), monthlyId);

  api.lang.bn.click();
  assert.notEqual(api.orderId(), monthlyId);
  api.submit();
  assert.equal(api.beacons.length, 3);
  const bnId = JSON.parse(api.beacons[2]).orderId;
  assert.equal(JSON.parse(api.beacons[2]).language, 'bn');
  api.lang.bn.click();
  api.submit();
  assert.equal(api.beacons.length, 3);
  assert.equal(api.orderId(), bnId);

  api.pay.other.click();
  assert.notEqual(api.orderId(), bnId);
  api.submit();
  assert.equal(api.beacons.length, 4);
  const otherId = JSON.parse(api.beacons[3]).orderId;
  assert.equal(JSON.parse(api.beacons[3]).payment, 'Other');
  api.pay.other.click();
  api.submit();
  assert.equal(api.beacons.length, 4);
  assert.equal(api.orderId(), otherId);
});

test('a failed Sheet send does not latch, so the retry beacons', () => {
  const failed = loadSubmitRuntime({ ua: UAS.android, beaconOk: false, fetchThrows: true });
  assert.equal(failed.click(), true);
  assert.equal(failed.beacons.length, 0);
  assert.equal(failed.fetches.length, 0);
  assert.equal(failed.sentLatch(), '');
  failed.net.beaconOk = true;
  assert.equal(failed.click(), true);
  assert.equal(failed.beacons.length, 1);
  assert.equal(failed.click(), true);
  assert.equal(failed.beacons.length, 1);

  const viaFetch = loadSubmitRuntime({ ua: UAS.android, beaconOk: false });
  assert.equal(viaFetch.click(), true);
  assert.equal(viaFetch.beacons.length, 0);
  assert.equal(viaFetch.fetches.length, 1);
  assert.match(viaFetch.sentLatch(), /^MM-/);
  viaFetch.click();
  assert.equal(viaFetch.fetches.length, 1);
  assert.equal(viaFetch.beacons.length, 0);
});

test('auxclick beacons and latches without preventDefault or contextmenu', () => {
  const main = read('js/main.js');
  assert.match(main, /addEventListener\('auxclick', submitOrder\)/);
  assert.equal(main.includes('contextmenu'), false);
  const api = loadSubmitRuntime({ ua: UAS.desktop });
  let prevented = false;
  const ev = { type: 'auxclick', preventDefault: function() { prevented = true; } };
  assert.equal(api.submitOrder(ev), true);
  assert.equal(prevented, false);
  assert.equal(api.opens.length, 0);
  assert.equal(api.location.href, 'http://127.0.0.1/index.html');
  assert.equal(api.beacons.length, 1);
  api.submitOrder(ev);
  assert.equal(api.beacons.length, 1);
  assert.equal(prevented, false);

  api.fields.iName.value = '';
  api.submitOrder(ev);
  assert.equal(prevented, false);
  assert.equal(api.beacons.length, 1);
});

test('a page-language switch that changes the payment label starts one new Sheet row', () => {
  const api = loadFormControls();
  api.pay.binance.click();
  const draftId = api.orderId();
  api.setLang('bn');
  api.renderPayments();
  assert.equal(api.payName(), 'বিকাশ');
  assert.equal(api.orderId(), draftId);
  assert.equal(api.beacons.length, 0);

  api.setLang('en');
  api.renderPayments();
  api.submit();
  assert.equal(api.beacons.length, 1);
  const first = JSON.parse(api.beacons[0]);
  assert.equal(first.payment, 'Binance Pay');
  assert.equal(api.sentLatch(), first.orderId);

  api.setLang('hi');
  api.renderPayments();
  assert.equal(api.payName(), 'Binance Pay');
  assert.equal(api.sentLatch(), first.orderId);
  api.submit();
  assert.equal(api.beacons.length, 1);

  api.setLang('bn');
  api.renderPayments();
  assert.equal(api.payName(), 'বিকাশ');
  assert.equal(api.sentLatch(), '');
  assert.notEqual(api.orderId(), first.orderId);
  api.submit();
  assert.equal(api.beacons.length, 2);
  const second = JSON.parse(api.beacons[1]);
  assert.equal(second.payment, 'বিকাশ');
  assert.equal(second.orderId, api.orderId());

  api.renderPayments();
  api.submit();
  assert.equal(api.beacons.length, 2);
  assert.equal(api.sentLatch(), second.orderId);
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
