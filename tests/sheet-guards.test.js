'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('order form no longer treats opaque no-cors fetch as success', () => {
  const main = read('js/main.js');
  assert.equal(main.includes("mode:'no-cors'"), false);
  assert.equal(main.includes('mode: "no-cors"'), false);
  assert.equal(main.includes("mode: 'no-cors'"), false);
  assert.match(main, /isWriteSuccess|interpretWriteResult/);
  assert.match(main, /toastSheetFail/);
});

test('order-status looks up the Sheet instead of localStorage fake status', () => {
  const page = read('order-status.html');
  const main = read('js/main.js');
  assert.equal(page.includes("localStorage.getItem('mm_last_order')"), false);
  assert.match(page + main, /buildStatusLookupUrl|action=status/);
  assert.match(page, /src="js\/sheet-client\.js"/);
});

test('frontend JS never ships ADMIN_TOKEN', () => {
  const files = [
    'config.js',
    'js/main.js',
    'js/sheet-client.js',
    'js/tracking-lib.js',
    'js/pixels.js',
    'order-status.html',
    'index.html'
  ];
  files.forEach(function(rel) {
    const src = read(rel);
    assert.equal(src.includes('ADMIN_TOKEN'), false, rel + ' must not mention ADMIN_TOKEN');
    assert.doesNotMatch(src, /token=CHANGE_ME|token=\s*['"][^'"]+['"]/);
  });
});

test('index and order-status load sheet-client before main', () => {
  ['index.html', 'order-status.html'].forEach(function(rel) {
    const html = read(rel);
    const sheetAt = html.indexOf('src="js/sheet-client.js"');
    const mainAt = html.indexOf('src="js/main.js"');
    assert.ok(sheetAt !== -1, rel + ' must load sheet-client.js');
    assert.ok(mainAt !== -1, rel + ' must load main.js');
    assert.ok(sheetAt < mainAt, rel + ' must load sheet-client before main');
  });
});

test('GUIDE no longer promises a fake Payment Confirmed banner', () => {
  const guide = read('GUIDE.md');
  assert.equal(guide.includes('"Payment Confirmed" banner দেখাবে'), false);
  assert.match(guide, /action=status|Sheet থেকে/);
});

test('i18n includes sheet-fail and real status copy in EN/BN/HI', () => {
  const tr = read('js/translations.js');
  const pages = read('js/pages.js');
  ['toastSheetFail'].forEach(function(key) {
    const hits = tr.split(key + ':').length - 1;
    assert.ok(hits >= 3, key + ' must exist in en/bn/hi, found ' + hits);
  });
  ['ordLookupFail', 'ordNotFound', 'ordActiveMsg', 'ordRejectMsg', 'ordLblReject', 'ordConfirmBackup'].forEach(function(key) {
    const hits = pages.split(key + ':').length - 1;
    assert.ok(hits >= 3, key + ' must exist in en/bn/hi, found ' + hits);
  });
});
