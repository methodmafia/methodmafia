/* ═══════════════════════════════════════════════════════════
   THE METHOD MAFIA — Tracking helpers (browser + Node tests)
   Click IDs, UTM, event rules. No pixel snippets here.
   ═══════════════════════════════════════════════════════════ */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.MMTracking = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  var FBCLID_KEY = 'mm_fbclid';
  var TTCLID_KEY = 'mm_ttclid';
  var FBC_KEY = 'mm_fbc';
  var UTM_SOURCE = 'mm_utm_source';
  var UTM_MEDIUM = 'mm_utm_medium';
  var UTM_CAMPAIGN = 'mm_utm_campaign';
  var VIEWCONTENT_KEY = 'mm_viewcontent';
  var ENTRY_VALUE = 30;
  var MONTHLY_VALUE = 15;

  function safeGet(store, key){
    if(!store) return '';
    try{
      var v = store.getItem(key);
      return v == null ? '' : String(v);
    }catch(e){ return ''; }
  }

  function safeSet(store, key, value){
    if(!store || value == null || value === '') return;
    try{ store.setItem(key, String(value)); }catch(e){}
  }

  function writeBoth(primary, secondary, key, value){
    safeSet(primary, key, value);
    if(secondary && secondary !== primary) safeSet(secondary, key, value);
  }

  function normalizePlan(plan){
    return String(plan || '').trim().toLowerCase();
  }

  function isEntryPlan(plan){
    return normalizePlan(plan) === 'entry';
  }

  function buildFbc(fbclid, eventTime){
    if(!fbclid) return '';
    var ts = eventTime || Math.floor(Date.now() / 1000);
    return 'fb.1.' + ts + '.' + fbclid;
  }

  function captureClickIds(search, store, secondary){
    var params;
    try{ params = new URLSearchParams(search || ''); }
    catch(e){ params = { get: function(){ return null; } }; }

    var fbclid = params.get('fbclid') || '';
    var ttclid = params.get('ttclid') || '';
    if(fbclid){
      writeBoth(store, secondary, FBCLID_KEY, fbclid);
      writeBoth(store, secondary, FBC_KEY, buildFbc(fbclid));
    }
    if(ttclid) writeBoth(store, secondary, TTCLID_KEY, ttclid);

    return {
      fbclid: fbclid || safeGet(store, FBCLID_KEY) || safeGet(secondary, FBCLID_KEY),
      ttclid: ttclid || safeGet(store, TTCLID_KEY) || safeGet(secondary, TTCLID_KEY),
      fbc: (fbclid ? buildFbc(fbclid) : '') || safeGet(store, FBC_KEY) || safeGet(secondary, FBC_KEY)
    };
  }

  function captureUtm(search, store, secondary){
    var params;
    try{ params = new URLSearchParams(search || ''); }
    catch(e){ params = { get: function(){ return null; } }; }

    var src = params.get('utm_source') || '';
    var med = params.get('utm_medium') || '';
    var cam = params.get('utm_campaign') || '';
    if(src) writeBoth(store, secondary, UTM_SOURCE, src);
    if(med) writeBoth(store, secondary, UTM_MEDIUM, med);
    if(cam) writeBoth(store, secondary, UTM_CAMPAIGN, cam);

    return {
      utm_source: src || safeGet(store, UTM_SOURCE) || 'direct',
      utm_medium: med || safeGet(store, UTM_MEDIUM),
      utm_campaign: cam || safeGet(store, UTM_CAMPAIGN)
    };
  }

  function readPersistedIds(store){
    return {
      fbclid: safeGet(store, FBCLID_KEY),
      ttclid: safeGet(store, TTCLID_KEY),
      fbc: safeGet(store, FBC_KEY)
    };
  }

  function getAttribution(search, store, secondary){
    var ids = captureClickIds(search, store, secondary);
    var utm = captureUtm(search, store, secondary);
    return {
      fbclid: ids.fbclid,
      ttclid: ids.ttclid,
      fbc: ids.fbc,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign
    };
  }

  function buildSheetTrackingFields(attr){
    attr = attr || {};
    return {
      source: attr.utm_source || attr.source || 'direct',
      medium: attr.utm_medium || attr.medium || '',
      campaign: attr.utm_campaign || attr.campaign || '',
      fbclid: attr.fbclid || '',
      ttclid: attr.ttclid || ''
    };
  }

  function purchaseBackupEvent(opts){
    opts = opts || {};
    var confirmed = String(opts.confirmed || '') === '1';
    var plan = opts.plan || 'Entry';
    if(!confirmed || !isEntryPlan(plan)){
      return { fire: false };
    }
    return {
      fire: true,
      eventName: 'Purchase',
      tiktokEvent: 'CompletePayment',
      value: ENTRY_VALUE,
      currency: 'USD',
      contentName: 'Entry',
      eventId: opts.orderId || ''
    };
  }

  function checkoutEventValue(plan){
    if(isEntryPlan(plan)){
      return { value: ENTRY_VALUE, contentName: 'Entry', currency: 'USD' };
    }
    return { value: MONTHLY_VALUE, contentName: 'Monthly', currency: 'USD' };
  }

  function shouldFireViewContent(store){
    return !safeGet(store, VIEWCONTENT_KEY);
  }

  function markViewContentFired(store){
    safeSet(store, VIEWCONTENT_KEY, '1');
  }

  function hrefMatches(href, target){
    if(!href || !target) return false;
    var a = String(href).split('?')[0].replace(/\/$/, '').toLowerCase();
    var b = String(target).split('?')[0].replace(/\/$/, '').toLowerCase();
    return a === b;
  }

  function isContactHref(href, cfg){
    if(!href || !cfg) return false;
    return hrefMatches(href, cfg.SUPPORT) || hrefMatches(href, cfg.PUBLIC_CHANNEL);
  }

  function advancedMatching(email, telegram){
    return {
      em: String(email || '').trim().toLowerCase(),
      external_id: String(telegram || '').trim()
    };
  }

  return {
    ENTRY_VALUE: ENTRY_VALUE,
    MONTHLY_VALUE: MONTHLY_VALUE,
    captureClickIds: captureClickIds,
    captureUtm: captureUtm,
    readPersistedIds: readPersistedIds,
    getAttribution: getAttribution,
    buildSheetTrackingFields: buildSheetTrackingFields,
    purchaseBackupEvent: purchaseBackupEvent,
    checkoutEventValue: checkoutEventValue,
    shouldFireViewContent: shouldFireViewContent,
    markViewContentFired: markViewContentFired,
    isContactHref: isContactHref,
    advancedMatching: advancedMatching,
    isEntryPlan: isEntryPlan,
    buildFbc: buildFbc
  };
});
