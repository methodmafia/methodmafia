'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadPay() {
  return require(path.join(ROOT, 'js', 'pay-now.js'));
}

function loadCheckoutFns() {
  const src = read('apps-script/PaymentCheckout.gs');
  const start = src.indexOf('/* @test-export */');
  const end = src.indexOf('/* @test-export-end */');
  assert.ok(start !== -1 && end > start, 'PaymentCheckout pure functions');
  return new Function(src.slice(start, end) + '\nreturn {' +
    'planAmountUsd_:planAmountUsd_,' +
    'chargeUsd_:chargeUsd_,' +
    'isOrderId_:isOrderId_,' +
    'nowpaymentsInvoiceBody_:nowpaymentsInvoiceBody_,' +
    'plisioInvoiceParams_:plisioInvoiceParams_,' +
    'whopCheckoutBody_:whopCheckoutBody_,' +
    'whopIdempotencyKey_:whopIdempotencyKey_,' +
    'checkoutUrlFromProvider_:checkoutUrlFromProvider_' +
    '};')();
}

const LABELS = {
  title: 'Pay now',
  note: 'Crypto or card for this order. Telegram payment still works.',
  crypto: 'Pay with Crypto',
  card: 'Pay with Card',
  order: 'Order',
  opening: 'Opening checkout…',
  fail: 'Checkout did not open. Use the button again, or pay on Telegram.'
};

function richNode(tag, byId) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(),
    className: '',
    textContent: '',
    href: '',
    hidden: false,
    children: [],
    attrs: {},
    listeners: {},
    appendChild: function(child) {
      this.children.push(child);
      if (child.id) byId[child.id] = child;
      return child;
    },
    removeChild: function(child) {
      const i = this.children.indexOf(child);
      if (i !== -1) this.children.splice(i, 1);
      return child;
    },
    setAttribute: function(key, value) { this.attrs[key] = String(value); },
    getAttribute: function(key) { return this.attrs[key]; },
    removeAttribute: function(key) {
      delete this.attrs[key];
      if (key === 'hidden') this.hidden = false;
    },
    addEventListener: function(type, fn) { this.listeners[type] = fn; }
  };
  Object.defineProperty(node, 'id', {
    configurable: true,
    get: function() { return this._id || ''; },
    set: function(value) {
      this._id = value || '';
      if (this._id) byId[this._id] = this;
    }
  });
  Object.defineProperty(node, 'firstChild', {
    configurable: true,
    get: function() { return this.children[0] || null; }
  });
  return node;
}

function fakeDoc() {
  const byId = {};
  const payNow = richNode('div', byId);
  payNow.id = 'payNow';
  payNow.hidden = true;
  byId.payNow = payNow;
  return {
    payNow: payNow,
    byId: byId,
    getElementById: function(id) { return byId[id] || null; },
    createElement: function(tag) { return richNode(tag, byId); }
  };
}

function payConfig(over) {
  const pay = Object.assign({
    enabled: false,
    crypto: 'nowpayments',
    nowpayments: { hostedLink: 'https://nowpayments.io/payment/?iid=PUBLIC', monthlyLink: '' },
    plisio: { hostedLink: 'https://plisio.net/account/stores/PUBLIC', monthlyLink: '' },
    whop: { enabled: false, productLink: 'https://whop.com/checkout/plan_PUBLIC', monthlyLink: '' }
  }, over || {});
  return {
    SUPPORT: 'https://t.me/MMHQ_Support',
    SHEET_URL: 'https://script.google.com/macros/s/x/exec?token=SECRET&foo=1',
    ENTRY_USD: '$30',
    MONTHLY_USD: '$15',
    ENTRY_BDT: '৳1',
    MONTHLY_BDT: '৳2',
    META_PIXEL: '',
    PAY_NOW: pay
  };
}

