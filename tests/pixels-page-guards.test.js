'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PIXELS = fs.readFileSync(path.join(__dirname, '..', 'js', 'pixels.js'), 'utf8');

function boot(opts){
  const fbqCalls = [];
  function fbq(){
    if(typeof fbq.callMethod === 'function') fbq.callMethod.apply(fbq, arguments);
    else fbq.queue.push(arguments);
  }
  fbq.queue = [];
  fbq.queue.push = function(args){
    fbqCalls.push(Array.prototype.slice.call(args));
    return fbq.queue.length;
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';

  const ttCalls = [];
  const ttq = {
    page: function(){},
    load: function(){},
    track: function(){ ttCalls.push(Array.prototype.slice.call(arguments)); }
  };

  const gtagCalls = [];
  function gtag(){ gtagCalls.push(Array.prototype.slice.call(arguments)); }

  const queried = [];
  const sandbox = {
    console: console,
    CONFIG: { META_PIXEL: '', TIKTOK_PIXEL: '', GA_ID: '' },
    location: { search: opts.search || '' },
    localStorage: { getItem: function(){ return null; }, setItem: function(){} },
    sessionStorage: { getItem: function(){ return null; }, setItem: function(){} },
    fbq: fbq,
    ttq: ttq,
    gtag: gtag,
    document: {
      readyState: 'complete',
      getElementById: function(id){
        if(opts.ids && opts.ids[id]) return { id: id };
        return null;
      },
      querySelector: function(sel){
        queried.push(sel);
        return null;
      },
      addEventListener: function(){},
      createElement: function(){ return { style: {} }; },
      getElementsByTagName: function(){ return [{ parentNode: { insertBefore: function(){} } }]; }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(PIXELS, sandbox, { filename: 'js/pixels.js' });
  return { sandbox: sandbox, fbqCalls: fbqCalls, ttCalls: ttCalls, gtagCalls: gtagCalls, queried: queried };
}

test('blog-style page does not watch the header Join link for ViewContent', function(){
  const page = boot({ ids: {} });
  const joined = page.queried.some(function(sel){ return String(sel).indexOf('#order') !== -1; });
  assert.equal(joined, false);
});

test('?confirmed=1 Purchase is dropped only when the page has no order surface', function(){
  const blog = boot({ search: '?confirmed=1&plan=Entry&orderId=MM-1', ids: {} });
  blog.sandbox.fbq('track', 'Purchase', { value: 30 });
  blog.sandbox.fbq('track', 'PageView');
  blog.sandbox.fbq.callMethod = function(){ blog.fbqCalls.push(Array.prototype.slice.call(arguments)); };
  blog.sandbox.fbq('track', 'Purchase', { value: 30 });
  blog.sandbox.fbq('track', 'Contact');
  blog.sandbox.ttq.track('CompletePayment', { value: 30 });
  blog.sandbox.ttq.track('Contact');
  blog.sandbox.gtag('event', 'purchase', { value: 30 });
  blog.sandbox.gtag('event', 'contact');

  assert.deepEqual(blog.fbqCalls.map(function(c){ return c[1]; }), ['PageView', 'Contact']);
  assert.equal(blog.sandbox.fbq, blog.sandbox.window.fbq);
  assert.deepEqual(blog.ttCalls.map(function(c){ return c[0]; }), ['Contact']);
  assert.deepEqual(blog.gtagCalls.map(function(c){ return c[1]; }), ['contact']);

  const home = boot({
    search: '?confirmed=1&plan=Entry',
    ids: { order: true, pricing: true }
  });
  home.sandbox.fbq('track', 'Purchase', { value: 30 });
  home.sandbox.ttq.track('CompletePayment', { value: 30 });
  home.sandbox.gtag('event', 'purchase', { value: 30 });
  assert.equal(home.fbqCalls.some(function(c){ return c[1] === 'Purchase'; }), true);
  assert.equal(home.ttCalls.some(function(c){ return c[0] === 'CompletePayment'; }), true);
  assert.equal(home.gtagCalls.some(function(c){ return c[1] === 'purchase'; }), true);
});
