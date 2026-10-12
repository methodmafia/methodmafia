'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function loadWorker() {
  return import('../worker/index.mjs');
}

test('www redirects to https apex and keeps path and query', async () => {
  const { apexRedirectUrl } = await loadWorker();
  assert.equal(
    apexRedirectUrl('https://www.themethodmafia.com/about.html?x=1&utm_source=facebook'),
    'https://themethodmafia.com/about.html?x=1&utm_source=facebook'
  );
  assert.equal(
    apexRedirectUrl('http://www.themethodmafia.com/blog/vip-access.html?plan=Entry'),
    'https://themethodmafia.com/blog/vip-access.html?plan=Entry'
  );
  assert.equal(
    apexRedirectUrl('https://www.themethodmafia.com/'),
    'https://themethodmafia.com/'
  );
  assert.equal(
    apexRedirectUrl('https://www.themethodmafia.com/order-status.html?orderId=MM-2026-53704&confirmed=1'),
    'https://themethodmafia.com/order-status.html?orderId=MM-2026-53704&confirmed=1'
  );
});

test('apex and other hosts are not redirected', async () => {
  const { apexRedirectUrl } = await loadWorker();
  assert.equal(apexRedirectUrl('https://themethodmafia.com/about.html?x=1'), null);
  assert.equal(apexRedirectUrl('https://themethodmafia.com/'), null);
  assert.equal(apexRedirectUrl('http://themethodmafia.com/payment.html'), null);
  assert.equal(apexRedirectUrl('https://methodmafia.example.workers.dev/about?x=1'), null);
});

test('fetch returns 301 only for www and passes apex through to assets', async () => {
  const { default: worker } = await loadWorker();
  const fetched = [];
  const env = {
    ASSETS: {
      fetch: function(request) {
        fetched.push(request.url);
        return new Response('ok', {
          status: 200,
          headers: { 'x-frame-options': 'DENY' }
        });
      }
    }
  };

  const www = await worker.fetch(new Request('https://www.themethodmafia.com/payment.html?q=2'), env);
  assert.equal(www.status, 301);
  assert.equal(www.headers.get('location'), 'https://themethodmafia.com/payment.html?q=2');
  assert.equal(fetched.length, 0);

  const apex = await worker.fetch(new Request('https://themethodmafia.com/payment.html?q=2'), env);
  assert.equal(apex.status, 200);
  assert.equal(apex.headers.get('x-frame-options'), 'DENY');
  assert.deepEqual(fetched, ['https://themethodmafia.com/payment.html?q=2']);
});

test('wrangler runs the worker before assets and does not publish the worker source', () => {
  const root = path.join(__dirname, '..');
  const wrangler = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
  assert.match(wrangler, /"main"\s*:\s*"worker\/index\.mjs"/);
  assert.match(wrangler, /"binding"\s*:\s*"ASSETS"/);
  assert.match(wrangler, /"run_worker_first"\s*:\s*true/);
  const ignore = fs.readFileSync(path.join(root, '.assetsignore'), 'utf8');
  assert.match(ignore, /^worker\/$/m);
});