function loadPaySubmit(opts) {
  const main = read('js/main.js');
  const start = main.indexOf('function makeOrderId');
  const end = main.indexOf('function initScroll');
  assert.ok(start !== -1 && end > start, 'order runtime slice');
  const MMPay = loadPay();
  const config = payConfig(opts && opts.pay);
  const fetches = [];
  const beacons = [];
  const beaconUrls = [];
  const doc = fakeDoc();
  function cls() {
    return { add(){}, remove(){}, contains(){ return false; }, toggle(){} };
  }
  const fields = {
    iName: { value: 'Swa Test', classList: cls() },
    iEmail: { value: 'swa@example.com', classList: cls() },
    iTelegram: { value: '@swa_test', classList: cls() },
    iLanguage: { value: 'en' },
    submitBtn: { tagName: 'A', href: 'https://t.me/MMHQ_Support', disabled: false, classList: cls() },
    toast: { textContent: '', classList: cls() },
    orderHandoff: { hidden: true, classList: cls() },
    orderHandoffSummary: { textContent: '' },
    orderTgLink: { href: '' },
    payNow: doc.payNow
  };
  const location = { href: 'http://127.0.0.1/index.html' };
  const windowObj = {
    location: location,
    open: function() { throw new Error('window.open is not used'); },
    addEventListener: function() {},
    removeEventListener: function() {}
  };
  const navigatorObj = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
    sendBeacon: function(url, body) {
      beaconUrls.push(String(url));
      beacons.push(String(body));
      return true;
    }
  };
  const documentObj = {
    getElementById: function(id) {
      return doc.byId[id] || fields[id] || null;
    },
    createElement: function(tag) { return doc.createElement(tag); },
    querySelectorAll: function() { return []; },
    visibilityState: 'visible',
    addEventListener: function() {},
    removeEventListener: function() {}
  };
  const labels = {
    payNowTitle: LABELS.title,
    payNowNote: LABELS.note,
    payNowCrypto: LABELS.crypto,
    payNowCard: LABELS.card,
    payNowOrder: LABELS.order,
    payNowOpening: LABELS.opening,
    payNowFail: LABELS.fail
  };
  const src = [
    'var LANG = "en";',
    'var SELECTED_PAY = "Binance Pay";',
    'var SELECTED_PLAN = "entry";',
    'var SELECTED_PREF_LANG = "en";',
    'var CONFIG = ' + JSON.stringify(config) + ';',
    'var MMSheet = {',
    '  normalizeOrderLanguage: function(v){ return v === "bn" || v === "hi" ? v : "en"; },',
    '  sheetLanguageLabel: function(v){ return String(v || "en").toUpperCase(); },',
    '  writeFetchOptions: function(payload){ return { method:"POST", mode:"no-cors", keepalive:true, body: JSON.stringify(payload) }; }',
    '};',
    'function getUtmData(){ return { utm_source:"direct", utm_medium:"", utm_campaign:"", fbclid:"", ttclid:"" }; }',
    'function t(key){ return labels[key] || key; }',
    main.slice(start, end),
    'function fetch(url, opts){',
    '  fetches.push({ url: String(url), opts: opts || {} });',
    '  if (String(url).indexOf("pay=create") !== -1) {',
    '    return Promise.resolve({',
    '      ok: true,',
    '      json: function(){ return Promise.resolve({ ok: true, url: "https://pay.example/invoice?ref=1" }); }',
    '    });',
    '  }',
    '  return { catch: function(){ return this; } };',
    '}',
    'return { submitOrder: submitOrder };'
  ].join('\n');
  const run = new Function('window', 'document', 'navigator', 'fetches', 'labels', 'MMPay', src);
  const api = run(windowObj, documentObj, navigatorObj, fetches, labels, MMPay);
  api.beacons = beacons;
  api.beaconUrls = beaconUrls;
  api.fetches = fetches;
  api.location = location;
  api.fields = fields;
  api.doc = doc;
  api.click = function() {
    return api.submitOrder({ preventDefault: function(){} });
  };
  return api;
}

