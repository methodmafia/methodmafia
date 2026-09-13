/* ═══════════════════════════════════════════════════════════
   THE METHOD MAFIA — CAPI / Events API payload builders
   Shared by Node tests. Apps Script mirrors these rules in
   apps-script/CapiPurchase.gs (do not hardcode tokens here).
   ═══════════════════════════════════════════════════════════ */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory();
  } else {
    root.MMCapiPayload = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  var PURCHASE_VALUE = 30;
  var PURCHASE_SENT = 'PURCHASE_SENT';
  var META_VERSION = 'v18.0';

  function sha256Hex(value){
    var crypto;
    try{ crypto = require('crypto'); }catch(e){ crypto = null; }
    if(!crypto) return '';
    return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
  }

  function normalizeEmail(email){
    return String(email || '').trim().toLowerCase();
  }

  function normalizeTelegram(tg){
    return String(tg || '').trim();
  }

  function isEntryPlan(plan){
    return String(plan || '').trim().toLowerCase() === 'entry';
  }

  function isActiveStatus(status){
    return String(status || '').trim().toLowerCase() === 'active';
  }

  function notesAlreadySent(notes){
    return String(notes || '').toUpperCase().indexOf(PURCHASE_SENT) !== -1;
  }

  function shouldSendPurchase(row){
    row = row || {};
    if(!isActiveStatus(row.status)) return false;
    if(!isEntryPlan(row.plan)) return false;
    if(notesAlreadySent(row.notes)) return false;
    return true;
  }

  function buildFbc(fbclid, eventTime){
    if(!fbclid) return '';
    return 'fb.1.' + eventTime + '.' + fbclid;
  }

  function buildMetaPurchasePayload(opts){
    opts = opts || {};
    var eventTime = opts.eventTime || Math.floor(Date.now() / 1000);
    var email = normalizeEmail(opts.email);
    var telegram = normalizeTelegram(opts.telegram);
    var userData = {};
    if(email) userData.em = [opts.hashFn ? opts.hashFn(email) : sha256Hex(email)];
    if(telegram) userData.external_id = [opts.hashFn ? opts.hashFn(telegram) : sha256Hex(telegram)];
    if(opts.fbclid) userData.fbc = buildFbc(opts.fbclid, eventTime);
    if(opts.fbc && !userData.fbc) userData.fbc = opts.fbc;

    return {
      data: [{
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: opts.orderId || '',
        event_source_url: opts.eventSourceUrl || 'https://themethodmafia.com/',
        action_source: 'website',
        user_data: userData,
        custom_data: {
          value: PURCHASE_VALUE,
          currency: 'USD',
          content_name: 'Entry'
        }
      }]
    };
  }

  function buildTikTokPurchasePayload(opts){
    opts = opts || {};
    var eventTime = opts.eventTime || Math.floor(Date.now() / 1000);
    var email = normalizeEmail(opts.email);
    var telegram = normalizeTelegram(opts.telegram);
    var hash = opts.hashFn || sha256Hex;
    var user = {};
    if(email) user.email = hash(email);
    if(telegram) user.external_id = hash(telegram);
    if(opts.ttclid) user.ttclid = opts.ttclid;

    return {
      event_source: 'web',
      event_source_id: opts.pixelId || '',
      data: [{
        event: 'CompletePayment',
        event_time: eventTime,
        event_id: opts.orderId || '',
        user: user,
        page: { url: opts.pageUrl || 'https://themethodmafia.com/' },
        properties: {
          value: PURCHASE_VALUE,
          currency: 'USD',
          content_name: 'Entry'
        }
      }]
    };
  }

  function shouldMarkPurchaseSent(results){
    results = results || {};
    var attempted = [];
    if(results.meta && results.meta !== 'skipped') attempted.push(results.meta);
    if(results.tiktok && results.tiktok !== 'skipped') attempted.push(results.tiktok);
    if(!attempted.length) return false;
    for(var i = 0; i < attempted.length; i++){
      if(attempted[i] !== 'ok') return false;
    }
    return true;
  }

  function appendPurchaseSentNote(notes){
    var cur = String(notes || '').trim();
    if(notesAlreadySent(cur)) return cur;
    if(!cur) return PURCHASE_SENT;
    return cur + ' | ' + PURCHASE_SENT;
  }

  function metaEventsUrl(pixelId){
    return 'https://graph.facebook.com/' + META_VERSION + '/' + pixelId + '/events';
  }

  function tiktokEventsUrl(){
    return 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
  }

  return {
    PURCHASE_VALUE: PURCHASE_VALUE,
    PURCHASE_SENT: PURCHASE_SENT,
    shouldSendPurchase: shouldSendPurchase,
    shouldMarkPurchaseSent: shouldMarkPurchaseSent,
    buildMetaPurchasePayload: buildMetaPurchasePayload,
    buildTikTokPurchasePayload: buildTikTokPurchasePayload,
    appendPurchaseSentNote: appendPurchaseSentNote,
    metaEventsUrl: metaEventsUrl,
    tiktokEventsUrl: tiktokEventsUrl,
    sha256Hex: sha256Hex
  };
});
