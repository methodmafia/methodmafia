'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function loadMakeOrderId() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
  const start = src.indexOf('function makeOrderId');
  const end = src.indexOf('function getUtmData');
  assert.ok(start !== -1 && end > start, 'makeOrderId slice');
  return new Function(src.slice(start, end) + '\nreturn makeOrderId;')();
}

test('makeOrderId stays MM-YYYY plus exactly 5 digits', () => {
  const makeOrderId = loadMakeOrderId();
  const year = String(new Date().getFullYear());
  for (let i = 0; i < 40; i++) {
    const id = makeOrderId();
    assert.match(id, new RegExp('^MM-' + year + '-\\d{5}$'));
    const suffix = id.slice(id.lastIndexOf('-') + 1);
    const n = Number(suffix);
    assert.equal(suffix.length, 5);
    assert.ok(n >= 10000 && n <= 99999, id);
    assert.ok(id.length <= 13, id);
  }
});

test('makeOrderId does not repeat within one page session', () => {
  const makeOrderId = loadMakeOrderId();
  const ids = [];
  for (let i = 0; i < 400; i++) ids.push(makeOrderId());
  assert.equal(new Set(ids).size, ids.length);
});