test('PAY_NOW defaults off and config.js holds only public links', () => {
  const src = read('config.js');
  assert.doesNotMatch(src, /NOWPAYMENTS_API_KEY|PLISIO_API_KEY|WHOP_API_KEY|x-api-key|api_key\s*[:=]/i);
  const CONFIG = new Function(src + '\nreturn CONFIG;')();
  assert.equal(CONFIG.PAY_NOW.enabled, false);
  assert.equal(CONFIG.PAY_NOW.crypto, 'nowpayments');
  assert.equal(CONFIG.PAY_NOW.card, undefined);
  assert.equal(CONFIG.PAY_NOW.whop.enabled, false);
  assert.equal(CONFIG.PAY_NOW.nowpayments.hostedLink, '');
  assert.equal(CONFIG.PAY_NOW.plisio.hostedLink, '');
  assert.equal(CONFIG.PAY_NOW.whop.productLink, '');
});

test('the Pay now shell is empty until the flag mounts it', () => {
  const html = read('index.html');
  assert.match(html, /<div id="payNow" hidden><\/div>/);
  assert.equal(html.includes('Pay with Crypto'), false);
  assert.equal(html.includes('Pay with Card'), false);
  const payAt = html.indexOf('src="js/pay-now.js"');
  const sheetAt = html.indexOf('src="js/sheet-client.js"');
  const mainAt = html.indexOf('src="js/main.js"');
  assert.ok(sheetAt !== -1 && payAt !== -1 && mainAt !== -1);
  assert.ok(sheetAt < payAt && payAt < mainAt);
});

test('English Pay now labels are the two checkout buttons', () => {
  const src = read('js/translations.js');
  const tr = new Function(src + '\nreturn TRANSLATIONS;')();
  assert.equal(tr.en.payNowCrypto, 'Pay with Crypto');
  assert.equal(tr.en.payNowCard, 'Pay with Card');
  assert.equal(tr.en.payNowTitle, 'Pay now');
  ['en', 'bn', 'hi'].forEach(function(lang) {
    ['payNowTitle', 'payNowNote', 'payNowCrypto', 'payNowCard', 'payNowFail'].forEach(function(key) {
      assert.ok(tr[lang][key] && tr[lang][key].length > 1, lang + '.' + key);
    });
  });
});

test('flag off mounts nothing and createPayment omits the amount', () => {
  const MMPay = loadPay();
  assert.equal(MMPay.isEnabled({ PAY_NOW: { enabled: false } }), false);
  assert.equal(MMPay.isEnabled({}), false);
  assert.equal(MMPay.isEnabled(null), false);
  const doc = fakeDoc();
  MMPay.mount(doc, {
    config: payConfig({ enabled: false }),
    orderId: 'MM-2026-1001',
    plan: 'Entry',
    labels: LABELS,
    onChoose: function() { throw new Error('should not choose'); }
  });
  assert.equal(doc.payNow.hidden, true);
  assert.equal(doc.payNow.children.length, 0);
  assert.equal(doc.getElementById('payCrypto'), null);
  assert.equal(doc.getElementById('payCard'), null);

  const url = MMPay.buildCreatePaymentUrl(
    'https://script.google.com/macros/s/x/exec?token=SECRET&foo=1'
  );
  const u = new URL(url);
  assert.equal(u.searchParams.get('pay'), 'create');
  assert.equal(u.searchParams.get('action'), null);
  assert.equal(u.searchParams.get('orderId'), null);
  assert.equal(u.searchParams.get('provider'), null);
  assert.equal(u.searchParams.get('token'), null);
  assert.equal(u.searchParams.get('amount'), null);
  assert.equal(u.searchParams.get('price'), null);
  assert.equal(url.includes('SECRET'), false);
  const body = JSON.parse(MMPay.createPaymentFetchOptions('MM-2026-1001', 'nowpayments').body);
  assert.equal(body.orderId, 'MM-2026-1001');
  assert.equal(body.provider, 'nowpayments');
  assert.equal(body.amount, undefined);
  assert.equal(body.pay, undefined);
});

