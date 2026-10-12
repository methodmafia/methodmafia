'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function reducedMotionBlock() {
  const css = read('css/style.css');
  const start = css.search(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  assert.ok(start !== -1, 'expected @media (prefers-reduced-motion: reduce)');
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  assert.fail('unclosed prefers-reduced-motion block');
}

function loadParticles() {
  const main = read('js/main.js');
  const start = main.indexOf('function initParticles');
  const end = main.indexOf('function initLogoTilt');
  assert.ok(start !== -1 && end > start, 'initParticles slice');
  const rafs = [];
  const cancelled = [];
  const motionListeners = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: function() {
      return {
        clearRect: function() {},
        createRadialGradient: function() { return { addColorStop: function() {} }; },
        fillRect: function() {},
        beginPath: function() {},
        arc: function() {},
        fill: function() {},
        fillStyle: '',
        globalAlpha: 1
      };
    }
  };
  const motion = {
    matches: false,
    addEventListener: function(_type, fn) { motionListeners.push(fn); }
  };
  const prev = {
    addEventListener: global.addEventListener,
    innerWidth: global.innerWidth,
    innerHeight: global.innerHeight,
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame
  };
  global.innerWidth = 1024;
  global.innerHeight = 768;
  global.addEventListener = function() {};
  global.requestAnimationFrame = function(fn) {
    rafs.push(fn);
    return rafs.length;
  };
  global.cancelAnimationFrame = function(id) { cancelled.push(id); };
  const windowObj = {
    innerWidth: 1024,
    matchMedia: function() { return motion; }
  };
  const documentObj = {
    getElementById: function(id) { return id === 'bg-canvas' ? canvas : null; }
  };
  const api = new Function('window', 'document', main.slice(start, end) + '\nreturn { initParticles: initParticles };')(windowObj, documentObj);
  api.rafs = rafs;
  api.cancelled = cancelled;
  api.motion = motion;
  api.motionListeners = motionListeners;
  api.restore = function() {
    global.addEventListener = prev.addEventListener;
    global.innerWidth = prev.innerWidth;
    global.innerHeight = prev.innerHeight;
    global.requestAnimationFrame = prev.requestAnimationFrame;
    global.cancelAnimationFrame = prev.cancelAnimationFrame;
  };
  return api;
}

test('reduced motion hides the particle canvas and freezes ticker and glow', () => {
  const block = reducedMotionBlock();
  assert.match(block, /#bg-canvas[\s\S]*display:\s*none/);
  assert.match(block, /\.ticker[\s\S]*animation:\s*none/);
  assert.match(block, /\.logo-ring[\s\S]*animation:\s*none/);
  assert.match(block, /\.logo-img[\s\S]*animation:\s*none/);
  assert.equal(/\.tab-panel/.test(block), false);
  assert.equal(/\.exit-overlay/.test(block), false);
  assert.equal(/\.live-pop/.test(block), false);
});

test('particles stay off when prefers-reduced-motion is reduce', () => {
  const api = loadParticles();
  try {
    api.motion.matches = true;
    api.initParticles();
    assert.equal(api.rafs.length, 0);
  } finally {
    api.restore();
  }
});

test('particles keep animating when reduced motion is off', () => {
  const api = loadParticles();
  try {
    api.motion.matches = false;
    api.initParticles();
    assert.ok(api.rafs.length >= 1);
  } finally {
    api.restore();
  }
});

test('turning reduced motion on stops a running particle loop', () => {
  const api = loadParticles();
  try {
    api.motion.matches = false;
    api.initParticles();
    assert.ok(api.motionListeners.length >= 1);
    const started = api.rafs.length;
    api.motion.matches = true;
    api.motionListeners[0]();
    assert.ok(api.cancelled.length >= 1);
    assert.equal(api.rafs.length, started);
  } finally {
    api.restore();
  }
});

test('logo tilt does not force a float animation over the reduced-motion rule', () => {
  const main = read('js/main.js');
  const tilt = main.slice(main.indexOf('function initLogoTilt'), main.indexOf('function initCountdown'));
  assert.match(tilt, /prefers-reduced-motion/);
  assert.equal(tilt.includes('float 5s'), false);
});
