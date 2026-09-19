'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const sheet = require(path.join(ROOT, 'js', 'sheet-client.js'));

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadTranslations() {
  const src = read('js/translations.js');
  return Function(src + '\nreturn TRANSLATIONS;')();
}

test('normalizeOrderLanguage defaults to en and only allows en|bn|hi', () => {
  assert.equal(typeof sheet.normalizeOrderLanguage, 'function');
  assert.equal(sheet.normalizeOrderLanguage('en'), 'en');
  assert.equal(sheet.normalizeOrderLanguage('bn'), 'bn');
  assert.equal(sheet.normalizeOrderLanguage('hi'), 'hi');
  assert.equal(sheet.normalizeOrderLanguage('EN'), 'en');
  assert.equal(sheet.normalizeOrderLanguage(''), 'en');
  assert.equal(sheet.normalizeOrderLanguage(null), 'en');
  assert.equal(sheet.normalizeOrderLanguage('fr'), 'en');
  assert.equal(sheet.normalizeOrderLanguage('english'), 'en');
});

test('sheetLanguageLabel maps order language to EN/BN/HI for the Sheet', () => {
  assert.equal(sheet.sheetLanguageLabel('en'), 'EN');
  assert.equal(sheet.sheetLanguageLabel('bn'), 'BN');
  assert.equal(sheet.sheetLanguageLabel('hi'), 'HI');
  assert.equal(sheet.sheetLanguageLabel(''), 'EN');
  assert.equal(sheet.sheetLanguageLabel('xx'), 'EN');
});

test('order form has Bangla | English | Hindi pills with English selected by default', () => {
  const html = read('index.html');
  const telegramAt = html.indexOf('id="iTelegram"');
  const langRowAt = html.indexOf('id="langPrefRow"');
  const planAt = html.indexOf('data-t="lblPlan"');

  assert.ok(telegramAt !== -1, 'telegram field must exist');
  assert.ok(langRowAt !== -1, 'preferred language row must exist');
  assert.ok(planAt !== -1, 'plan field must exist');
  assert.ok(telegramAt < langRowAt && langRowAt < planAt,
    'language selector must sit between telegram and plan');

  assert.match(html, /name="language"/);
  assert.match(html, /id="iLanguage"[^>]*value="en"|value="en"[^>]*id="iLanguage"/);

  const pills = [...html.matchAll(/class="lang-pref-opt[^"]*"[^>]*data-lang="(bn|en|hi)"/g)]
    .map(function(m) { return m[1]; });
  if (pills.length !== 3) {
    const alt = [...html.matchAll(/data-lang="(bn|en|hi)"[^>]*class="lang-pref-opt[^"]*"/g)]
      .map(function(m) { return m[1]; });
    pills.push.apply(pills, alt);
  }
  const unique = [...new Set(pills)];
  assert.deepEqual(unique, ['bn', 'en', 'hi']);

  assert.match(html, /data-lang="en"[^>]*class="[^"]*\bsel\b|class="lang-pref-opt sel"[^>]*data-lang="en"/);
  assert.doesNotMatch(html, /data-lang="bn"[^>]*class="[^"]*\bsel\b/);
  assert.doesNotMatch(html, /data-lang="hi"[^>]*class="[^"]*\bsel\b/);

  const buttons = html.match(/<button[^>]*class="lang-pref-opt[^"]*"[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.equal(buttons.length, 3);
  const joined = buttons.join('\n');
  assert.ok(joined.indexOf('বাংলা') !== -1);
  assert.ok(joined.indexOf('English') !== -1);
  assert.ok(joined.indexOf('हिन्दी') !== -1);
  assert.ok(joined.indexOf('data-t=') === -1,
    'pill labels stay native and must not use data-t');
});

test('i18n preferred-language chrome exists in EN/BN/HI with approved copy', () => {
  const tr = loadTranslations();
  assert.equal(tr.en.lblLanguage, 'Preferred Language');
  assert.equal(tr.en.langHint, 'Renew messages will use this language');
  assert.equal(tr.bn.lblLanguage, 'পছন্দের ভাষা');
  assert.equal(tr.bn.langHint, 'রিনিউ মেসেজ এই ভাষায় যাবে');
  assert.equal(tr.hi.lblLanguage, 'पसंदीदा भाषा');
  assert.equal(tr.hi.langHint, 'रिन्यू मैसेज इसी भाषा में जाएगा');
});

test('submit payload includes language from preferred-language selection, not page LANG', () => {
  const main = read('js/main.js');
  assert.match(main, /let SELECTED_PREF_LANG = 'en'/);
  assert.match(main, /function selectPrefLang\s*\(/);
  const payload = main.match(/const payload = \{[\s\S]*?\n  \};/);
  assert.ok(payload, 'submitOrder payload object must exist');
  assert.match(payload[0], /language:/);
  assert.match(payload[0], /normalizeOrderLanguage\(SELECTED_PREF_LANG\)|SELECTED_PREF_LANG/);
  assert.doesNotMatch(main, /function selectPrefLang[\s\S]{0,400}setLang\(/);
  assert.doesNotMatch(main, /SELECTED_PREF_LANG\s*=\s*LANG/);
  assert.match(main, /iLanguage/);
});

test('GUIDE documents a Language column with EN/BN/HI values', () => {
  const guide = read('GUIDE.md');
  assert.match(guide, /Language/);
  assert.match(guide, /EN\/BN\/HI|EN \/ BN \/ HI|EN, BN, HI/);
});

test('OrderProcessor persists language after TTclid without shifting existing columns', () => {
  const gs = read('apps-script/OrderProcessor.gs');
  assert.match(gs, /LANGUAGE\s*:/);
  assert.match(gs, /data\.language/);
  assert.match(gs, /'Language'|\"Language\"/);
  const headers = gs.match(/const headers = \[[\s\S]*?\];/);
  assert.ok(headers, 'setupSheetHeaders headers array must exist');
  assert.match(headers[0], /'TTclid'[\s\S]*'Language'/);
  assert.match(gs, /TTCLID\s*:\s*16/);
  assert.match(gs, /LANGUAGE\s*:\s*17/);
});

test('live activity, reviews, and countdown stay on the order page', () => {
  const html = read('index.html');
  assert.match(html, /id="livePop"/);
  assert.match(html, /id="reviewGrid"/);
  assert.match(html, /id="cdH"/);
  assert.match(html, /id="order"/);
});