test('flag on renders Pay with Crypto and Pay with Card with the order id', () => {
  const MMPay = loadPay();
  const doc = fakeDoc();
  const chosen = [];
  MMPay.mount(doc, {
    config: payConfig({ enabled: true, crypto: 'plisio' }),
    orderId: 'MM-2026-4242',
    plan: 'Entry',
    labels: LABELS,
    onChoose: function(provider) { chosen.push(provider); }
  });
  assert.equal(doc.payNow.hidden, false);
  const crypto = doc.getElementById('payCrypto');
  const card = doc.getElementById('payCard');
  assert.equal(crypto.textContent, 'Pay with Crypto');
  assert.equal(card.textContent, 'Pay with Card');
  assert.equal(crypto.getAttribute('data-provider'), 'plisio');
  assert.equal(card.getAttribute('data-provider'), 'nowpayments');
  const cryptoUrl = new URL(crypto.href);
  const cardUrl = new URL(card.href);
  assert.equal(cryptoUrl.searchParams.get('order_number'), 'MM-2026-4242');
  assert.match(cryptoUrl.hostname, /plisio\.net/);
  assert.equal(cardUrl.searchParams.get('order_id'), 'MM-2026-4242');
  assert.match(cardUrl.hostname, /nowpayments\.io/);
  assert.equal(cardUrl.searchParams.get('orderId'), null);
  crypto.listeners.click({ preventDefault: function() {} });
  card.listeners.click({ preventDefault: function() {} });
  assert.deepEqual(chosen, ['plisio', 'nowpayments']);
});

test('Whop is off unless whop.enabled is true, then Pay with Card uses it', () => {
  const MMPay = loadPay();
  assert.equal(MMPay.cardProvider(payConfig()), 'nowpayments');
  assert.equal(MMPay.cardProvider(payConfig({ whop: { enabled: false, productLink: 'https://whop.com/checkout/plan_PUBLIC' } })), 'nowpayments');
  const doc = fakeDoc();
  MMPay.mount(doc, {
    config: payConfig({
      enabled: true,
      whop: { enabled: true, productLink: 'https://whop.com/checkout/plan_PUBLIC', monthlyLink: '' }
    }),
    orderId: 'MM-2026-4242',
    plan: 'Entry',
    labels: LABELS,
    onChoose: function() {}
  });
  const card = doc.getElementById('payCard');
  const cardUrl = new URL(card.href);
  assert.equal(card.getAttribute('data-provider'), 'whop');
  assert.equal(cardUrl.searchParams.get('orderId'), 'MM-2026-4242');
  assert.equal(cardUrl.searchParams.get('metadata[order_id]'), 'MM-2026-4242');
  assert.match(cardUrl.pathname, /plan_PUBLIC/);
});

test('NOWPayments fallback uses order_id and a monthly link when the plan is Monthly', () => {
  const MMPay = loadPay();
  const config = payConfig({
    enabled: true,
    crypto: 'nowpayments',
    nowpayments: {
      hostedLink: 'https://nowpayments.io/payment/?iid=ENTRY',
      monthlyLink: 'https://nowpayments.io/payment/?iid=MONTH'
    }
  });
  const entry = new URL(MMPay.hostedFallbackUrl(config, 'nowpayments', 'MM-2026-1001', 'Entry'));
  const monthly = new URL(MMPay.hostedFallbackUrl(config, 'nowpayments', 'MM-2026-1001', 'Monthly'));
  assert.equal(entry.searchParams.get('iid'), 'ENTRY');
  assert.equal(entry.searchParams.get('order_id'), 'MM-2026-1001');
  assert.equal(monthly.searchParams.get('iid'), 'MONTH');
  assert.equal(monthly.searchParams.get('order_id'), 'MM-2026-1001');
  assert.equal(MMPay.hostedFallbackUrl(config, 'nowpayments', 'MM-2026-1001', 'Entry').includes('javascript:'), false);
  assert.equal(MMPay.hostedFallbackUrl(
    payConfig({ nowpayments: { hostedLink: 'javascript:alert(1)' } }),
    'nowpayments',
    'MM-2026-1001',
    'Entry'
  ), '');
  assert.equal(MMPay.cryptoProvider(payConfig({ crypto: 'plisio' })), 'plisio');
  assert.equal(MMPay.cryptoProvider(payConfig({})), 'nowpayments');
  assert.equal(MMPay.cryptoProvider(payConfig({ crypto: 'nowpayments' })), 'nowpayments');
  assert.equal(MMPay.cardProvider(payConfig()), 'nowpayments');
});

