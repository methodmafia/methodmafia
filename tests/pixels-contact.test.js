'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MMTracking = require(path.join(ROOT, 'js/tracking-lib.js'));

const CONFIG = {
  META_PIXEL: '1402762621295852',
  TIKTOK_PIXEL: 'DA6ITFJC77U72JPLUACG',
  SUPPORT: 'https://t.me/MMHQ_Support',
  PUBLIC_CHANNEL: 'https://t.me/TheMethodMafia',
  FULL_LIST_POST: 'https://t.me/TheMethodmafia1/95',
  FACEBOOK_PAGE: 'https://www.facebook.com/share/19Q7KrfTBT/'
};

function loadPixels() {
  const src = fs.readFileSync(path.join(ROOT, 'js/pixels.js'), 'utf8');
  const calls = [];
  const listeners = [];
  const fbq = function() { calls.push(['fbq'].concat([].slice.call(arguments))); };
  const ttq = {
    page: function() { calls.push(['ttq', 'page']); },
    track: function() { calls.push(['ttq'].concat([].slice.call(arguments))); }
  };
  const gtag = function() { calls.push(['gtag'].concat([].slice.call(arguments))); };
  const windowObj = { fbq: fbq, ttq: ttq, MMTracking: MMTracking, localStorage: null, sessionStorage: null };
  const documentObj = {
    readyState: 'complete',
    getElementById: function() { return null; },
    querySelector: function() { return null; },
    addEventListener: function(type, fn, capture) { listeners.push({ type: type, fn: fn, capture: capture }); }
  };
  new Function('window', 'document', 'location', 'CONFIG', 'fbq', 'ttq', 'gtag', src)(
    windowObj, documentObj, { search: '' }, CONFIG, fbq, ttq, gtag);
  function anchor(attrs) {
    const a = {
      id: attrs.id || '',
      getAttribute: function(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; }
    };
    a.closest = function(sel) { return sel === 'a' ? a : null; };
    return a;
  }
  function click(attrs) {
    const target = anchor(attrs);
    listeners.filter(function(l) { return l.type === 'click'; }).forEach(function(l) { l.fn({ target: target }); });
  }
  return { calls: calls, click: click, api: windowObj.MMPixels, listeners: listeners };
}

const PLAIN_CONTACT = [
  ['fbq', 'track', 'Contact'],
  ['ttq', 'Contact'],
  ['gtag', 'event', 'contact']
];

const SUPPORT_CLICK = [
  ['fbq', 'trackCustom', 'SupportClick'],
  ['ttq', 'SupportClick'],
  ['gtag', 'event', 'support_click']
];

function contacts(calls) {
  return calls.filter(function(c) { return (c[0] === 'fbq' && c[2] === 'Contact') || (c[0] === 'ttq' && c[1] === 'Contact') || (c[0] === 'gtag' && c[2] === 'contact'); });
}

function supportClicks(calls) {
  return calls.filter(function(c) {
    return (c[0] === 'fbq' && c[1] === 'trackCustom' && c[2] === 'SupportClick') ||
      (c[0] === 'ttq' && c[1] === 'SupportClick') ||
      (c[0] === 'gtag' && c[2] === 'support_click');
  });
}

test('a click on the order Submit link does not fire the generic Contact', () => {
  const px = loadPixels();
  px.calls.length = 0;
  px.click({ id: 'submitBtn', href: 'https://t.me/MMHQ_Support' });
  px.click({ id: 'submitBtn', href: 'https://t.me/MMHQ_Support?text=%F0%9F%A7%BE%20NEW%20ORDER' });
  px.click({ id: 'submitBtn', href: 'tg://resolve?domain=MMHQ_Support&text=hi' });
  assert.deepEqual(contacts(px.calls), []);
  assert.deepEqual(supportClicks(px.calls), []);
});

test('an @MMHQ_Support link gives Contact with no event id', () => {
  const px = loadPixels();
  [
    { 'data-href': 'SUPPORT', href: 'https://t.me/MMHQ_Support' },
    { href: 'https://t.me/MMHQ_Support?text=hi' },
    { id: 'orderTgLink', href: 'https://t.me/MMHQ_Support' },
    { className: 'float-tg', href: 'https://t.me/MMHQ_Support' },
    { href: 'tg://resolve?domain=MMHQ_Support&text=hello' },
    { href: 'intent://resolve?domain=MMHQ_Support&text=hello#Intent;scheme=tg;end' },
    { href: 'https://web.telegram.org/k/#?tgaddr=' + encodeURIComponent('tg://resolve?domain=MMHQ_Support&text=hello') }
  ].forEach(function(attrs) {
    px.calls.length = 0;
    px.click(attrs);
    assert.deepEqual(contacts(px.calls), PLAIN_CONTACT, JSON.stringify(attrs));
    assert.deepEqual(supportClicks(px.calls), [], JSON.stringify(attrs));
  });
});

test('a channel link gives SupportClick and no Contact', () => {
  const px = loadPixels();
  [
    { 'data-href': 'PUBLIC_CHANNEL', href: 'https://t.me/TheMethodMafia' },
    { 'data-href': 'PUBLIC_CHANNEL', href: 'https://t.me/TheMethodMafia', label: 'Join Free Channel' },
    { href: 'https://t.me/TheMethodmafia1' },
    { 'data-href': 'FULL_LIST_POST', href: CONFIG.FULL_LIST_POST },
    { href: 'tg://resolve?domain=TheMethodMafia' }
  ].forEach(function(attrs) {
    px.calls.length = 0;
    px.click(attrs);
    assert.deepEqual(contacts(px.calls), [], JSON.stringify(attrs));
    assert.deepEqual(supportClicks(px.calls), SUPPORT_CLICK, JSON.stringify(attrs));
  });
  px.calls.length = 0;
  px.click({ href: CONFIG.FACEBOOK_PAGE });
  px.click({ 'data-href': 'FACEBOOK_PAGE', href: CONFIG.FACEBOOK_PAGE });
  assert.deepEqual(contacts(px.calls), []);
  assert.deepEqual(supportClicks(px.calls), []);
});

test('the order gives exactly 1 Contact', () => {
  const px = loadPixels();
  px.calls.length = 0;
  px.click({ id: 'submitBtn', href: 'https://t.me/MMHQ_Support?text=NEW%20ORDER' });
  px.click({ id: 'submitBtn', href: 'https://t.me/MMHQ_Support?text=NEW%20ORDER' });
  px.click({ 'data-href': 'PUBLIC_CHANNEL', href: 'https://t.me/TheMethodMafia' });
  px.api.fireContact('MM-9-1_contact');
  assert.deepEqual(contacts(px.calls), [
    ['fbq', 'track', 'Contact', {}, { eventID: 'MM-9-1_contact' }],
    ['ttq', 'Contact', {}, { event_id: 'MM-9-1_contact' }],
    ['gtag', 'event', 'contact']
  ]);
  assert.deepEqual(supportClicks(px.calls), SUPPORT_CLICK);
});

test('fireContact with an event id passes it to Meta and TikTok', () => {
  const px = loadPixels();
  px.calls.length = 0;
  px.api.fireContact('MM-1-2_contact');
  assert.deepEqual(contacts(px.calls), [
    ['fbq', 'track', 'Contact', {}, { eventID: 'MM-1-2_contact' }],
    ['ttq', 'Contact', {}, { event_id: 'MM-1-2_contact' }],
    ['gtag', 'event', 'contact']
  ]);
});
