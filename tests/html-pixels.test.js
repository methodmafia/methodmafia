'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function walkHtml(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(ent) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'tests') return;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtml(full, acc);
    else if (ent.name.endsWith('.html')) acc.push(full);
  });
  return acc;
}

test('every public HTML page loads config.js then js/pixels.js', () => {
  const files = walkHtml(ROOT, []);
  assert.ok(files.length >= 11, 'expected root + blog HTML pages, got ' + files.length);

  files.forEach(function(file) {
    const html = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    const inBlog = rel.startsWith('blog' + path.sep);
    const configSrc = inBlog ? '../config.js' : 'config.js';
    const libSrc = inBlog ? '../js/tracking-lib.js' : 'js/tracking-lib.js';
    const pixelsSrc = inBlog ? '../js/pixels.js' : 'js/pixels.js';

    assert.ok(html.indexOf('src="' + configSrc + '"') !== -1, rel + ' must load ' + configSrc);
    assert.ok(html.indexOf('src="' + libSrc + '"') !== -1, rel + ' must load ' + libSrc);
    assert.ok(html.indexOf('src="' + pixelsSrc + '"') !== -1, rel + ' must load ' + pixelsSrc);

    const cfgAt = html.indexOf('src="' + configSrc + '"');
    const libAt = html.indexOf('src="' + libSrc + '"');
    const pxAt = html.indexOf('src="' + pixelsSrc + '"');
    assert.ok(cfgAt < libAt && libAt < pxAt, rel + ' must load config → tracking-lib → pixels');
  });
});

test('index.html no longer inlines a second Meta/TikTok snippet', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal((html.match(/connect\.facebook\.net\/en_US\/fbevents\.js/g) || []).length, 0);
  assert.equal((html.match(/analytics\.tiktok\.com\/i18n\/pixel\/events\.js/g) || []).length, 0);
  assert.ok(html.indexOf('src="js/pixels.js"') !== -1);
});