test('checkout prefers the Apps Script URL and falls back without sending an amount', async () => {
  const MMPay = loadPay();
  const config = payConfig({ enabled: true });
  const calls = [];
  let dest = '';
  const apiUrl = await MMPay.startCheckout({
    config: config,
    orderId: 'MM-2026-1001',
    plan: 'Entry',
    provider: 'nowpayments',
    fetch: function(url, opts) {
      calls.push({ url: url, opts: opts });
      return Promise.resolve({
        json: function() {
          return Promise.resolve({ ok: true, url: 'https://nowpayments.io/payment/?iid=LIVE' });
        }
      });
    },
    navigate: function(url) { dest = url; }
  });
  assert.equal(apiUrl, 'https://nowpayments.io/payment/?iid=LIVE');
  assert.equal(dest, apiUrl);
  const u = new URL(calls[0].url);
  const posted = JSON.parse(calls[0].opts.body);
  assert.equal(u.searchParams.get('pay'), 'create');
  assert.equal(u.searchParams.get('action'), null);
  assert.equal(u.searchParams.get('orderId'), null);
  assert.equal(u.searchParams.get('provider'), null);
  assert.equal(u.searchParams.get('amount'), null);
  assert.equal(posted.orderId, 'MM-2026-1001');
  assert.equal(posted.provider, 'nowpayments');
  assert.equal(posted.amount, undefined);
  assert.equal(posted.pay, undefined);
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.mode, 'cors');
  assert.equal(calls[0].opts.credentials, 'omit');

  dest = '';
  const fallback = await MMPay.startCheckout({
    config: config,
    orderId: 'MM-2026-1001',
    plan: 'Entry',
    provider: 'whop',
    fetch: function() { return Promise.reject(new Error('down')); },
    navigate: function(url) { dest = url; }
  });
  const fb = new URL(fallback);
  assert.equal(dest, fallback);
  assert.equal(fb.searchParams.get('orderId'), 'MM-2026-1001');
  assert.match(fb.hostname, /whop\.com/);

  let failed = false;
  dest = '';
  const blocked = await MMPay.startCheckout({
    config: payConfig({ enabled: true, whop: { productLink: '' } }),
    orderId: 'MM-2026-1001',
    plan: 'Entry',
    provider: 'whop',
    fetch: function() {
      return Promise.resolve({ json: function() { return Promise.resolve({ ok: true, url: 'javascript:alert(1)' }); } });
    },
    navigate: function(url) { dest = url; },
    onFail: function() { failed = true; }
  });
  assert.equal(blocked, '');
  assert.equal(dest, '');
  assert.equal(failed, true);
});

