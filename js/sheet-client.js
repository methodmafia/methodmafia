/* ═══════════════════════════════════════════════════════════
   THE METHOD MAFIA — Sheet web-app client (browser + Node)
   Writes are no-cors fire-and-forget (opaque is expected).
   Status lookup GET is CORS + public (action=status) and
   never sends an admin token.
   ═══════════════════════════════════════════════════════════ */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.MMSheet = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  function escapeHtml(text){
    return String(text == null ? '' : text).replace(/[&<>"']/g, function(ch){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }

  function parseJsonSafe(text){
    if(text == null || text === '') return null;
    try{
      var v = JSON.parse(text);
      return (v && typeof v === 'object') ? v : null;
    }catch(e){ return null; }
  }

  function isWriteSuccess(parsed){
    if(!parsed) return false;
    if(parsed.type === 'opaque') return false;
    if(parsed.ok !== true) return false;
    return !!(parsed.json && parsed.json.ok === true);
  }

  function isPendingDuplicateJson(json){
    if(!json || json.dupe !== true) return false;
    var reason = String(json.reason || json.error || '').toLowerCase();
    return reason === 'pending' || reason === 'duplicate_pending';
  }

  function interpretWriteResult(parsed){
    if(isWriteSuccess(parsed)){
      return { ok: true, dupe: !!(parsed.json && parsed.json.dupe) };
    }
    var json = parsed && parsed.json;
    if(isPendingDuplicateJson(json)){
      return {
        ok: false,
        reason: 'duplicate_pending',
        dupe: true,
        orderId: String(json.orderId || '')
      };
    }
    var reason = 'invalid';
    if(!parsed || parsed.networkError) reason = 'network';
    else if(parsed.type === 'opaque') reason = 'opaque';
    else if(parsed.json && parsed.json.ok === false) reason = 'sheet';
    else if(parsed.ok === false) reason = 'http';
    return { ok: false, reason: reason, dupe: false };
  }

  function stripTokenFromSearch(searchParams){
    if(!searchParams) return;
    if(typeof searchParams.delete === 'function'){
      searchParams.delete('token');
    }
  }

  function buildStatusLookupUrl(sheetUrl, orderId){
    var base = String(sheetUrl || '').trim();
    var id = String(orderId || '').trim().toUpperCase();
    if(!base || !id) return '';
    try{
      var u = new URL(base);
      stripTokenFromSearch(u.searchParams);
      u.searchParams.set('action', 'status');
      u.searchParams.set('orderId', id);
      return u.toString();
    }catch(e){
      var cleaned = base
        .replace(/([?&])token=[^&]*/gi, '$1')
        .replace(/[?&]+$/, '')
        .replace(/\?&/, '?');
      var sep = cleaned.indexOf('?') === -1 ? '?' : '&';
      return cleaned + sep + 'action=status&orderId=' + encodeURIComponent(id);
    }
  }

  function normalizeStatus(raw){
    var s = String(raw || '').trim().toLowerCase();
    if(s === 'active') return 'active';
    if(s === 'pending' || s === 'submitted') return 'pending';
    if(s === 'verifying') return 'verifying';
    if(s === 'expired') return 'expired';
    if(s === 'reject' || s === 'rejected' || s === 'declined') return 'reject';
    if(!s) return 'unknown';
    return 'other';
  }

  function interpretStatusResult(parsed){
    if(!parsed || parsed.networkError || parsed.type === 'opaque'){
      return { kind: 'lookup_failed' };
    }
    var json = parsed.json;
    if(!json || json.ok !== true){
      return { kind: 'lookup_failed' };
    }
    if(json.found !== true){
      return { kind: 'not_found', orderId: String(json.orderId || '').toUpperCase() };
    }
    return {
      kind: 'found',
      orderId: String(json.orderId || '').toUpperCase(),
      status: normalizeStatus(json.status),
      statusRaw: String(json.status || ''),
      plan: json.plan ? String(json.plan) : ''
    };
  }

  function readResponse(res){
    if(!res){
      return Promise.resolve({ type: 'error', ok: false, status: 0, json: null, text: '' });
    }
    if(res.type === 'opaque'){
      return Promise.resolve({ type: 'opaque', ok: false, status: 0, json: null, text: '' });
    }
    return Promise.resolve(res.text()).then(function(text){
      return {
        type: res.type || 'basic',
        ok: !!res.ok,
        status: res.status || 0,
        json: parseJsonSafe(text),
        text: text || ''
      };
    });
  }

  function writeFetchOptions(payload){
    return {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload || {})
    };
  }

  var SHEET_WRITE_TIMEOUT_MS = 10000;

  function fetchWithTimeout(url, opts, timeoutMs, fetchFn){
    var ms = Number(timeoutMs);
    if(!(ms > 0)) ms = SHEET_WRITE_TIMEOUT_MS;
    var run = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if(!run){
      return Promise.reject(new Error('fetch_unavailable'));
    }
    var options = {};
    var src = opts || {};
    for(var k in src){ if(Object.prototype.hasOwnProperty.call(src, k)) options[k] = src[k]; }
    var ctrl = null;
    if(typeof AbortController !== 'undefined' && !options.signal){
      ctrl = new AbortController();
      options.signal = ctrl.signal;
    }
    return new Promise(function(resolve, reject){
      var done = false;
      var timer = setTimeout(function(){
        if(done) return;
        done = true;
        if(ctrl){ try{ ctrl.abort(); }catch(e){} }
        var err = new Error('sheet_timeout');
        err.reason = 'timeout';
        reject(err);
      }, ms);
      Promise.resolve(run(url, options)).then(function(res){
        if(done) return;
        done = true;
        clearTimeout(timer);
        resolve(res);
      }, function(err){
        if(done) return;
        done = true;
        clearTimeout(timer);
        if(err && err.name === 'AbortError'){
          var te = new Error('sheet_timeout');
          te.reason = 'timeout';
          reject(te);
          return;
        }
        reject(err);
      });
    });
  }

  function normalizeOrderLanguage(code){
    var s = String(code == null ? '' : code).trim().toLowerCase();
    if(s === 'bn' || s === 'hi' || s === 'en') return s;
    return 'en';
  }

  /* Sheet column stores EN/BN/HI. Keep in sync with OrderProcessor.gs → sheetLanguageLabel_ */
  function sheetLanguageLabel(code){
    return normalizeOrderLanguage(code).toUpperCase();
  }

  function statusFetchOptions(){
    return {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow',
      credentials: 'omit'
    };
  }

  return {
    escapeHtml: escapeHtml,
    parseJsonSafe: parseJsonSafe,
    isWriteSuccess: isWriteSuccess,
    interpretWriteResult: interpretWriteResult,
    buildStatusLookupUrl: buildStatusLookupUrl,
    normalizeStatus: normalizeStatus,
    interpretStatusResult: interpretStatusResult,
    readResponse: readResponse,
    writeFetchOptions: writeFetchOptions,
    fetchWithTimeout: fetchWithTimeout,
    SHEET_WRITE_TIMEOUT_MS: SHEET_WRITE_TIMEOUT_MS,
    statusFetchOptions: statusFetchOptions,
    normalizeOrderLanguage: normalizeOrderLanguage,
    sheetLanguageLabel: sheetLanguageLabel
  };
});
