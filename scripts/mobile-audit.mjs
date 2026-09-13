#!/usr/bin/env node
/**
 * Mobile audit for Method Mafia landing page.
 * Measures tap targets, live-pop vs sticky CTA, and header wordmark clip
 * at a 375×812 phone viewport.
 *
 *   node scripts/mobile-audit.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.AUDIT_PORT || 8765);
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const MIN_TAP = 44;
const FAIL = [];
const PASS = [];

function assert(ok, msg, detail) {
  if (ok) PASS.push(msg);
  else FAIL.push(detail ? `${msg} — ${detail}` : msg);
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.jsonc': 'application/json',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
  }[ext] || 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': mime(file) });
        res.end(data);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function loadPuppeteer() {
  const require = createRequire(import.meta.url);
  try {
    return require('puppeteer-core');
  } catch {
    const { execSync } = await import('node:child_process');
    execSync('npm install --no-save --prefix /tmp/mm-audit puppeteer-core@23', {
      stdio: 'inherit',
    });
    return require('/tmp/mm-audit/node_modules/puppeteer-core');
  }
}

async function measure(page) {
  return page.evaluate((MIN_TAP) => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: r.width, h: r.height, top: r.top, bottom: r.bottom,
        left: r.left, right: r.right,
        fontSize: cs.fontSize,
        letterSpacing: cs.letterSpacing,
        overflow: cs.overflow,
        textOverflow: cs.textOverflow,
        whiteSpace: cs.whiteSpace,
        decoThick: cs.textDecorationThickness,
        z: cs.zIndex,
      };
    };
    const overlaps = (a, b, pad = 0) => {
      if (!a || !b) return false;
      return !(a.right <= b.left + pad || a.left >= b.right - pad
        || a.bottom <= b.top + pad || a.top >= b.bottom - pad);
    };
    const clip = (el) => {
      if (!el) return { clipped: false, ellipsis: false, scrollW: 0, clientW: 0 };
      const cs = getComputedStyle(el);
      const overflowed = el.scrollWidth > el.clientWidth + 1;
      const usesEllipsis = cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible';
      return {
        clipped: overflowed && !usesEllipsis,
        ellipsis: overflowed && usesEllipsis,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        text: (el.textContent || '').trim(),
      };
    };

    const lang = document.querySelector('.lang-btn');
    const join = document.querySelector('header .btn-gold');
    const tabs = [...document.querySelectorAll('.tab-btn')];
    const topBtn = document.querySelector('.scroll-top');
    const name = document.querySelector('.hdr-name');
    const hdrRight = document.querySelector('.hdr-right');
    const header = document.querySelector('header');
    const ticker = document.querySelector('.ticker-wrap');
    const sticky = document.querySelector('.sticky-cta');
    const live = document.querySelector('.live-pop');
    const exit = document.querySelector('.exit-overlay');
    const form = document.getElementById('orderForm') || document.querySelector('#order .form-wrap');
    const inputs = [...document.querySelectorAll('#order .inp, #order .submit-btn, #order .plan-opt')];
    const heroCta = document.querySelector('.hero .cta-lg');
    const ctaOld = document.querySelector('.cta-lg .price-old');
    const stickyOld = document.querySelector('.sticky-cta .price-old');

    return {
      viewport: { w: innerWidth, h: innerHeight },
      lang: box(lang),
      join: box(join),
      tabs: tabs.map((el) => ({ text: el.textContent.trim(), ...box(el) })),
      topBtn: box(topBtn),
      name: { ...box(name), ...clip(name) },
      hdrRight: box(hdrRight),
      header: box(header),
      nameHitsActions: overlaps(box(name), box(hdrRight), 2),
      nameOverflowsHeader: name && header
        ? name.getBoundingClientRect().right > header.getBoundingClientRect().right + 1
        : false,
      ticker: ticker ? { overflow: getComputedStyle(ticker).overflow, h: ticker.getBoundingClientRect().height } : null,
      sticky: box(sticky),
      live: box(live),
      exit: box(exit),
      stickyZ: sticky ? getComputedStyle(sticky).zIndex : '0',
      exitZ: exit ? getComputedStyle(exit).zIndex : '0',
      bodySticky: document.body.classList.contains('sticky-visible'),
      stickyShown: sticky ? sticky.classList.contains('show') : false,
      liveShown: live ? live.classList.contains('show') : false,
      overlapLiveSticky: overlaps(box(live), box(sticky), 2),
      overlapLiveHero: overlaps(box(live), box(heroCta), 2),
      overlapLiveInputs: inputs.some((el) => overlaps(box(live), box(el), 2)),
      heroCta: box(heroCta),
      form: box(form),
      ctaOld: box(ctaOld),
      stickyOld: box(stickyOld),
      showLive: typeof CONFIG !== 'undefined' ? CONFIG.SHOW_LIVE_ACTIVITY : null,
      entryUsd: typeof CONFIG !== 'undefined' ? CONFIG.ENTRY_USD : null,
      entryReg: typeof CONFIG !== 'undefined' ? CONFIG.ENTRY_REGULAR_USD : null,
    };
  }, MIN_TAP);
}

async function run() {
  const server = await startServer();
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});

  // ── 1. Default header / tabs / back-to-top ──
  await page.evaluate(() => {
    const top = document.getElementById('scrollTop');
    if (top) top.classList.add('show');
  });
  const atTop = await measure(page);

  assert(atTop.lang && atTop.lang.w >= MIN_TAP && atTop.lang.h >= MIN_TAP,
    `lang switcher tap ≥${MIN_TAP}px`,
    atTop.lang ? `${Math.round(atTop.lang.w)}×${Math.round(atTop.lang.h)}` : 'missing');
  assert(atTop.join && atTop.join.w >= MIN_TAP && atTop.join.h >= MIN_TAP,
    `header Join CTA tap ≥${MIN_TAP}px`,
    atTop.join ? `${Math.round(atTop.join.w)}×${Math.round(atTop.join.h)}` : 'missing');
  const smallTabs = (atTop.tabs || []).filter((t) => t.w < MIN_TAP || t.h < MIN_TAP);
  assert(atTop.tabs.length > 0 && smallTabs.length === 0,
    `vault tabs tap ≥${MIN_TAP}px`,
    smallTabs.map((t) => `${t.text}:${Math.round(t.w)}×${Math.round(t.h)}`).join(', ') || 'no tabs');
  assert(atTop.topBtn && atTop.topBtn.w >= MIN_TAP && atTop.topBtn.h >= MIN_TAP,
    `back-to-top tap ≥${MIN_TAP}px`,
    atTop.topBtn ? `${Math.round(atTop.topBtn.w)}×${Math.round(atTop.topBtn.h)}` : 'missing');
  assert(atTop.name && !atTop.name.clipped && !atTop.nameHitsActions && !atTop.nameOverflowsHeader,
    'header wordmark not clipped / not colliding with actions @375',
    atTop.name
      ? `box ${Math.round(atTop.name.w)}×${Math.round(atTop.name.h)} scroll=${atTop.name.scrollW} client=${atTop.name.clientW} hitsActions=${atTop.nameHitsActions} overflowsHeader=${atTop.nameOverflowsHeader}`
      : 'missing');

  await page.setViewport({ width: 320, height: 720, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 80));
  const narrow = await measure(page);
  assert(narrow.name && !narrow.name.clipped && !narrow.nameHitsActions && !narrow.nameOverflowsHeader,
    'header wordmark not clipped / not colliding with actions @320',
    narrow.name
      ? `box ${Math.round(narrow.name.w)}×${Math.round(narrow.name.h)} scroll=${narrow.name.scrollW} client=${narrow.name.clientW} hitsActions=${narrow.nameHitsActions} overflowsHeader=${narrow.nameOverflowsHeader}`
      : 'missing');
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 40));

  // ── 2. Sticky visible + live toast ──
  await page.evaluate(() => {
    const sticky = document.getElementById('stickyCta');
    const live = document.getElementById('livePop');
    if (sticky) {
      sticky.style.transition = 'none';
      sticky.classList.add('show');
      sticky.style.transform = 'translateY(0)';
      sticky.style.opacity = '1';
    }
    document.body.classList.add('sticky-visible');
    document.body.classList.remove('near-order');
    if (sticky) {
      document.documentElement.style.setProperty(
        '--sticky-clearance',
        (sticky.offsetHeight + 12) + 'px'
      );
    }
    if (live) {
      live.style.transition = 'none';
      live.innerHTML = '<div class="live-av">R</div><div><div class="live-tx"><b>Rajib</b> joined</div></div>';
      live.classList.add('show');
      live.style.transform = 'translateX(0)';
      live.style.opacity = '1';
    }
  });
  await new Promise((r) => setTimeout(r, 100));
  const withSticky = await measure(page);
  assert(withSticky.stickyShown, 'sticky CTA can show on mobile');
  assert(!withSticky.overlapLiveSticky,
    'live-pop does not overlap sticky CTA',
    withSticky.live && withSticky.sticky
      ? `live bottom ${withSticky.live.bottom.toFixed(1)} vs sticky top ${withSticky.sticky.top.toFixed(1)}`
      : 'missing nodes');
  assert(withSticky.live && withSticky.sticky && withSticky.live.bottom <= withSticky.sticky.top - 8,
    'live-pop sits ≥8px above sticky bar',
    withSticky.live && withSticky.sticky
      ? `gap ${ (withSticky.sticky.top - withSticky.live.bottom).toFixed(1) }px`
      : 'missing');

  // ── 3. Order form: live toast must not cover fields ──
  await page.evaluate(() => {
    const order = document.getElementById('order');
    if (order) order.scrollIntoView({ block: 'start' });
    const sticky = document.getElementById('stickyCta');
    if (sticky) sticky.classList.remove('show');
    document.body.classList.remove('sticky-visible');
    document.body.classList.add('near-order');
    const live = document.getElementById('livePop');
    if (live) live.classList.add('show');
  });
  await new Promise((r) => setTimeout(r, 80));
  const onForm = await measure(page);
  assert(!onForm.overlapLiveInputs,
    'live-pop does not cover order form fields');

  // ── 4. Exit popup: sticky stays above overlay ──
  await page.evaluate(() => {
    document.getElementById('exitPop')?.classList.add('show');
    document.getElementById('stickyCta')?.classList.add('show');
    document.body.classList.add('sticky-visible');
  });
  await new Promise((r) => setTimeout(r, 40));
  const withExit = await measure(page);
  const stickyZ = Number(withExit.stickyZ) || 0;
  const exitZ = Number(withExit.exitZ) || 0;
  assert(stickyZ > exitZ,
    'sticky CTA z-index above exit overlay so Join stays tappable',
    `sticky ${stickyZ} vs exit ${exitZ}`);

  // ── Keep: pricing + strike polish + live flag ──
  assert(atTop.showLive === true, 'SHOW_LIVE_ACTIVITY stays true', String(atTop.showLive));
  assert(atTop.entryUsd === '$30' && atTop.entryReg === '$100',
    'pricing $100→$30 unchanged',
    `${atTop.entryReg} → ${atTop.entryUsd}`);
  const ctaFs = atTop.ctaOld ? parseFloat(atTop.ctaOld.fontSize) : 0;
  const ctaParentFs = await page.evaluate(() => {
    const el = document.querySelector('.cta-lg');
    return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
  });
  assert(ctaFs >= ctaParentFs * 0.98,
    'cta-lg .price-old is ~1em on mobile',
    `${ctaFs} vs parent ${ctaParentFs}`);
  const thick = atTop.ctaOld ? parseFloat(atTop.ctaOld.decoThick) : 0;
  assert(thick >= 4.5,
    'cta-lg .price-old strike thickness ~5px',
    String(atTop.ctaOld && atTop.ctaOld.decoThick));

  await browser.close();
  server.close();

  console.log(`\nMobile audit @ 375×812 — ${PASS.length} passed, ${FAIL.length} failed\n`);
  PASS.forEach((m) => console.log('  PASS  ' + m));
  FAIL.forEach((m) => console.log('  FAIL  ' + m));
  if (FAIL.length) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