test('flag off submit does not render Pay now and makes no createPayment call', () => {
  const api = loadPaySubmit({ pay: { enabled: false } });
  assert.equal(api.click(), false);
  assert.equal(api.beacons.length, 1);
  assert.equal(api.fetches.length, 0);
  assert.equal(api.fields.payNow.hidden, true);
  assert.equal(api.fields.payNow.children.length, 0);
  assert.equal(api.doc.getElementById('payCrypto'), null);
  assert.equal(api.fields.orderHandoff.hidden, false);
  assert.equal(api.location.href.indexOf('tg://resolve?domain=MMHQ_Support&text='), 0);
  const body = JSON.parse(api.beacons[0]);
  assert.match(body.orderId, /^MM-\d{4}-\d{4,5}$/);
  assert.equal(body.action, undefined);
  assert.equal(body.pay, undefined);
  assert.equal(api.beaconUrls[0].includes('pay='), false);
  assert.equal(api.beaconUrls[0].includes('createPayment'), false);
  assert.equal(JSON.stringify(api.beacons).includes('createPayment'), false);
});

test('flag on submit shows the panel and Pay buttons POST pay=create with the order id', async () => {
  const api = loadPaySubmit({
    pay: {
      enabled: true,
      crypto: 'nowpayments'
    }
  });
  api.click();
  assert.equal(api.fetches.length, 0);
  assert.equal(api.fields.payNow.hidden, false);
  const id = JSON.parse(api.beacons[0]).orderId;
  const order = JSON.parse(api.beacons[0]);
  assert.equal(order.pay, undefined);
  assert.equal(api.beaconUrls[0].includes('pay='), false);
  const crypto = api.doc.getElementById('payCrypto');
  const card = api.doc.getElementById('payCard');
  assert.equal(crypto.textContent, 'Pay with Crypto');
  assert.equal(card.textContent, 'Pay with Card');
  assert.equal(crypto.getAttribute('data-provider'), 'nowpayments');
  assert.equal(card.getAttribute('data-provider'), 'nowpayments');
  assert.equal(new URL(crypto.href).searchParams.get('order_id'), id);
  assert.equal(new URL(card.href).searchParams.get('order_id'), id);
  assert.equal(crypto.getAttribute('data-order-id'), id);

  const ev = { preventDefault: function() { this.prevented = true; }, prevented: false };
  await crypto.listeners.click(ev);
  assert.equal(ev.prevented, true);
  assert.equal(api.fetches.length, 1);
  const u = new URL(api.fetches[0].url);
  const posted = JSON.parse(api.fetches[0].opts.body);
  assert.equal(u.searchParams.get('pay'), 'create');
  assert.equal(u.searchParams.get('orderId'), null);
  assert.equal(u.searchParams.get('provider'), null);
  assert.equal(u.searchParams.get('amount'), null);
  assert.equal(u.searchParams.get('token'), null);
  assert.equal(api.fetches[0].url.includes('SECRET'), false);
  assert.equal(api.fetches[0].opts.method, 'POST');
  assert.equal(posted.orderId, id);
  assert.equal(posted.provider, 'nowpayments');
  assert.equal(posted.amount, undefined);
  assert.equal(api.location.href, 'https://pay.example/invoice?ref=1');

  await card.listeners.click({ preventDefault: function() {} });
  assert.equal(api.fetches.length, 2);
  const cardPost = JSON.parse(api.fetches[1].opts.body);
  assert.equal(new URL(api.fetches[1].url).searchParams.get('pay'), 'create');
  assert.equal(cardPost.provider, 'nowpayments');
  assert.equal(cardPost.orderId, id);
  assert.equal(cardPost.amount, undefined);
});

test('a failed order does not mount Pay now', () => {
  const api = loadPaySubmit({ pay: { enabled: true } });
  api.fields.iEmail.value = '';
  assert.equal(api.click(), false);
  assert.equal(api.beacons.length, 0);
  assert.equal(api.fetches.length, 0);
  assert.equal(api.fields.payNow.hidden, true);
  assert.equal(api.fields.payNow.children.length, 0);
});

