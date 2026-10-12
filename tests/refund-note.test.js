'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('hero Join CTA has a one-line 48-hour refund note linking to /refund', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const heroStart = html.indexOf('class="cta-lg"');
  const heroEnd = html.indexOf('id="problem"', heroStart);
  const problem = html.indexOf('data-t="problemEyebrow"', heroStart);
  const end = problem !== -1 ? problem : heroEnd;
  assert.ok(heroStart !== -1 && end > heroStart, 'hero Join CTA block');
  const hero = html.slice(heroStart, end);
  assert.match(hero, /data-t="heroCta"/);
  const noteAt = hero.indexOf('cta-refund');
  const ctaAt = hero.indexOf('data-t="heroCta"');
  assert.ok(noteAt > ctaAt, 'refund note sits under the Join CTA');
  assert.match(hero, /href="\/refund"/);
  assert.equal(hero.includes('refund.html'), false);
  assert.match(hero, /<a href="\/refund">48-hour refund<\/a> if we can't deliver access\./);
});