test('submitOrder reveals Pay now only after the Sheet post and does not fetch inside the click', () => {
  const main = read('js/main.js');
  const submit = main.match(/function submitOrder\(e\)\{[\s\S]*?\n\}/)[0];
  const postAt = submit.indexOf('postOrderToSheet(payload)');
  const revealAt = submit.indexOf('revealPayNow(orderId, payload.plan)');
  const navAt = submit.indexOf('window.location.href = instantUrl');
  assert.ok(postAt !== -1 && revealAt > postAt && navAt > revealAt);
  assert.equal(submit.includes('createPayment'), false);
  assert.equal(submit.includes('fetch('), false);
  assert.equal(submit.includes('.then('), false);
  assert.equal(submit.includes('window.open'), false);
  const reveal = main.slice(main.indexOf('function revealPayNow'), main.indexOf('function openPayCheckout'));
  assert.match(reveal, /MMPay\.isEnabled/);
  assert.equal(reveal.includes('fetch('), false);
});

test('the server re-derives Entry $30 and Monthly $15 and ignores client amounts', () => {
  const api = loadCheckoutFns();
  assert.equal(api.planAmountUsd_('Entry'), 30);
  assert.equal(api.planAmountUsd_('entry'), 30);
  assert.equal(api.planAmountUsd_('Monthly'), 15);
  assert.equal(api.planAmountUsd_('monthly'), 15);
  assert.equal(api.planAmountUsd_(''), 0);
  assert.equal(api.chargeUsd_({ plan: 'Entry', clientAmount: 1, sheetAmount: '$1', amount: 0.01 }), 30);
  assert.equal(api.chargeUsd_({ plan: 'Monthly', clientAmount: 30, sheetAmount: '$30' }), 15);
  assert.equal(api.isOrderId_('MM-2026-1001'), true);
  assert.equal(api.isOrderId_('MM-2026-42421'), true);
  assert.equal(api.isOrderId_('nope'), false);

  const invoice = api.nowpaymentsInvoiceBody_('MM-2026-1001', api.chargeUsd_({ plan: 'Entry', clientAmount: 1 }), 'Entry');
  assert.equal(invoice.price_amount, 30);
  assert.equal(invoice.price_currency, 'usd');
  assert.equal(invoice.order_id, 'MM-2026-1001');
  assert.equal(JSON.stringify(invoice).includes('clientAmount'), false);

  const plisio = api.plisioInvoiceParams_('MM-2026-1001', 30, 'Entry');
  assert.equal(plisio.order_number, 'MM-2026-1001');
  assert.equal(plisio.source_currency, 'USD');
  assert.equal(plisio.source_amount, 30);
  assert.equal(plisio.api_key, undefined);

  const whop = api.whopCheckoutBody_('MM-2026-1001', 30, 'biz_public', 'Entry', '');
  assert.equal(whop.plan.initial_price, 30);
  assert.equal(whop.plan.currency, 'usd');
  assert.equal(whop.metadata.order_id, 'MM-2026-1001');
  assert.equal(whop.mode, 'payment');
  assert.equal(api.whopIdempotencyKey_('MM-2026-1001'), 'checkout-MM-2026-1001');

  assert.equal(
    api.checkoutUrlFromProvider_('nowpayments', { invoice_url: 'https://nowpayments.io/payment/?iid=9' }),
    'https://nowpayments.io/payment/?iid=9'
  );
  assert.equal(
    api.checkoutUrlFromProvider_('plisio', { data: { invoice_url: 'https://plisio.net/invoice/abc?api_key=SECRET' } }),
    'https://plisio.net/invoice/abc'
  );
  assert.equal(api.checkoutUrlFromProvider_('whop', { purchase_url: '/checkout/ch_123/' }), 'https://whop.com/checkout/ch_123/');
  assert.equal(api.checkoutUrlFromProvider_('nowpayments', { invoice_url: 'javascript:alert(1)' }), '');
});

test('POST ?pay=create is separate from the order writer, which has no pay hook', () => {
  const gs = read('apps-script/OrderProcessor.gs');
  const post = gs.slice(gs.indexOf('function doPost'), gs.indexOf('function writeOrderPost_'));
  assert.match(post, /parameter[\s\S]{0,80}pay/);
  assert.match(post, /=== 'create'/);
  assert.match(post, /handleCreatePayment_/);
  assert.equal(post.includes('amount'), false);
  const order = gs.slice(gs.indexOf('function writeOrderPost_'), gs.indexOf('function doGet'));
  assert.match(order, /appendRow/);
  assert.equal(order.includes('parameter.pay'), false);
  assert.equal(order.includes('?pay'), false);
  assert.equal(order.includes("pay === 'create'"), false);
  assert.equal(order.includes('createPayment'), false);
  assert.equal(/data\.pay(?!ment)/.test(order), false);
  const get = gs.slice(gs.indexOf('function doGet'), gs.indexOf('function checkDuplicate'));
  assert.equal(get.includes('createPayment'), false);
  assert.equal(get.includes('parameter.pay'), false);
  const main = read('js/main.js');
  const sheetPost = main.slice(main.indexOf('function postOrderToSheet'), main.indexOf('function copyOrderHandoff'));
  assert.equal(sheetPost.includes('pay=create'), false);
  assert.equal(sheetPost.includes('?pay'), false);

  const pay = read('apps-script/PaymentCheckout.gs');
  assert.match(pay, /re-deriv/i);
  assert.match(pay, /PropertiesService\.getScriptProperties/);
  assert.match(pay, /NOWPAYMENTS_API_KEY/);
  assert.match(pay, /PLISIO_API_KEY/);
  assert.match(pay, /WHOP_API_KEY/);
  assert.match(pay, /WHOP_COMPANY_ID/);
  const handler = pay.slice(pay.indexOf('function handleCreatePayment_'), pay.indexOf('function createProviderCheckoutUrl_'));
  assert.match(handler, /chargeUsd_\(\s*\{\s*plan:\s*plan\s*\}\s*\)/);
  assert.match(handler, /COL\.PLAN/);
  assert.equal(handler.includes('params.amount'), false);
  assert.equal(handler.includes('COL.AMOUNT'), false);
  assert.doesNotMatch(pay, /x-api-key['"]\s*:\s*['"][A-Za-z0-9]{8,}/);
  assert.doesNotMatch(pay, /Bearer [A-Za-z0-9]{8,}/);

  ['config.js', 'js/pay-now.js', 'js/main.js', 'index.html'].forEach(function(rel) {
    const src = read(rel);
    assert.equal(src.includes('NOWPAYMENTS_API_KEY'), false, rel);
    assert.equal(src.includes('PLISIO_API_KEY'), false, rel);
    assert.equal(src.includes('WHOP_API_KEY'), false, rel);
    assert.doesNotMatch(src, /x-api-key/);
  });
});

test('GUIDE says how to turn Pay now on and which public values to fill', () => {
  const guide = read('GUIDE.md');
  assert.match(guide, /PAY_NOW/);
  assert.match(guide, /enabled:\s*false/);
  assert.match(guide, /pay=create/);
  assert.match(guide, /whop\.enabled/);
  assert.doesNotMatch(guide, /action=createPayment/);
  assert.match(guide, /re-deriv/i);
  assert.match(guide, /hostedLink/);
  assert.match(guide, /productLink/);
  assert.match(guide, /nowpayments/);
  assert.match(guide, /plisio/);
  assert.match(guide, /whop/);
});

test('Pay now styles stay on the black and gold form and do not restyle the timer', () => {
  const css = read('css/style.css');
  const start = css.indexOf('.pay-now{');
  assert.ok(start !== -1);
  const block = css.slice(start, start + 1800);
  assert.match(block, /var\(--gold\)/);
  assert.match(block, /\.pay-now-crypto/);
  assert.match(block, /\.pay-now-card/);
  assert.equal(block.includes('.cd-'), false);
  assert.equal(block.includes('.exit-'), false);
  assert.equal(block.includes('.live-pop'), false);
  assert.equal(block.includes('#bg-canvas'), false);
});
